<!-- The attestation block. It goes last in the change request body,
     after every prose section. Copy from the fence below, fill every field, and delete this
     comment.

     head_sha comes from `git rev-parse HEAD` after the push in phase 6, never
     from anywhere else and never typed by hand. Push again and this whole block
     is rewritten for the new head.

     Field contract, statuses and the verdict rule: references/attestation.md.
     The marker string is publish-attestation/v1 and it is load-bearing - a
     consumer greps the raw body for it. Do not reword it. -->

<!-- publish-attestation/v1 -->
```json
{
  "schema": "publish-attestation/v1",
  "head_sha": "0000000000000000000000000000000000000000",
  "base": "main",
  "base_sha": "0000000000000000000000000000000000000000",
  "repository": "owner/repo",
  "attested_at": "1970-01-01T00:00:00Z",
  "gate_source": ".publish.yaml",
  "steps": [
    {
      "name": "review",
      "status": "passed",
      "rounds": 0,
      "findings": 0,
      "fixed": 0
    },
    {
      "name": "lint",
      "status": "passed",
      "command": "<the command the declaration named>"
    },
    {
      "name": "test",
      "status": "passed",
      "command": "<the command the declaration named>"
    },
    {
      "name": "ci",
      "status": "passed",
      "conclusion": "success",
      "run_url": "<the pipeline run this verdict is about>"
    }
  ],
  "verdict": "passed"
}
```
<!-- /publish-attestation -->

<!-- A worked block that is blocked rather than passed - two of the four ways
     this ends, and neither of them is reported to the user as done:

     { "name": "docs", "status": "skipped",
       "reason": "./scripts/check-docs.sh: command not found" }

     { "name": "ci", "status": "failed", "conclusion": "failure",
       "reason": "integration job: 3 tests failed on the sqlite backend",
       "run_url": "<the pipeline run this verdict is about>" }

     Either one makes the verdict blocked, because the verdict is passed only
     when every step is passed or not-applicable. -->
