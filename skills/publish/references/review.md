# The review

Loaded by phase 3, before the first round. This step produces most of what the
gate is worth; the rest of the skill is plumbing around it. Read this in full
and work the passes.

## What you are reviewing

The whole branch, against the base it will merge into:

```sh
BASE=$(git merge-base origin/<base> HEAD)
git diff --stat "$BASE"...HEAD
git diff "$BASE"...HEAD
```

Not `HEAD~1`, not the last commit: a defect introduced in commit two and papered
over in commit four is still a defect on `main` if the branch is squashed, and
reviewing commit-by-commit is how it gets missed.

Read whole files, not only hunks, wherever a hunk changes behaviour. Most real
defects live in the interaction between the changed lines and the unchanged ones
around them, and a hunk hides exactly that.

## Read the rules first

Review against this repository's standards, not against generic taste. Before
round one, read:

1. `review.rules` from the gate declaration - the repository naming, explicitly,
   what it wants reviewed against.
2. The repository's agent and contributor instructions: `AGENTS.md`,
   `CLAUDE.md`, `CONTRIBUTING.md`, and any style or architecture document those
   point to.
3. The code next to the change. Naming, error handling, test style, logging,
   comment density - the neighbours are the standard where nothing is written
   down.

A violation of a rule the repository actually wrote down is a finding. A
preference of yours that the repository does not share is not, and shipping it
as one is how a review step trains people to stop reading it.

## The two rules

**Recall: work every pass.** Do not stop at the first defect in a file. Walking
all of the passes below on a diff you think is clean is where the unobvious ones
come from.

**Precision: every finding carries a failure scenario.** Concrete input or
state, and the wrong result it produces - a crash, a wrong value, a leak, a
silently dropped write.

> `parse_window("")` returns `None`, and the caller at `sched.rs:88` unwraps it,
> so an empty `WINDOW` env var panics the scheduler at start-up instead of
> falling back to the default the docs promise.

If you cannot write that sentence, you do not have a finding yet. You have a
feeling. Drop it, or go and find the scenario that makes it real. This is the
rule that keeps the step worth reading.

Both rules at once: raise everything you can substantiate, and nothing you
cannot.

## The passes

Work them in order. Each is a different way of looking at the same diff, which
is why the order matters less than doing all of them.

**1. Correctness.** Off-by-one and boundary conditions. Empty, one, many. Null,
zero, negative, absent. Integer and float behaviour at the edges. Time zones and
DST. Encoding. Does the code do what its own name and docstring say?

**2. The contract.** Every changed signature, exported symbol, route, schema,
config key, CLI flag, database column. Who calls it? Search - do not assume.
A changed default is a behaviour change for every caller that did not pass the
argument. A removed field breaks a consumer that is not in this repository.

**3. Error handling.** Every new failure path. Is it handled, propagated with
context, or swallowed? A bare catch that logs and continues leaves the caller
believing something succeeded. Partial failure in the middle of a multi-step
write - what is the state afterwards, and can it be retried?

**4. Concurrency and resources.** Shared mutable state, async ordering, a check
followed by an act on something another task can change in between. Files,
sockets, locks, transactions, subprocesses: is each closed on the error path as
well as the happy one?

**5. Security.** Credentials, tokens, keys, connection strings - in code, in
fixtures, in test data, in logs, in the diff's own history. Input that reaches a
shell, a query, a path, a template, a deserializer. Authorization checks on new
entry points. Permissions widened. A dependency added: what is it, who
maintains it, what version, and why not the latest stable.

**6. Tests.** Does the change have tests, and do they fail without it? Assert on
behaviour, not on a mock's call count. A test with no assertion, a test that
catches its own exception and passes, a test asserting a value it just computed
the same way the code does - each is worse than no test, because it reports
safety it does not have. Bug fix with no regression test: that is a finding.

**7. Documentation.** Anything the change made untrue. READMEs, help text,
comments describing behaviour that no longer exists, an example that no longer
runs, a changelog the repository keeps. A comment that lies is a defect, and a
stale comment beside a changed line is the most common one in any diff.

**8. Simplification.** Duplication of something the repository already has -
search before accepting a new helper. Dead code, unreachable branches, a
parameter no caller passes, an abstraction with one implementation. Say what to
delete and what to call instead; a cleanup finding with no replacement named is
noise.

**9. Scope.** Does the diff contain anything the task did not ask for? Unrelated
reformatting, a drive-by rename, a dependency bump that came along for the ride.
These are findings: they cost the reviewer the ability to read either half.

**10. Leakage.** Machine names, usernames, home directory paths, internal
hostnames, IP addresses, private URLs, ticket systems, customer names, absolute
paths from the machine this ran on. In code, in comments, in fixtures, in test
names. Published repositories keep whatever ships to them.

## Rounds

1. Work the passes. Write down every finding with its failure scenario.
2. Fix them. Smallest change that removes the cause, not the symptom.
3. **Review the fixes.** They are new code, and new code is unreviewed code. Go
   back to the top with the new diff.
4. Stop when a full round produces nothing.

Cap at five rounds. Still finding real defects at round five means the change is
not ready to publish: stop, record `failed` with what is still open, and say so.
Do not push it.

Count honestly for the attestation: rounds run, findings raised, findings fixed.
A finding you dropped as unsubstantiated was never a finding and is not
counted; a finding you decided not to fix is counted, and the reason belongs in
the pull request body where a reviewer will see it.

## What this step does not do

It does not approve the change. It does not decide whether the work was worth
doing, or gate on the design being the one you would have chosen. It finds
defects in the change as written, against the rules the repository set for
itself, and it fixes them.
