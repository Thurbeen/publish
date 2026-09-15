# The forge

Loaded by phase 1. The gate is the same everywhere; only three phases
touch a forge, and they touch it through four operations. This file is the
adapter table.

## The four operations

Everything phases 1, 8 and 9 need, and nothing else:

| # | operation | why the skill needs it |
| --- | --- | --- |
| 1 | **default branch** | what to rebase onto and target, when the declaration does not say |
| 2 | **open or update a change request**, body from a file | phase 8; the body is where the attestation lives |
| 3 | **the head commit** the change request would merge | the value the attestation must name to be current |
| 4 | **watch the pipeline** to a terminal state | phase 9; a pipeline still running is not a green one |

A change request is a pull request on GitHub and a merge request on GitLab. The
skill says "change request" where the difference does not matter and uses the
forge's own word when talking to a user.

## Choosing the adapter

`forge:` in the gate declaration wins. Otherwise read the remote:

```sh
git remote get-url origin
```

Match the host, and confirm the CLI is authenticated before phase 2 rather than
discovering it at phase 8, after the branch is already pushed. An
unauthenticated CLI is a `skipped` publish, not a retry loop.

## GitHub, through `gh`

```sh
gh auth status                                                  # 0
gh repo view --json defaultBranchRef -q .defaultBranchRef.name  # 1
gh pr create --base <base> --title "<title>" --body-file <path> # 2
gh pr edit <number> --body-file <path>                          # 2, existing
gh pr view <number> --json headRefOid -q .headRefOid            # 3
gh pr checks <number> --watch --fail-fast                       # 4
gh run view <run-id> --log-failed                               # 4, reading a red job
```

Verifying an attestation against the head:

```sh
gh pr view <number> --json headRefOid,body -q \
  '.headRefOid as $head
   | (.body | [capture("\"head_sha\"\\s*:\\s*\"(?<s>[0-9a-f]{7,40})\"").s] | first) as $attested
   | if $attested == null then "no attestation"
     elif $attested == $head then "current"
     else "stale" end'
```

## GitLab, through `glab`

Same four operations, GitLab's own field names: the head is `sha`, the body is
`description`. `-R` takes the project's full URL so that a self-hosted instance
is asked and not gitlab.com.

```sh
glab auth status                                                       # 0
glab repo view -F json --jq .default_branch                            # 1
glab mr create --target-branch <base> --title "<title>" \
  --description "$(cat <path>)"                                        # 2
glab mr update <number> --description "$(cat <path>)"                  # 2, existing
glab mr view <number> -F json --jq .sha                                # 3
glab ci status --branch <branch> --live                                # 4
glab ci trace <job-id>                                                 # 4, reading a red job
```

Verifying an attestation against the head:

```sh
glab mr view <number> -R https://<host>/<group>/<project> -F json --jq \
  '.sha as $head
   | (.description | [capture("\"head_sha\"\\s*:\\s*\"(?<s>[0-9a-f]{7,40})\"").s] | first) as $attested
   | if $attested == null then "no attestation"
     elif $attested == $head then "current"
     else "stale" end'
```

Two differences that change behaviour rather than spelling:

- **Squash.** A GitLab project can forbid squashing (`squash_option: never`).
  The skill does not merge, so this is not its problem to solve, but say it in
  the change request if the repository's own convention assumes a squash.
- **`--description` takes a string, not a file.** Read the file in the command,
  as above. Do not shorten the body to fit an argument you found awkward - the
  attestation is part of it.

## Any other forge

Stop, and say which forge and which operation is missing. Do not improvise: a
`git push` and a link to a web form is not a change request the skill opened,
and nothing downstream can verify a body nobody wrote.

Adding a forge means giving all four operations, with a way to read the head as
a full commit sha and a way to wait for a pipeline rather than sample it. A
forge that cannot do operation 3 cannot carry an attestation at all, and a forge
that cannot do operation 4 makes phase 9 permanently `skipped` - which blocks.
Half of an adapter is worse than none, because the missing half is discovered
after the push.
