// The readers over the whole history, each reading once: agreement between
// the three models on every answer, each model and the majority against the
// golden key (training and validation articles only; the test side is
// counted and left alone), the classifier, the Decider and the extractor
// against three agreeing readers, by fighter and by language, the saved
// text's copies and problems by fetch method and outlet, and the headline
// screen of the unread by fighter and outlet. Writes data/compare/history-readers.md
// (names outlets, no article text) and results/history-readers.json.
//
// Usage: node --experimental-strip-types research/experiments/2026-11-05-three-judges/history-readers.mjs [opus,fable,sonnet]

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decideTier, startingTierMap } from "../../../v0/pipeline/settings/tiers.ts";
import { agreementCounts, fleissKappa, majority, share } from "./stats.mjs";
import { CAREER_EVENTS, NINE } from "./values.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const models = (process.argv[2] ?? "opus,fable,sonnet").split(",");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const table = (header, rows) => [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.join(" | ")} |`), ""];
const pct = (count, of) => (of ? `${count} (${share(count, of).pct}%)` : "–");

// Every reading once, with its claim, week, pipeline answers; every unread once.
const weeks = readdirSync(join(here, "data", "history")).filter((name) => /^week-\d{4}-\d{2}-\d{2}\.json$/.test(name)).map((name) => name.slice(5, 15)).sort();
const readings = new Map();
const unread = new Map();
const pipelineOf = new Map();
for (const monday of weeks) {
  const week = read(join(here, "data", "history", `week-${monday}.json`));
  for (const row of read(join(here, "data", "history", `pipeline-${monday}.json`)).readings) pipelineOf.set(row.reading_id, row);
  for (const claim of week.claims) for (const reading of claim.readings) if (!readings.has(reading.reading_id)) readings.set(reading.reading_id, { ...reading, fighter: claim.fighter, claim_id: claim.id, week: monday });
  for (const reading of week.unread) if (!unread.has(reading.reading_id)) unread.set(reading.reading_id, { ...reading, week: monday });
}

// Every reader's and screener's answers, by model.
const answersOf = {};
const screensOf = {};
for (const model of models) {
  answersOf[model] = new Map();
  screensOf[model] = new Map();
  const folder = join(here, "data", model);
  for (const other of readdirSync(folder).filter((name) => name.startsWith("batches-"))) {
    for (const name of readdirSync(join(folder, other)).filter((file) => file.endsWith(".out.json"))) for (const answer of read(join(folder, other, name))) answersOf[model].set(String(answer.reading_id), answer);
  }
  for (const name of readdirSync(folder).filter((file) => /^screen-.*\.out\.json$/.test(file))) for (const item of read(join(folder, name))) screensOf[model].set(String(item.reading_id), item);
}
const complete = [...readings.values()].filter((reading) => models.every((model) => answersOf[model].has(reading.reading_id)));
const answer = (model, reading, field) => answersOf[model].get(reading.reading_id)?.[field];
const majorityOf = (reading, field) => majority(models.map((model) => answer(model, reading, field)));

const counts = { models, weeks, readings: readings.size, complete: complete.length, unread: unread.size };
const lines = [`# The readers over the whole history`, "", `Models: ${models.join(", ")}. Weeks: ${weeks[0]} to ${weeks.at(-1)}. Readings: ${readings.size}, read by every model: ${complete.length}. Unread (no saved text): ${unread.size}.`, ""];

// A. Agreement.
counts.agreement = {};
const agreeRows = [];
for (const field of [...NINE, "kind", "career_event", "first_source"]) {
  const items = complete.map((reading) => models.map((model) => answer(model, reading, field)));
  const agreed = agreementCounts(items);
  counts.agreement[field] = { ...agreed, kappa: fleissKappa(items) };
  agreeRows.push([field, pct(agreed.unanimous, agreed.items), agreed.majority, agreed.split, counts.agreement[field].kappa ?? "–"]);
}
lines.push("## How far the three readers agree", "", ...table(["Answer", "Unanimous", "Majority", "Split", "Kappa"], agreeRows));

// B. Against the golden key.
const labels = read(join(root, "golden", "labels.json"));
const sideOf = read(join(root, "golden", "split.json")).articles;
const flips = new Map();
for (const flip of read(join(root, "golden", "coin-flips.json")).flips) flips.set(`${flip.id} ${flip.question}`, new Set(flip.accepted));
const golden = complete.filter((reading) => labels.articles[reading.production_item_id] && ["tune", "check"].includes(sideOf[reading.production_item_id]));
const testSide = complete.filter((reading) => sideOf[reading.production_item_id] === "test").length;
const accepted = (reading, question) => flips.get(`${reading.production_item_id} ${question}`) ?? new Set([labels.articles[reading.production_item_id].answers[question]]);
const rightOn = (who, rows) => {
  const right = Object.fromEntries(NINE.map((question) => [question, 0]));
  let allNine = 0;
  for (const reading of rows) {
    let here = 0;
    for (const question of NINE) if (accepted(reading, question).has(who(reading, question))) { right[question]++; here++; }
    if (here === NINE.length) allNine++;
  }
  return { ...right, all_nine: allNine };
};
counts.golden = { scored: golden.length, test_side_left_alone: testSide, right: {} };
const scorers = [...models.map((model) => [model, (reading, question) => answer(model, reading, question)]), ["majority", (reading, question) => majorityOf(reading, question)?.answer], ["pipeline v7.7", (reading, question) => pipelineOf.get(reading.reading_id)?.classification?.[question]]];
const goldenRows = scorers.map(([name, who]) => { const right = rightOn(who, golden); counts.golden.right[name] = right; return [name, ...NINE.map((question) => pct(right[question], golden.length)), pct(right.all_nine, golden.length)]; });
lines.push(`## Against the golden key: ${golden.length} training and validation articles (${testSide} test-side articles counted and left alone)`, "", "Right answers per question; the last column is articles with all nine right. The golden set ends on 17 Sep, so this covers the first seven weeks.", "", ...table(["Reader", ...NINE.map((question) => question.replace("reports_his_", "")), "all nine"], goldenRows));
const unanimousGolden = golden.filter((reading) => NINE.every((question) => majorityOf(reading, question)?.unanimous));
let unanimousWrong = 0;
for (const reading of unanimousGolden) for (const question of NINE) if (!accepted(reading, question).has(majorityOf(reading, question).answer)) unanimousWrong++;
counts.golden.unanimous_articles = unanimousGolden.length;
counts.golden.unanimous_wrong_answers = unanimousWrong;
lines.push(`Where all three readers agree on all nine answers (${unanimousGolden.length} articles), they are wrong against the key on ${unanimousWrong} of ${unanimousGolden.length * NINE.length} answers (${share(unanimousWrong, unanimousGolden.length * NINE.length).pct}%).`, "");
// Per question: when the readers are unanimous, how often the key agrees.
const perQ = [];
for (const question of NINE) {
  const rows = golden.filter((reading) => majorityOf(reading, question)?.unanimous);
  const wrong = rows.filter((reading) => !accepted(reading, question).has(majorityOf(reading, question).answer)).length;
  perQ.push([question, rows.length, pct(wrong, rows.length)]);
}
lines.push("Per question, when the three agree, how often the key still says otherwise:", "", ...table(["Question", "Unanimous articles", "Key disagrees"], perQ));

// C. The classifier against three agreeing readers, in all and by fighter.
counts.classifier = {};
const classRows = [];
const byFighter = {};
for (const question of NINE) {
  let unanimous = 0, differs = 0;
  for (const reading of complete) {
    const best = majorityOf(reading, question);
    const got = pipelineOf.get(reading.reading_id)?.classification?.[question];
    if (!best?.unanimous || got === undefined) continue;
    unanimous++;
    byFighter[reading.fighter] ??= { unanimous: 0, differs: 0 };
    byFighter[reading.fighter].unanimous++;
    if (got !== best.answer) { differs++; byFighter[reading.fighter].differs++; }
  }
  counts.classifier[question] = { unanimous, pipeline_differs: differs };
  classRows.push([question, unanimous, pct(differs, unanimous)]);
}
counts.classifier_by_fighter = byFighter;
lines.push("## The classifier against three agreeing readers", "", "Of the readings where all three readers gave the same answer, how often v7.7 gave another (likely classifier errors, or a rule the readers apply differently).", "", ...table(["Question", "Readers unanimous", "Classifier differs"], classRows), ...table(["Fighter", "Unanimous answers", "Classifier differs"], Object.entries(byFighter).map(([fighter, row]) => [fighter, row.unanimous, pct(row.differs, row.unanimous)])));

// D. The tier.
const settings = { version: 1, classifier_version: "v7.7", tiers: startingTierMap(), digest_schedule: {} };
counts.tier = { counted: 0, same: 0, confusion: {}, tier1_flips: [] };
for (const reading of complete) {
  const row = pipelineOf.get(reading.reading_id);
  if (!row?.tier) continue;
  const answers = Object.fromEntries(NINE.map((question) => [question, majorityOf(reading, question)?.answer]));
  let ours;
  try { ours = decideTier(answers, "v7.7", settings).tier; } catch { continue; }
  counts.tier.counted++;
  if (ours === row.tier) counts.tier.same++;
  const key = `v0 ${row.tier} → readers ${ours}`;
  counts.tier.confusion[key] = (counts.tier.confusion[key] ?? 0) + 1;
  if ((ours === 1) !== (row.tier === 1)) counts.tier.tier1_flips.push({ reading_id: reading.reading_id, fighter: reading.fighter, v0: row.tier, readers: ours, posted: Boolean(row.posted_at) });
}
lines.push("## The tier, re-decided from the readers' majority answers", "", `Same tier as v0 on ${share(counts.tier.same, counts.tier.counted).text}. ${Object.entries(counts.tier.confusion).sort().map(([key, count]) => `${key}: ${count}`).join("; ")}.`, "", `Tier-1 disagreements: ${counts.tier.tier1_flips.length} (v0 tier 1 but readers say lower: ${counts.tier.tier1_flips.filter((flip) => flip.v0 === 1).length}; readers say tier 1 but v0 lower: ${counts.tier.tier1_flips.filter((flip) => flip.readers === 1).length}).`, "");

// E. The extractor's kind.
counts.extractor = { same: 0, counted: 0, pairs: {}, no_claim_v0: 0, no_claim_readers: 0, no_claim_both: 0 };
for (const reading of complete) {
  const row = pipelineOf.get(reading.reading_id);
  const best = majorityOf(reading, "kind");
  if (!row?.extract?.kind || !best) continue;
  counts.extractor.counted++;
  if (row.extract.kind === best.answer) counts.extractor.same++;
  else { const key = `${row.extract.kind} → ${best.answer}`; counts.extractor.pairs[key] = (counts.extractor.pairs[key] ?? 0) + 1; }
  const v0No = row.extract.claim === "NO CLAIM";
  const oursNo = models.filter((model) => answer(model, reading, "claim") === "NO CLAIM").length >= 2;
  if (v0No) counts.extractor.no_claim_v0++;
  if (oursNo) counts.extractor.no_claim_readers++;
  if (v0No && oursNo) counts.extractor.no_claim_both++;
}
lines.push("## The extractor's kind against the readers' majority", "", `Same kind on ${share(counts.extractor.same, counts.extractor.counted).text}. NO CLAIM: v0 ${counts.extractor.no_claim_v0}, readers ${counts.extractor.no_claim_readers}, both ${counts.extractor.no_claim_both}.`, "", `Most common differences (v0 → readers): ${Object.entries(counts.extractor.pairs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, count]) => `${key} ${count}`).join("; ")}.`, "");

// F. The saved text, and the languages.
counts.text = { copies: 0, problems: 0, by_body_via: {}, by_outlet: {}, languages: {}, problem_kinds: {} };
for (const reading of complete) {
  const flags = models.map((model) => answer(model, reading, "body_problem") || "").filter(Boolean);
  const isCopy = flags.filter((flag) => flag === "copy").length >= 2;
  const others = flags.filter((flag) => flag !== "copy");
  const isProblem = !isCopy && others.length >= 2;
  const via = reading.body_via ?? "unknown";
  counts.text.by_body_via[via] ??= { readings: 0, copies: 0, problems: 0 };
  counts.text.by_body_via[via].readings++;
  counts.text.by_outlet[reading.outlet] ??= { readings: 0, copies: 0, problems: 0 };
  counts.text.by_outlet[reading.outlet].readings++;
  if (isCopy) { counts.text.copies++; counts.text.by_body_via[via].copies++; counts.text.by_outlet[reading.outlet].copies++; }
  if (isProblem) { counts.text.problems++; counts.text.by_body_via[via].problems++; counts.text.by_outlet[reading.outlet].problems++; const kind = majority(others)?.answer ?? "other"; counts.text.problem_kinds[kind] = (counts.text.problem_kinds[kind] ?? 0) + 1; }
  const language = majorityOf(reading, "language")?.answer ?? "?";
  counts.text.languages[language] = (counts.text.languages[language] ?? 0) + 1;
}
const outletRows = Object.entries(counts.text.by_outlet).filter(([, row]) => row.copies + row.problems >= 3).sort((a, b) => (b[1].copies + b[1].problems) - (a[1].copies + a[1].problems)).slice(0, 15);
lines.push("## The saved text", "", `Copies of another article (at least two readers): ${share(counts.text.copies, complete.length).text}. Not the article: ${share(counts.text.problems, complete.length).text}${Object.keys(counts.text.problem_kinds).length ? ` (${Object.entries(counts.text.problem_kinds).map(([kind, count]) => `${kind} ${count}`).join(", ")})` : ""}.`, "", ...table(["Fetched via", "Readings", "Copies", "Not the article"], Object.entries(counts.text.by_body_via).sort((a, b) => b[1].readings - a[1].readings).map(([via, row]) => [via, row.readings, row.copies, row.problems])), ...table(["Outlet", "Readings", "Copies", "Not the article"], outletRows.map(([outlet, row]) => [outlet, row.readings, row.copies, row.problems])), `Languages: ${Object.entries(counts.text.languages).sort((a, b) => b[1] - a[1]).map(([language, count]) => `${language} ${count}`).join(", ")}.`, "");

// G. By language: the classifier against unanimous readers.
const byLanguage = {};
for (const reading of complete) {
  const language = majorityOf(reading, "language")?.answer ?? "?";
  for (const question of NINE) {
    const best = majorityOf(reading, question);
    const got = pipelineOf.get(reading.reading_id)?.classification?.[question];
    if (!best?.unanimous || got === undefined) continue;
    byLanguage[language] ??= { unanimous: 0, differs: 0 };
    byLanguage[language].unanimous++;
    if (got !== best.answer) byLanguage[language].differs++;
  }
}
counts.classifier_by_language = byLanguage;
lines.push("## The classifier by language", "", ...table(["Language", "Unanimous answers", "Classifier differs"], Object.entries(byLanguage).sort((a, b) => b[1].unanimous - a[1].unanimous).map(([language, row]) => [language, row.unanimous, pct(row.differs, row.unanimous)])));

// H. Where the news came from, and the career events named.
counts.sources = {};
counts.career = Object.fromEntries(CAREER_EVENTS.map((event) => [event, 0]));
counts.rewrite_by_outlet = {};
for (const reading of complete) {
  const source = majorityOf(reading, "first_source")?.answer ?? "split";
  counts.sources[source] = (counts.sources[source] ?? 0) + 1;
  counts.rewrite_by_outlet[reading.outlet] ??= { readings: 0, rewrites: 0, own: 0 };
  counts.rewrite_by_outlet[reading.outlet].readings++;
  if (source === "rewrite") counts.rewrite_by_outlet[reading.outlet].rewrites++;
  if (source === "own_interview" || source === "own_report") counts.rewrite_by_outlet[reading.outlet].own++;
  const event = majorityOf(reading, "career_event");
  if (event?.answer) counts.career[event.answer] = (counts.career[event.answer] ?? 0) + 1;
}
const sourceRows = Object.entries(counts.rewrite_by_outlet).filter(([, row]) => row.readings >= 15).sort((a, b) => b[1].own - a[1].own).slice(0, 15);
lines.push("## Where the news came from (readers' majority)", "", Object.entries(counts.sources).sort((a, b) => b[1] - a[1]).map(([source, count]) => `${source} ${count}`).join(", ") + ".", "", "Outlets with 15 or more readings, by their own reporting:", "", ...table(["Outlet", "Readings", "Own interview or report", "Rewrites"], sourceRows.map(([outlet, row]) => [outlet, row.readings, row.own, row.rewrites])), "Career events named (majority): " + Object.entries(counts.career).filter(([, count]) => count).map(([event, count]) => `${event} ${count}`).join(", ") + ".", "");

// I. The unread, screened by headline.
const screened = [...unread.values()].filter((reading) => models.every((model) => screensOf[model].has(reading.reading_id)));
counts.screen = { unread: unread.size, screened: screened.length, news_majority: 0, news_unanimous: 0, by_fighter: {}, by_outlet: {}, career: {} };
for (const reading of screened) {
  const votes = models.map((model) => screensOf[model].get(reading.reading_id).looks_like_news);
  const best = majority(votes);
  const yes = best?.answer === "yes" && best.count > votes.length / 2;
  counts.screen.by_fighter[reading.fighter] ??= { unread: 0, news: 0 };
  counts.screen.by_fighter[reading.fighter].unread++;
  counts.screen.by_outlet[reading.outlet] ??= { unread: 0, news: 0 };
  counts.screen.by_outlet[reading.outlet].unread++;
  if (yes) {
    counts.screen.news_majority++;
    counts.screen.by_fighter[reading.fighter].news++;
    counts.screen.by_outlet[reading.outlet].news++;
    const event = majority(models.map((model) => screensOf[model].get(reading.reading_id).career_event))?.answer ?? "unclear";
    counts.screen.career[event] = (counts.screen.career[event] ?? 0) + 1;
  }
  if (yes && best.unanimous) counts.screen.news_unanimous++;
}
lines.push(`## The unread, screened by headline (${screened.length} of ${unread.size})`, "", `Looks like news of the fighter: ${counts.screen.news_majority} by majority, ${counts.screen.news_unanimous} unanimously. Headline-only evidence. Career events among them: ${Object.entries(counts.screen.career).sort((a, b) => b[1] - a[1]).map(([event, count]) => `${event} ${count}`).join(", ")}.`, "", ...table(["Fighter", "Unread", "Looks like news", "Read and grouped, for scale"], Object.entries(counts.screen.by_fighter).map(([fighter, row]) => [fighter, row.unread, row.news, complete.filter((reading) => reading.fighter === fighter).length])), ...table(["Outlet", "Unread", "Looks like news"], Object.entries(counts.screen.by_outlet).sort((a, b) => b[1].news - a[1].news).slice(0, 15).map(([outlet, row]) => [outlet, row.unread, row.news])));

mkdirSync(join(here, "data", "compare"), { recursive: true });
mkdirSync(join(here, "results"), { recursive: true });
writeFileSync(join(here, "data", "compare", "history-readers.md"), lines.join("\n") + "\n");
writeFileSync(join(here, "results", "history-readers.json"), JSON.stringify(counts, null, 1));
console.log(lines.join("\n"));
