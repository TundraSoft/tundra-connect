# Repository Settings

Manual GitHub settings checklist — these don't travel with committed files
and must be configured once (or re-verified) in the repo/org settings UI.

## Merge settings

- Merge commits, squash and rebase are all allowed. Squash a
  single-purpose PR (its title becomes the commit, so it must be a
  Conventional Commit — enforced by `pr-checks`). Use a **merge commit** for
  a PR whose commits carry different types or scopes, so release-please
  sees each one (a squash would collapse them into the title's type).
- Auto-delete head branches after merge.
- Wikis enabled (published by `workflows/wiki-sync.yml`).

## Branch protection (`main`)

A repository ruleset, `protect-main`, mirroring TundraLibs:

- Blocks deletion and force-pushes.
- Requires a pull request (0 approvals; review threads must be resolved).
- Requires these status checks (GitHub Actions):
  - `Format, lint, type-check`, `Dependency audit (high+)`,
    `JSR publish dry-run`, `Workers smoke (workerd)` (from `ci.yml`)
  - `Test (deno)`, `Test (bun)`, `Test (node-22)`, `Test (node-24)`
  - `Conventional PR title`, `Single-connector guard` (from `pr-checks.yml`)
- Blocks merging on CodeQL errors or high/critical security alerts.
- Organization admins and repository admins may bypass.

Release-please's own release PR is exempt from `Single-connector guard`
(it carries the `autorelease: pending` label); it must be opened with
`RELEASE_PLEASE_TOKEN`, since PRs opened by `GITHUB_TOKEN` do not trigger
the required checks.

Do not enable or tighten these rules in the same PR that introduces the
workflows: a missing or renamed check can block that PR from merging.

## Labels

At minimum: `bug`, `enhancement`, `documentation`, `dependencies`, `infra`,
`multi-connector`, `ci-health`, `live-test-failure`, plus one
`connector: <connect>` label per connect (generated — see
[labeler.yml](labeler.yml)).

Create the matching `connector: <connect>` label in GitHub whenever
`workspace:sync` adds a new connect to [labeler.yml](labeler.yml).

## Secrets

- `RELEASE_PLEASE_TOKEN` — PAT used by `workflows/release-please.yml` to open
  release PRs that trigger other workflows (falls back to `github.token` if
  unset).
- JSR publishing uses tokenless OIDC (`id-token: write`) — no publish token
  needed once the JSR package is linked to this repo.
- `SONAR_TOKEN` / `CODECOV_TOKEN` if SonarQube/Codecov reporting is enabled.
- `CONNECTOR_<NAME>_<FIELD>` — real (or sandbox) vendor credentials for
  `workflows/live-tests.yml`'s monthly live-vendor test run, same names as
  `.env.sample` (e.g. `CONNECTOR_COINGECKO_API_KEY`). Optional and
  independent per connector — set only the ones you have credentials for;
  a connector with none configured simply skips its live tests, same as
  locally. See `.env.sample` for the full current list and
  `CONVENTIONS.md`'s "Tests" section for how they're consumed.

## Security settings

- Secret scanning + push protection: enabled.
- Private vulnerability reporting: enabled (see
  [SECURITY.md](../SECURITY.md)).
- Dependabot alerts + security updates: enabled (see
  [dependabot.yml](dependabot.yml)).

## JSR

Each connect (`@tundraconnect/<name>`) must be linked to this repository on
[jsr.io](https://jsr.io) before its first publish so the OIDC-based publish
step in `workflows/release-please.yml` is authorized.