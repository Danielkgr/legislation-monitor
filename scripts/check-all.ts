/**
 * Check every watched Act once, print a digest, and post it to a webhook
 * when DIGEST_WEBHOOK_URL is set.  Exits with status 1 when any check
 * failed, so cron and CI can tell.
 *
 *   npm run check-all
 *   DIGEST_WEBHOOK_URL=https://hooks.slack.com/services/... npm run check-all
 *   DIGEST_WEBHOOK_URL=<Teams workflow URL> DIGEST_WEBHOOK_FORMAT=teams npm run check-all
 *
 * It uses the same database as the app (LEGISLATION_DB_PATH or
 * .data/legislation.db) and the same brief settings.
 */
import fs from "node:fs";
import { checkAllActs, type DigestFormat, formatDigest, postDigest } from "../src/lib/digest";

async function main(): Promise<number> {
  // Next.js reads .env.local for the app; read it here too when it exists.
  // process.loadEnvFile arrived in Node 20.12.
  if (fs.existsSync(".env.local") && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(".env.local");
  }

  const outcomes = await checkAllActs();
  const digest = formatDigest(outcomes);
  console.log(digest);

  const webhook = process.env.DIGEST_WEBHOOK_URL;
  if (webhook) {
    const format: DigestFormat = process.env.DIGEST_WEBHOOK_FORMAT === "teams" ? "teams" : "slack";
    try {
      await postDigest(webhook, digest, format);
      console.log(`\nPosted the digest to the ${format} webhook.`);
    } catch (err) {
      console.error(`\nCould not post the digest: ${err instanceof Error ? err.message : err}`);
      return 1;
    }
  }
  return outcomes.some((o) => o.status === "failed") ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
