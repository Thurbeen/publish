// Exits non-zero unless the title given as the only argument is a conventional
// commit: `type(scope)!: description`, scope and `!` optional. Squash merge
// makes the pull request title the commit on main, so this is the commit
// message check. Standard library only, like the rest of this repository.
const TYPES = ["feat", "fix", "perf", "refactor", "docs", "style", "test", "chore", "build", "ci", "revert"];
const PATTERN = new RegExp(`^(${TYPES.join("|")})(\\([\\w./-]+\\))?!?: \\S.*$`);

const title = process.argv[2] ?? "";

if (PATTERN.test(title) && !/[\r\n]/.test(title)) {
  console.log(`PR title is a conventional commit: ${title}`);
} else {
  console.error(
    `PR title is not a conventional commit: ${JSON.stringify(title)}\n` +
      `Expected "type(scope)!: description", scope and "!" optional, where type is one of: ${TYPES.join(", ")}.`,
  );
  process.exit(1);
}
