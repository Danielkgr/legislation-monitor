import { checkAct } from "./check";
import { connectDB } from "./db";

/**
 * A demo database for screenshots and walkthroughs.  Every Act here is
 * fictional, labelled "(demo fixture)", and lives at a URL on the reserved
 * .invalid domain, so a check against it fails instead of reaching a real
 * site.  The change between the two versions of the Example Act is recorded
 * through the real check pipeline, so the diff, section mapping and brief
 * are what the app would produce.
 */

const NOTICE = "<p>Demo fixture: fictional text for screenshots. This is not real legislation.</p>";

const EXAMPLE_V1 = `<html><body>
<h1>Example Act 2026 (demo fixture)</h1>
<div id="content">
${NOTICE}
<p>Compilation No. 1</p>
<h2>Part 1 - Preliminary</h2>
<h4>Section 1 - Short title</h4>
<p>This Act is the Example Act 2026.</p>
<h4>Section 2 - Definitions</h4>
<p>In this Act:</p>
<p>widget means a small device sold to consumers.</p>
<p>widget seller means a business that sells widgets.</p>
<h2>Part 2 - Widget safety</h2>
<h4>Section 5 - Safety notices</h4>
<p>(1) A widget seller must give the Example Regulator a safety notice within 30 days after learning that a widget it sold is unsafe.</p>
<p>(2) The notice must describe the widget and the hazard.</p>
<h4>Section 6 - Records</h4>
<p>A widget seller must keep a copy of each safety notice for 2 years.</p>
</div></body></html>`;

const EXAMPLE_V2 = `<html><body>
<h1>Example Act 2026 (demo fixture)</h1>
<div id="content">
${NOTICE}
<p>Compilation No. 2</p>
<h2>Part 1 - Preliminary</h2>
<h4>Section 1 - Short title</h4>
<p>This Act is the Example Act 2026.</p>
<h4>Section 2 - Definitions</h4>
<p>In this Act:</p>
<p>widget means a small or medium device sold to consumers or businesses.</p>
<p>widget seller means a business that sells widgets.</p>
<h2>Part 2 - Widget safety</h2>
<h4>Section 5 - Safety notices</h4>
<p>(1) A widget seller must give the Example Regulator a safety notice within 72 hours after learning that a widget it sold is unsafe.</p>
<p>(2) The notice must describe the widget and the hazard.</p>
<p>(3) The Example Regulator may publish a summary of a safety notice.</p>
<h4>Section 6 - Records</h4>
<p>A widget seller must keep a copy of each safety notice for 7 years.</p>
<h4>Section 7 - Review</h4>
<p>The Minister must arrange a review of this Act within 3 years after it commences.</p>
</div></body></html>`;

/** Padding so the Victorian scraper accepts the page as a full Act page. */
const VIC_CHROME = "<nav>Demo register navigation, search and help links.</nav>".repeat(10);

const SAMPLE_SERVICES = `<html><body>${VIC_CHROME}
<h1>Sample Services Act 2025 (demo fixture)</h1>
<main>
${NOTICE}
<h2>Part 1 - Preliminary</h2>
<h4>Section 1 - Purpose</h4>
<p>The purpose of this Act is to show how a Victorian Act appears in the monitor.</p>
<h4>Section 2 - Commencement</h4>
<p>This Act comes into operation on a day to be proclaimed.</p>
</main></body></html>`;

const DEMO_RECORDS = `<html><body>
<h1>Demo Records Act 2024 (demo fixture)</h1>
<div id="content">
${NOTICE}
<p>Compilation No. 3</p>
<h2>Part 1 - Preliminary</h2>
<h4>Section 1 - Short title</h4>
<p>This Act is the Demo Records Act 2024.</p>
<h4>Section 3 - Object</h4>
<p>The object of this Act is to give the demo dashboard a second federal entry.</p>
</div></body></html>`;

export const DEMO_ACTS = [
  {
    title: "Example Act 2026 (demo fixture)",
    url: "https://demo.invalid/example-act-2026",
    jurisdiction: "federal",
    page: EXAMPLE_V1,
  },
  {
    title: "Sample Services Act 2025 (demo fixture)",
    url: "https://demo.invalid/sample-services-act-2025",
    jurisdiction: "vic",
    page: SAMPLE_SERVICES,
  },
  {
    title: "Demo Records Act 2024 (demo fixture)",
    url: "https://demo.invalid/demo-records-act-2024",
    jurisdiction: "federal",
    page: DEMO_RECORDS,
  },
] as const;

/**
 * Fill the current database with the demo Acts, a baseline version of each,
 * and one recorded change to the Example Act.  Call it on an empty database.
 */
export async function seedDemo(): Promise<{ exampleActId: number; changeId: number | null }> {
  const db = connectDB();
  const insert = db.prepare("INSERT INTO acts (title, url, jurisdiction) VALUES (?, ?, ?)");
  const ids = DEMO_ACTS.map((a) =>
    Number(insert.run(a.title, a.url, a.jurisdiction).lastInsertRowid),
  );

  // Serve the fixture pages for the demo URLs only.  Anything else, such as
  // a brief request to a configured model, goes to the real fetch.
  const pages = new Map<string, string>(DEMO_ACTS.map((a) => [a.url, a.page]));
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const page = pages.get(url);
    return page === undefined ? realFetch(input, init) : new Response(page, { status: 200 });
  }) as typeof fetch;

  try {
    for (const id of ids) await checkAct(id);
    pages.set(DEMO_ACTS[0].url, EXAMPLE_V2);
    const result = await checkAct(ids[0]);
    return { exampleActId: ids[0], changeId: result.change?.id ?? null };
  } finally {
    globalThis.fetch = realFetch;
  }
}
