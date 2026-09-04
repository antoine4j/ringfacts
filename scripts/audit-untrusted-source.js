// Replays the untrusted-source rule (lib/untrusted.js) over the archive,
// point in time: each item is judged by the record its domain had BEFORE it
// arrived, which is what the hunter would have seen. Read-only: no writes, no
// posting, no LLM calls.
//
// Reports, per domain that ever trips the rule, how many items it would have
// held, and — the part that matters — which POSTED items would have been
// held: spam caught, or real news lost. A run against the production archive
// (or a Neon branch of it) is the measurement behind
// docs/decisions.md#untrusted-source; re-run it before touching a threshold.
//
// Run:
//   DATABASE_URL=$(neonctl connection-string test --project-id <id> --database-name prod) \
//     node scripts/audit-untrusted-source.js
import { openDb } from "../lib/db.js";
import { domainOf, isUntrustedSource, configuredThresholds } from "../lib/untrusted.js";

const client = await openDb();
const { rows } = await client.query(
  `SELECT id, url, resolved_url, source, subject, title, posted, held_reason, body IS NOT NULL AS has_body
     FROM items ORDER BY id`
);
await client.end();

const thresholds = configuredThresholds();
console.log(`${rows.length} items; thresholds ${JSON.stringify(thresholds)}\n`);

// The record each domain has accumulated so far, grown as the replay walks
// forward — a domain's own item never counts toward its own judgement.
const records = new Map();
const held = new Map(); // domain -> items the rule would have held

for (const row of rows) {
  const domain = domainOf(row.resolved_url ?? row.url);
  if (!domain) continue;

  const record = records.get(domain) ?? { items: 0, wrongSubject: 0, bodies: 0 };
  if (isUntrustedSource(record, thresholds)) {
    if (!held.has(domain)) held.set(domain, []);
    held.get(domain).push(row);
  }

  // Grow the record after judging, as production does.
  record.items += 1;
  if (row.held_reason === "wrong_subject") record.wrongSubject += 1;
  if (row.has_body) record.bodies += 1;
  records.set(domain, record);
}

if (held.size === 0) {
  console.log("No domain ever trips the rule.");
} else {
  for (const [domain, items] of held) {
    const record = records.get(domain);
    const posted = items.filter((row) => row.posted);
    console.log(`${domain} — final record ${record.wrongSubject}/${record.items} wrong-subject, ${record.bodies} bodies`);
    console.log(`  would hold ${items.length} items, of which ${posted.length} actually POSTED to the group:`);
    for (const row of posted) {
      console.log(`    #${row.id} [${row.subject}] ${row.title.slice(0, 80)}`);
    }
  }
}

// The other side of the ledger: domains with a majority-junk record that the
// bodies condition protects. Each one is a real outlet the ratio alone would
// have muzzled.
const protectedByBodies = [...records]
  .filter(([, r]) => r.items >= thresholds.minItems && r.wrongSubject / r.items >= thresholds.minRatio && r.bodies > 0)
  .sort((a, b) => b[1].items - a[1].items);
if (protectedByBodies.length) {
  console.log("\nMajority wrong-subject but readable — trusted because a body was extracted:");
  for (const [domain, r] of protectedByBodies) {
    console.log(`  ${domain}: ${r.wrongSubject}/${r.items} wrong-subject, ${r.bodies} bodies`);
  }
}
