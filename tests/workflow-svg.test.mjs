import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, read } from "./helpers.mjs";

const svg = read(path.join(ROOT, "assets", "workflow.svg"));
const readme = read(path.join(ROOT, "README.md"));

// All motion lives in one <g id="motion"> block, its own <style> included, so
// dropping the animation is deleting that block and nothing else.
const motion = /<g id="motion"[^>]*>([\s\S]*?)\n  <\/g><!-- \/motion -->/.exec(svg)?.[1] ?? "";
const still = svg.replace(/\n  <g id="motion"[\s\S]*?<\/g><!-- \/motion -->/, "");

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

test("every bit of motion is isolated in one removable block", () => {
  assert.ok(motion, "no <g id=\"motion\"> block closed by <!-- /motion -->");
  assert.match(motion, /<style>/, "the motion block carries its own style");
  assert.doesNotMatch(still, /@keyframes|animation|offset-path/, "motion leaks outside the motion block");
  assert.match(still, /prefers-color-scheme: dark/, "the static diagram must still follow the theme on its own");
});

test("the animation tells one publish run: phase by phase, a detour to review, a pause", () => {
  const cycle = Number(/--cycle:\s*([\d.]+)s/.exec(motion)?.[1]);
  assert.ok(cycle >= 12 && cycle <= 24, `cycle of ${cycle}s`);
  const durations = [...motion.matchAll(/animation:\s*[\w-]+\s+([\d.]+)s/g)].map((m) => Number(m[1]));
  assert.ok(durations.length > 0 && durations.every((d) => d === cycle), "every animation must share the one cycle so they stay in step");
  assert.doesNotMatch(motion, /animation:[^;]*\blinear infinite/, "motion is eased, not linear");

  // One token travels the spine, out along the fix loop, into review and back.
  assert.equal((motion.match(/class="token"/g) ?? []).length, 1, "exactly one token");
  const route = /\.token\s*\{[^}]*offset-path:\s*path\("([^"]+)"\)/.exec(motion)?.[1] ?? "";
  assert.match(route, /V\s*\d+[^"]*?H\s*12\d[^"]*?V\s*40\d/, "the token never takes the loop back up to review");

  // Each phase on the main path lights when reached; the conditional one is passed by.
  for (const phase of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "report", "passed"]) {
    assert.match(motion, new RegExp(`class="lit[^"]*" data-phase="${phase}"`), `phase ${phase} never lights up`);
    assert.match(motion, new RegExp(`@keyframes lit-${phase} \\{`), `phase ${phase} has no timeline`);
  }
  assert.doesNotMatch(motion, /data-phase="\+"/, "the infrastructure review only runs when infrastructure is affected");
  assert.match(motion, /class="trace"/, "the loop is not traced while the token takes it");

  // Review is reached twice: before and after the fix.
  const review = /@keyframes lit-3 \{([\s\S]*?)\n    \}/.exec(motion)?.[1] ?? "";
  const peaks = [...review.matchAll(/opacity:\s*1\b/g)].length;
  assert.ok(peaks >= 2, "review lights only once, so the detour does not read");

  // Everything ends unlit and holds still before the restart.
  const token = /@keyframes token \{([\s\S]*?)\n    \}/.exec(motion)?.[1] ?? "";
  const stops = [...token.matchAll(/([\d.]+)%\s*\{[^}]*offset-distance:\s*([\d.]+)px/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const end = stops.at(-1);
  const hold = stops.filter(([, d]) => d === end[1]).map(([p]) => p);
  assert.ok(Math.max(...hold) - Math.min(...hold) >= 10, "no pause at the end before the run restarts");
});

test("reduced motion shows the full static diagram", () => {
  const reduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\s*\}/.exec(motion)?.[1] ?? "";
  assert.match(reduced, /#motion[^{]*\{[^}]*display:\s*none/, "reduced motion must hide every moving part");
});

test("the README embeds a GIF per theme rendered from that SVG", () => {
  assert.match(readme, /<a href="assets\/workflow\.svg">/, "the animated embed must link to its accessible SVG source");
  assert.match(readme, /<img src="assets\/workflow\.gif"[^>]+alt="[^"]+"/);
  assert.match(readme, /GitHub[^.]*autoplay/i, "the README does not explain reduced-motion control for its GIF");
  assert.match(readme, /<source media="\(prefers-color-scheme: dark\)" srcset="assets\/workflow-dark\.gif">/, "dark-theme readers need the dark GIF");
  for (const name of ["workflow.gif", "workflow-dark.gif"]) {
    const gif = fs.readFileSync(path.join(ROOT, "assets", name));
    assert.equal(gif.subarray(0, 6).toString("ascii"), "GIF89a", name);
    assert.ok(gif.toString("latin1").split("\x21\xf9\x04").length > 2, `${name} has fewer than two frames`);
    assert.ok(gif.length < 600_000, `${name} is ${gif.length} bytes`);
  }
});
