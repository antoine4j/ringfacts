// Restores a daily backup into the database in DATABASE_URL. Rows keep their
// original ids; rows that already exist are left alone; identity sequences are
// moved past the highest restored id. Nothing is ever deleted.
//
//   gcloud storage cp gs://<bucket>/backups/2026-09-04T11.json.gz /tmp/backup.json.gz
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
//     node scripts/restore-backup.js /tmp/backup.json.gz
//
// Restoring into a scratch branch first is the safe rehearsal:
//   DATABASE_URL=$(neonctl connection-string test --project-id <id> --database-name prod) ...

import { readFile } from "node:fs/promises";
import { openDb, restoreTables } from "../lib/db.js";
import { parseBackup } from "../lib/backup.js";

const [, , path] = process.argv;
if (!path) {
  console.error("usage: node scripts/restore-backup.js <backup.json.gz>");
  process.exit(2);
}

const backup = parseBackup(await readFile(path));
const counts = Object.fromEntries(
  Object.entries(backup.tables).map(([table, rows]) => [table, rows.length])
);
console.log(`backup taken ${backup.taken_at}:`, counts);

const client = await openDb();
try {
  const restored = await restoreTables(client, backup.tables);
  console.log("rows restored (skipping any that already existed):", restored);
} finally {
  await client.end();
}
