# How a repository declares its gate

Loaded by phase 1. The skill does not know a repository's commands; it reads
them from the repository.

## The file

`.publish.yaml` or `.publish.yml`, at the repository root. When both exist,
`.publish.yaml` remains authoritative:

```yaml
# .publish.yaml
version: 1

forge: github
base: main

review:
  rules:
    - AGENTS.md
    - docs/conventions.md

gate:
  - name: lint
    run: just lint
    fix: just fmt
  - name: test
    run:
      - cargo nextest run --all
      - cargo test --doc
    instructions: "The sqlite tests share one port, so a bind failure means an earlier run is still up. Stop it and re-run; do not mark the test flaky."
  - name: docs
    run: ./scripts/check-docs.sh

ci:
  required: true
  timeout: 30m

feedback:
  wait: 15m
```

| key | required | meaning |
| --- | --- | --- |
| `version` | yes | `1`. Anything else: the repository is undeclared. |
| `forge` | no | `github` or `gitlab`, an adapter in `forge.md`. Default: matched from the origin host. |
| `base` | no | The branch to rebase onto and target. Default: the remote's default branch. |
| `review.rules` | no | Extra files the review must read, relative to the repository root. |
| `gate` | yes | Ordered steps, run in the order written. |
| `gate[].name` | yes | The step's name in the report, such as `test`, `lint`, `docs` or `check`. |
| `gate[].run` | yes | One shell command, or a list run in order, from the repository root. |
| `gate[].fix` | no | A command applying this step's mechanical fixes, run once on failure before re-running `run`. |
| `gate[].instructions` | no | Text: the repository's notes on this step, handed as written to whoever runs it, reads its failure or fixes it. |
| `ci.required` | no | Default `true`. `false` declares that the repository has no CI. |
| `ci.timeout` | no | Default `30m`. How long to wait before CI is `skipped`. |
| `feedback.wait` | no | Default `15m`. How long to keep reading feedback after CI is green; see [`feedback.md`](feedback.md). |

`gate: []` - an empty list - is a repository stating it has no mechanical gate:
`not-applicable`. Leaving `gate` out entirely is not the same thing.

Other repositories declare other gates; run what is declared rather than what
the toolchain suggests:

```yaml
version: 1
gate:
  - name: check
    run: ./scripts/check.sh
    fix: ./scripts/check.sh --fix
```

```yaml
version: 1
gate:
  - name: lint
    run: prek run --all-files
  - name: test
    run: cargo test --all-features
```

```yaml
version: 1
gate:
  - name: test
    run: npm test
```

## Reading the file

Read the selected file as text. Do not add a YAML parser to the repository
being published, and do not install one. Check as you read:

- `version` is `1`; otherwise fall back as undeclared, and say so.
- Every `gate[]` entry has a `name` and a `run`. An entry missing either is a
  broken declaration: report a `skipped` step naming the entry, and do
  not guess what was meant.
- `instructions`, when it is there, is text. A number, list, map or empty
  value is a broken declaration too, reported the same way.

`review`, `ci` and `feedback` take no `instructions`.

## When there is no declaration

When there is neither `.publish.yaml` nor `.publish.yml`, derive the gate from
the repository instead of refusing publication over missing config. Inspect all
of these sources before deciding:

1. **Agent or contributor instructions** - `AGENTS.md`, `CLAUDE.md`,
   `CONTRIBUTING.md` - commands required before pushing or opening a change
   request.
2. **CI workflows** - `.github/workflows`, `.gitlab-ci.yml` and equivalent
   repository-native pipeline config. Follow the pull-request or merge-request
   jobs and record their local verification commands; setup, upload, deploy and
   credentialed steps are not local gate commands.
3. **Task runners and check scripts** - a `justfile`, `Makefile`,
   `scripts/check.sh` or equivalent target named `check`, `ci`, `verify`,
   `lint`, `test`, `typecheck` or `build`.
4. **Manifest scripts and tool config** - for example `package.json` scripts,
   `Cargo.toml`, `pyproject.toml`, language test config and formatter or linter
   config.

Instructions and CI say what is required; task runners, manifests and tool
config resolve the commands they invoke. Keep every required check, preserve
its declared order, and collapse exact duplicates. Do not invent a command from
a dependency or a filename. If sources disagree, take the union of their
required checks and report the disagreement instead of silently choosing one.

Name the gate source in the final report - `.publish.yaml`, `.publish.yml`,
`discovered:AGENTS.md+.github/workflows/ci.yml`, or `discovered:package.json` -
with the commands actually run. Run the discovered commands in phase 4; their
exit status validates the inferred gate exactly as it validates a declared
one. A command that cannot run is still `skipped` and blocks.

If the complete search finds no native mechanical check, record the gate as
`not-applicable` with source `discovered:none` and the sources inspected.
Missing publish config by itself does not block publication. Do not create a
declaration while publishing: the inferred gate must describe existing
repository policy, not policy invented by the publisher.
