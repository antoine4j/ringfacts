// Option D measured (docs/story-matching-options.md): stories as objects,
// embeddings shortlist, one Haiku call decides. Replays the labelled archive
// in arrival order, per subject. Each story is { root, fact, members,
// reactsTo }; an arriving article retrieves the top-K stories of the last
// 7 days by embedding and Haiku answers join / new / reaction. Stories are
// D's OWN (cascade), scored against the labelled stories exactly like
// story-gate.simulate. TEST Anthropic key only (bench/.env.bench), no
// database, no posting. Verdicts are cached per run in tmp/labels/, so a
// rerun replays them without a call.
//
//   node labels/measure-stories-llm.js --mode title|body [--top 3] [--limit N]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBenchEnv } from "../bench/env.js";
await loadBenchEnv();
const { default: Anthropic } = await import("@anthropic-ai/sdk");
import { cosine, storiesByArrival } from "./story-gate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "tmp/labels");
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const MODE = arg("--mode", "title");
const TOP = Number(arg("--top", 3));
const LIMIT = Number(arg("--limit", Infinity));
const MODEL = "claude-haiku-4-5-20251001";
const WINDOW_MS = 7 * 24 * 3_600_000;
const CACHE = join(DIR, `d-verdicts-${MODE}.json`);

const items = JSON.parse(readFileSync(join(DIR, "stories.json"), "utf8"));
const bodies = existsSync(join(DIR, "bodies.json")) ? JSON.parse(readFileSync(join(DIR, "bodies.json"), "utf8")) : {};
if (MODE === "body") {
  const vecs = JSON.parse(readFileSync(join(DIR, "vectors-body.json"), "utf8"));
  for (const it of items) { it.vec = vecs[it.id] ?? it.vec; it.body = it.body ?? bodies[it.id]?.body ?? null; }
} else {
  for (const it of items) it.body = null; // headline-only, the shape of today's early hold
}
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const anthropic = new Anthropic();
const usage = { input: 0, output: 0, calls: 0 };

const TOOL = {
  name: "decide",
  description: "Place this article among the known stories.",
  input_schema: {
    type: "object",
    properties: {
      reasoning: { type: "string", description: "One or two sentences, written first: what this article's own news is, and whether a listed story already IS that news." },
      decision: { type: "string", enum: ["join", "new", "reaction"], description: "join: same news as a listed story (a repeat, translation, retelling, or the same interview/quote). new: news no listed story has. reaction: a reply, rebuttal or follow-up ABOUT a listed story by someone else — its own news, connected to that story." },
      story: { type: "integer", description: "For join and reaction: the id of the story." },
      fact: { type: "string", description: "For new and reaction: ONE English sentence stating this article's news, naming the subject." },
    },
    required: ["reasoning", "decision"],
  },
};

const arrival = (it) => new Date(it.seen_at).getTime();
const prompt = (subject, it, candidates) => `You sort news articles about the fighter ${subject} into stories. A story is one piece of news; every article that reports that same news belongs to it, whatever the outlet, language or wording. A reaction to a story (someone replying, a coach commenting, a rival answering a callout) is its own story, connected to the one it answers.

ARTICLE:
Headline: ${it.title}
Source: ${it.source} | Published: ${it.published_at}
${it.body ? `Body excerpt:\n${it.body.slice(0, 1200)}\n` : "(no body available — judge from the headline)"}

KNOWN STORIES ABOUT ${subject} FROM THE LAST 7 DAYS (most similar first):
${candidates.length ? candidates.map((c) => `[${c.root}] ${c.fact} (${c.members.length} article${c.members.length === 1 ? "" : "s"}, first: "${c.rootTitle}")`).join("\n") : "(none)"}

Rules:
- join only when the article reports the SAME news as a listed story. Same interview, same quote, same announcement, same result — join, even if the headline picks a different sentence from it.
- Different remarks by the same person on different occasions are different stories. A story about a fight and a reaction to that fight are different stories.
- reaction when someone ELSE responds to a listed story. Name the story it answers.
- new when no listed story is this news. Write the fact as one plain sentence.`;

async function decide(subject, it, candidates) {
  if (cache[it.id]) return cache[it.id];
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 400, tools: [TOOL], tool_choice: { type: "tool", name: "decide" },
    messages: [{ role: "user", content: prompt(subject, it, candidates) }],
  });
  usage.input += res.usage.input_tokens; usage.output += res.usage.output_tokens; usage.calls += 1;
  const raw = res.content.find((b) => b.type === "tool_use")?.input ?? {};
  const offered = new Set(candidates.map((c) => c.root));
  let decision = ["join", "new", "reaction"].includes(raw.decision) ? raw.decision : "new";
  if (decision !== "new" && !offered.has(raw.story)) decision = "new"; // an unoffered story id is no story
  const verdict = { decision, story: decision === "new" ? null : raw.story, fact: raw.fact ?? it.title, reasoning: raw.reasoning ?? "", candidates: candidates.map((c) => c.root) };
  cache[it.id] = verdict;
  writeFileSync(CACHE, JSON.stringify(cache));
  return verdict;
}

// One subject's replay: stories are D's own; a "reaction" opens a new story
// that points at the one it answers.
async function replaySubject(subject, subjectItems) {
  const stories = new Map(); // root id → { root, rootTitle, fact, members: [items], reactsTo }
  const predicted = new Map(); // item id → predicted story root
  for (const it of subjectItems) {
    const live = [...stories.values()].filter((s) => s.members.some((m) => arrival(it) - arrival(m) < WINDOW_MS));
    const ranked = live.map((s) => ({ ...s, sim: Math.max(...s.members.map((m) => cosine(it.vec, m.vec))) })).sort((a, b) => b.sim - a.sim);
    const candidates = ranked.slice(0, TOP);
    const v = await decide(subject, it, candidates);
    if (v.decision === "join") {
      stories.get(v.story).members.push(it);
      predicted.set(it.id, v.story);
    } else {
      stories.set(it.id, { root: it.id, rootTitle: it.title, fact: v.fact, members: [it], reactsTo: v.decision === "reaction" ? v.story : null });
      predicted.set(it.id, it.id);
    }
    process.stderr.write(`${subject} #${it.id} ${v.decision}${v.story ? " → #" + v.story : ""}\n`);
  }
  return predicted;
}

const sorted = [...items].sort((a, b) => arrival(a) - arrival(b) || a.id - b.id).slice(0, LIMIT);
const bySubject = new Map();
for (const it of sorted) { if (!bySubject.has(it.subject)) bySubject.set(it.subject, []); bySubject.get(it.subject).push(it); }
const predicted = new Map();
for (const p of await Promise.all([...bySubject].map(([s, list]) => replaySubject(s, list)))) for (const [k, v] of p) predicted.set(k, v);

// Score like story-gate.simulate, plus Anton's rows alone and the shortlist's recall.
const trueStory = storiesByArrival(items);
const tally = () => ({ caught: 0, misplaced: 0, missed: 0, members: 0, swallowedUseful: 0, swallowedJunk: 0, newStories: 0, reactions: 0, oracleInShortlist: 0, membersWithShortlist: 0 });
const all = tally(), user = tally();
for (const it of sorted) {
  const v = cache[it.id];
  const isMember = trueStory.get(it.id) !== it.id;
  const joined = v.decision === "join";
  for (const t of it.author === "user" ? [all, user] : [all]) {
    if (v.decision === "reaction") t.reactions += 1;
    if (isMember) {
      t.members += 1;
      if (!joined) t.missed += 1;
      else if (predicted.get(v.story) === undefined ? false : trueStory.get(v.story) === trueStory.get(it.id)) t.caught += 1;
      else t.misplaced += 1;
      t.membersWithShortlist += 1;
      if (v.candidates.some((root) => trueStory.get(root) === trueStory.get(it.id))) t.oracleInShortlist += 1;
    } else {
      t.newStories += 1;
      if (joined) t[(it.bucket ?? 3) === 3 ? "swallowedJunk" : "swallowedUseful"] += 1;
    }
  }
}
const cost = (usage.input * 1 + usage.output * 5) / 1e6;
const row = (label, t) => `| ${label} | ${t.caught + t.misplaced} | ${t.caught} | ${t.misplaced} | ${t.missed} | ${t.swallowedUseful} | ${t.swallowedJunk} | ${t.reactions} | ${t.oracleInShortlist}/${t.membersWithShortlist} |`;
console.log(`## D, ${MODE} text, top-${TOP} shortlist, ${MODEL}

| rows | held | caught | misplaced | missed | useful swallowed | junk swallowed | reactions | true story in shortlist |
|---|---|---|---|---|---|---|---|---|
${row(`all ${sorted.length} articles (${all.members} members, ${all.newStories} first arrivals)`, all)}
${row(`Anton's rows only (${user.members} members, ${user.newStories} first arrivals)`, user)}

Spent this run: ${usage.calls} calls, ${usage.input} input + ${usage.output} output tokens ≈ $${cost.toFixed(2)} at Haiku 4.5 list price (cached verdicts cost nothing).`);
