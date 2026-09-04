// The claim matcher (step 5, docs/architecture-overview.html §5).
// One structured Haiku call per surviving article: which fact is this about —
// or is it a new one, or none, or the wrong person entirely?
// Forced tool use = guaranteed-parseable verdict, no JSON scraping.

import Anthropic from "@anthropic-ai/sdk";
import { htmlToText } from "./extract.js";
import { domain } from "../domain/index.js";

// MATCHER_MODEL in the environment overrides the model — for the bench only
// (a ceiling test on a stronger model, 2026-09-04); the deployed job carries
// no plain env vars, so production always runs the default.
export const MATCHER_MODEL = process.env.MATCHER_MODEL || "claude-haiku-4-5-20251001";
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const P = domain.prompt;

export const VERDICT_TOOL = {
  name: "verdict",
  description: "Report your verdict about this article.",
  input_schema: {
    type: "object",
    properties: {
      // First on purpose: the model fills tool fields in schema order, and a
      // forced tool call otherwise gives it no room to think before it must
      // pick a verdict. 2026-09-04: with reasoning room it called a fight
      // result NEW; without, the same prompt folded it into the booking.
      reasoning: {
        type: "string",
        description: "One or two sentences, written BEFORE the verdict: what the article's own fact is, and whether any listed claim states that same fact.",
      },
      verdict: {
        type: "string",
        enum: ["MATCH", "NEW", "NO_CLAIM", "WRONG_SUBJECT", "UNSURE"],
      },
      subject_role: {
        type: "string",
        enum: ["central", "supporting", "passing"],
        description: "How prominent the subject is in the article's own text. Always report this, whatever the verdict.",
      },
      news_for_followers: {
        type: "string",
        enum: ["yes", "no"],
        description: "Would a follower of the subject learn something new about him from this article? Always report this, whatever the verdict.",
      },
      match_claim_id: {
        type: "integer",
        description: "Required when verdict is MATCH: id of the matched claim",
      },
      stance: {
        type: "string",
        enum: ["asserts", "denies"],
        description: "For MATCH: does the article assert or deny the claim?",
      },
      new_claim: {
        type: "object",
        description: "Required when verdict is NEW",
        properties: {
          type: {
            type: "string",
            enum: domain.claimTypes,
          },
          canonical_text: {
            type: "string",
            description: "One English sentence stating the fact about the subject, naming the subject. Only what the text supports — no invention.",
          },
          facts: {
            type: "object",
            description: `Structured fields when present: ${P.factFields}`,
          },
          sourcing: {
            type: "string",
            enum: ["official", "reported", "rumored"],
            description: P.sourcingHint,
          },
        },
        required: ["type", "canonical_text", "sourcing"],
      },
    },
    required: ["reasoning", "verdict", "subject_role", "news_for_followers"],
  },
};

// `confusables` are the disambiguation hints for THIS subject — namesakes,
// relatives, anyone the model might confuse them with. Per-subject, because a
// hint about one subject's brother is noise for everyone else. Falls back to
// the domain's default when a watchlist entry supplies none.
export function buildPrompt({ subject, item, candidates, confusables = P.confusables }) {
  const candidateList = candidates.length
    ? candidates
        .map((c) => `[${c.id}] (${c.status}, ${c.type}) ${c.canonical_text}${P.bookingTypes?.includes(c.type) ? " " + P.bookingNote : ""}`)
        .join("\n")
    : "(none yet)";
  // Evidence beyond the headline, best available (2e). A body excerpt when we
  // have one; else Google's related-coverage cluster (headlines of stories
  // Google groups with this one — weaker, but it exists for the old archive).
  const context = item.body
    ? `\nBody excerpt (start of the article, may be truncated):\n${item.body.slice(0, 1200)}\n`
    : item.rssDescription
      ? `\nRelated coverage (headlines Google clusters with this story — secondary evidence, not the article itself):\n${htmlToText(item.rssDescription).slice(0, 500)}\n`
      : "";
  return `You match ${P.domainNoun} news articles to known claims about the ${P.subjectNoun} ${subject}.

ARTICLE:
Headline: ${item.title}
Source: ${item.source} | Published: ${item.publishedAt.toISOString()} | Found via query: ${item.foundVia ?? "?"}
${context}
KNOWN ACTIVE CLAIMS ABOUT ${subject} (ordered most-similar first):
${candidateList}

Rules:
- MATCH only if the article reports the SAME underlying fact as a listed claim (translations, retellings, syndications of it). Give match_claim_id and stance (asserts/denies).
- A reaction, rebuttal, or follow-up ABOUT a claim is NEW, not MATCH ("X reacts to Y's prediction" is different news from the prediction).
- ${P.sameFactGuide}
- WRONG_SUBJECT ONLY if the article is not about this ${P.subjectNoun} AT ALL: ${confusables}, or keyword-stuffed junk with no real connection. Judge on EVERYTHING shown: a body that clearly concerns ${subject} overrides a headline that never names them.
- WRONG_SUBJECT also when ${subject} appears NOWHERE in the headline or body excerpt shown — or only inside site furniture (a "LATEST NEWS"/related-articles link list, a photo caption, a navigation block). Such an article merely sits NEXT TO news about them; it is not about them.
- An article mainly about OTHER ${P.peerPlural} or the ${P.peerGroupNoun} whose OWN TEXT mentions or peripherally involves ${subject} (as a rival, comparison, or context) is NO_CLAIM — NOT WRONG_SUBJECT. Readers still see NO_CLAIM articles; WRONG_SUBJECT articles are dropped.
- NO_CLAIM also covers articles asserting nothing claim-worthy about ${subject}'s ${P.careerNoun} (${P.offTopicExamples}) — type ${domain.ignoredTypes.join("/")} articles are always NO_CLAIM.
- NEW: canonical_text must be ONE English sentence ABOUT ${subject}, naming ${subject}, strictly supported by the headline and body excerpt shown — NEVER invent details they don't state. A fact whose subject is another ${P.subjectNoun} (their fight, their injury, their booking) is not a claim about ${subject}: answer NO_CLAIM. If the evidence is too ambiguous to state a fact without guessing, answer UNSURE instead. sourcing reflects the article's own certainty language.
- NEW claim types, and how strictly each is meant. The types ${domain.loudTypes.join("/")} raise an alert to readers, so they require a concrete, new event about ${subject} personally, stated in the text shown; when torn between one of them and quote/other, choose quote/other.
${P.claimTypeGuide.map((line) => `  · ${line}`).join("\n")}
- UNSURE if you genuinely cannot decide from what you see. Abstaining is better than guessing.
- ALWAYS also report subject_role, judged independently of the verdict: "central" if the article is primarily about ${subject}; "supporting" if they genuinely act in the story (quoted, a participant in its events); "passing" if they are named only as background color — a comparison, an opponent's teammate or cornerman, a ranking mention — in an article about someone or something else. ${P.roleGuide}
- ALWAYS also report news_for_followers: ${P.newsGuide} Examples, from the readers' own rulings:
${P.newsExamples.map(([what, answer]) => `  · ${what} → ${answer}`).join("\n")}`;
}

const VERDICTS = new Set(["MATCH", "NEW", "NO_CLAIM", "WRONG_SUBJECT", "UNSURE"]);
// Derived from the same list the tool schema advertises, so the menu offered
// to the model and the gate it is judged against cannot drift apart. They
// were separate literals until 2026-08-09; an edit to one silently coerced
// every verdict of the new type to "other".
const CLAIM_TYPES = new Set(domain.claimTypes);
const SOURCINGS = new Set(["official", "reported", "rumored"]);
const ROLES = new Set(["central", "supporting", "passing"]);
const NEWS = new Set(["yes", "no"]);

// The tool schema's enums are guidance to the model, not a guarantee — a
// Haiku call can still hand back an off-menu type ('prediction', observed
// 2026-08-08) or a MATCH pointing at a claim id that was never offered.
// Unvalidated, the first pollutes the type column and the second throws a
// foreign-key error that kills the rest of that subject's hunt. So every
// verdict is squeezed through this gate before the pipeline trusts it.
// Every downgrade is toward caution: UNSURE posts the article without
// inventing a claim, and an unreadable `sourcing` can never born-confirm.
export function normalizeVerdict(raw, candidateIds, { subjectNames = null, publishedAt = null } = {}) {
  // The role is a second, independent axis, so it is normalized once here and
  // then rides along on every return — including the downgrades. Junk in the
  // role can only null the role; it never touches the verdict, because a
  // model that misjudged prominence has not thereby misjudged the fact.
  // Absent is not an error worth logging: the matcher may be answering an
  // older schema, or the field may simply be missing.
  let subject_role = raw?.subject_role ?? null;
  if (subject_role !== null && !ROLES.has(subject_role)) {
    console.warn(`matcher: off-enum subject role "${subject_role}" -> null`);
    subject_role = null;
  }
  // Same treatment for the third axis: the reader's "would I learn something
  // new about him" (2026-09-04). Junk nulls it; null means "no opinion" and
  // leaves the tier rule exactly as it was.
  let news_for_followers = raw?.news_for_followers ?? null;
  if (news_for_followers !== null && !NEWS.has(news_for_followers)) {
    console.warn(`matcher: off-enum news_for_followers "${news_for_followers}" -> null`);
    news_for_followers = null;
  }
  const unsure = (why) => {
    console.warn(`matcher: verdict downgraded to UNSURE — ${why}`);
    return { verdict: "UNSURE", subject_role, news_for_followers };
  };
  if (!raw || !VERDICTS.has(raw.verdict)) return unsure(`unknown verdict ${JSON.stringify(raw?.verdict)}`);

  if (raw.verdict === "MATCH") {
    // Only a claim we actually showed the model is a legal match target.
    // Compared as strings on purpose: Postgres bigints arrive from pg as
    // strings ("4") while the model answers with a JSON number (4).
    if (!candidateIds.has(String(raw.match_claim_id))) {
      return unsure(`MATCH on unoffered claim id ${raw.match_claim_id}`);
    }
    return {
      verdict: "MATCH",
      subject_role,
      news_for_followers,
      match_claim_id: raw.match_claim_id,
      stance: raw.stance === "denies" ? "denies" : "asserts",
    };
  }

  if (raw.verdict === "NEW") {
    const nc = raw.new_claim;
    if (!nc?.canonical_text?.trim()) return unsure("NEW without canonical_text");
    // A claim FOR the subject names the subject. The model has minted
    // "injury" for an opponent's broken hands and "result" for another
    // fighter's win with the subject as scenery (graded month, 2026-09-04);
    // a canonical sentence that never names them is a fact about someone
    // else, and the article is NO_CLAIM for this subject. The role is kept:
    // the tier rule still needs it.
    if (subjectNames?.length && !namesAnyOf(nc.canonical_text, subjectNames)) {
      console.warn(`matcher: NEW claim does not name the subject -> NO_CLAIM: "${nc.canonical_text.trim().slice(0, 80)}"`);
      return { verdict: "NO_CLAIM", subject_role, news_for_followers };
    }
    let { type, sourcing } = nc;
    if (!CLAIM_TYPES.has(type)) {
      console.warn(`matcher: off-enum claim type "${type}" -> other`);
      type = "other";
    }
    // An announcement is a specific fight: it names an opponent, or an event
    // or date. "Topuria announces his return to the UFC" (2026-09-04, claim
    // #51) carried none of those, was born confirmed on the fighter's own
    // words, and fired the 🚨 Fight-announced ceremony for a fight that does
    // not exist — the G4 failure in one row. Without a single concrete fact
    // the type is "other": still a real claim, still a main item, never a
    // ceremony and never a rumor line.
    if (type === domain.ceremonyType && !hasAnnouncementFacts(nc.facts)) {
      console.warn(`matcher: "${type}" with no opponent, event or date -> other: "${nc.canonical_text.trim().slice(0, 80)}"`);
      type = "other";
    }
    // A result is news for days, not months. The model restates the
    // subject's last loss as a "result" whenever an August article mentions
    // June (graded month, 2026-09-04). When the claim carries the fight's
    // date and the article is more than RESULT_MAX_AGE_DAYS later, the fight
    // is old news retold: NO_CLAIM. No date, or an unreadable one, passes —
    // the gate only acts on evidence.
    if (type === "result" && publishedAt && isStaleResult(nc.facts?.date, publishedAt)) {
      console.warn(`matcher: "result" dated ${nc.facts.date} in an article of ${publishedAt.toISOString().slice(0, 10)} -> NO_CLAIM`);
      return { verdict: "NO_CLAIM", subject_role, news_for_followers };
    }
    // The mirror of the stale gate. Once the prompt told the model a fight's
    // stages are separate facts (2026-09-04), "Topuria dropped his title in
    // 2026" and a highlights clip began minting "result" with no usable date,
    // which the stale gate cannot judge. A result is a loud type — a 🕵️ line
    // and, if official, a confirmation — so without the one fact that makes
    // it checkable it is demoted to "other": still a claim, never an alert.
    if (type === "result" && !hasResultDate(nc.facts?.date)) {
      console.warn(`matcher: "result" with no fight date -> other: "${nc.canonical_text.trim().slice(0, 80)}"`);
      type = "other";
    }
    if (!SOURCINGS.has(sourcing)) {
      console.warn(`matcher: off-enum sourcing "${sourcing}" -> reported`);
      sourcing = "reported"; // never silently promote junk to official
    }
    return {
      verdict: "NEW",
      subject_role,
      news_for_followers,
      new_claim: {
        type, sourcing,
        canonical_text: nc.canonical_text.trim(),
        facts: nc.facts && typeof nc.facts === "object" ? nc.facts : {},
      },
    };
  }

  // NO_CLAIM / WRONG_SUBJECT / UNSURE carry no CLAIM payload — but they do
  // carry the role, and this is exactly where the digest tier needs it.
  return { verdict: raw.verdict, subject_role, news_for_followers };
}

/**
 * Whether a claim's facts pin a fight down: an opponent, an event, or a
 * date, each a non-empty string.
 *
 * @param {object|undefined} facts
 * @returns {boolean}
 */
export function hasAnnouncementFacts(facts) {
  if (!facts || typeof facts !== "object") return false;
  return ["opponent", "event", "date"].some((key) => typeof facts[key] === "string" && facts[key].trim().length > 0);
}

// How long a fight's outcome stays a "result" rather than history.
/**
 * Whether a result claim carries a fight date the gates can read:
 * YYYY-MM or YYYY-MM-DD, as the prompt asks for. A bare year is not enough.
 *
 * @param {unknown} date
 * @returns {boolean}
 */
export function hasResultDate(date) {
  return typeof date === "string" && /^\d{4}-\d{2}(-\d{2})?/.test(date);
}

const RESULT_MAX_AGE_DAYS = 14;

/**
 * Whether a result claim's fight date sits more than RESULT_MAX_AGE_DAYS
 * before the article. Reads YYYY-MM-DD and YYYY-MM (taken as the 1st); any
 * other shape is "no evidence" and returns false.
 *
 * @param {string|undefined} date   the claim's facts.date
 * @param {Date} publishedAt
 * @returns {boolean}
 */
export function isStaleResult(date, publishedAt) {
  const match = typeof date === "string" && date.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return false;
  const fought = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3] ?? 1));
  if (Number.isNaN(fought)) return false;
  return publishedAt.getTime() - fought > RESULT_MAX_AGE_DAYS * 86_400_000;
}

/**
 * Whether the text names the subject by any of the watchlist's match names
 * (surname stems in Latin and Cyrillic), case-insensitively.
 *
 * @param {string} text
 * @param {string[]} names
 * @returns {boolean}
 */
function namesAnyOf(text, names) {
  const lower = text.toLowerCase();
  return names.some((name) => lower.includes(name.toLowerCase()));
}

// Tokens spent by every matchItem call in this process, so a bench run can
// report what it cost. Read with usageTotals(); nothing in the pipeline
// reads it.
const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };

/**
 * A copy of the running token count for this process.
 *
 * @returns {{ calls: number, inputTokens: number, outputTokens: number }}
 */
export function usageTotals() {
  return { ...usage };
}

// Returns a validated verdict object, e.g. {verdict:"NEW", new_claim:{...}}.
// Throws on API failure — callers treat that as UNSURE (fail-open).
export async function matchItem({ subject, item, candidates, confusables, subjectNames = null }) {
  const response = await anthropic.messages.create({
    model: MATCHER_MODEL,
    max_tokens: 500,
    tools: [VERDICT_TOOL],
    tool_choice: { type: "tool", name: "verdict" },
    // `confusables ?? undefined` so an entry without hints falls through to
    // buildPrompt's domain default rather than interpolating a null.
    messages: [{ role: "user", content: buildPrompt({ subject, item, candidates, confusables: confusables ?? undefined }) }],
  });
  usage.calls++;
  usage.inputTokens += response.usage?.input_tokens ?? 0;
  usage.outputTokens += response.usage?.output_tokens ?? 0;
  const call = response.content.find((b) => b.type === "tool_use");
  const verdict = normalizeVerdict(call?.input, new Set(candidates.map((c) => String(c.id))), { subjectNames, publishedAt: item.publishedAt });
  // Carried for the log line only: the hunter prints it so a live verdict can
  // be audited without re-running the model. Not stored.
  if (typeof call?.input?.reasoning === "string") verdict.reasoning = call.input.reasoning.slice(0, 300);
  return verdict;
}
