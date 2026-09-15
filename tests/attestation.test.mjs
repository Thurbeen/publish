// The property everything downstream rests on: an attestation naming an earlier
// head must not authorise the current one.
//
// These tests do not reimplement the check. They lift the verification command
// out of the documentation byte for byte and run it, so documentation that
// stops working stops the suite.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { MARKER, SKILL_DIR, STATUSES, fencedBlocks, read, shippedFiles } from "./helpers.mjs";

const TEMPLATE = read(path.join(SKILL_DIR, "templates", "attestation.md"));
const REFERENCE = read(path.join(SKILL_DIR, "references", "attestation.md"));

const HEAD = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const OTHER = "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432";
const ZEROS = "0".repeat(40);

/** The attestation block as the template ships it, retargeted at one commit. */
function block(headSha, overrides = {}) {
  const json = JSON.parse(fencedBlocks(TEMPLATE, "json")[0]);
  const body = { ...json, head_sha: headSha, ...overrides };
  return [
    `<!-- ${MARKER} -->`,
    "```json",
    JSON.stringify(body, null, 2),
    "```",
    "<!-- /publish-attestation -->",
  ].join("\n");
}

// A body in the shape the skill ships: the body template's five headings, with
// its comments answered, and the block appended under ## Attestation.
const prose = read(path.join(SKILL_DIR, "templates", "change-request-body.md"))
  .replace(/<!--[\s\S]*?-->/g, "Filled in.")
  .trimEnd() + "\n\n";

/**
 * Every verification recipe the skill documents, one per forge adapter, as the
 * jq program inside it plus the shape of the object that program is fed. A
 * forge that spells the head `sha` and the body `description` is still the same
 * question, and its recipe is held to the same three answers.
 */
const FORGES = [
  { cli: "gh", view: "gh pr view", head: "headRefOid", body: "body" },
  { cli: "glab", view: "glab mr view", head: "sha", body: "description" },
];

function documentedVerifiers() {
  const found = [];
  for (const rel of shippedFiles()) {
    if (!rel.endsWith(".md")) continue;
    const text = read(path.join(SKILL_DIR, rel));
    for (const sh of fencedBlocks(text, "sh")) {
      const forge = FORGES.find((f) => sh.includes(f.view));
      if (!forge || !sh.includes("head_sha")) continue;
      const program = /(?:-q|--jq)\s*\\?\s*\n?\s*'([\s\S]*)'\s*$/.exec(sh.trim());
      assert.ok(program, `${rel}: a ${forge.cli} recipe with no quoted jq program`);
      found.push({ file: `${rel} (${forge.cli})`, forge, program: program[1] });
    }
  }
  return found;
}

/** What the documented command would print for this head and this body. */
function verify({ forge, program }, head, body) {
  return execFileSync("jq", ["-r", program], {
    input: JSON.stringify({ [forge.head]: head, [forge.body]: body }),
    encoding: "utf8",
  }).trim();
}

test("the documentation ships a verification recipe", () => {
  const verifiers = documentedVerifiers();
  const clis = new Set(verifiers.map((v) => v.forge.cli));
  assert.deepEqual([...clis].sort(), ["gh", "glab"], "every shipped forge adapter must document one");
});

test("an attestation naming the current head verifies as current", () => {
  for (const v of documentedVerifiers()) {
    const { file } = v;
    const out = verify(v, HEAD, prose + block(HEAD));
    assert.match(out, /current/i, `${file} did not call a matching head current`);
    assert.doesNotMatch(out, /stale/i, `${file} called a matching head stale`);
  }
});

test("an attestation naming an earlier head does not authorise the current one", () => {
  for (const v of documentedVerifiers()) {
    const { file } = v;
    const out = verify(v, HEAD, prose + block(OTHER));
    assert.match(out, /stale/i, `${file} accepted an attestation for another commit`);
    assert.doesNotMatch(
      out,
      /^(attestation is )?current$/i,
      `${file} reported a stale attestation as current`,
    );
  }
});

test("a body with no attestation authorises nothing", () => {
  for (const v of documentedVerifiers()) {
    const { file } = v;
    const out = verify(v, HEAD, prose);
    assert.doesNotMatch(out, /^(attestation is )?current$/i, `${file} accepted an unattested body`);
    assert.match(out, /no attestation|stale/i, `${file} said nothing useful about an unattested body`);
  }
});

test("the template's own placeholder sha does not verify against a real head", () => {
  for (const v of documentedVerifiers()) {
    const { file } = v;
    const out = verify(v, HEAD, prose + block(ZEROS));
    assert.doesNotMatch(out, /^(attestation is )?current$/i, `${file} accepted the unfilled template`);
  }
  assert.ok(
    TEMPLATE.includes(ZEROS),
    "the template should ship an obviously-unfilled sha, so a forgotten field cannot pass",
  );
});

test("the marker is one exact string, and the template carries it", () => {
  assert.equal(MARKER, "publish-attestation/v1");
  assert.ok(TEMPLATE.includes(`<!-- ${MARKER} -->`), "template is missing the opening marker comment");
  assert.ok(TEMPLATE.includes("<!-- /publish-attestation -->"), "template is missing the closing comment");
  const json = JSON.parse(fencedBlocks(TEMPLATE, "json")[0]);
  assert.equal(json.schema, MARKER, "the schema field must be the marker, so one grep finds the block");
  assert.ok(REFERENCE.includes(MARKER), "the reference must name the marker a consumer configures");
});

test("the template block is well-formed and names every required field", () => {
  const json = JSON.parse(fencedBlocks(TEMPLATE, "json")[0]);
  for (const field of [
    "schema",
    "head_sha",
    "base",
    "base_sha",
    "repository",
    "attested_at",
    "gate_source",
    "steps",
    "verdict",
  ]) {
    assert.ok(field in json, `the template is missing ${field}`);
  }
  assert.match(json.head_sha, /^[0-9a-f]{40}$/, "head_sha must be a full 40-character sha");
  const STEP_FIELDS = ["name", "status", "command", "reason", "rounds", "findings", "fixed", "run_url", "conclusion"];
  for (const step of json.steps) {
    assert.ok(step.name, "every step needs a name");
    assert.ok(STATUSES.includes(step.status), `${step.status} is not one of the four statuses`);
    for (const field of Object.keys(step)) {
      assert.ok(STEP_FIELDS.includes(field), `${step.name} carries ${field}, which the field contract does not define`);
    }
  }
});

test("the template records the documentation step after the gate and before CI", () => {
  const names = JSON.parse(fencedBlocks(TEMPLATE, "json")[0]).steps.map((s) => s.name);
  const docs = names.indexOf("documentation");
  assert.ok(docs !== -1, "the template has no documentation step");
  assert.ok(docs > names.indexOf("test") && docs < names.indexOf("ci"), `steps are out of order: ${names}`);
  assert.match(REFERENCE, /The documentation step/, "the reference must define the documentation step");
});

test("the filled body carries the attestation under ## Attestation, last", () => {
  const body = prose + block(HEAD);
  const heading = body.indexOf("\n## Attestation\n");
  assert.ok(heading !== -1 && body.indexOf(`<!-- ${MARKER} -->`) > heading, "the block is not under ## Attestation");
  assert.ok(body.trimEnd().endsWith("<!-- /publish-attestation -->"), "something follows the attestation");
});

test("the three answers are the same words on every forge", () => {
  assert.match(REFERENCE, /^current\s+the attestation names the head/m);
  assert.match(REFERENCE, /^stale\s+it names another commit/m);
  assert.match(REFERENCE, /^no attestation\s+nothing was proved/m);
});

test("the verdict rule is documented as the only one, and blocks on a skip", () => {
  assert.match(REFERENCE, /verdict\s*=\s*"passed"\s+if every step is "passed" or "not-applicable"/);
  assert.match(REFERENCE, /verdict\s*=\s*"blocked"\s+otherwise/);
  assert.match(REFERENCE, /A `skipped` step\s+blocks\./);
  assert.match(REFERENCE, /A `failed`\s+step blocks\./);
});

test("a reason is required on any step that did not pass", () => {
  assert.match(
    REFERENCE,
    /`reason` is \*\*required\*\* whenever `status` is `skipped` or `failed`/,
    "the reference must require a reason, or a skip can be recorded with no explanation",
  );
});

test("every push after the attestation obliges a new one", () => {
  assert.match(REFERENCE, /Every push after the\s+attestation obliges a re-attestation/);
  assert.match(REFERENCE, /never patch `head_sha` on\s+its own/);
});
