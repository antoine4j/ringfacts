// The claim matcher (step 5, docs/architecture-overview.html §5).
// One structured Haiku call per surviving article: which fact is this about —
// or is it a new one, or none, or the wrong person entirely?
// Forced tool use = guaranteed-parseable verdict, no JSON scraping.

import Anthropic from "@anthropic-ai/sdk";
import { htmlToText } from "./extract.js";
import { domain } from "../domain/index.js";

export const MATCHER_MODEL = "claude-haiku-4-5-20251001";
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const P = domain.prompt;

const VERDICT_TOOL = {
  name: "verdict",
  description: "Report your verdict about this article.",
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["MATCH", "NEW", "NO_CLAIM", "WRONG_SUBJECT", "UNSURE"],
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
            description: "One English sentence stating the fact. Only what the headline supports — no invention.",
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
    required: ["verdict"],
  },
};

// `confusables` are the disambiguation hints for THIS subject — namesakes,
// relatives, anyone the model might confuse them with. Per-subject, because a
// hint about one subject's brother is noise for everyone else. Falls back to
// the domain's default when a watchlist entry supplies none.
function buildPrompt({ subject, item, candidates, confusables = P.confusables }) {
  const candidateList = candidates.length
    ? candidates
        .map((c) => `[${c.id}] (${c.status}, ${c.type}) ${c.canonical_text}`)
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
- WRONG_SUBJECT ONLY if the article is not about this ${P.subjectNoun} AT ALL: ${confusables}, or keyword-stuffed junk with no real connection. Judge on EVERYTHING shown: a body that clearly concerns ${subject} overrides a headline that never names them.
- WRONG_SUBJECT also when ${subject} appears NOWHERE in the headline or body excerpt shown — or only inside site furniture (a "LATEST NEWS"/related-articles link list, a photo caption, a navigation block). Such an article merely sits NEXT TO news about them; it is not about them.
- An article mainly about OTHER ${P.peerPlural} or the ${P.peerGroupNoun} whose OWN TEXT mentions or peripherally involves ${subject} (as a rival, comparison, or context) is NO_CLAIM — NOT WRONG_SUBJECT. Readers still see NO_CLAIM articles; WRONG_SUBJECT articles are dropped.
- NO_CLAIM also covers articles asserting nothing claim-worthy about ${subject}'s ${P.careerNoun} (${P.offTopicExamples}) — type ${domain.ignoredTypes.join("/")} articles are always NO_CLAIM.
- NEW: canonical_text must be ONE English sentence, strictly supported by the headline and body excerpt shown — NEVER invent details they don't state. If the evidence is too ambiguous to state a fact without guessing, answer UNSURE instead. sourcing reflects the article's own certainty language.
- UNSURE if you genuinely cannot decide from what you see. Abstaining is better than guessing.`;
}

const VERDICTS = new Set(["MATCH", "NEW", "NO_CLAIM", "WRONG_SUBJECT", "UNSURE"]);
// Derived from the same list the tool schema advertises, so the menu offered
// to the model and the gate it is judged against cannot drift apart. They
// were separate literals until 2026-08-09; an edit to one silently coerced
// every verdict of the new type to "other".
const CLAIM_TYPES = new Set(domain.claimTypes);
const SOURCINGS = new Set(["official", "reported", "rumored"]);

// The tool schema's enums are guidance to the model, not a guarantee — a
// Haiku call can still hand back an off-menu type ('prediction', observed
// 2026-08-08) or a MATCH pointing at a claim id that was never offered.
// Unvalidated, the first pollutes the type column and the second throws a
// foreign-key error that kills the rest of that subject's hunt. So every
// verdict is squeezed through this gate before the pipeline trusts it.
// Every downgrade is toward caution: UNSURE posts the article without
// inventing a claim, and an unreadable `sourcing` can never born-confirm.
export function normalizeVerdict(raw, candidateIds) {
  const unsure = (why) => {
    console.warn(`matcher: verdict downgraded to UNSURE — ${why}`);
    return { verdict: "UNSURE" };
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
      match_claim_id: raw.match_claim_id,
      stance: raw.stance === "denies" ? "denies" : "asserts",
    };
  }

  if (raw.verdict === "NEW") {
    const nc = raw.new_claim;
    if (!nc?.canonical_text?.trim()) return unsure("NEW without canonical_text");
    let { type, sourcing } = nc;
    if (!CLAIM_TYPES.has(type)) {
      console.warn(`matcher: off-enum claim type "${type}" -> other`);
      type = "other";
    }
    if (!SOURCINGS.has(sourcing)) {
      console.warn(`matcher: off-enum sourcing "${sourcing}" -> reported`);
      sourcing = "reported"; // never silently promote junk to official
    }
    return {
      verdict: "NEW",
      new_claim: {
        type, sourcing,
        canonical_text: nc.canonical_text.trim(),
        facts: nc.facts && typeof nc.facts === "object" ? nc.facts : {},
      },
    };
  }

  return { verdict: raw.verdict }; // NO_CLAIM / WRONG_SUBJECT / UNSURE carry no payload
}

// Returns a validated verdict object, e.g. {verdict:"NEW", new_claim:{...}}.
// Throws on API failure — callers treat that as UNSURE (fail-open).
export async function matchItem({ subject, item, candidates }) {
  const response = await anthropic.messages.create({
    model: MATCHER_MODEL,
    max_tokens: 500,
    tools: [VERDICT_TOOL],
    tool_choice: { type: "tool", name: "verdict" },
    messages: [{ role: "user", content: buildPrompt({ subject, item, candidates }) }],
  });
  const call = response.content.find((b) => b.type === "tool_use");
  return normalizeVerdict(call?.input, new Set(candidates.map((c) => String(c.id))));
}
