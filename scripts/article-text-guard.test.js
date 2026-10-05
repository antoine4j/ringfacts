// The article-text guard on invented text: a copied passage is caught, a quoted sentence is not.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { indexBodies, longestCopiedPassage, normalise, MAX_COPIED_CHARACTERS } from "./article-text-guard.js";

/**
 * An invented article with no repeated phrase, so every piece of it is unique.
 *
 * @returns {string}
 */
function inventedArticle() {
  const words = ["fighter", "camp", "coach", "weigh", "card", "title", "round", "judge", "crowd", "belt",
    "gym", "rival", "manager", "contract", "doctor", "arena", "promoter", "debut", "rematch", "training"];
  let seed = 7;
  const next = () => { seed = (seed * 48271) % 2147483647; return seed; };
  return Array.from({ length: 600 }, () => words[next() % words.length] + (next() % 97)).join(" ");
}

const body = inventedArticle();
const pieces = indexBodies([body]);

describe("the article-text guard", () => {
  it("catches a file that copies a 400-character passage", () => {
    const file = `{"notes": "x", "body": ${JSON.stringify(body.slice(1000, 1400))}}`;
    assert.ok(longestCopiedPassage(file, pieces) > MAX_COPIED_CHARACTERS);
  });

  it("lets a quoted sentence of 150 characters through", () => {
    const file = `The reader's reason: "${body.slice(2000, 2150)}" is the deciding line.`;
    assert.ok(longestCopiedPassage(file, pieces) <= MAX_COPIED_CHARACTERS);
  });

  it("lets several short quotes from one article through when none is long", () => {
    const file = [body.slice(100, 220), body.slice(900, 1020), body.slice(1800, 1920)].join(" … ");
    assert.ok(longestCopiedPassage(file, pieces) <= MAX_COPIED_CHARACTERS);
  });

  it("matches text stored with JSON escapes and other line breaks", () => {
    const stored = body.slice(500, 1000).replace(/ /g, "\\n");
    assert.ok(longestCopiedPassage(stored, pieces) > MAX_COPIED_CHARACTERS);
    assert.equal(normalise("a\\n  b\tc"), "a b c");
  });

  it("finds nothing in unrelated text", () => {
    assert.equal(longestCopiedPassage("Nothing from any article is here. ".repeat(20), pieces), 0);
  });
});
