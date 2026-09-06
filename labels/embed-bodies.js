// Re-embeds the labelled archive on headline + body, for the B measurement:
// the vectors the story gate would compare if the body were fetched before
// the early hold. TEST Gemini key only (bench/.env.bench); no database.
// Reads tmp/labels/stories.json and tmp/labels/bodies.json, writes
// tmp/labels/vectors-body.json — { [id]: vector }. An item with no body from
// either file is embedded on its headline alone, exactly as today.
//
//   node labels/embed-bodies.js [--chars 1500]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBenchEnv } from "../bench/env.js";
await loadBenchEnv();
const { embedTexts } = await import("../lib/embeddings.js");

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "tmp/labels");
const OUT = join(DIR, "vectors-body.json");
const cArg = process.argv.indexOf("--chars");
const CHARS = cArg > 0 ? Number(process.argv[cArg + 1]) : 1500;
const BATCH = 20;

const items = JSON.parse(readFileSync(join(DIR, "stories.json"), "utf8"));
const bodies = existsSync(join(DIR, "bodies.json")) ? JSON.parse(readFileSync(join(DIR, "bodies.json"), "utf8")) : {};
const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};

export const textFor = (it) => {
  const body = it.body ?? bodies[it.id]?.body ?? null;
  return body ? `${it.title}\n\n${body.slice(0, CHARS)}` : it.title;
};

const todo = items.filter((it) => !(it.id in out));
let withBody = 0, chars = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const texts = batch.map(textFor);
  withBody += texts.filter((t) => t.includes("\n\n")).length;
  chars += texts.reduce((a, t) => a + t.length, 0);
  let vecs = null;
  for (let attempt = 0; !vecs; attempt++) {
    try { vecs = await embedTexts(texts); }
    catch (err) {
      if (!/ 429/.test(err.message) || attempt >= 6) throw err;
      const wait = 15_000 * (attempt + 1);
      console.error(`rate limited, waiting ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  batch.forEach((it, k) => { out[it.id] = vecs[k]; });
  writeFileSync(OUT, JSON.stringify(out));
  console.error(`${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  await new Promise((r) => setTimeout(r, 4000)); // free-tier pacing
}
console.error(`done: ${Object.keys(out).length} vectors, ${withBody} embedded with a body, ~${Math.round(chars / 4)} tokens sent`);
