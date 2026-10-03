// The labelling rules are decisions Anton made article by article; each one
// lives in the readers' guide as a sentence or two. A later edit to the guide
// could drop such a sentence without anyone noticing, and the rule with it.
// golden/rules.json lists, for every rule in force, the exact sentences the
// guide must still contain. These tests fail when one is gone.
//
// Changing a rule's wording on purpose is fine: change the guide and the
// sentence in rules.json in the same commit.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

/**
 * Text with markdown marks removed and whitespace collapsed, so a sentence is
 * found however the file wraps its lines.
 *
 * @param {string} text
 * @returns {string}
 */
function plain(text) {
  return text.replaceAll("**", "").replaceAll("`", "").replace(/\s+/g, " ");
}

const registry = JSON.parse(readFileSync(path.join(HERE, "rules.json"), "utf8"));
const guide = plain(readFileSync(path.join(REPO, registry.guide), "utf8"));
const rulesPage = readFileSync(path.join(HERE, "rules.md"), "utf8");
const articleIds = new Set(
  JSON.parse(readFileSync(path.join(HERE, "articles.json"), "utf8")).map((article) => String(article.id)),
);

describe("labelling rules stay in the readers' guide", () => {
  for (const rule of registry.rules) {
    test(`"${rule.name}" is still said in the guide`, () => {
      assert.ok(rule.guide_must_say.length > 0, "a rule must list at least one sentence the guide carries");
      for (const sentence of rule.guide_must_say) {
        assert.ok(
          guide.includes(sentence),
          `the guide no longer says: "${sentence}" — restore it, or change it here too if the rule was reworded on purpose`,
        );
      }
    });
  }
});

describe("the rule index and the registry list the same rules", () => {
  // every "### name" heading in rules.md is one rule
  const headings = [...rulesPage.matchAll(/^### (.+)$/gm)].map((match) => match[1]);
  const names = registry.rules.map((rule) => rule.name);

  test("every rule in rules.md has an entry in rules.json", () => {
    assert.deepEqual(headings.filter((heading) => !names.includes(heading)), []);
  });

  test("every entry in rules.json has a heading in rules.md", () => {
    assert.deepEqual(names.filter((name) => !headings.includes(name)), []);
  });

  test("rule ids are unique", () => {
    const ids = registry.rules.map((rule) => rule.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("every example article is in the golden set", () => {
    const unknown = registry.rules.flatMap((rule) => rule.articles.filter((id) => !articleIds.has(id)));
    assert.deepEqual(unknown, []);
  });
});
