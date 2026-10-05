// Digest writer (8): a Mastra agent with no tools, on an open model through
// OpenRouter with reasoning on. One call per fighter per period: a wide
// context in, the digest's text and the claims each item used out. No database.
// Design: docs/superpowers/specs/2026-10-04-v0-design.md, section 8 (D24, D25).

import { Agent } from "@mastra/core/agent";
import type { DigestContext } from "../../store/digests.ts";

export const DIGEST_PROMPT_VERSION = "d2";
export const DEFAULT_DIGEST_MODEL = "deepseek/deepseek-v4-pro";

const INSTRUCTIONS = `You write one fighter's news digest for a small private Telegram group of people who follow him closely.

You are given: today's date and the period this digest covers; the group's previous digests about him; this period's stories ("claims"), each with every article's one-sentence summary, outlet, date, link and tier; and quieter background stories from the month before, without new articles.

Tier 1 means the story was important enough to be posted on its own as it happened; "posted" says whether it was. Tier 2 is digest news.

Write the digest:
- Lead with what matters most to a follower: his next fight, a result, his health, a career move. Then what others said about him and what he said. Leave out what adds nothing: passing mentions, repeats of old news, rumours that went nowhere.
- One short paragraph per item. Plain English, no hype.
- Each paragraph ends with one or two links to its best sources, written inside the text itself, using only the links you are given, for example: (<a href="https://example.com/story">ESPN</a>, <a href="https://example.org/story">MMA Junkie</a>). A paragraph without a link is not finished.
- A story already posted on its own gets one line, not a retelling.
- Connect to the previous digests where a story moved on or stayed stuck ("still no official word on his next fight").
- If nothing worth reading happened, say so in one line.
- Never state a fact that is not in the summaries you are given.
- Formatting: Telegram HTML only, <b>, <i> and <a href>. No headings, no markdown.

Return JSON only, no other text:
{"text": "<the digest>", "items": [{"title": "<a few words>", "claims": [<claim ids it draws on>], "links": ["<urls it gives>"]}], "left_out": [{"claim": <id>, "why": "<a few words>"}]}`;

/**
 * The context as the message the writer reads.
 *
 * @param context  What the store gathered.
 * @param today  The date the digest is written.
 * @returns The user message.
 */
export function digestMessage(context: DigestContext, today: Date): string {
  const day = (instant: Date) => instant.toISOString().slice(0, 10);
  const story = (claim: DigestContext["active"][number]) => ({
    claim: claim.id, label: claim.label, tier: claim.bestTier, posted: claim.postedInPeriod,
    articles_in_all: claim.readings, outlets_in_all: claim.outlets, first: claim.firstDate, last: claim.lastDate,
    ...(claim.articles.length ? { articles: claim.articles } : {}),
  });
  return JSON.stringify({
    fighter: context.fighter,
    today: day(today),
    period: { from: day(context.periodStart), to: day(context.periodEnd) },
    previous_digests: context.previous,
    this_period: context.active.map(story),
    background: context.background.map(story),
  }, null, 1);
}

/**
 * The writer's answer, checked: JSON with a text, items whose claims were all in the context.
 *
 * @param reply  The model's text.
 * @param context  What it was given.
 * @returns The digest text, its items, and the ids of the claims it used.
 */
export function parseDigest(reply: string, context: DigestContext): { text: string; items: { title: string; claims: number[]; links: string[] }[]; usedClaimIds: Set<number>; unknownClaims: number[] } {
  const json = reply.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const parsed = JSON.parse(json);
  if (typeof parsed.text !== "string" || parsed.text.trim() === "") throw new Error("the digest has no text");

  // Keep only claims the writer was given; note any it invented.
  const given = new Set([...context.active, ...context.background].map((claim) => claim.id));
  const usedClaimIds = new Set<number>();
  const unknownClaims: number[] = [];
  const items = (parsed.items ?? []).map((item: { title?: string; claims?: unknown[]; links?: string[] }) => {
    const claims = (item.claims ?? []).map(Number);
    for (const claim of claims) (given.has(claim) ? usedClaimIds.add(claim) : unknownClaims.push(claim));
    return { title: String(item.title ?? ""), claims: claims.filter((claim) => given.has(claim)), links: item.links ?? [] };
  });
  return { text: withSources(telegramSafe(parsed.text), items), items, usedClaimIds, unknownClaims };
}

/**
 * The text with its links: as written when it has any, otherwise with a
 * sources line per item built from the links the writer listed.
 *
 * @param text  The digest text, already made safe.
 * @param items  The writer's items.
 * @returns The text, with links.
 */
export function withSources(text: string, items: { title: string; links: string[] }[]): string {
  if (text.includes("<a href=")) return text;
  const lines = items
    .filter((item) => item.links.length > 0)
    .map((item) => `${escapeText(item.title)}: ${item.links.map((link, index) => `<a href="${escapeText(link).replaceAll('"', "&quot;")}">${index + 1}</a>`).join(" ")}`);
  return lines.length ? `${text}\n\n<i>Sources</i>\n${lines.join("\n")}` : text;
}

/**
 * Keeps only the tags Telegram's HTML accepts here (<b>, <i>, <a href>), escaping everything else.
 *
 * @param html  The writer's text.
 * @returns Text Telegram will accept.
 */
export function telegramSafe(html: string): string {
  const allowed = /<\/?(b|i)>|<a href="[^"<>]*">|<\/a>/g;
  const pieces: string[] = [];
  let last = 0;
  for (const match of html.matchAll(allowed)) {
    pieces.push(escapeText(html.slice(last, match.index)), match[0]);
    last = (match.index ?? 0) + match[0].length;
  }
  pieces.push(escapeText(html.slice(last)));
  return pieces.join("");
}

/**
 * Escapes text outside the allowed tags; an entity already written stays as it is.
 *
 * @param text  Plain text.
 * @returns The text with &, < and > escaped.
 */
function escapeText(text: string): string {
  return text.replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Writes one digest.
 *
 * @param context  What the store gathered.
 * @param model  The OpenRouter model id.
 * @param today  The date it is written.
 * @returns The checked digest and the model's reply metadata (usage, reasoning length).
 */
export async function writeDigest(context: DigestContext, model: string, today: Date) {
  const agent = new Agent({ id: "digest-writer", name: "Digest writer", instructions: INSTRUCTIONS, model: `openrouter/${model}` });
  const reply = await agent.generate(digestMessage(context, today), { providerOptions: { openrouter: { reasoning: { enabled: true } } } });
  const checked = parseDigest(reply.text, context);
  const usage = reply.usage as { inputTokens?: number; outputTokens?: number; reasoningTokens?: number; raw?: { raw?: { cost?: number } } };
  const raw = {
    reply: reply.text,
    usage: { input: usage.inputTokens, output: usage.outputTokens, reasoning: usage.reasoningTokens, cost: usage.raw?.raw?.cost },
    unknown_claims: checked.unknownClaims,
  };
  return { ...checked, raw };
}
