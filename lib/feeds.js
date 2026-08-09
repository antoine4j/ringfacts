// Direct publisher feeds (2e). A second discovery source next to Google News:
// real, fetchable article URLs (Google's are machine-blocked wrappers) and an
// independent rail when Google sheds our datacenter IP (the documented 503
// escalation path). Feeds are outlet-wide, not per-subject queries, so items
// are filtered by subject name after the fetch — one fetch per outlet per
// run, shared across all subjects.
//
// The outlet list itself is domain knowledge and lives in domain/*.js beside
// the official-source rule its `name` field is matched against. Everything
// here — fetching, parsing, per-subject filtering — is domain-blind.

import { decodeEntities, htmlToText } from "./extract.js";
import { mentionsName } from "./tier.js";
import { domain } from "../domain/index.js";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const OUTLETS = domain.outlets;

// Tolerant RSS 2.0 / Atom parse. Publisher XML is messier than Google's —
// CDATA everywhere, Atom <entry> with href links, content:encoded bodies.
// Still regex (same call the hunter made for Google's regular output);
// upgrade to a real XML parser only if an outlet actually breaks this.
export function parseFeedItems(xml) {
  const items = [];
  const blocks = [
    ...xml.matchAll(/<item>([\s\S]*?)<\/item>/g),
    ...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g),
  ];
  for (const [, block] of blocks) {
    const pick = (tag) =>
      decodeEntities(
        block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? ""
      ).trim();
    // RSS: <link>url</link>. Atom: <link rel="alternate" href="url"/> (or any
    // <link href> when no alternate is marked).
    const url =
      pick("link") ||
      block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/)?.[1] ||
      block.match(/<link[^>]*href=["']([^"']+)["']/)?.[1] ||
      "";
    const date =
      block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ??
      block.match(/<published>(.*?)<\/published>/)?.[1] ??
      block.match(/<updated>(.*?)<\/updated>/)?.[1] ??
      block.match(/<dc:date>(.*?)<\/dc:date>/)?.[1] ??
      0;
    items.push({
      title: pick("title"),
      url: url.trim(),
      publishedAt: new Date(date),
      // Whatever body-ish text the feed carries, richest first. WordPress
      // feeds often ship the full article in content:encoded — a free body
      // (extract.js rung 0). Kept raw (HTML allowed); extraction strips it.
      feedContent:
        pick("content:encoded") || pick("content") || pick("description") || pick("summary") || null,
    });
  }
  return items.filter((i) => i.title && i.url);
}

export async function fetchOutletItems(outlet, { timeoutMs = 10_000 } = {}) {
  const res = await fetch(outlet.url, {
    headers: { "user-agent": BROWSER_UA, accept: "application/rss+xml,application/atom+xml,application/xml,text/xml" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`feed ${res.status} for ${outlet.id}`);
  return parseFeedItems(await res.text()).map((item) => ({
    ...item,
    source: outlet.name,
    edition: outlet.lang,
    foundVia: `direct ${outlet.id}`,
    rssDescription: null, // that column is Google's related-coverage capture
  }));
}

// Outlet feeds cover the whole sport; a subject's items are the ones that
// name them. The name test itself lives in lib/tier.js — the digest tier rule
// asks the same question of the same stems, and two copies of a name-matching
// rule is how they fork. What stays here is the feeds-specific part: the feed
// body is matched as reader-visible TEXT, not raw HTML, because a name inside
// an href slug or an image alt attribute is not a mention (Bloody Elbow's
// markup produced exactly those false positives, 2026-08-09).
export function matchesSubject(item, subject) {
  const visible = `${item.title} ${item.feedContent ? htmlToText(item.feedContent) : ""}`;
  return mentionsName(visible, subject.matchNames);
}
