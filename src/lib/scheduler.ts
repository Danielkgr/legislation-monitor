/**
 * A lightweight in-process auto-check scheduler.  Runs at a configurable
 * interval (default 5 minutes), sequentially fetching every tracked act and
 * recording new versions / diffs via the existing check route.
 *
 * Configuration is read from environment variables with DB fallback —
 * settings in the SQLite store take precedence over env vars which override
 * defaults.
 *
 * HMR-safe: a global guard prevents multiple intervals even when Turbopack
 * re-evaluates modules during development.  Calls to `start()` stop any
 * previously running scheduler before starting a new one.
 */

import { getSetting, setSetting } from "./db";

/* ── Internal state (globalThis-guarded) ─────────────────────────────── */

const SCHEDULER_KEY = "__legislation_monitor_scheduler";

interface SchedulerState {
  timerId?: ReturnType<typeof setInterval>;
  stopped: boolean;
}

interface SchedulerGlobal {
  [key: string]: SchedulerState | undefined;
}

function getState(): SchedulerState | null {
  if (typeof globalThis === "undefined") return null;
  const g = globalThis as unknown as SchedulerGlobal;
  return g[SCHEDULER_KEY] ?? null;
}

/* ── Configuration ───────────────────────────────────────────────────── */

interface Config {
  enabled: boolean;
  intervalMs: number; // minimum 60_000 ms (1 minute)
}

/** Read scheduler config from DB settings, env vars, then defaults. */
function getConfig(): Config {
  const rawEnabled = process.env.SCHEDULER_ENABLED ?? "true";
  const dbEnabled = getSetting("scheduler_enabled");
  const enabledRaw = dbEnabled !== null ? dbEnabled : rawEnabled;

  const defaultIntervalMin = process.env.SCHEDULER_INTERVAL_MINUTES ?? "5";
  const dbInterval = getSetting("scheduler_interval_minutes");
  const intervalMin = parseInt(dbInterval ?? defaultIntervalMin, 10);

  return {
    enabled: enabledRaw === "true",
    intervalMs: Math.max(60_000, isNaN(intervalMin) ? 300_000 : intervalMin * 60_000),
  };
}

/* ── Start / stop ────────────────────────────────────────────────────── */

/** Start the auto-check scheduler. HMR-safe (stops any previous instance). */
export function start(config?: Config): void {
  stop(); // always clean up first

  const cfg = config ?? getConfig();
  if (!cfg.enabled) return;

  const state: SchedulerState = { stopped: false };
  const g = globalThis as unknown as SchedulerGlobal;
  g[SCHEDULER_KEY] = state;

  // First check after interval (gives server time to settle during startup)
  state.timerId = setInterval(() => {
    if (state.stopped) return;
    checkAllActs().catch((err) => {
      console.error("[scheduler] check-all failed:", err);
    });
  }, cfg.intervalMs);

  console.log(
    `[scheduler] started — interval ${cfg.intervalMs / 60_000}min`
  );
}

/** Stop the scheduler (clears any active timer). */
export function stop(): void {
  const state = getState();
  if (!state) return;
  if (state.timerId) clearInterval(state.timerId);
  state.stopped = true;
  const g = globalThis as unknown as SchedulerGlobal;
  delete g[SCHEDULER_KEY];
}

/* ── Check logic ─────────────────────────────────────────────────────── */

/** Iterate over all tracked acts and POST to each check route sequentially. */
async function checkAllActs(): Promise<void> {
  const db = await import("@/lib/db").then((m) => m.connectDB());
  const acts = db.prepare("SELECT id FROM acts ORDER BY id ASC").all() as Array<{ id: number }>;

  if (acts.length === 0) return;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  for (const act of acts) {
    try {
      const res = await fetch(`${baseUrl}/api/acts/${act.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Don't block if a single check hangs; timeout after 30s per act
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json()) as { success?: boolean; hasChange?: boolean };

      if (data.success && data.hasChange) {
        const count = parseInt(getSetting("pending_changes_count") ?? "0", 10);
        setSetting("pending_changes_count", String(count + 1));
        console.log(`[scheduler] change in act #${act.id} (${count + 1} pending)`);
      }
    } catch (err) {
      console.error(`[scheduler] failed to check act #${act.id}:`, err);
    }
  }
}

// ── Auto-start when this module is first loaded ───────────────────────
start();
