// The branch protection on main requires two checks by name, `All Checks` and
// `PR Title`, rather than the matrix jobs, so renaming or extending the matrix
// cannot silently change what is required. These tests hold the workflows to
// that, and run the aggregator and the title check themselves.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT, read } from "./helpers.mjs";

const WORKFLOWS = path.join(ROOT, ".github", "workflows");
const CI = read(path.join(WORKFLOWS, "ci.yml"));
const PR_TITLE = read(path.join(WORKFLOWS, "pr-title.yml"));
const CHECKER = path.join(ROOT, "scripts", "check-pr-title.mjs");

/** The jobs of a workflow, each as the raw lines of its block, keyed by job id. */
function jobs(text) {
  const lines = text.split("\n");
  const out = {};
  let key = null;
  for (const line of lines.slice(lines.indexOf("jobs:") + 1)) {
    if (/^\S/.test(line)) break;
    const m = /^  ([\w-]+):\s*$/.exec(line);
    if (m) out[(key = m[1])] = [];
    else if (key) out[key].push(line);
  }
  return out;
}

/** A job-level scalar such as `name` or `timeout-minutes`. */
const field = (block, name) =>
  block.map((l) => new RegExp(`^    ${name}:\\s*(.*)$`).exec(l)).find(Boolean)?.[1];

/** A job's `needs`, in either flow (`[a, b]`) or block list form. */
function needs(block) {
  const at = block.findIndex((l) => /^    needs:/.test(l));
  if (at === -1) return [];
  const inline = block[at].replace(/^    needs:\s*/, "");
  if (inline) return inline.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const line of block.slice(at + 1)) {
    const m = /^      - ([\w-]+)\s*$/.exec(line);
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}

/** The body of the only `run: |` block scalar in a job, dedented. */
function runScript(block) {
  const at = block.findIndex((l) => /^\s*(- )?run: \|\s*$/.test(l));
  assert.notEqual(at, -1, "the job has no `run: |` step");
  const body = [];
  for (const line of block.slice(at + 1)) {
    if (line.trim() && !/^ {10}/.test(line)) break;
    body.push(line.slice(10));
  }
  return body.join("\n");
}

const ciJobs = jobs(CI);
const titleJobs = jobs(PR_TITLE);

test("every job in every workflow has a timeout", () => {
  for (const [file, found] of [["ci.yml", ciJobs], ["pr-title.yml", titleJobs]]) {
    assert.ok(Object.keys(found).length > 0, `${file} has no jobs`);
    for (const [id, block] of Object.entries(found)) {
      assert.match(field(block, "timeout-minutes") ?? "", /^\d+$/, `${file} job ${id} has no timeout-minutes`);
    }
  }
});

test("All Checks needs every other job in ci.yml and runs even when one fails", () => {
  const block = ciJobs["all-checks"];
  assert.ok(block, "ci.yml has no all-checks job");
  assert.equal(field(block, "name"), "All Checks");
  assert.equal(field(block, "if"), "always()");
  const others = Object.keys(ciJobs).filter((id) => id !== "all-checks").sort();
  assert.ok(others.length > 0, "all-checks has nothing to aggregate");
  assert.deepEqual(needs(block).sort(), others);
});

test("All Checks passes only when every job it needs succeeded", () => {
  const script = runScript(ciJobs["all-checks"]);
  const verdict = (results) => {
    const NEEDS = JSON.stringify(
      Object.fromEntries(Object.entries(results).map(([id, result]) => [id, { result, outputs: {} }])),
    );
    // `bash -e` is what a `run:` step without a `shell:` runs under on Linux.
    return spawnSync("bash", ["-e", "-c", script], { env: { ...process.env, NEEDS }, encoding: "utf8" }).status;
  };
  assert.equal(verdict({ test: "success" }), 0);
  assert.equal(verdict({ test: "success", lint: "success" }), 0);
  for (const bad of ["failure", "cancelled", "skipped"]) {
    assert.equal(verdict({ test: "success", lint: bad }), 1, `a ${bad} job passed All Checks`);
  }
});

test("PR Title runs on pull requests only, and again whenever the title is edited", () => {
  const on = PR_TITLE.slice(PR_TITLE.indexOf("\non:"), PR_TITLE.indexOf("\njobs:"));
  assert.match(on, /^\s+pull_request:\s*$/m);
  assert.doesNotMatch(on, /^\s+(push|pull_request_target|workflow_dispatch|schedule):/m);
  assert.match(on, /types: \[opened, edited, synchronize, reopened\]/);
  const block = titleJobs["pr-title"];
  assert.ok(block, "pr-title.yml has no pr-title job");
  assert.equal(field(block, "name"), "PR Title");
});

test("the PR title reaches the checker through the environment, never interpolated into the shell", () => {
  const block = titleJobs["pr-title"].join("\n");
  assert.match(block, /PR_TITLE: \$\{\{ github\.event\.pull_request\.title \}\}/);
  assert.match(block, /run: node scripts\/check-pr-title\.mjs "\$PR_TITLE"/);
  for (const line of titleJobs["pr-title"].filter((l) => /run:/.test(l))) {
    assert.doesNotMatch(line, /\$\{\{/, `a run line interpolates an expression: ${line.trim()}`);
  }
});

const check = (title) => spawnSync(process.execPath, [CHECKER, title], { encoding: "utf8" });

test("the title check accepts conventional commits", () => {
  for (const title of [
    "feat: add the publish skill",
    "fix(ci): wait for the right run",
    "ci!: drop Node 20",
    "chore(deps-dev): bump a thing",
    "revert: feat: add the publish skill",
    ...["perf", "refactor", "docs", "style", "test", "build"].map((t) => `${t}: something`),
  ]) {
    const r = check(title);
    assert.equal(r.status, 0, `rejected ${JSON.stringify(title)}: ${r.stderr}`);
  }
});

test("the title check rejects anything else, and says why", () => {
  for (const title of [
    "",
    "Add the publish skill",
    "feature: add the publish skill",
    "Feat: add the publish skill",
    "feat add the publish skill",
    "feat:add the publish skill",
    "feat: ",
    "feat(): add the publish skill",
    "wip",
    "feat: two\nlines",
  ]) {
    const r = check(title);
    assert.equal(r.status, 1, `accepted ${JSON.stringify(title)}`);
    assert.match(r.stderr, /conventional commit/, `no reason given for ${JSON.stringify(title)}`);
  }
});
