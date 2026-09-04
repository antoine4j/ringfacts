// The bench (bench/): run a battery of articles through one pipeline step on
// the test keys and the bench database, from any fresh session. Everything
// here runs on fakes; the steps take their dependencies as a context object,
// which is the whole point — the same seam the hunter has, one level up.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseEnvFile, mapBenchEnv } from "../bench/env.js";
import { toPipelineItem, resolveSubject, itemsFromFile } from "../bench/items.js";
import { STEPS, runStep, aggregateRuns, bucketFor } from "../bench/steps.js";
import { parseArgs } from "../bench/args.js";

const SUBJECTS = [
  { name: "Daniil Donchenko", aliases: [], matchNames: ["Donchenko", "Донченк"] },
  { name: "Ilia Topuria", aliases: [], matchNames: ["Topuria", "Топурі"] },
];

const corpusItem = (over = {}) => ({
  key: "a16", subject: "Daniel Donchenko", title: "Донченко проведе бій у Парижі - sport24.ua",
  source: "sport24.ua", url: "https://sport24.ua/x", published_at: "2026-07-31T11:19:00.000Z",
  edition: null, body: "Український боєць Донченко проведе бій 5 вересня. ".repeat(12),
  production: { posted: false, held_reason: "embedding", digest_tier: null, subject_role: null },
  expect: { verdict: "NEW", subject_role: "central", digest_tier: "main", claim_type: "announcement" },
  ...over,
});

describe("bench/env — the test keys, and nothing else", () => {
  test("parses KEY=VALUE lines, strips quotes, ignores comments and blanks", () => {
    const raw = parseEnvFile('# comment\nA=1\nB="two"\n\nC=\'three\'\nD=a=b\n');
    assert.deepEqual(raw, { A: "1", B: "two", C: "three", D: "a=b" });
  });

  test("maps the TEST keys onto the names the SDKs read", () => {
    const env = mapBenchEnv({
      ANTHROPIC_TEST_API_KEY: "ant-test", GEMINI_TEST_API_KEY: "gem-test",
      DATABASE_URL: "postgres://u:p@host/bench?sslmode=require", BENCH_CHAT_ID: "-100", TELEGRAM_BOT_TOKEN: "t",
    });
    assert.equal(env.ANTHROPIC_API_KEY, "ant-test");
    assert.equal(env.GEMINI_API_KEY, "gem-test");
    assert.equal(env.DATABASE_URL, "postgres://u:p@host/bench?sslmode=require");
    assert.equal(env.BENCH_CHAT_ID, "-100");
  });

  test("refuses a database that is not the bench database", () => {
    assert.throws(
      () => mapBenchEnv({ ANTHROPIC_TEST_API_KEY: "a", GEMINI_TEST_API_KEY: "g", DATABASE_URL: "postgres://u:p@host/prod" }),
      /bench database/
    );
  });

  test("refuses a file that carries an unprefixed production key", () => {
    assert.throws(
      () => mapBenchEnv({ ANTHROPIC_API_KEY: "prod!", ANTHROPIC_TEST_API_KEY: "a", GEMINI_TEST_API_KEY: "g", DATABASE_URL: "postgres://h/bench" }),
      /TEST/
    );
  });
});

describe("bench/items — corpus rows become pipeline items", () => {
  test("a corpus item becomes the shape huntSubject reads, body as feed content", () => {
    const item = toPipelineItem(corpusItem());
    assert.equal(item.title, "Донченко проведе бій у Парижі - sport24.ua");
    assert.equal(item.url, "https://sport24.ua/x");
    assert.equal(item.source, "sport24.ua");
    assert.ok(item.publishedAt instanceof Date);
    assert.match(item.feedContent, /Донченко проведе бій/);
    assert.equal(item.foundVia, "bench a16");
    assert.equal(item.key, "a16");
  });

  test("a subject is resolved by exact name, or by a name stem when the watchlist renamed him", () => {
    assert.equal(resolveSubject(SUBJECTS, "Ilia Topuria").name, "Ilia Topuria");
    assert.equal(resolveSubject(SUBJECTS, "Daniel Donchenko").name, "Daniil Donchenko");
    assert.equal(resolveSubject(SUBJECTS, "Nobody Known"), null);
  });

  test("itemsFromFile reads both the corpus wrapper and a bare array, filtered by key and limit", () => {
    const wrapped = { split: "tune", items: [corpusItem({ key: "a1" }), corpusItem({ key: "a2" }), corpusItem({ key: "a3" })] };
    assert.deepEqual(itemsFromFile(wrapped, {}).map((i) => i.key), ["a1", "a2", "a3"]);
    assert.deepEqual(itemsFromFile(wrapped.items, { limit: 2 }).map((i) => i.key), ["a1", "a2"]);
    assert.deepEqual(itemsFromFile(wrapped, { keys: ["a3", "a1"] }).map((i) => i.key), ["a1", "a3"]);
  });
});

describe("bench/steps — one named step, its dependencies handed in", () => {
  const ctx = (over = {}) => ({
    subjects: SUBJECTS,
    db: {},
    store: { domainRecord: async () => ({ items: 6, wrongSubject: 5, bodies: 0 }) },
    digestTierFor: (item, names, role) => (role === "passing" ? "tangential" : "main"),
    matchItem: async () => ({ verdict: "NEW", subject_role: "central", new_claim: { type: "announcement" } }),
    fetchArticleBody: async () => ({ body: "x".repeat(900), via: "json-ld" }),
    isUntrustedSource: (record) => record.wrongSubject / record.items >= 0.5 && record.bodies === 0,
    domainOf: (url) => new URL(url).hostname,
    ...over,
  });

  test("every step names what it needs, so the runner can refuse early", () => {
    for (const step of Object.values(STEPS)) {
      assert.ok(Array.isArray(step.needs), `${step.name} declares needs`);
      assert.equal(typeof step.run, "function");
    }
    assert.deepEqual(STEPS.tier.needs, []);
    assert.ok(STEPS.matcher.needs.includes("anthropic"));
    assert.ok(STEPS.extract.needs.includes("network"));
    assert.ok(STEPS.untrusted.needs.includes("db"));
  });

  test("tier: the stored role and the corpus expectation, side by side", async () => {
    const item = corpusItem({ production: { subject_role: "passing" }, expect: { digest_tier: "tangential" } });
    const row = await STEPS.tier.run(item, ctx());
    assert.equal(row.got, "tangential");
    assert.equal(row.want, "tangential");
    assert.equal(row.ok, true);
  });

  test("matcher: verdict, role and type against the expectation", async () => {
    const row = await STEPS.matcher.run(corpusItem(), ctx());
    assert.equal(row.got, "NEW/announcement/central");
    assert.equal(row.want, "NEW/announcement/central");
    assert.equal(row.ok, true);
  });

  test("matcher and bucket hand the matcher the subject's NAME, as the hunter does", async () => {
    // Regression: the bench passed the subject object, so every prompt read
    // "[object Object]" as the fighter's name (2026-09-04). The baseline
    // measured that way was worthless.
    const seen = [];
    const spy = ctx({ matchItem: async ({ subject }) => { seen.push(subject); return { verdict: "NO_CLAIM", subject_role: "central" }; }, domain: { loudTypes: [], ignoredTypes: [] } });
    await STEPS.matcher.run(corpusItem(), spy);
    await STEPS.bucket.run(corpusItem(), spy);
    assert.deepEqual(seen, ["Daniil Donchenko", "Daniil Donchenko"]);
  });

  test("matcher: an unresolvable subject is reported, not thrown", async () => {
    const row = await STEPS.matcher.run(corpusItem({ subject: "Nobody Known" }), ctx());
    assert.match(row.error, /subject/);
  });

  test("extract: which rung produced the body and how long it is", async () => {
    const row = await STEPS.extract.run(corpusItem(), ctx());
    assert.equal(row.got, "json-ld/900");
  });

  test("untrusted: the domain, its record, and whether the rule fires", async () => {
    const row = await STEPS.untrusted.run(corpusItem(), ctx());
    assert.equal(row.domain, "sport24.ua");
    assert.equal(row.got, "hold (5/6 wrong-subject, 0 bodies)");
  });

  test("runStep tallies ok/not-ok when expectations exist", async () => {
    const items = [
      corpusItem({ key: "a1", production: { subject_role: "passing" }, expect: { digest_tier: "tangential" } }),
      corpusItem({ key: "a2", production: { subject_role: "central" }, expect: { digest_tier: "tangential" } }),
    ];
    const result = await runStep(STEPS.tier, items, ctx());
    assert.equal(result.rows.length, 2);
    assert.equal(result.summary.total, 2); assert.equal(result.summary.scored, 2); assert.equal(result.summary.ok, 1);
  });
});

describe("bench/args", () => {
  test("parses --step, --from, --keys, --limit and --sink", () => {
    const args = parseArgs(["--step", "tier", "--from", "corpus/tune.json", "--keys", "a1,a2", "--limit", "5", "--sink"]);
    assert.deepEqual(args, { step: "tier", from: "corpus/tune.json", keys: ["a1", "a2"], split: null, limit: 5, repeat: 1, sink: true });
  });

  test("defaults: corpus tune split, no keys, no limit, no sink", () => {
    assert.deepEqual(parseArgs(["--step", "matcher"]), { step: "matcher", from: "corpus/tune.json", keys: null, split: null, limit: null, repeat: 1, sink: false });
  });

  test("a missing or unknown step is an error naming the choices", () => {
    assert.throws(() => parseArgs([]), /--step/);
    assert.throws(() => parseArgs(["--step", "nope"]), /tier/);
  });
});

describe("bench — the goals.md bucket, and K runs folded into one answer", () => {
  const domain = { loudTypes: ["announcement", "result"], ignoredTypes: ["lifestyle"] };
  const NEW = (type) => ({ verdict: "NEW", subject_role: "central", new_claim: { type } });

  test("bucketFor mirrors the hunter's routing", () => {
    assert.deepEqual(bucketFor({ verdict: "WRONG_SUBJECT" }, "main", domain), { bucket: "3", outcome: "wrong_subject" });
    assert.deepEqual(bucketFor(NEW("announcement"), "tangential", domain), { bucket: "1", outcome: "claim:announcement" });
    assert.deepEqual(bucketFor(NEW("quote"), "tangential", domain), { bucket: "2", outcome: "claim:quote" });
    assert.deepEqual(bucketFor(NEW("lifestyle"), "tangential", domain), { bucket: "3", outcome: "tangential" });
    assert.deepEqual(bucketFor({ verdict: "NO_CLAIM", subject_role: "passing" }, "tangential", domain), { bucket: "3", outcome: "tangential" });
    assert.deepEqual(bucketFor({ verdict: "NO_CLAIM", subject_role: "central" }, "main", domain), { bucket: "2", outcome: "main" });
  });

  test("bucket step: the matcher's role feeds the tier rule, and the bucket is scored", async () => {
    const ctx = {
      subjects: SUBJECTS, domain,
      digestTierFor: (item, names, role) => (role === "passing" ? "tangential" : "main"),
      matchItem: async () => ({ verdict: "NO_CLAIM", subject_role: "passing" }),
    };
    const row = await STEPS.bucket.run(corpusItem({ expect: { bucket: 3 } }), ctx);
    assert.equal(row.got, "3");
    assert.equal(row.want, "3");
    assert.equal(row.ok, true);
    assert.equal(row.outcome, "tangential");
    assert.equal(row.role, "passing");
  });

  test("aggregateRuns: the modal answer wins, agree counts its votes, errors do not vote", () => {
    const runs = [
      { key: "a1", got: "2", want: "2", ok: true },
      { key: "a1", got: "3", want: "2", ok: false },
      { key: "a1", got: "2", want: "2", ok: true },
      { key: "a1", error: "boom" },
    ];
    const folded = aggregateRuns(runs);
    assert.equal(folded.got, "2");
    assert.equal(folded.ok, true);
    assert.equal(folded.runs, 4);
    assert.equal(folded.agree, 2);
    assert.deepEqual(folded.votes, { 2: 2, 3: 1 });
    assert.equal(aggregateRuns([{ key: "a1", error: "boom" }]).error, "boom");
  });

  test("runStep with repeat asks K times, keeps row order under concurrency, and counts stable rows", async () => {
    let calls = 0;
    const ctx = {
      subjects: SUBJECTS, domain,
      digestTierFor: () => "main",
      // The first row flips between two answers; the second always agrees.
      matchItem: async ({ item }) => {
        calls++;
        const flip = item.key === "a1" && calls % 2 === 0;
        return { verdict: "NO_CLAIM", subject_role: flip ? "passing" : "central" };
      },
    };
    ctx.digestTierFor = (item, names, role) => (role === "passing" ? "tangential" : "main");
    const items = [corpusItem({ key: "a1", expect: { bucket: 2 } }), corpusItem({ key: "a2", expect: { bucket: 2 } })];
    const { rows, summary } = await runStep(STEPS.bucket, items, ctx, { repeat: 4, concurrency: 3 });
    assert.deepEqual(rows.map((r) => r.key), ["a1", "a2"]);
    assert.equal(calls, 8);
    assert.equal(rows[1].agree, 4);
    assert.equal(summary.repeat, 4);
    assert.equal(summary.stable >= 1, true);
    assert.deepEqual(summary.byWant["2"], { scored: 2, ok: summary.ok });
  });

  test("args: --split, --repeat, and a bad repeat", () => {
    const args = parseArgs(["--step", "bucket", "--split", "tune", "--repeat", "5"]);
    assert.equal(args.split, "tune");
    assert.equal(args.repeat, 5);
    assert.throws(() => parseArgs(["--step", "bucket", "--repeat", "0"]), /--repeat/);
  });

  test("items: --split narrows to one split before keys and limit", () => {
    const wrapped = { items: [corpusItem({ key: "a1", split: "tune" }), corpusItem({ key: "a2", split: "holdout" }), corpusItem({ key: "a3", split: "tune" })] };
    assert.deepEqual(itemsFromFile(wrapped, { split: "tune" }).map((i) => i.key), ["a1", "a3"]);
    assert.deepEqual(itemsFromFile(wrapped, { split: "tune", limit: 1 }).map((i) => i.key), ["a1"]);
  });
});
