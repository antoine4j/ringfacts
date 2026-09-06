// Fetches article bodies for the labelled items that have none, for the B
// measurement (docs/story-matching-options.md): what would the story gate
// see if the body were fetched BEFORE the early embedding hold? Read-only
// against the world, nothing against the database: it reads
// tmp/labels/stories.json (from labels/export-stories.js) and writes
// tmp/labels/bodies.json — { [id]: { resolved_url, body, via } }. Resumable:
// ids already in the output file are skipped.
//
//   node labels/fetch-bodies.js [--concurrency 4]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeGoogleNewsUrl, isGoogleWrapped } from "../lib/googlenews.js";
import { fetchArticleBody } from "../lib/extract.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const INPUT = join(HERE, "..", "tmp/labels/stories.json");
const OUT = join(HERE, "..", "tmp/labels/bodies.json");
const cArg = process.argv.indexOf("--concurrency");
const CONCURRENCY = cArg > 0 ? Number(process.argv[cArg + 1]) : 4;

const items = JSON.parse(readFileSync(INPUT, "utf8"));
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const todo = items.filter((it) => !it.body && !(it.id in out));
console.error(`${items.length} items, ${items.filter((it) => !it.body).length} without a body, ${todo.length} to fetch`);

let done = 0;
async function one(it) {
  let resolved = it.resolved_url;
  if (!resolved && isGoogleWrapped(it.url)) resolved = await decodeGoogleNewsUrl(it.url).catch(() => null);
  if (!resolved && !isGoogleWrapped(it.url)) resolved = it.url;
  const fetched = resolved ? await fetchArticleBody(resolved) : { body: null, via: "decode-failed" };
  out[it.id] = { resolved_url: resolved ?? null, body: fetched.body, via: fetched.via };
  done += 1;
  if (done % 10 === 0) { writeFileSync(OUT, JSON.stringify(out)); console.error(`${done}/${todo.length} (${Object.values(out).filter((o) => o.body).length} bodies so far)`); }
}
const queue = [...todo];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (queue.length) await one(queue.shift()); }));
writeFileSync(OUT, JSON.stringify(out));

const vias = {};
for (const o of Object.values(out)) vias[o.body ? "body:" + o.via : "none:" + o.via] = (vias[o.body ? "body:" + o.via : "none:" + o.via] || 0) + 1;
console.error(`done: ${Object.values(out).filter((o) => o.body).length} bodies of ${Object.keys(out).length}`, vias);
