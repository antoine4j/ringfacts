// Counts how many career events were first reported only through an article
// v0 could not read, and how far behind the first article it could read
// trailed. Reads the three-judges run's weekly exports and headline screens
// (read-only), the agent's hand-made event groups in events.json, and writes
//   results/unread-news.json  ids, dates, outlets, hours and counts only;
//   data/unread-news.md       the same with headlines and reasons (git-ignored:
//                             headlines are other people's text).
// The event groups are an agent's calls from headlines, not the maintainer's:
// see README.md for the rules they follow.
//
// Usage (from a checkout that holds the three-judges data):
//   node research/experiments/2026-11-18-unread-news/unread-news.mjs [judgesDataDir] [outDataDir]
// Both directories default to the data/ folders beside the experiments; when
// the worktree has no data, pass the shared checkout's.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { majority } from "../2026-11-05-three-judges/stats.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** G1's window, in hours (docs/goals.md): every career event posts within 6 hours of the first report. */
export const WINDOW_HOURS = 6;

/** The three screeners, as the three-judges run names them. */
export const MODELS = ["opus", "fable", "sonnet"];

/** The career kinds the headline screen can answer that G1 counts (the three-judges run's own list, without ranking and title). */
export const CAREER_KINDS = ["fight_booked", "fight_changed", "result", "injury", "retirement", "contract_or_move"];

/** Every career kind a screener may have answered, including the two that G1 does not count. */
export const SCREEN_CAREER_KINDS = [...CAREER_KINDS, "title", "ranking"];

/**
 * Reads a JSON file.
 *
 * @param path  The file to read.
 * @returns The parsed content.
 */
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Loads every weekly export: the readings v0 read and grouped, those it could not read, and what the pipeline decided about each.
 *
 * @param dataDir  The three-judges data folder.
 * @returns The reads and unread by reading id (each once, the first week that lists it), the pipeline's answer by reading id, and the latest export time.
 */
export function loadHistory(dataDir) {
  const weeks = readdirSync(join(dataDir, "history"))
    .filter((name) => /^week-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => name.slice(5, 15))
    .sort();
  const reads = new Map();
  const unread = new Map();
  const pipeline = new Map();
  let exportedAt = "";
  for (const monday of weeks) {
    const week = readJson(join(dataDir, "history", `week-${monday}.json`));
    if (week.exported_at > exportedAt) exportedAt = week.exported_at;
    for (const row of readJson(join(dataDir, "history", `pipeline-${monday}.json`)).readings) pipeline.set(String(row.reading_id), row);
    for (const claim of week.claims) {
      for (const reading of claim.readings) {
        const id = String(reading.reading_id);
        if (!reads.has(id)) reads.set(id, { ...reading, reading_id: id, fighter: lastName(claim.fighter), claim_id: claim.id, week: monday });
      }
    }
    for (const reading of week.unread) {
      const id = String(reading.reading_id);
      if (!unread.has(id)) unread.set(id, { ...reading, reading_id: id, fighter: lastName(reading.fighter), week: monday });
    }
  }
  return { weeks, reads, unread, pipeline, exportedAt };
}

/**
 * The last word of a fighter's name, which is how events.json names them.
 *
 * @param fullName  For example "Ilia Topuria".
 * @returns For example "Topuria".
 */
export function lastName(fullName) {
  return String(fullName).split(" ").pop();
}

/**
 * Loads every screener's answers on the unread articles.
 *
 * @param dataDir  The three-judges data folder.
 * @returns One map per model, from reading id to the screener's answer.
 */
export function loadScreens(dataDir) {
  const screens = {};
  for (const model of MODELS) {
    screens[model] = new Map();
    const folder = join(dataDir, model);
    for (const name of readdirSync(folder).filter((file) => /^screen-.*\.out\.json$/.test(file))) {
      for (const item of readJson(join(folder, name))) screens[model].set(String(item.reading_id), item);
    }
  }
  return screens;
}

/**
 * Splits the unread articles into those the headline screen called a career event and everything else.
 * "Core" is the three-judges run's own rule (a majority of the three screeners say it looks like news, and the majority career kind is one of G1's six). "Extra" is any other article at least one screener gave a career kind, so nothing a single screener saw is left out.
 *
 * @param unread  The unread readings by id.
 * @param screens  The screeners' answers, by model.
 * @returns The two lists of reading ids, and how many unread articles lack an answer from some screener.
 */
export function findCandidates(unread, screens) {
  const core = [];
  const extra = [];
  let unscreened = 0;
  for (const id of unread.keys()) {
    const answers = MODELS.map((model) => screens[model].get(id));
    if (answers.some((answer) => !answer)) {
      unscreened++;
      continue;
    }
    const news = majority(answers.map((answer) => answer.looks_like_news));
    const isNews = news?.answer === "yes" && news.count > answers.length / 2;
    const kind = majority(answers.map((answer) => answer.career_event))?.answer;
    if (isNews && CAREER_KINDS.includes(kind)) core.push(id);
    else if (answers.some((answer) => SCREEN_CAREER_KINDS.includes(answer.career_event))) extra.push(id);
  }
  return { core, extra, unscreened };
}

/**
 * Hours from one time to a later one; negative when the second is earlier.
 *
 * @param fromIso  The first time, as an ISO string.
 * @param toIso  The second time.
 * @returns Hours, to two decimals.
 */
export function hoursBetween(fromIso, toIso) {
  return Math.round(((Date.parse(toIso) - Date.parse(fromIso)) / 3_600_000) * 100) / 100;
}

/**
 * Where an event falls against G1's window.
 *
 * @param hours  Hours from the first unread report to the first read one (negative if the read one came first); null when no read article reports the event.
 * @returns "within_window" (a read article first or within the window), "late" (read only after it) or "never_read".
 */
export function classifyLag(hours) {
  if (hours === null || hours === undefined) return "never_read";
  return hours <= WINDOW_HOURS ? "within_window" : "late";
}

/**
 * The earliest of some readings by publish time.
 *
 * @param readings  Readings with `published_at`.
 * @returns The earliest, or null when there are none.
 */
export function earliest(readings) {
  let best = null;
  for (const reading of readings) if (!best || reading.published_at < best.published_at) best = reading;
  return best;
}

/**
 * What one event group comes to: its first unread report, its first read twin, the gap, and what v0 did with its read articles.
 *
 * @param group  A group from events.json.
 * @param history  The loaded exports.
 * @returns The summary, with ids, outlets and times only.
 */
export function summariseGroup(group, history) {
  const unreadRows = group.unread.map((id) => requireRow(history.unread, id, `${group.id} unread`));
  const twinRows = group.twins.map((id) => requireRow(history.reads, id, `${group.id} twin`));
  const firstUnread = earliest(unreadRows);
  const firstRead = earliest(twinRows);
  const hours = firstRead ? hoursBetween(firstUnread.published_at, firstRead.published_at) : null;
  const tiers = twinRows.map((row) => history.pipeline.get(row.reading_id)?.tier).filter((tier) => tier !== undefined);
  return {
    id: group.id,
    fighter: group.fighter,
    kind: group.kind,
    call: group.call,
    name: group.name,
    match: group.match ?? null,
    unread_count: unreadRows.length,
    twin_count: twinRows.length,
    first_unread: describe(firstUnread),
    first_read: firstRead ? { ...describe(firstRead), tier: history.pipeline.get(firstRead.reading_id)?.tier ?? null } : null,
    hours,
    category: classifyLag(hours),
    best_tier: tiers.length ? Math.min(...tiers) : null,
    tier1_posted: twinRows.some((row) => Boolean(history.pipeline.get(row.reading_id)?.posted_at)),
  };
}

/**
 * Looks a reading up and fails loudly when events.json names one that is not there.
 *
 * @param table  Reads or unread, by id.
 * @param id  The reading id.
 * @param label  Where the id came from, for the error.
 * @returns The reading.
 */
function requireRow(table, id, label) {
  const row = table.get(String(id));
  if (!row) throw new Error(`${label}: reading ${id} is not in the export`);
  return row;
}

/**
 * The few fields of a reading the results keep.
 *
 * @param row  A reading.
 * @returns Id, outlet and publish time.
 */
function describe(row) {
  return { reading_id: row.reading_id, outlet: row.outlet, published_at: row.published_at };
}

/**
 * Checks that every candidate belongs to exactly one group and no group holds an article that is not a candidate.
 *
 * @param groups  The groups from events.json.
 * @param candidateIds  Core and extra candidate ids together.
 * @returns Problems found, empty when the groups cover the candidates exactly.
 */
export function checkCoverage(groups, candidateIds) {
  const problems = [];
  const owner = new Map();
  for (const group of groups) {
    for (const id of group.unread) {
      if (owner.has(id)) problems.push(`${id} is in ${owner.get(id)} and ${group.id}`);
      owner.set(id, group.id);
    }
  }
  const wanted = new Set(candidateIds);
  for (const id of wanted) if (!owner.has(id)) problems.push(`${id} is a candidate with no group`);
  for (const id of owner.keys()) if (!wanted.has(id)) problems.push(`${id} (${owner.get(id)}) is not a candidate`);
  return problems;
}

/**
 * Counts a fighter's events against the window.
 *
 * @param summaries  Event summaries of one fighter, already filtered to the calls being counted.
 * @returns Total, within the window, late (with their hours) and never read.
 */
export function tally(summaries) {
  const late = summaries.filter((row) => row.category === "late").map((row) => ({ id: row.id, hours: row.hours }));
  return {
    events: summaries.length,
    within_window: summaries.filter((row) => row.category === "within_window").length,
    read_first: summaries.filter((row) => row.hours !== null && row.hours <= 0).length,
    late,
    never_read: summaries.filter((row) => row.category === "never_read").length,
  };
}

/**
 * Builds the per-fighter table for two readings of "event": only the clear ones, and the clear ones plus the borderline ones.
 *
 * @param summaries  Every group's summary.
 * @param fighters  The fighters, in the order to print.
 * @returns For each fighter, the tally for each reading.
 */
export function perFighter(summaries, fighters) {
  const table = {};
  for (const fighter of fighters) {
    const own = summaries.filter((row) => row.fighter === fighter);
    table[fighter] = {
      clear: tally(own.filter((row) => row.call === "event")),
      clear_and_borderline: tally(own.filter((row) => row.call === "event" || row.call === "borderline")),
      not_event_groups: own.filter((row) => row.call === "not_event").length,
    };
  }
  return table;
}

/**
 * Counts the candidates by fighter, with the scale the earlier experiment used.
 *
 * @param candidates  The core and extra ids.
 * @param history  The loaded exports.
 * @param fighters  The fighters.
 * @returns For each fighter: unread, read and grouped, core and extra candidates.
 */
export function candidateCounts(candidates, history, fighters) {
  const counts = {};
  for (const fighter of fighters) {
    counts[fighter] = {
      unread: [...history.unread.values()].filter((row) => row.fighter === fighter).length,
      read_and_grouped: [...history.reads.values()].filter((row) => row.fighter === fighter).length,
      core: candidates.core.filter((id) => history.unread.get(id).fighter === fighter).length,
      extra: candidates.extra.filter((id) => history.unread.get(id).fighter === fighter).length,
    };
  }
  return counts;
}

/**
 * How many candidate articles landed in each kind of group, by fighter: what the headline screen's career calls come to once an agent reads the headlines.
 *
 * @param groups  The groups from events.json.
 * @param candidates  The core and extra ids.
 * @param history  The loaded exports.
 * @returns For core and extra, a count per fighter and call.
 */
export function articlesByCall(groups, candidates, history) {
  const callOf = new Map();
  for (const group of groups) for (const id of group.unread) callOf.set(id, group.call);
  const counts = { core: {}, extra: {} };
  for (const set of ["core", "extra"]) {
    for (const id of candidates[set]) {
      const fighter = history.unread.get(id).fighter;
      counts[set][fighter] ??= { event: 0, borderline: 0, not_event: 0 };
      counts[set][fighter][callOf.get(id)]++;
    }
  }
  return counts;
}

/**
 * Writes the git-ignored note file: every group with its headlines and the agent's one-line reason.
 *
 * @param summaries  Every group's summary.
 * @param groups  The groups from events.json.
 * @param history  The loaded exports.
 * @param notes  The agent's reasons by group id, from data/event-notes.json (may be empty).
 * @returns The Markdown text.
 */
export function renderNotes(summaries, groups, history, notes) {
  const lines = ["# Unread career headlines, grouped (agent's calls; headlines are other people's text, keep local)", ""];
  for (const summary of summaries) {
    const group = groups.find((candidate) => candidate.id === summary.id);
    const note = notes[summary.id] ?? {};
    lines.push(`## ${summary.id} ${summary.fighter}: ${summary.name}`, "");
    lines.push(`call: ${summary.call}; kind: ${summary.kind}; match: ${summary.match ?? "-"}; ${summary.category}${summary.hours === null ? "" : `, ${summary.hours} h`}`);
    if (note.why) lines.push("", `Why: ${note.why}`);
    if (note.twin) lines.push("", `Twin: ${note.twin}`);
    lines.push("", "Unread:");
    for (const id of group.unread) lines.push(`- ${rowLine(history.unread.get(id))}`);
    if (group.twins.length) lines.push("", "Read twins:");
    for (const id of group.twins) lines.push(`- ${rowLine(history.reads.get(id))}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * One line naming a reading: id, time, outlet and headline.
 *
 * @param row  A reading.
 * @returns The line.
 */
function rowLine(row) {
  return `${row.reading_id} ${row.published_at.slice(0, 16)}Z ${row.outlet}: ${row.headline}`;
}

/**
 * Runs the whole count and writes the two outputs.
 *
 * @param judgesDataDir  The three-judges data folder.
 * @param outDataDir  Where the git-ignored note file goes.
 * @returns The results object.
 */
export function run(judgesDataDir, outDataDir) {
  const history = loadHistory(judgesDataDir);
  const screens = loadScreens(judgesDataDir);
  const candidates = findCandidates(history.unread, screens);
  const { events: groups } = readJson(join(here, "events.json"));
  const problems = checkCoverage(groups, [...candidates.core, ...candidates.extra]);
  if (problems.length) throw new Error(`events.json does not cover the candidates:\n${problems.join("\n")}`);
  const summaries = groups.map((group) => summariseGroup(group, history));
  const fighters = ["Amosov", "Donchenko", "Topuria"];
  const results = {
    experiment: "2026-11-18-unread-news",
    exported_at: history.exportedAt,
    weeks: history.weeks.length,
    window_hours: WINDOW_HOURS,
    unread_total: history.unread.size,
    unscreened: candidates.unscreened,
    candidates: candidateCounts(candidates, history, fighters),
    candidate_totals: { core: candidates.core.length, extra: candidates.extra.length },
    articles_by_call: articlesByCall(groups, candidates, history),
    per_fighter: perFighter(summaries, fighters),
    events: summaries.filter((row) => row.call !== "not_event"),
    not_event_groups: summaries.filter((row) => row.call === "not_event").map((row) => ({ id: row.id, fighter: row.fighter, unread_count: row.unread_count })),
  };
  mkdirSync(join(here, "results"), { recursive: true });
  writeFileSync(join(here, "results", "unread-news.json"), JSON.stringify(results, null, 1) + "\n");
  const notesPath = join(outDataDir, "event-notes.json");
  const notes = existsSync(notesPath) ? readJson(notesPath) : {};
  mkdirSync(outDataDir, { recursive: true });
  writeFileSync(join(outDataDir, "unread-news.md"), renderNotes(summaries, groups, history, notes));
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const judgesDataDir = process.argv[2] ?? join(here, "../2026-11-05-three-judges/data");
  const outDataDir = process.argv[3] ?? join(here, "data");
  const results = run(judgesDataDir, outDataDir);
  console.log(JSON.stringify({ candidates: results.candidates, candidate_totals: results.candidate_totals, per_fighter: results.per_fighter }, null, 1));
}
