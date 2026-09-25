<!--
PR title MUST be a Conventional Commit — it becomes the squash commit
on main and drives changelogs and version bumps via release-please:

  type(scope): description
  types: feat fix docs refactor perf test build ci chore revert
  scope: the connect directory (openexchange, ...) or global (release, workflows, deps)
  breaking: feat!(scope): ... or a BREAKING CHANGE: footer
-->

## What

<!-- What does this PR change, and why? -->

## Checklist

- [ ] Touches **one connect only** (or carries the `multi-connector` label
      for a genuinely atomic cross-connect change)
- [ ] `deno task check && deno task test` pass locally
- [ ] Live tests use only environment-provided credentials and are skipped when
      unavailable; otherwise transport is mocked or fixtures are used
- [ ] Every new or changed Guardian schema validates accepted and rejected
      payloads
- [ ] Docs updated where behavior changed (connect README /
      [CONVENTIONS.md](../CONVENTIONS.md))
- [ ] No hand-edited versions or changelogs (release-please owns those)
