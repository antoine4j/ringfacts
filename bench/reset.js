// Resets the bench database to an empty schema, so a second run is not
// eaten by dedup — and optionally fills it from a backup, so a step can be
// exercised against a copy of the real archive.
//
//   node bench/reset.js                          # empty tables, current schema
//   node bench/reset.js --from backup.json.gz    # then restore a daily backup into it
//
// Refuses anything but the bench database (bench/env.js checks the name).
// Production is never touched: this file reads bench/.env.bench and nothing
// else.

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { loadBenchEnv } from "./env.js";

await loadBenchEnv();
const { openDb, restoreTables } = await import("../lib/db.js");
const { parseBackup } = await import("../lib/backup.js");

const fromIndex = process.argv.indexOf("--from");
const backupPath = fromIndex >= 0 ? process.argv[fromIndex + 1] : null;

// Schema first, so a brand-new bench database gets its tables before the
// truncate below looks for them. migrate.js reads DATABASE_URL, now the
// bench one.
const migrate = spawnSync(process.execPath, [new URL("../migrate.js", import.meta.url).pathname], {
  stdio: "inherit",
  env: process.env,
});
if (migrate.status !== 0) throw new Error("migrate.js failed");

const db = await openDb();
try {
  // A second guard beside the one in bench/env.js: the truncate below is the
  // one destructive statement in the whole bench.
  const { rows } = await db.query("SELECT current_database() AS name");
  if (rows[0].name !== "bench") throw new Error(`connected to "${rows[0].name}", refusing to truncate`);

  await db.query("TRUNCATE claim_sources, claims, items RESTART IDENTITY");
  console.log("bench database emptied");

  if (backupPath) {
    const backup = parseBackup(await readFile(backupPath));
    const restored = await restoreTables(db, backup.tables);
    console.log(`restored backup taken ${backup.taken_at}:`, restored);
  }
} finally {
  await db.end();
}
