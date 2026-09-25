# Repository Settings

Manual GitHub settings checklist — these don't travel with committed files
and must be configured once (or re-verified) in the repo/org settings UI.

## Merge settings

- **Squash merge only** — the PR title becomes the squash commit message and
  must be a Conventional Commit (enforced by the `pr-checks` workflow).
- Auto-delete head branches after merge.
- Wikis enabled (published by `workflows/wiki-sync.yml`).

## Branch protection (`main`)

Require these status checks before merging:

- `Format, lint, type-check` (from `workflows/ci.yml` / `quality` job)
- `JSR publish dry-run`
- `Test (deno)`, `Test (bun)`, `Test (node-22)`, `Test (node-24)`
- `Conventional PR title`
- `Single-connector guard`

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