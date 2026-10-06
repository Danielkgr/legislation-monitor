import { type Act, connectDB, incrementPendingChanges, type Version } from "./db";
import { analyzeChanges } from "./diff";
import { type ChangeBrief, generateChangeBrief } from "./llm";
import { type ScraperResult, scrapeAct } from "./scrapers";
import {
  deserializeTOC,
  type EnrichedSectionChange,
  identifyAffectedSectionsEnriched,
  serializeTOCFromHTML,
} from "./structure";

/** A change recorded by a check, as the check endpoint returns it. */
export interface RecordedChange {
  id: number;
  summary: string;
  sections_changed: string[];
  affected_groups: string[];
  change_count: number;
  brief: ChangeBrief;
  section_details: EnrichedSectionChange[];
}

export interface CheckResult {
  success: true;
  /** True only when this check recorded a change against the previous version. */
  hasChange: boolean;
  /** True when this check stored the Act's first version. */
  baseline: boolean;
  change: RecordedChange | null;
  new_version_count: number;
}

export type Scraper = (url: string, jurisdiction: Act["jurisdiction"]) => Promise<ScraperResult>;

export class ActNotFoundError extends Error {}

/**
 * Fetch an Act again and compare it with its latest stored version.  A new
 * hash stores a new version; if a previous version exists, the change is
 * analysed, briefed and recorded.  The scraper is a parameter so tests and
 * demos can supply fixture text.
 */
export async function checkAct(
  actId: number | string,
  scrape: Scraper = scrapeAct,
): Promise<CheckResult> {
  const db = connectDB();
  const act = db.prepare<[number | string], Act>("SELECT * FROM acts WHERE id = ?").get(actId);
  if (!act) throw new ActNotFoundError(`Act ${actId} not found`);

  const scraped = await scrape(act.url, act.jurisdiction);

  const latest = db
    .prepare<[number], Version>(
      "SELECT * FROM versions WHERE act_id = ? ORDER BY fetched_at DESC, id DESC LIMIT 1",
    )
    .get(act.id);

  let change: RecordedChange | null = null;
  const isNewVersion = !latest || latest.content_hash !== scraped.contentHash;

  if (isNewVersion) {
    // Parse the table of contents now so the next change can be mapped to sections.
    const structure = scraped.rawHtml ? serializeTOCFromHTML(scraped.rawHtml) : null;
    const versionId = Number(
      db
        .prepare(
          `INSERT INTO versions (act_id, version_label, content_hash, plain_text, source_url, structure, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          act.id,
          scraped.versionLabel,
          scraped.contentHash,
          scraped.plainText,
          act.url,
          structure,
          scraped.metadata ? JSON.stringify(scraped.metadata) : null,
        ).lastInsertRowid,
    );

    if (latest?.plain_text && scraped.plainText !== latest.plain_text) {
      change = await recordChange(act, latest, versionId, scraped.plainText);
    }

    db.prepare("UPDATE acts SET updated_at = datetime('now') WHERE id = ?").run(act.id);
  }

  const versionCount =
    db
      .prepare<[number], { cnt: number }>("SELECT COUNT(*) AS cnt FROM versions WHERE act_id = ?")
      .get(act.id)?.cnt ?? 0;

  return {
    success: true,
    hasChange: change !== null,
    baseline: !latest,
    change,
    new_version_count: versionCount,
  };
}

async function recordChange(
  act: Act,
  previous: Version,
  versionId: number,
  newText: string,
): Promise<RecordedChange> {
  const oldText = previous.plain_text ?? "";
  const diffResult = analyzeChanges(oldText, newText, act.title);

  // Map the change to sections using the previous version's table of contents.
  let sectionDetails: EnrichedSectionChange[] = [];
  if (previous.structure) {
    try {
      sectionDetails = identifyAffectedSectionsEnriched(
        deserializeTOC(previous.structure),
        oldText.split("\n"),
        newText.split("\n"),
      );
    } catch (err) {
      console.warn("Failed to map the change to sections:", err);
    }
  }

  // Structured brief: the configured model when there is one, otherwise the
  // deterministic heuristic.  Never blocks on a model failure.
  const brief = await generateChangeBrief({
    actTitle: act.title,
    oldText,
    newText,
    heuristic: diffResult,
  });

  const sections = diffResult.changedSections.slice(0, 10);
  const changeCount = diffResult.addedLines + diffResult.removedLines;
  const id = Number(
    connectDB()
      .prepare(
        `INSERT INTO changes (act_id, version_from_id, version_to_id, summary, sections_changed,
           affected_groups, change_count, brief, section_details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        act.id,
        previous.id,
        versionId,
        brief.summary,
        JSON.stringify(sections),
        JSON.stringify(diffResult.affectedGroups),
        changeCount,
        JSON.stringify(brief),
        JSON.stringify(sectionDetails),
      ).lastInsertRowid,
  );
  incrementPendingChanges();

  return {
    id,
    summary: brief.summary,
    sections_changed: sections,
    affected_groups: diffResult.affectedGroups,
    change_count: changeCount,
    brief,
    section_details: sectionDetails,
  };
}
