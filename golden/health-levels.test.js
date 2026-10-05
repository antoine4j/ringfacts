// golden/health-levels.json is Anton's health level (0–4) for each training and
// validation article whose frozen key says "reports his health". These tests keep
// it frozen and keep it tied to labels.json.
//
// Frozen: the checksum of the levels is stored in the file. An edit to any level
// fails the test until the checksum is updated, and that is the moment to add a
// line to "errata" saying what changed and why.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(readFileSync(path.join(HERE, name), "utf8"));

const health = read("health-levels.json");
const labels = read("labels.json").articles;
const sideOf = read("split.json").articles;
const ids = Object.keys(health.articles);

describe("the health levels are frozen and match the key", () => {
  test("the levels match the stored checksum", () => {
    // one row per article, in number order: [id, level]
    const rows = [...ids].sort((a, b) => Number(a) - Number(b)).map((id) => [id, health.articles[id].level]);
    const checksum = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
    assert.equal(
      checksum,
      health.sha256_of_levels,
      "a level in golden/health-levels.json changed: if that was on purpose, update sha256_of_levels and add a line to errata",
    );
  });

  test("every level is one the scale names", () => {
    const allowed = Object.keys(health.scale).map(Number);
    assert.deepEqual(ids.filter((id) => !allowed.includes(health.articles[id].level)), []);
  });

  test("exactly the training and validation articles the key calls health news are levelled", () => {
    const expected = Object.keys(labels)
      .filter((id) => health.sides.includes(sideOf[id]) && labels[id].answers.reports_his_health === "yes")
      .sort();
    assert.deepEqual([...ids].sort(), expected);
  });

  test("no test-set article is levelled", () => {
    assert.deepEqual(ids.filter((id) => sideOf[id] === "test"), []);
  });
});
