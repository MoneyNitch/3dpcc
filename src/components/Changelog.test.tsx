import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Changelog } from "./Changelog";

function render(text: string) {
  return renderToStaticMarkup(createElement(Changelog, { text }));
}

test("renders Markdown and separates releases without splitting fenced headings", () => {
  const html = render(`# Changelog
Introduction.
## [Unreleased]
### Added
- **Bold** and \`code\` with *emphasis*.
\`\`\`md
## Not a release
\`\`\`
## v1.0.0
1. First
2. Second

| Feature | Status |
| --- | --- |
| Cards | Done |
`);
  assert.equal((html.match(/<article\b/g) ?? []).length, 2);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<em>emphasis<\/em>/);
  assert.match(html, /<code[^>]*>code<\/code>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<ol>/);
  assert.match(html, /<table\b/);
  assert.match(html, /<pre><code[^>]*>## Not a release/);
  assert.match(html, /<\/article>\s*<article\b/);
  assert.ok(html.indexOf("Introduction.") < html.indexOf("<article"));
});

test("ignores raw HTML, blocks automatic image loading and unsafe links", () => {
  const html = render(`## v1.0.0
<script>alert('bad')</script>

<img src="https://example.com/tracker">

![Image description](https://example.com/tracker)
[Unsafe](javascript:alert%281%29)
[Data](data:text/html,bad)
[Release](https://github.com/MoneyNitch/3dpcc/releases)
`);
  assert.doesNotMatch(html, /<script|<img|javascript:|data:text|tracker/);
  assert.match(html, /Image description/);
  assert.equal((html.match(/<a /g) ?? []).length, 1);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /referrerPolicy="no-referrer"/);
});

test("renders documents without release headings and Windows line endings", () => {
  assert.match(render("Just **notes**."), /<strong>notes<\/strong>/);
  assert.equal((render("## v2.0.0\r\n- New\r\n## v1.0.0\r\n- Old").match(/<article\b/g) ?? []).length, 2);
});

test("each bundled changelog release gets exactly one card", async () => {
  const text = await readFile("CHANGELOG.md", "utf8");
  const headings = text.match(/^## /gm) ?? [];
  assert.ok(headings.length > 1);
  assert.equal((render(text).match(/<article\b/g) ?? []).length, headings.length);
});
