import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, read } from "./helpers.mjs";

const svg = read(path.join(ROOT, "assets", "workflow.svg"));
const readme = read(path.join(ROOT, "README.md"));

test("the README workflow diagram stays self-contained, labelled and themed", () => {
  assert.match(svg, /<svg[^>]+role="img"[^>]+aria-labelledby="title desc"/);
  assert.match(svg, /<title id="title">[^<]+<\/title>/);
  assert.match(svg, /<desc id="desc">[^<]+<\/desc>/);
  assert.doesNotMatch(svg, /<script|<foreignObject|(?:href|src)=["']https?:\/\//, "the README SVG must stay self-contained and GitHub-compatible");
  const markers = svg.match(/<marker\b[^>]*>/g) ?? [];
  assert.ok(markers.length > 0, "the diagram has no arrowheads");
  for (const marker of markers) {
    assert.match(marker, /markerUnits="userSpaceOnUse"/, `arrowhead scales with stroke width, so its tip misses the edge: ${marker}`);
    assert.match(marker, /refX="0"/, `arrowhead is not anchored at its base: ${marker}`);
  }
  assert.ok(Buffer.byteLength(svg) < 40_000, `workflow.svg grew to ${Buffer.byteLength(svg)} bytes`);
});

test("the diagram is static", () => {
  assert.doesNotMatch(svg, /@keyframes|animation|offset-path/, "the README diagram does not move");
  assert.match(svg, /prefers-color-scheme: dark/, "the diagram must follow the theme");
});

test("the README embeds a PNG per theme rendered from that SVG", () => {
  assert.match(readme, /<a href="assets\/workflow\.svg">/, "the embed must link to its accessible SVG source");
  assert.match(readme, /<img src="assets\/workflow\.png"[^>]+alt="[^"]+"/);
  assert.match(readme, /<source media="\(prefers-color-scheme: dark\)" srcset="assets\/workflow-dark\.png">/, "dark-theme readers need the dark image");
  for (const name of ["workflow.png", "workflow-dark.png"]) {
    const png = fs.readFileSync(path.join(ROOT, "assets", name));
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", name);
    assert.ok(png.length < 600_000, `${name} is ${png.length} bytes`);
  }
});
