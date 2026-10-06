import { type Change, connectDB } from "./db";
import type { ChangeBrief } from "./llm";
import type { EnrichedSectionChange } from "./structure";

/** A change record as the API returns it, with its JSON columns parsed. */
export interface ChangeView {
  id: number;
  act_id: number;
  act_title: string;
  version_from_id: number | null;
  version_to_id: number;
  from_label: string | null;
  to_label: string | null;
  detected_at: string;
  summary: string | null;
  sections_changed: string[];
  affected_groups: string[];
  change_count: number;
  brief: ChangeBrief | null;
  section_details: EnrichedSectionChange[];
}

interface ChangeRow extends Change {
  act_title: string;
  from_label: string | null;
  to_label: string | null;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseArray<T>(raw: string | null): T[] {
  const value = parseJson<unknown>(raw, []);
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Every recorded change for an Act, newest first. */
export function listChanges(actId: number | string): ChangeView[] {
  const rows = connectDB()
    .prepare<[number | string], ChangeRow>(
      `SELECT c.*, a.title AS act_title, v1.version_label AS from_label, v2.version_label AS to_label
       FROM changes c
       JOIN acts a ON a.id = c.act_id
       JOIN versions v2 ON v2.id = c.version_to_id
       LEFT JOIN versions v1 ON v1.id = c.version_from_id
       WHERE c.act_id = ?
       ORDER BY c.detected_at DESC, c.id DESC`,
    )
    .all(actId);

  return rows.map((row) => ({
    id: row.id,
    act_id: row.act_id,
    act_title: row.act_title,
    version_from_id: row.version_from_id,
    version_to_id: row.version_to_id,
    from_label: row.from_label,
    to_label: row.to_label,
    detected_at: row.detected_at,
    summary: row.summary,
    sections_changed: parseArray<string>(row.sections_changed),
    affected_groups: parseArray<string>(row.affected_groups),
    change_count: row.change_count ?? 0,
    brief: parseJson<ChangeBrief | null>(row.brief, null),
    section_details: parseArray<EnrichedSectionChange>(row.section_details),
  }));
}
