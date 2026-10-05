import { test } from "node:test";
import assert from "node:assert/strict";
import { safeTelegramHtml } from "./telegram-html.ts";

test("bold, italics and web links are kept, links open in a new tab", () => {
  assert.equal(
    safeTelegramHtml('<b>Topuria</b> said <i>no</i> (<a href="https://example.com/a?b=1&amp;c=2">ESPN</a>)'),
    '<b>Topuria</b> said <i>no</i> (<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noreferrer">ESPN</a>)',
  );
});

test("anything else is shown as text", () => {
  assert.equal(safeTelegramHtml('<script>alert(1)</script>'), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(safeTelegramHtml('<a href="javascript:alert(1)">x</a>'), '&lt;a href="javascript:alert(1)"&gt;x</a>');
  assert.equal(safeTelegramHtml('<b onclick="x">y</b>'), '&lt;b onclick="x"&gt;y</b>');
  assert.equal(safeTelegramHtml("3 < 4 > 2"), "3 &lt; 4 &gt; 2");
});
