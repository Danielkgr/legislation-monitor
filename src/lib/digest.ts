import { type CheckResult, checkAct } from "./check";
import { type Act, connectDB } from "./db";

/** What happened to one Act in a scheduled run. */
export interface ActOutcome {
  act: Pick<Act, "id" | "title" | "jurisdiction">;
  status: "changed" | "unchanged" | "baseline" | "failed";
  /** The change summary, when the check recorded a change. */
  summary?: string;
  /** The error message, when the check failed. */
  error?: string;
}

export type DigestFormat = "slack" | "teams";

/**
 * Check every watched Act, one at a time so the registers see one request
 * at a time.  A failure is recorded as an outcome and the run carries on.
 */
export async function checkAllActs(
  check: (actId: number) => Promise<CheckResult> = checkAct,
): Promise<ActOutcome[]> {
  const acts = connectDB()
    .prepare<[], ActOutcome["act"]>("SELECT id, title, jurisdiction FROM acts ORDER BY title")
    .all();
  const outcomes: ActOutcome[] = [];
  for (const act of acts) {
    try {
      const result = await check(act.id);
      if (result.change) {
        outcomes.push({ act, status: "changed", summary: result.change.summary });
      } else {
        outcomes.push({ act, status: result.baseline ? "baseline" : "unchanged" });
      }
    } catch (err) {
      outcomes.push({
        act,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return outcomes;
}

function label(o: ActOutcome): string {
  return `${o.act.title} (${o.act.jurisdiction === "federal" ? "Cth" : "Vic"})`;
}

/** A plain-text digest of a run, readable in a terminal, Slack or Teams. */
export function formatDigest(outcomes: ActOutcome[], now = new Date()): string {
  const count = (status: ActOutcome["status"]) => outcomes.filter((o) => o.status === status);
  const changed = count("changed");
  const failed = count("failed");
  const unchanged = count("unchanged");
  const baseline = count("baseline");

  const lines = [
    `Legislation Monitor digest, ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    `Checked ${outcomes.length} Act${outcomes.length === 1 ? "" : "s"}: ${changed.length} changed, ` +
      `${unchanged.length} unchanged, ${baseline.length} baseline stored, ${failed.length} failed.`,
  ];
  if (changed.length > 0) {
    lines.push("", "Changed:", ...changed.map((o) => `- ${label(o)}: ${o.summary ?? ""}`.trim()));
  }
  if (failed.length > 0) {
    lines.push("", "Failed:", ...failed.map((o) => `- ${label(o)}: ${o.error ?? "unknown error"}`));
  }
  if (baseline.length > 0) {
    lines.push("", `Baseline stored: ${baseline.map(label).join(", ")}`);
  }
  if (unchanged.length > 0) {
    lines.push("", `Unchanged: ${unchanged.map(label).join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Webhook body for the digest.  Slack incoming webhooks take {"text": ...}.
 * Teams workflow webhooks ("Post to a channel when a webhook request is
 * received") take a message with an Adaptive Card attachment.
 */
export function webhookPayload(digest: string, format: DigestFormat): unknown {
  if (format === "teams") {
    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: digest
              .split("\n\n")
              .map((block) => ({ type: "TextBlock", text: block, wrap: true })),
          },
        },
      ],
    };
  }
  return { text: digest };
}

/** Post the digest to a webhook.  Throws when the webhook does not accept it. */
export async function postDigest(
  url: string,
  digest: string,
  format: DigestFormat,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookPayload(digest, format)),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`The webhook returned HTTP ${res.status}`);
}
