// LOCAL EXPERIMENT — measures how STABLE and how ACCURATE Haiku's subject_role
// and verdict are, by asking the same question K times per item.
//
// Safety: the ONLY database call is activeClaims() — a SELECT. Nothing that
// writes is imported at all (no insertItem, insertClaim, markUnposted,
// markPosted, linkClaimSource, setClaimMessageId, confirmClaim), and there is
// no Telegram import, so no message can be sent. Runs on the laptop, so nothing
// reaches Cloud Logging. Production data is untouched.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
import { openDb, activeClaims } from "../lib/db.js";
import { matchItem } from "../lib/matcher.js";

const K = Number(process.env.K || 5);
const CONCURRENCY = 4;

const corpus = ["tune", "holdout"].flatMap((s) =>
  JSON.parse(readFileSync(join(HERE, `${s}.json`), "utf8")).items
);

const db = await openDb();
// One read per subject, reused for every item — the candidate list the matcher
// would have seen. Read-only.
const claimsBySubject = new Map();
for (const subject of new Set(corpus.map((i) => i.subject))) {
  claimsBySubject.set(subject, await activeClaims(db, subject));
}
await db.end(); // DB closed before a single LLM call is made.

console.error(
  `corpus ${corpus.length} items x K=${K} = ${corpus.length * K} Haiku calls; ` +
  `candidates per subject: ${[...claimsBySubject].map(([s, c]) => `${s.split(" ").pop()}=${c.length}`).join(" ")}`
);

const results = [];
let done = 0;
const queue = corpus.flatMap((i) => Array.from({ length: K }, (_, k) => ({ i, k })));

async function worker() {
  while (queue.length) {
    const { i, k } = queue.shift();
    let out;
    try {
      const v = await matchItem({
        subject: i.subject,
        item: { title: i.title, body: i.body, rssDescription: null,
                source: i.source, publishedAt: new Date(i.published_at), foundVia: null },
        candidates: claimsBySubject.get(i.subject),
        confusables: undefined,
      });
      out = { verdict: v.verdict, role: v.subject_role ?? null };
    } catch (err) {
      out = { verdict: "ERROR", role: null, error: err.message };
      if (done < 2) console.error("FIRST ERROR:", err.message);
    }
    results.push({ key: i.key, run: k, ...out });
    if (++done % 25 === 0) console.error(`  ${done}/${corpus.length * K}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// ---------------------------------------------------------------- report ---
const mode = (arr) => {
  const c = {};
  for (const v of arr) c[String(v)] = (c[String(v)] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0];
};
const L = [];
const say = (s = "") => L.push(s);

say("=".repeat(96));
say(`HAIKU VARIATION — ${corpus.length} items x ${K} runs`);
say("=".repeat(96));

const rows = corpus.map((i) => {
  const mine = results.filter((r) => r.key === i.key);
  const [roleMode, roleN] = mode(mine.map((r) => r.role));
  const [verdMode, verdN] = mode(mine.map((r) => r.verdict));
  return {
    i, mine,
    roleMode: roleMode === "null" ? null : roleMode, roleStable: roleN / mine.length,
    verdMode, verdStable: verdN / mine.length,
    roleOk: (roleMode === "null" ? null : roleMode) === i.expect.subject_role,
    verdOk: verdMode === i.expect.verdict,
  };
});

const pct = (n, d) => `${Math.round((100 * n) / d)}%`;
const fullyStableRole = rows.filter((r) => r.roleStable === 1).length;
const fullyStableVerd = rows.filter((r) => r.verdStable === 1).length;
say("");
say(`STABILITY (same answer all ${K} runs)`);
say(`  subject_role: ${fullyStableRole}/${rows.length} items (${pct(fullyStableRole, rows.length)})`);
say(`  verdict:      ${fullyStableVerd}/${rows.length} items (${pct(fullyStableVerd, rows.length)})`);
say("");
say(`ACCURACY of the modal answer vs the corpus label`);
say(`  subject_role: ${rows.filter((r) => r.roleOk).length}/${rows.length} (${pct(rows.filter((r) => r.roleOk).length, rows.length)})`);
say(`  verdict:      ${rows.filter((r) => r.verdOk).length}/${rows.length} (${pct(rows.filter((r) => r.verdOk).length, rows.length)})`);

// The risk the tier reorder introduces: a real story wrongly called "passing".
const falsePassing = rows.filter((r) => r.expectNot !== undefined ? false : r.i.expect.subject_role !== "passing" && r.mine.some((m) => m.role === "passing"));
say("");
say(`RISK CHECK — items whose label is NOT 'passing' but Haiku said 'passing' at least once`);
say(`(under the reorder these would be wrongly folded)  count: ${falsePassing.length}`);
for (const r of falsePassing) {
  const n = r.mine.filter((m) => m.role === "passing").length;
  say(`  ${r.i.key.padEnd(6)} ${r.i.class.padEnd(14)} label=${String(r.i.expect.subject_role).padEnd(11)} passing ${n}/${K} runs`);
  say(`         ${r.i.title.slice(0, 88)}`);
}

const unstable = rows.filter((r) => r.roleStable < 1);
say("");
say(`UNSTABLE ROLE — items where Haiku changed its mind across runs (${unstable.length})`);
for (const r of unstable) {
  const dist = {};
  for (const m of r.mine) dist[String(m.role)] = (dist[String(m.role)] || 0) + 1;
  say(`  ${r.i.key.padEnd(6)} ${r.i.class.padEnd(14)} ${JSON.stringify(dist).padEnd(34)} label=${r.i.expect.subject_role}`);
  say(`         ${r.i.title.slice(0, 88)}`);
}

say("");
say("PER-ITEM");
say("  key    class          label-role   modal-role   role  label-verdict modal-verdict verd");
for (const r of rows) {
  say(
    `  ${r.i.key.padEnd(6)} ${r.i.class.padEnd(14)} ${String(r.i.expect.subject_role).padEnd(12)} ` +
    `${String(r.roleMode).padEnd(12)} ${(r.roleOk ? "ok" : "MISS").padEnd(5)} ` +
    `${String(r.i.expect.verdict).padEnd(13)} ${r.verdMode.padEnd(13)} ${r.verdOk ? "ok" : "MISS"}`
  );
}
console.log(L.join("\n"));
