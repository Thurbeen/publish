import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ROOT, read } from "./helpers.mjs";

const svg = read(path.join(ROOT, "assets", "workflow.svg"));
const readme = read(path.join(ROOT, "README.md"));

test("the README workflow diagram uses restrained accessible SVG animation", () => {
  assert.match(readme, /<img src="assets\/workflow\.svg"[^>]+alt="[^"]+"/);
  assert.match(svg, /<svg[^>]+role="img"[^>]+aria-labelledby="title desc"/);
  assert.match(svg, /<title id="title">[^<]+<\/title>/);
  assert.match(svg, /<desc id="desc">[^<]+<\/desc>/);
  assert.match(svg, /@keyframes\s+workflow-flow/);
  assert.match(svg, /class="[^"]*motion[^"]*"/);

  const seconds = Number(/animation:\s*workflow-flow\s+([\d.]+)s/.exec(svg)?.[1]);
  assert.ok(seconds >= 6, `workflow animation is too fast: ${seconds}s`);

  const reduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\s*\}/.exec(svg)?.[1] ?? "";
  assert.match(reduced, /\.motion\s*\{[^}]*animation:\s*none/);
  assert.doesNotMatch(svg, /<script|<foreignObject|(?:href|src)=["']https?:\/\//, "the README SVG must stay self-contained and GitHub-compatible");
});
