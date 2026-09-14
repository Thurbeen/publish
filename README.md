# publish

An agent skill that takes committed work through a gate — review, tests, lint,
docs — and only then pushes it, opens the pull request, and waits for CI to go
green.

It writes an attestation into the pull request body naming the commit it ran on
and what each step found, so a reader — or a machine — can tell whether the
proof belongs to the code that would actually merge.

Status: initial scaffold.
