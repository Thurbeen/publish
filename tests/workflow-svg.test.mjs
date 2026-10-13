import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, read } from "./helpers.mjs";

const svg = read(path.join(ROOT, "assets", "workflow.svg"));
const readme = read(path.join(ROOT, "README.md"));

test("the README workflow diagram uses restrained accessible GitHub animation", () => {
  const gifPath = path.join(ROOT, "assets", "workflow.gif");
  assert.ok(fs.existsSync(gifPath), "GitHub needs an animated GIF because it renders SVG animation as static");
  assert.match(readme, /<a href="assets\/workflow\.svg">/, "the animated embed must link to its accessible SVG source");
  assert.match(readme, /<img src="assets\/workflow\.gif"[^>]+alt="[^"]+"/);
  assert.match(readme, /GitHub[^.]*autoplay/i, "the README does not explain reduced-motion control for its GIF");
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

  const gif = fs.readFileSync(gifPath);
  assert.equal(gif.subarray(0, 6).toString("ascii"), "GIF89a");
  assert.ok(gif.toString("latin1").split("\x21\xf9\x04").length > 2, "the GitHub-rendered GIF has fewer than two frames");
});
