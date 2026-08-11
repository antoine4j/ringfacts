// LOCAL EXPERIMENT — changes nothing. Computes both tier orderings side by side
// using the real exported helpers from lib/tier.js, so neither variant is a
// reimplementation of the rule. No writes, no deploy, no repo edits.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
import { mentionsName, isTangential } from "../lib/tier.js";
import { loadSubjects, matchNamesOf } from "../lib/subjects.js";
import { openDb } from "../lib/db.js";

// CURRENT: headline first (lib/tier.js as it stands today)
const tierCurrent = (item, names, role) => {
  if (mentionsName(item.title, names)) return "main";
  if (role === "passing") return "tangential";
  return isTangential(item, names) ? "tangential" : "main";
};

// PROPOSED: passing first — the only change is the order of these two lines
const tierProposed = (item, names, role) => {
  if (role === "passing") return "tangential";
  if (mentionsName(item.title, names)) return "main";
  return isTangential(item, names) ? "tangential" : "main";
};

const subjects = await loadSubjects();
const namesFor = (s) => matchNamesOf(subjects, s);
const out = [];
const say = (s = "") => out.push(s);

// ---------------------------------------------------------------- CORPUS ---
// Fed with expect.subject_role: "if the matcher gets the role right, what does
// the tier rule do?" — isolates the rule from matcher error.
say("=".repeat(72));
say("A. CORPUS (48 labelled items) — scored against expect.digest_tier");
say("=".repeat(72));

const corpus = ["tune", "holdout"].flatMap((s) =>
  JSON.parse(readFileSync(join(HERE, `${s}.json`), "utf8")).items
);
// Only items the tier rule actually decides (it never runs on dropped items).
const scored = corpus.filter((i) => i.expect.digest_tier !== null);

let curOk = 0, propOk = 0;
const flips = [];
for (const i of scored) {
  const names = namesFor(i.subject);
  const item = { title: i.title, body: i.body };
  const c = tierCurrent(item, names, i.expect.subject_role);
  const p = tierProposed(item, names, i.expect.subject_role);
  if (c === i.expect.digest_tier) curOk++;
  if (p === i.expect.digest_tier) propOk++;
  if (c !== p) flips.push({ i, c, p });
}
say(`scored items: ${scored.length}  (of ${corpus.length}; the rest expect a drop, tier never runs)`);
say(`  CURRENT  correct: ${curOk}/${scored.length}  (${Math.round(100*curOk/scored.length)}%)`);
say(`  PROPOSED correct: ${propOk}/${scored.length}  (${Math.round(100*propOk/scored.length)}%)`);
say("");
say(`items whose tier CHANGES (${flips.length}):`);
say("  key    class          current -> proposed   want          verdict");
for (const { i, c, p } of flips) {
  const good = p === i.expect.digest_tier ? "FIXED" : c === i.expect.digest_tier ? "BROKEN" : "still wrong";
  say(`  ${i.key.padEnd(6)} ${i.class.padEnd(14)} ${c.padEnd(10)} -> ${p.padEnd(10)} ${String(i.expect.digest_tier).padEnd(12)} ${good}`);
  say(`         ${i.title.slice(0, 92)}`);
}
const stillWrong = scored.filter((i) => {
  const p = tierProposed({ title: i.title, body: i.body }, namesFor(i.subject), i.expect.subject_role);
  return p !== i.expect.digest_tier;
});
say("");
say(`still wrong after the change (${stillWrong.length}):`);
for (const i of stillWrong) {
  const p = tierProposed({ title: i.title, body: i.body }, namesFor(i.subject), i.expect.subject_role);
  say(`  ${i.key.padEnd(6)} ${i.class.padEnd(14)} got ${p.padEnd(11)} want ${i.expect.digest_tier}   role=${i.expect.subject_role}`);
  say(`         ${i.title.slice(0, 92)}`);
}

// --------------------------------------------------------------- ARCHIVE ---
// Real rows, real stored roles. No labels here — this answers "what would the
// group have seen differently", not "is it correct".
say("");
say("=".repeat(72));
say("B. LIVE ARCHIVE — what the group would actually have seen differently");
say("=".repeat(72));

const db = await openDb();
const { rows } = await db.query(`
  SELECT id, subject, title, posted, held_reason, digest_tier, subject_role,
         left(body, 4000) AS body
    FROM items ORDER BY id`);
await db.end();

const withRole = rows.filter((r) => r.subject_role);
say(`rows total: ${rows.length}   with a stored subject_role: ${withRole.length}   passing: ${withRole.filter(r=>r.subject_role==="passing").length}`);
say(`(subject_role shipped 2026-08-10, so older rows are null and the change cannot touch them)`);
say("");

const changed = [];
for (const r of rows) {
  const names = namesFor(r.subject);
  const item = { title: r.title, body: r.body };
  const c = tierCurrent(item, names, r.subject_role);
  const p = tierProposed(item, names, r.subject_role);
  if (c !== p) changed.push({ r, c, p });
}
say(`rows whose tier changes: ${changed.length}`);
for (const { r, c, p } of changed) {
  say(`  #${String(r.id).padEnd(4)} ${c} -> ${p}   posted=${r.posted}  stored_tier=${r.digest_tier ?? "-"}  role=${r.subject_role}`);
  say(`        ${r.title.slice(0, 96)}`);
}
const postedChanged = changed.filter(({ r }) => r.posted);
say("");
say(`of those, ACTUALLY POSTED to the group: ${postedChanged.length} — these are the headlines that would have become links:`);
for (const { r } of postedChanged) say(`  #${r.id}  ${r.title.slice(0, 96)}`);

console.log(out.join("\n"));
