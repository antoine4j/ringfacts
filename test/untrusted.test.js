// The untrusted-source rule (lib/untrusted.js): a domain that has earned a
// majority wrong-subject record and has never yielded an article body is
// keyword spam, and its items are held before they can post. Pure functions
// here; the aggregate query is tier 3 (test/sql.test.js) and the veto's place
// in the pipeline is tier 2 (test/pipeline.test.js).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { domainOf, isUntrustedSource } from "../lib/untrusted.js";

describe("domainOf", () => {
  test("is the hostname without a www prefix", () => {
    assert.equal(domainOf("https://www.mshale.com/2026/08/some-slug/"), "mshale.com");
    assert.equal(domainOf("https://bloodyelbow.com/2026/09/03/x/"), "bloodyelbow.com");
  });

  test("is null for something that is not a URL", () => {
    assert.equal(domainOf("not a url"), null);
    assert.equal(domainOf(null), null);
  });
});

describe("isUntrustedSource — all three conditions, or nothing", () => {
  const spam = { items: 5, wrongSubject: 3, bodies: 0 };

  test("holds a domain with enough history, a majority wrong-subject, and no body ever", () => {
    assert.equal(isUntrustedSource(spam), true);
  });

  test("a domain below the history floor is not judged yet", () => {
    assert.equal(isUntrustedSource({ ...spam, items: 4 }), false);
  });

  test("a body ever extracted disarms the rule — real outlets get blocked too", () => {
    assert.equal(isUntrustedSource({ ...spam, bodies: 1 }), false);
  });

  test("a minority wrong-subject record is normal for a surname-filtered feed", () => {
    assert.equal(isUntrustedSource({ items: 10, wrongSubject: 4, bodies: 0 }), false);
  });

  test("exactly half counts as a majority-junk record", () => {
    assert.equal(isUntrustedSource({ items: 6, wrongSubject: 3, bodies: 0 }), true);
  });

  test("no record at all is not untrusted", () => {
    assert.equal(isUntrustedSource(null), false);
    assert.equal(isUntrustedSource({ items: 0, wrongSubject: 0, bodies: 0 }), false);
  });

  test("the thresholds can be handed in explicitly", () => {
    assert.equal(isUntrustedSource(spam, { minItems: 6, minRatio: 0.5 }), false);
    assert.equal(isUntrustedSource(spam, { minItems: 5, minRatio: 0.7 }), false);
  });

  test("the kill switch turns the rule off", () => {
    assert.equal(isUntrustedSource(spam, { off: true }), false);
  });
});
