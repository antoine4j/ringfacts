// golden/labels.json is the frozen answer key: nine answers for each of the
// 300 golden articles. These tests keep it frozen and keep it consistent.
//
// Frozen: the checksum of all answers is stored in the file. An edit to any
// answer fails the test until the checksum is updated, and that is the moment
// to add a line to "errata" saying what changed and why.
//
// Consistent: the labelling rules tie some answers to others (golden/rules.md).
// Those ties are checked on every article.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

const labels = JSON.parse(readFileSync(path.join(HERE, "labels.json"), "utf8"));
const articleIds = JSON.parse(readFileSync(path.join(HERE, "articles-meta.json"), "utf8")).map((article) => String(article.id));
const coinFlips = JSON.parse(readFileSync(path.join(HERE, "coin-flips.json"), "utf8")).flips;
const guide = readFileSync(path.join(REPO, labels.guide), "utf8");
const entries = Object.entries(labels.articles);

/**
 * The values the labelling guide allows for one of its five table questions:
 * every value named in the first column of that question's table.
 *
 * @param {string} question the question's name as the guide's heading has it, e.g. "fact"
 * @returns {string[]} the allowed values
 */
function valuesInGuide(question) {
  // the section runs from this question's heading to the next "## " heading
  const start = guide.search(new RegExp(`^## \\d\\. ${question} — `, "m"));
  const rest = guide.slice(start + 3);
  const section = rest.slice(0, rest.search(/^## /m));
  return [...section.matchAll(/^\| `(\w+)` \|/gm)].map((match) => match[1]);
}

describe("the frozen labels are complete and unchanged", () => {
  test("one entry for each of the 300 golden articles", () => {
    assert.deepEqual(Object.keys(labels.articles).sort(), [...articleIds].sort());
    assert.equal(entries.length, 300);
  });

  test("the answers match the stored checksum", () => {
    // the same canonical form the freeze used: one row per article, in number order, answers in question order
    const rows = Object.keys(labels.articles)
      .sort((a, b) => Number(a) - Number(b))
      .map((id) => [id, ...labels.questions.map((question) => labels.articles[id].answers[question])]);
    const checksum = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
    assert.equal(
      checksum,
      labels.sha256_of_answers,
      "an answer in golden/labels.json changed: if that was on purpose, update sha256_of_answers and add a line to errata",
    );
  });

  test("every answer is a value the guide names", () => {
    const allowed = Object.fromEntries(
      ["centrality", "source", "act", "fact", "firmness"].map((question) => [question, valuesInGuide(question)]),
    );
    for (const question of ["reports_his_result", "reports_his_next_fight", "reports_his_health", "he_speaks"]) {
      allowed[question] = ["yes", "no"];
    }
    const unknown = entries.flatMap(([id, article]) =>
      labels.questions
        .filter((question) => !allowed[question].includes(article.answers[question]))
        .map((question) => `#${id} ${question}: ${article.answers[question]}`),
    );
    assert.deepEqual(unknown, []);
  });
});

describe("the answers obey the rules that tie one answer to another", () => {
  /**
   * The articles that break one tie between answers.
   *
   * @param {(answers: object) => boolean} broken true when an article's answers break the tie
   * @returns {string[]} the numbers of the articles that break it
   */
  const breaking = (broken) => entries.filter(([, article]) => broken(article.answers)).map(([id]) => `#${id}`);

  test("no fact means nothing else either: firmness none and the three news questions no", () => {
    assert.deepEqual(
      breaking(
        (a) =>
          a.fact === "no_fact" &&
          (a.firmness !== "none" ||
            a.reports_his_result === "yes" ||
            a.reports_his_next_fight === "yes" ||
            a.reports_his_health === "yes"),
      ),
      [],
    );
  });

  test("firmness is none only when there is no fact", () => {
    assert.deepEqual(breaking((a) => a.fact !== "no_fact" && a.firmness === "none"), []);
  });

  test("when the fact is result, next fight or health, its own question is yes", () => {
    assert.deepEqual(
      breaking(
        (a) =>
          (a.fact === "result" && a.reports_his_result !== "yes") ||
          (a.fact === "next_fight" && a.reports_his_next_fight !== "yes") ||
          (a.fact === "health" && a.reports_his_health !== "yes"),
      ),
      [],
    );
  });

  test("gives news of him never goes with no fact", () => {
    assert.deepEqual(breaking((a) => a.act === "gives_news_of_him" && a.fact === "no_fact"), []);
  });

  test("an article he is not in carries no fact about him and none of his words", () => {
    assert.deepEqual(
      breaking((a) => a.centrality === "not_in_content" && (a.fact !== "no_fact" || a.he_speaks === "yes")),
      [],
    );
  });
});

describe("the coin flips agree with the labels", () => {
  test("each coin flip's key value is the label, and is among its accepted values", () => {
    const wrong = coinFlips
      .filter((flip) => labels.articles[flip.id].answers[flip.question] !== flip.key || !flip.accepted.includes(flip.key))
      .map((flip) => `#${flip.id} ${flip.question}`);
    assert.deepEqual(wrong, []);
  });
});
