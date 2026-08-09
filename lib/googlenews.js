// Google News wrapped-URL decoding (2e). Google's RSS hands out redirect URLs
// (news.google.com/rss/articles/<token>) that work in a browser but resist
// machine fetching — and the token is where the real URL hides.
//
// Two token generations:
//   - old style ("CBMi..."): protobuf-in-base64 with the literal article URL
//     embedded — decodes locally, zero network. Every URL observed in our
//     feeds as of 2026-08-08 is still this style.
//   - new style ("AU_yqL..."): opaque; requires scraping a signature +
//     timestamp off the article page and POSTing Google's internal
//     batchexecute endpoint. Unofficial, unversioned, known to 429 — exactly
//     the kind of API that breaks without notice.
//
// Contract with callers: BEST EFFORT. Non-Google URLs pass through untouched;
// any failure returns null and the item continues headline-only. A per-run
// circuit breaker stops paying the network cost once Google starts refusing
// (one 429, or two consecutive slow-path failures). Never throws.

const GN_ARTICLE_RE = /^https?:\/\/news\.google\.com\/rss\/articles\/([^?/]+)/;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export function isGoogleWrapped(url) {
  return GN_ARTICLE_RE.test(url);
}

let tripped = false;
let consecutiveFailures = 0;

function noteFailure(hard = false) {
  consecutiveFailures++;
  if (hard || consecutiveFailures >= 2) {
    if (!tripped) console.warn("googlenews: decode circuit breaker tripped for this run");
    tripped = true;
  }
}

// Old-style tokens: base64url-decode and scan the bytes for the embedded URL.
// The token is a protobuf, but the URL sits in it as a plain length-prefixed
// string, so a printable-ASCII scan finds it without a protobuf parser. The
// first URL is the canonical one (a second, when present, is the AMP copy).
function decodeFast(token) {
  const bytes = Buffer.from(token.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
  const match = bytes.match(/https?:\/\/[!-~]+/);
  if (!match) return null;
  try {
    return new URL(match[0]).href;
  } catch {
    return null;
  }
}

// New-style tokens: fetch the wrapper page for its signature/timestamp, then
// ask batchexecute to resolve the token. Double-JSON-encoded on both sides.
async function decodeSlow(token, timeoutMs) {
  const page = await fetch(`https://news.google.com/rss/articles/${token}`, {
    headers: { "user-agent": BROWSER_UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (page.status === 429) { noteFailure(true); return null; }
  if (!page.ok) return null;
  const html = await page.text();
  const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sg || !ts) return null;

  const inner = JSON.stringify(["garturlreq", [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], token, Number(ts), sg]);
  const body = "f.req=" + encodeURIComponent(JSON.stringify([[["Fbv4je", inner, null, "generic"]]]));
  const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: { "user-agent": BROWSER_UA, "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 429) { noteFailure(true); return null; }
  if (!res.ok) return null;
  const text = await res.text();
  // Response: ")]}'" guard line, then JSON whose Fbv4je row carries another
  // JSON string; its second element is the decoded URL.
  const rows = JSON.parse(text.split("\n").find((l) => l.trim().startsWith("[")));
  const payload = rows?.find((r) => r?.[1] === "Fbv4je")?.[2];
  const url = payload ? JSON.parse(payload)?.[1] : null;
  return typeof url === "string" ? new URL(url).href : null;
}

export async function decodeGoogleNewsUrl(url, { timeoutMs = 10_000 } = {}) {
  const token = url.match(GN_ARTICLE_RE)?.[1];
  if (!token) return url; // not wrapped — already a real URL

  try {
    const fast = decodeFast(decodeURIComponent(token));
    if (fast) return fast;
  } catch {}

  if (tripped) return null;
  try {
    const slow = await decodeSlow(decodeURIComponent(token), timeoutMs);
    if (slow) { consecutiveFailures = 0; return slow; }
    noteFailure();
    return null;
  } catch (err) {
    noteFailure();
    console.warn(`googlenews: decode failed (${err.name}): ${url.slice(0, 80)}`);
    return null;
  }
}
