// thurview is a PR/MR reviewer only: one summary comment, an inline thread per
// finding, and a `thurview/review` commit status, all read in the feedback
// phase. It has no local CLI review, no code graph, no page and no fix skill,
// so the skill must not send an agent looking for any of them.
import test from "node:test";
import assert from "node:assert/strict";
import { ROOT, SKILL_DIR, read, shippedFiles } from "./helpers.mjs";
import path from "node:path";

const docs = [
  ...shippedFiles().filter((f) => f.endsWith(".md")).map((f) => path.join(SKILL_DIR, f)),
  path.join(ROOT, "README.md"),
];

test("nothing relies on the thurview parts that no longer exist", () => {
  for (const file of docs) {
    const text = read(file).replace(/\s+/g, " ");
    for (const gone of [
      /command -v thurview/,
      /npx [^`]*thurview/,
      /npm (?:view|i|install)[^`]*thurview/,
      /thurview update/,
      /thurview@/,
      /\breview-fix\b/,
      /thurview-fix/,
      /thurview-publish/,
      /`thurview` (?:or `[^`]+` )?skill/,
      /\bgraph (?:impact|interfaces|callers)\b/,
      /code graph/i,
      /thurview[^.]*\bpage\b/i,
    ]) {
      assert.doesNotMatch(text, gone, `${path.relative(ROOT, file)} still mentions ${gone}`);
    }
  }
});

test("the review phase is the built-in review alone", () => {
  const review = read(path.join(SKILL_DIR, "references", "review.md"));
  assert.doesNotMatch(review, /^## thurview$/m, "review.md still has a thurview section");
  const skill = read(path.join(SKILL_DIR, "SKILL.md"));
  const phase = /## Phase 3 - review\n([\s\S]*?)(?=\n## )/.exec(skill)[1];
  assert.doesNotMatch(phase, /thurview/, "phase 3 still runs thurview locally");
});

test("thurview's review check is read with the other review checks", () => {
  const feedback = read(path.join(SKILL_DIR, "references", "feedback.md")).replace(/\s+/g, " ");
  assert.match(feedback, /`thurview\/review`/, "the feedback reference never names thurview's commit status");
});
