/**
 * Write a demo database of fictional Acts for screenshots and walkthroughs.
 *
 *   npm run demo:seed
 *   LEGISLATION_DB_PATH=.data/demo.db npm run dev
 *
 * DEMO_DB_PATH changes where it goes (default .data/demo.db).  It replaces
 * any earlier demo database at that path and refuses to touch the main
 * database.  The brief comes from whichever provider is configured; with
 * none, the heuristic writes it.
 */
import fs from "node:fs";
import path from "node:path";
import { seedDemo } from "../src/lib/demo";

const target = path.resolve(process.env.DEMO_DB_PATH ?? ".data/demo.db");
if (target === path.resolve(".data/legislation.db")) {
  console.error("Refusing to overwrite the main database.  Choose another DEMO_DB_PATH.");
  process.exit(1);
}
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${target}${suffix}`, { force: true });

process.env.LEGISLATION_DB_PATH = target;
process.env.SEED_DEFAULT_ACTS = "false";

seedDemo().then(
  ({ changeId }) => {
    const relative = path.relative(process.cwd(), target);
    console.log(`Demo database written to ${relative} (change #${changeId} recorded).`);
    console.log(`Start the app on it with: LEGISLATION_DB_PATH=${relative} npm run dev`);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
