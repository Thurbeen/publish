---
name: publish
description: Take committed work through a gate and publish it - rebase, adversarial review against the repository's own rules, then whatever gate that repository declares (tests, lint, docs), then commit the fixes, push, open the change request, watch CI, and write an attestation naming the commit it ran on. Works on any forge with an adapter - GitHub and GitLab ship with it. Load this whenever someone asks to push, publish, ship, land, open a PR or MR, or get a branch merged, and whenever a task says to publish its own work. Do not load it when the repository ships its own publish, ship or release skill - that one wins.
license: MIT
---

# publish

Committed work goes out through one door. This skill is the door: it reviews the
change, runs the gate the repository declares for itself, pushes, opens the
change request, and waits for continuous integration. It reports done only when
the pipeline is green, and it writes into the change request body an attestation
naming the exact commit every one of those steps ran against.

The attestation is the point. A green pipeline on a commit nobody will merge
proves nothing, so the attestation names `head_sha`, and a reader who finds a
different head knows the proof is stale and does not apply. Never write that
field by hand or edit it afterwards - see
[`references/attestation.md`](references/attestation.md).

A change request is a pull request on GitHub and a merge request on GitLab. The
gate is the same either way; only phases 1, 7 and 8 touch the forge, and they go
through the adapter table in [`references/forge.md`](references/forge.md).

```
  "ship this"
      │
      ▼
  0 precedence ──── someone else's gate? ──▶ hand over and stop
      │
  1 preflight       branch, clean tree, forge, base
  2 rebase          onto the base branch, fresh from the remote
  3 review     ◀─┐  adversarial, against this repository's rules
      │          │
      └─ fixes ──┘  iterate until a round finds nothing
      │
  4 gate            exactly the steps the repository declares
  5 commit          the fixes review and the gate produced
  6 push
  7 change request  body + attestation for the pushed head
  8 CI              watch it; a red pipeline is not done
      │
      ▼
  green, and the attestation names the head that is green
```

Every phase below reports one of four statuses, and phase 8 turns them into a
verdict. There is no fifth status and no way to leave a phase unreported:
`passed`, `failed`, `skipped`, `not-applicable`.

| status | means |
| --- | --- |
| `passed` | it ran and it was clean |
| `failed` | it ran and it was not clean |
| `skipped` | it should have run and could not - say why |
| `not-applicable` | the repository declares it has no such step |

**A `skipped` step and a `failed` step both block.** The verdict is `passed`
only when every step is `passed` or `not-applicable`. Anything else is
`blocked`, and a `blocked` verdict is reported to the user as not done. A step
you could not run is never reported as one that passed, and "CI was still
running" is never reported as green.

## Phase 0 - precedence

Three things outrank this skill. Check in this order and stop at the first hit.

1. **The repository's own skill.** A `publish`, `ship`, `release` or `deploy`
   skill inside the repository being published knows things this one cannot.
   Run that instead.
2. **An installed gate tool.** If the repository root has a gate tool's own
   config and that tool is set up in this clone, it is already the door. Running
   both pushes twice and opens two change requests.
3. **An explicit instruction in the repository's agent rules** naming a
   different way to publish.

Nothing found: this skill is the door. Continue.

## Phase 1 - preflight

Establish four facts and stop if any of them is wrong.

```sh
git rev-parse --abbrev-ref HEAD          # not the base branch
git status --porcelain                   # empty; this skill publishes commits
git rev-parse --short HEAD
git remote get-url origin                # which forge this is
```

- **Working tree must be clean.** This skill publishes committed work. Uncommitted
  changes are the user's to keep or commit; do not commit them on their behalf
  and do not discard them. Stop and say what is uncommitted.
- **Never publish from the base branch.** If `HEAD` is the base, stop and ask for
  a branch name. Do not create one silently - the user may have meant to commit
  somewhere else entirely.
- **The forge** comes from `forge:` in the gate declaration, or from the origin
  host. Read [`references/forge.md`](references/forge.md) now and pick the
  adapter: it is the four operations phases 1, 7 and 8 need, one command each.
  **Check the forge CLI is authenticated here, before phase 2** - an
  authentication failure discovered at phase 7 is one discovered after the push.
  A forge with no adapter is a stop, not an improvisation: `git push` and a link
  to a web form is not a change request this skill opened, and nothing
  downstream can verify a body nobody wrote.
- **The base branch** is, in order: `base:` in the gate declaration, else the
  forge's default branch (operation 1). Fall back to
  `git symbolic-ref refs/remotes/origin/HEAD` and then to `main` only if the
  forge cannot be asked, and say in the attestation which one you used.

Then read the gate declaration -
[`references/gate.md`](references/gate.md) has the file, the keys and the
discovery order for a repository that declares nothing. Read it now: the rest of
this skill runs the steps it returns, and a gate you could not resolve is a
`skipped` step, not an assumption.

## Phase 2 - rebase

```sh
git fetch origin
git rebase origin/<base>
```

Rebase before reviewing, not after. Reviewing a diff against a stale base means
reviewing code that will not exist after the merge, and every finding you spend
a round fixing may be a finding about somebody else's already-merged work.

Conflicts are the user's call. Stop, name the conflicted paths, and let them
choose - a conflict resolved by an agent guessing at intent is the one mistake
this whole gate cannot catch afterwards.

## Phase 3 - review

**This is the product.** Everything after it is plumbing. Measured against the
tool this replaces, the review step produced the large majority of the fixes and
the other steps produced a handful between them, so give it the time and the
rounds it needs and do not rush to phase 4.

Read [`references/review.md`](references/review.md) before the first round and
follow it. In outline:

1. Read the repository's own rules first - the declaration's `review.rules`,
   then the agent and contributor instructions the repository ships. Review
   against those, not against generic taste.
2. Review the whole branch, `git diff $(git merge-base origin/<base> HEAD)...HEAD`,
   not the last commit.
3. Every finding carries a concrete failure scenario: the input or state, and
   the wrong result it produces. **A finding with no failure scenario is not a
   finding** - drop it. That rule is what keeps the step precise enough to be
   worth the rounds.
4. Fix what you find, then review again - the fixes are new code and new code is
   unreviewed code. Iterate until a round finds nothing.
5. Cap it at five rounds. Still finding real defects at round five means the
   change is not ready: stop, report `failed`, and do not push.

Record for the attestation: rounds run, findings raised, findings fixed.

## Phase 4 - gate

Run exactly the steps the declaration returned, in the order it lists them, from
the repository root, and nothing else. Do not add a step because the toolchain
suggests one, and do not drop a step because it looks redundant - a gate the
repository declared and this skill quietly skipped is the failure this design
exists to prevent.

For each step:

- **It passes.** Record `passed` with the command.
- **It fails.** Fix the cause, not the symptom. Run the step's `fix:` command
  first if it declares one, then re-run the step. Fixes are code, so anything
  they touch goes back through phase 3 before you move on.
- **It cannot run at all** - the command is missing, a toolchain is not
  installed, it needs a credential you do not have. Record `skipped` and the
  reason in the step's own words, and remember that this blocks the verdict.
  Say it out loud to the user too; a blocked publish they do not hear about is
  a publish that silently did not happen.

Never edit the declaration to make a step pass. If a declared command is wrong,
that is a finding to report, not a file to change on the way past.

## Phase 5 - commit

Commit what phases 3 and 4 changed, separately from the work being published, so
a reviewer can read the original change without the gate's corrections mixed
into it. Conventional-commit subjects, imperative mood, and say what the fix
was for:

```sh
git add -A
git commit -m "fix: <what the review or the gate found>"
```

Nothing changed: no commit. An empty commit is a lie about what the gate did.

## Phase 6 - push

```sh
git push --force-with-lease origin HEAD
```

`--force-with-lease` and never `--force`: phase 2 rewrote this branch, and the
lease is what stops the push from erasing a commit somebody else put on it while
you were reviewing.

Then capture the head that is now on the remote. **This value is the
attestation.**

```sh
git rev-parse HEAD
```

## Phase 7 - change request

Start from
[`templates/change-request-body.md`](templates/change-request-body.md), fill it
in, and delete every instruction comment as you answer it. What ships must read
as prose a teammate wrote.

Append the attestation block from
[`templates/attestation.md`](templates/attestation.md), filled from what each
phase recorded and from the `git rev-parse HEAD` of phase 6.
[`references/attestation.md`](references/attestation.md) has the field contract.

Open it with operation 2 from your adapter, or update the one that is already
open from this branch rather than opening a second one.

The remote may squash-merge, in which case the title becomes the commit on the
base branch. Write it as that commit message: conventional-commit prefix,
imperative, no trailing period.

## Phase 8 - CI

Watch the pipeline with operation 4 from your adapter, and read a failing job
with the log command beside it. Wait for it. This is the phase with the only
failure mode that matters, so it has one rule and the rule has no exceptions:
**a red pipeline is not done, and a pipeline still running is not done either.**

- **Green.** Every required check succeeded. Record `passed` with the run URL.
- **Red.** Read the failing job's log, fix the cause, and go back to phase 3 -
  the fix is new code. Then push again, and **re-attest**: a new commit makes
  the attestation in the body name a commit that is no longer the head, and a
  stale attestation authorises nothing. Rewrite the whole block with operation 2,
  never by editing `head_sha` alone.
- **No pipeline exists at all.** Only `ci.required: false` in the declaration
  makes that `not-applicable`. Without it, a repository with no checks is
  `skipped`, and the verdict is `blocked` until someone says in the declaration
  that this repository genuinely has no CI.
- **Still running past `ci.timeout`.** `skipped`, with how long you waited. It
  blocks, and that is the honest answer - say the pipeline is still going and
  let the user decide whether to wait.

## Reporting

Compute the verdict, then say it in one line before anything else.

- Every step `passed` or `not-applicable` → verdict `passed` → report the change
  request URL and that CI is green.
- Anything else → verdict `blocked` → **say it is not done**, name every step
  that is `failed` or `skipped`, and say what would unblock each one. The change
  request may well be open; that is not the same claim as published.

Before you report `passed`, check the attestation still names the head. The
verification command for your forge is in
[`references/forge.md`](references/forge.md), beside that adapter's operations;
it answers `current`, `stale` or `no attestation`, and only `current` lets you
report done. Anything else means go back to phase 7 and rewrite the body for the
real head.
