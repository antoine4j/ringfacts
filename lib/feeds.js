// Direct publisher feeds (2e). A second discovery source next to Google News:
// real, fetchable article URLs (Google's are machine-blocked wrappers) and an
// independent rail when Google sheds our datacenter IP (the documented 503
// escalation path). Feeds are outlet-wide, not per-fighter queries, so items
// are filtered by fighter name after the fetch — one fetch per outlet per
// run, shared across all fighters.
//
// Every URL below was verified live on 2026-08-08 (200 + parseable XML with a
// browser UA). Casualties of that verification: MMA Junkie (Gannett killed
// their feeds), XSPORT.ua (410 gone), AS/Mundo Deportivo (404/403). The list
// is config — grow or prune it as outlets appear or start blocking.

import { decodeEntities } from "./extract.js";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const OUTLETS = [
  // "UFC" as the source name matches isOfficialSource() — items from this
  // feed can born-confirm and flip rumors, exactly like ufc.com via Google.
  { id: "ufc",         name: "UFC",          url: "https://www.ufc.com/rss/news",              lang: "en" },
  { id: "mmafighting", name: "MMA Fighting", url: "https://www.mmafighting.com/rss/index.xml", lang: "en" }, // Atom
  { id: "bloodyelbow", name: "Bloody Elbow", url: "https://bloodyelbow.com/feed/",             lang: "en" },
  { id: "sherdog",     name: "Sherdog",      url: "https://www.sherdog.com/rss/news.xml",      lang: "en" }, // 403s non-browser UAs
  { id: "sportua",     name: "Sport.ua",     url: "https://sport.ua/uk/rss/mma",               lang: "uk" }, // XSPORT has no feed
  { id: "marca",       name: "Marca",        url: "https://e00-marca.uecdn.es/rss/mma.xml",    lang: "es" }, // Fighter C's home press
];

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

// Outlet feeds cover the whole sport; a fighter's items are the ones that
// name them. Substring match over title + feed body, both scripts where the
// press uses both (declension-safe: surnames only, stems chosen so Ukrainian
// case endings still match).
export function matchesFighter(item, fighter) {
  const haystack = `${item.title} ${item.feedContent ?? ""}`.toLowerCase();
  return fighter.matchNames.some((name) => haystack.includes(name.toLowerCase()));
}
