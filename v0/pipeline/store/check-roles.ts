// Logs in as each of v0's roles and tries what it should and should not be
// able to do, then prints one line per check. Every write is made inside a
// transaction that is rolled back, so the check leaves nothing behind.
//
//   node --env-file=.env.v0 v0/pipeline/store/check-roles.ts

import pg from "pg";

type Check = { role: string; url: string | undefined; label: string; sql: string; allowed: boolean };

const ARTICLE = "INSERT INTO articles (production_item_id, url, headline, published_at, production_subject) VALUES (-1, 'x', 'x', now(), 'Ilia Topuria') RETURNING id";

const CHECKS: Check[] = [
  { role: "v0_feed", url: process.env.V0_FEED_DATABASE_URL, label: "reads production's items", sql: "SELECT count(*) FROM items", allowed: true },
  { role: "v0_feed", url: process.env.V0_FEED_DATABASE_URL, label: "reads production's claims", sql: "SELECT count(*) FROM claims", allowed: false },
  { role: "v0_feed", url: process.env.V0_FEED_DATABASE_URL, label: "reads production's stories", sql: "SELECT count(*) FROM stories", allowed: false },
  { role: "v0_feed", url: process.env.V0_FEED_DATABASE_URL, label: "writes production's items", sql: "UPDATE items SET title = title WHERE id = -1", allowed: false },
  { role: "v0_pipeline", url: process.env.V0_DATABASE_URL, label: "adds an article", sql: ARTICLE, allowed: true },
  { role: "v0_pipeline", url: process.env.V0_DATABASE_URL, label: "deletes a fighter", sql: "DELETE FROM fighters WHERE name = 'nobody'", allowed: false },
  { role: "v0_pipeline", url: process.env.V0_DATABASE_URL, label: "changes a settings row", sql: "UPDATE settings SET note = note", allowed: false },
  { role: "v0_pipeline", url: process.env.V0_DATABASE_URL, label: "adds settings", sql: "INSERT INTO settings (author, classifier_version, tiers, digest_schedule) VALUES ('x', 'x', '{}', '{}')", allowed: false },
  { role: "v0_pipeline", url: process.env.V0_DATABASE_URL?.replace("/v0?", "/prod?"), label: "reads production's items from its own login", sql: "SELECT count(*) FROM items", allowed: false },
  { role: "v0_editor", url: process.env.V0_EDITOR_DATABASE_URL, label: "adds settings", sql: "INSERT INTO settings (author, classifier_version, tiers, digest_schedule) VALUES ('x', 'x', '{}', '{}')", allowed: true },
  { role: "v0_editor", url: process.env.V0_EDITOR_DATABASE_URL, label: "adds an article", sql: ARTICLE, allowed: false },
  { role: "v0_editor", url: process.env.V0_EDITOR_DATABASE_URL, label: "reads the reading_now view", sql: "SELECT count(*) FROM reading_now", allowed: true },
];

/**
 * Runs one statement as one role inside a rolled-back transaction.
 *
 * @param check  The role, its address and the statement.
 * @returns Whether the database let it through, and the refusal if not.
 */
async function attempt(check: Check): Promise<{ ran: boolean; why: string }> {
  const client = new pg.Client({ connectionString: check.url });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query(check.sql);
    return { ran: true, why: "" };
  } catch (error) {
    return { ran: false, why: (error as Error).message };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

/**
 * Runs every check and exits non-zero if any role can do more, or less, than it should.
 */
async function main(): Promise<void> {
  let failures = 0;
  for (const check of CHECKS) {
    const { ran, why } = await attempt(check);
    const asExpected = ran === check.allowed;
    if (!asExpected) failures += 1;
    const verdict = asExpected ? "ok  " : "FAIL";
    const outcome = ran ? "allowed" : `refused (${why.slice(0, 70)})`;
    console.log(`${verdict} ${check.role.padEnd(12)} ${check.label.padEnd(44)} ${outcome}`);
  }
  if (failures) process.exit(1);
}

if (import.meta.main) await main();
