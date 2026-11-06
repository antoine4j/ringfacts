// Compares the three models' readers on one week, before any judge runs: how
// far they agree with each other on every answer, how each and their majority
// score against the golden key (training and validation articles only; the
// test side is counted and left alone), where the pipeline's classifier,
// Decider and extractor differ from what all three readers say, which saved
// texts are not the article, and what the headline screen found among the
// unread. Writes a readable report to data/compare/ (it names headlines) and
// the counts alone to results/ (public).
//
// Usage: node --experimental-strip-types research/experiments/2026-11-05-three-judges/readers-compare.mjs 2026-09-28 [opus,fable,sonnet]

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decideTier, startingTierMap } from "../../../v0/pipeline/settings/tiers.ts";
import { agreementCounts, fleissKappa, majority, share } from "./stats.mjs";
import { CAREER_EVENTS, KINDS, NINE } from "./values.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const [monday, modelList = "opus,fable,sonnet"] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(monday ?? "")) throw new Error("usage: readers-compare.mjs <monday> [models]");
const models = modelList.split(",");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));

const week = read(join(here, "data", "history", `week-${monday}.json`));
const pipeline = read(join(here, "data", "history", `pipeline-${monday}.json`));
const labels = read(join(root, "golden", "labels.json"));
const sideOf = read(join(root, "golden", "split.json")).articles;
const flips = new Map();
for (const flip of read(join(root, "golden", "coin-flips.json")).flips) flips.set(`${flip.id} ${flip.question}`, new Set(flip.accepted));
const settings = { version: 1, classifier_version: "v7.7", tiers: startingTierMap(), digest_schedule: {} };

// Every reader's answers, by model and reading.
const answersOf = {};
for (const model of models) {
  // Every week's batches: a claim that spans weeks was read once.
  answersOf[model] = new Map();
  const root = join(here, "data", model);
  if (!existsSync(root)) continue;
  for (const other of readdirSync(root).filter((name) => name.startsWith("batches-"))) {
    for (const name of readdirSync(join(root, other)).filter((file) => file.endsWith(".out.json"))) {
      for (const answer of read(join(root, other, name))) answersOf[model].set(String(answer.reading_id), answer);
    }
  }
}
const readings = week.claims.flatMap((claim) => claim.readings.map((reading) => ({ ...reading, fighter: claim.fighter, claim_id: claim.id })));
const complete = readings.filter((reading) => models.every((model) => answersOf[model].has(reading.reading_id)));
const pipelineOf = new Map(pipeline.readings.map((row) => [row.reading_id, row]));

const lines = [`# Readers compared, week of ${monday}`, "", `Models: ${models.join(", ")}. Readings in the week: ${readings.length}; read by every model: ${complete.length}.`, ""];
const counts = { week: monday, models, readings: readings.length, complete: complete.length };
const answer = (model, reading, field) => answersOf[model].get(reading.reading_id)?.[field];
const majorityOf = (reading, field) => majority(models.map((model) => answer(model, reading, field)));
const table = (header, rows) => [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.join(" | ")} |`), ""];

// A. Agreement between the readers, per field.
const fields = [...NINE, "kind", "career_event", "first_source", "language"];
counts.agreement = {};
const agreeRows = [];
for (const field of fields) {
  const items = complete.map((reading) => models.map((model) => answer(model, reading, field)));
  const agreed = agreementCounts(items);
  const kappa = fleissKappa(items);
  counts.agreement[field] = { ...agreed, kappa };
  agreeRows.push([field, `${agreed.unanimous} (${share(agreed.unanimous, agreed.items).pct}%)`, agreed.majority, agreed.split, kappa ?? "–"]);
}
const bodyItems = complete.map((reading) => models.map((model) => (answer(model, reading, "body_problem") ? "problem" : "ok")));
const bodyAgreed = agreementCounts(bodyItems);
counts.agreement.body_problem = { ...bodyAgreed, kappa: fleissKappa(bodyItems) };
agreeRows.push(["body_problem (any)", `${bodyAgreed.unanimous} (${share(bodyAgreed.unanimous, bodyAgreed.items).pct}%)`, bodyAgreed.majority, bodyAgreed.split, counts.agreement.body_problem.kappa ?? "–"]);
lines.push("## How far the three readers agree", "", "Unanimous = all three the same; majority = two of three; split = all differ. Kappa is agreement beyond chance (1 = perfect, 0 = chance).", "", ...table(["Answer", "Unanimous", "Majority", "Split", "Kappa"], agreeRows));

// B. Against the golden key, training and validation only.
const golden = complete.filter((reading) => labels.articles[reading.production_item_id] && ["tune", "check"].includes(sideOf[reading.production_item_id]));
const testSide = complete.filter((reading) => sideOf[reading.production_item_id] === "test").length;
counts.golden = { scored: golden.length, test_side_left_alone: testSide, right: {} };
if (golden.length) {
  const rightOn = (who) => {
    const right = Object.fromEntries(NINE.map((question) => [question, 0]));
    let allNine = 0;
    for (const reading of golden) {
      const key = labels.articles[reading.production_item_id].answers;
      let here = 0;
      for (const question of NINE) {
        const got = who(reading, question);
        const accepted = flips.get(`${reading.production_item_id} ${question}`) ?? new Set([key[question]]);
        if (accepted.has(got)) { right[question]++; here++; }
      }
      if (here === NINE.length) allNine++;
    }
    return { ...right, all_nine: allNine };
  };
  const scorers = [...models.map((model) => [model, (reading, question) => answer(model, reading, question)]), ["majority", (reading, question) => majorityOf(reading, question)?.answer]];
  const unanimousOnly = golden.filter((reading) => NINE.every((question) => majorityOf(reading, question)?.unanimous));
  const pipelineRight = (reading, question) => pipelineOf.get(reading.reading_id)?.classification?.[question];
  scorers.push(["pipeline v7.7", pipelineRight]);
  const rows = scorers.map(([name, who]) => { const right = rightOn(who); counts.golden.right[name] = right; return [name, ...NINE.map((question) => right[question]), right.all_nine]; });
  lines.push(`## Against the golden key (${golden.length} training and validation articles in this week; ${testSide} test-side articles left alone)`, "", "Right answers out of " + golden.length + " per question; the last column is articles with all nine right.", "", ...table(["Reader", ...NINE.map((question) => question.replace("reports_his_", "")), "all nine"], rows));
  counts.golden.unanimous_articles = unanimousOnly.length;
  if (unanimousOnly.length) {
    let wrong = 0;
    for (const reading of unanimousOnly) for (const question of NINE) { const key = labels.articles[reading.production_item_id].answers; const accepted = flips.get(`${reading.production_item_id} ${question}`) ?? new Set([key[question]]); if (!accepted.has(majorityOf(reading, question).answer)) wrong++; }
    counts.golden.unanimous_wrong_answers = wrong;
    lines.push(`Where all three readers agree on all nine (${unanimousOnly.length} articles), their answers are wrong against the key on ${wrong} of ${unanimousOnly.length * NINE.length} answers.`, "");
  }
} else lines.push("## Against the golden key", "", "No training or validation articles in this week.", "");

// C. Against the pipeline's classifier: where all three readers agree and the pipeline differs.
counts.classifier = {};
const classRows = [];
for (const question of NINE) {
  let unanimous = 0;
  let differs = 0;
  for (const reading of complete) {
    const best = majorityOf(reading, question);
    const got = pipelineOf.get(reading.reading_id)?.classification?.[question];
    if (!best?.unanimous || got === undefined) continue;
    unanimous++;
    if (got !== best.answer) differs++;
  }
  counts.classifier[question] = { unanimous, pipeline_differs: differs };
  classRows.push([question, unanimous, `${differs} (${share(differs, unanimous).pct ?? "–"}%)`]);
}
lines.push("## Where the classifier differs from three agreeing readers", "", "Of the readings where all three readers gave the same answer, how many times v7.7 gave another: likely classifier errors (or a rule the readers apply differently).", "", ...table(["Question", "Readers unanimous", "Classifier differs"], classRows));

// D. The tier: the Decider on the readers' majority answers against v0's tier.
const tierRows = [];
const confusion = {};
let tierSame = 0;
let tierCounted = 0;
for (const reading of complete) {
  const row = pipelineOf.get(reading.reading_id);
  if (!row?.tier) continue;
  const answers = Object.fromEntries(NINE.map((question) => [question, majorityOf(reading, question)?.answer]));
  let ours;
  try { ours = decideTier(answers, "v7.7", settings).tier; } catch { continue; }
  tierCounted++;
  if (ours === row.tier) tierSame++;
  const key = `v0 ${row.tier} → readers ${ours}`;
  confusion[key] = (confusion[key] ?? 0) + 1;
  if (ours !== row.tier) tierRows.push({ reading, v0: row.tier, ours, headline: reading.headline, fighter: reading.fighter });
}
counts.tier = { counted: tierCounted, same: tierSame, confusion };
lines.push("## The tier, re-decided from the readers' majority answers", "", `Same tier as v0 on ${share(tierSame, tierCounted).text}. Pairs: ${Object.entries(confusion).sort().map(([key, count]) => `${key}: ${count}`).join("; ")}.`, "");
const worst = tierRows.filter((row) => (row.v0 === 1) !== (row.ours === 1));
if (worst.length) lines.push(`Tier-1 disagreements (${worst.length}): would post or not post differently.`, "", ...worst.slice(0, 40).map((row) => `- ${row.fighter}, v0 tier ${row.v0}, readers tier ${row.ours}: ${row.headline} (reading ${row.reading.reading_id})`), "");

// E. The extractor's kind against the readers' majority kind.
counts.extractor = { kind_same: 0, kind_counted: 0, no_claim_v0: 0, no_claim_readers: 0, no_claim_both: 0, pairs: {} };
for (const reading of complete) {
  const row = pipelineOf.get(reading.reading_id);
  const best = majorityOf(reading, "kind");
  const v0Kind = row?.extract?.kind;
  if (!v0Kind || !best) continue;
  counts.extractor.kind_counted++;
  if (v0Kind === best.answer) counts.extractor.kind_same++;
  const key = `${v0Kind} → ${best.answer}`;
  if (v0Kind !== best.answer) counts.extractor.pairs[key] = (counts.extractor.pairs[key] ?? 0) + 1;
  const v0No = row.extract?.claim === "NO CLAIM";
  const oursNo = models.map((model) => answer(model, reading, "claim") === "NO CLAIM").filter(Boolean).length >= 2;
  if (v0No) counts.extractor.no_claim_v0++;
  if (oursNo) counts.extractor.no_claim_readers++;
  if (v0No && oursNo) counts.extractor.no_claim_both++;
}
const topPairs = Object.entries(counts.extractor.pairs).sort((a, b) => b[1] - a[1]).slice(0, 8);
lines.push("## The extractor's kind against the readers' majority", "", `Same kind on ${share(counts.extractor.kind_same, counts.extractor.kind_counted).text}. NO CLAIM: v0 ${counts.extractor.no_claim_v0}, readers ${counts.extractor.no_claim_readers}, both ${counts.extractor.no_claim_both}.`, "", `Most common differences (v0 → readers): ${topPairs.map(([key, count]) => `${key} ${count}`).join("; ") || "none"}.`, "");

// F. The saved text: copies of another article (a dedup signal) apart from texts that are not the article (a fetch signal).
counts.text = { copies_majority: 0, problems_majority: 0, by_body_via: {}, by_outlet: {}, languages: {}, problem_kinds: {} };
for (const reading of complete) {
  const flags = models.map((model) => answer(model, reading, "body_problem") || "").filter(Boolean);
  const copies = flags.filter((flag) => flag === "copy").length;
  const others = flags.filter((flag) => flag !== "copy");
  const isCopy = copies >= 2;
  const isProblem = !isCopy && others.length >= 2;
  const via = reading.body_via ?? "unknown";
  counts.text.by_body_via[via] ??= { readings: 0, copies: 0, problems: 0 };
  counts.text.by_body_via[via].readings++;
  counts.text.by_outlet[reading.outlet] ??= { readings: 0, copies: 0, problems: 0 };
  counts.text.by_outlet[reading.outlet].readings++;
  if (isCopy) { counts.text.copies_majority++; counts.text.by_body_via[via].copies++; counts.text.by_outlet[reading.outlet].copies++; }
  if (isProblem) { counts.text.problems_majority++; counts.text.by_body_via[via].problems++; counts.text.by_outlet[reading.outlet].problems++; const kind = majority(others)?.answer ?? "other"; counts.text.problem_kinds[kind] = (counts.text.problem_kinds[kind] ?? 0) + 1; }
  const language = majorityOf(reading, "language")?.answer ?? "?";
  counts.text.languages[language] = (counts.text.languages[language] ?? 0) + 1;
}
const outletRows = Object.entries(counts.text.by_outlet).filter(([, row]) => row.copies || row.problems).sort((a, b) => (b[1].copies + b[1].problems) - (a[1].copies + a[1].problems)).slice(0, 12);
lines.push("## The saved text", "", `A copy of another article in the week (at least two readers): ${share(counts.text.copies_majority, complete.length).text}. Not the article (navigation, cut off, another story, a stub): ${share(counts.text.problems_majority, complete.length).text}${Object.keys(counts.text.problem_kinds).length ? `, of which ${Object.entries(counts.text.problem_kinds).map(([kind, count]) => `${kind} ${count}`).join(", ")}` : ""}.`, "", ...table(["Fetched via", "Readings", "Copies", "Not the article"], Object.entries(counts.text.by_body_via).map(([via, row]) => [via, row.readings, row.copies, row.problems])), ...table(["Outlet", "Readings", "Copies", "Not the article"], outletRows.map(([outlet, row]) => [outlet, row.readings, row.copies, row.problems])), `Languages: ${Object.entries(counts.text.languages).sort((a, b) => b[1] - a[1]).map(([language, count]) => `${language} ${count}`).join(", ")}.`, "");

// G. Where the news came from, and career events named.
counts.sources = {};
counts.career = Object.fromEntries(CAREER_EVENTS.map((event) => [event, 0]));
for (const reading of complete) {
  const source = majorityOf(reading, "first_source")?.answer ?? "split";
  counts.sources[source] = (counts.sources[source] ?? 0) + 1;
  const event = majorityOf(reading, "career_event");
  if (event?.answer) counts.career[event.answer] = (counts.career[event.answer] ?? 0) + 1;
}
lines.push("## Where the news came from (readers' majority)", "", Object.entries(counts.sources).sort((a, b) => b[1] - a[1]).map(([source, count]) => `${source} ${count}`).join(", ") + ".", "", "Career events named (majority): " + Object.entries(counts.career).filter(([, count]) => count).map(([event, count]) => `${event} ${count}`).join(", ") + ".", "");

// H. The headline screen of the unread.
const screens = {};
for (const model of models) {
  const file = join(here, "data", model, `screen-${monday}.out.json`);
  if (existsSync(file)) screens[model] = new Map(read(file).map((item) => [String(item.reading_id), item]));
}
const screened = week.unread.filter((reading) => Object.values(screens).every((map) => map.has(reading.reading_id)));
counts.screen = { unread: week.unread.length, screened: screened.length, models: Object.keys(screens), news_unanimous: 0, news_majority: 0, by_fighter: {}, by_outlet: {} };
for (const reading of screened) {
  const votes = Object.values(screens).map((map) => map.get(reading.reading_id).looks_like_news);
  const best = majority(votes);
  const yes = best?.answer === "yes" && best.count > votes.length / 2;
  counts.screen.by_fighter[reading.fighter] ??= { unread: 0, news: 0 };
  counts.screen.by_fighter[reading.fighter].unread++;
  counts.screen.by_outlet[reading.outlet] ??= { unread: 0, news: 0 };
  counts.screen.by_outlet[reading.outlet].unread++;
  if (yes) { counts.screen.news_majority++; counts.screen.by_fighter[reading.fighter].news++; counts.screen.by_outlet[reading.outlet].news++; }
  if (yes && best.unanimous) counts.screen.news_unanimous++;
}
lines.push(`## The unread, screened by headline (${screened.length} of ${week.unread.length}, by ${Object.keys(screens).join(", ")})`, "", `Looks like news of the fighter: ${counts.screen.news_majority} by majority, ${counts.screen.news_unanimous} unanimously. Headline-only evidence.`, "", ...table(["Fighter", "Unread", "Looks like news"], Object.entries(counts.screen.by_fighter).map(([fighter, row]) => [fighter, row.unread, row.news])), ...table(["Outlet", "Unread", "Looks like news"], Object.entries(counts.screen.by_outlet).sort((a, b) => b[1].news - a[1].news).slice(0, 10).map(([outlet, row]) => [outlet, row.unread, row.news])));

mkdirSync(join(here, "data", "compare"), { recursive: true });
mkdirSync(join(here, "results"), { recursive: true });
writeFileSync(join(here, "data", "compare", `readers-${monday}.md`), lines.join("\n") + "\n");
writeFileSync(join(here, "results", `readers-${monday}.json`), JSON.stringify(counts, null, 1));
console.log(lines.join("\n"));
console.log(`\n→ data/compare/readers-${monday}.md, results/readers-${monday}.json`);
