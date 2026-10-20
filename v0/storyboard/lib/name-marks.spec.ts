import { test } from "node:test";
import assert from "node:assert/strict";
import { nameCount, splitOnNames } from "./name-marks.ts";

test("the name is found in any letter case, and the text comes back whole", () => {
  const text = "Ilia Topuria beats Holloway; TOPURIA calls out Makhachev.";
  const pieces = splitOnNames(text, ["Topuria", "Топурі"]);
  assert.equal(pieces.map((piece) => piece.text).join(""), text);
  assert.deepEqual(pieces.filter((piece) => piece.isName).map((piece) => piece.text), ["Topuria", "TOPURIA"]);
  assert.equal(nameCount(pieces), 2);
});

test("a declined Ukrainian form matches by its stem", () => {
  const pieces = splitOnNames("Бій Топурії та Донченка", ["Топурі"]);
  assert.deepEqual(pieces, [
    { text: "Бій ", isName: false },
    { text: "Топурі", isName: true },
    { text: "ї та Донченка", isName: false },
  ]);
});

test("another fighter's name is left alone", () => {
  assert.equal(nameCount(splitOnNames("Amosov and Topuria", ["Donchenko", "Донченк"])), 0);
});

test("no stems or no text marks nothing", () => {
  assert.deepEqual(splitOnNames("Topuria", []), [{ text: "Topuria", isName: false }]);
  assert.deepEqual(splitOnNames("", ["Topuria"]), []);
});

test("characters special to a regular expression are matched literally", () => {
  assert.equal(nameCount(splitOnNames("a.b axb", ["a.b"])), 1);
});
