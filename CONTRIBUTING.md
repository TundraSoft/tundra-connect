# 🤝 Contributing to Tundra Connect

Thanks for your interest in contributing! Tundra Connect is a collection of
vendor API integrations (OpenExchangeRates, Twilio, ...) built on
[`@tundralibs/restler`](https://jsr.io/@tundralibs/restler) and
[`@tundralibs/guardian`](https://jsr.io/@tundralibs/guardian).

## Getting started

- [Deno](https://deno.land/) v2.x (primary toolchain — fmt/lint/check/test)
- [Bun](https://bun.sh/) and [Node.js](https://nodejs.org/) ≥ 22 (test matrix)
- Git

```bash
git clone https://github.com/TundraSoft/tundra-connect.git
cd tundra-connect
deno task check
deno task test
```

## Repository structure

Every connect (`connectors/openexchange/`, ...) lives under `connectors/`,
mirroring TundraLibs. See [CONVENTIONS.md](CONVENTIONS.md) for the full
layout, error, schema, and naming conventions every connect must follow.

## Adding a new connect

```bash
deno task workspace:add <connect-name>
```

`<connect-name>` is always lowercased for the directory/package name. For the
display/class name: type it with the exact casing you want (`add PayPal`,
`add GCS`) to preserve it verbatim, or type it in the traditional
all-lowercase, hyphen-separated style (`add azure-blob`) to have each segment
auto-capitalized (`AzureBlob`). Got the casing wrong either way? Hand-edit
that entry, then run `deno task workspace:sync`.

This scaffolds a full starting skeleton under `connectors/<connect-name>/`,
matching CONVENTIONS.md's "Connect (connector) layout" — `deno.json` +
`package.json` (with the `.`/`./schemas`/`./errors` `exports` map already
wired up), `mod.ts`, `README.md`, `CHANGELOG.md`, `<Connect>.ts` +
`<Connect>.test.ts` (a working `RESTler` subclass skeleton with an
`auth: RESTlerAuth` option, `_responseHandler`/`__toError`/
`__requestAndValidate` already wired per CONVENTIONS.md's "HTTP client"
section, and one passing constructor test), `errors/` (a working
`<Connect>Error` class, a four-code starter registry, and their test), an
empty `schema/mod.ts` barrel, and three `docs/<Connect>-*.md` stub pages.
It also regenerates the derived config (labeler, codecov, issue templates,
release-please manifest, README's connect list, ROADMAP's shipped list) — `deno.json`'s `workspace` and
`package.json`'s `workspaces`/test scripts are a static `connectors/*` glob,
so they need no update. Everything vendor-specific (base URL, auth scheme,
error codes, schemas, endpoint methods) is left as a clearly marked `TODO`
for you to fill in — it is not fabricated. Never hand-edit the generated
files — re-run `deno task workspace:sync` after manually touching a
connect's `deno.json` (e.g. bumping `exports`).

## Development workflow

1. Branch: `<connect-name>/<brief-description>` (e.g.
   `openexchange/fix-retry-backoff`).
2. One connect per PR — a PR touching more than one connect directory needs
   the `multi-connector` label for a genuinely atomic cross-connect change.
3. Prefer environment-gated live tests against a vendor sandbox; when that is
   unavailable, mock `@restler`'s transport or use fixtures. Validate every
   Guardian schema with accepted and rejected payloads.
4. Before opening a PR:
   ```bash
   deno task check        # fmt --check, lint, type-check
   deno task test
   npm run test:workers   # after `bun install`: each connect inside workerd
   ```
   A new connect needs an entry in `.github/scripts/workers-smoke.mjs`.
5. PR title **must** be a Conventional Commit — it becomes the squash commit
   on `main` and drives release-please's changelog/version bump:
   ```
   type(scope): description
   types: feat fix docs refactor perf test build ci chore revert
   scope: the connect directory (openexchange, twilio, ...) or a global
          scope (release, workflows, deps)
   ```
   Breaking changes: `feat!(scope): ...` or a `BREAKING CHANGE:` footer.

## Releases

Versions, tags, and changelogs are fully owned by **release-please** — do
not hand-edit a `version` field or `CHANGELOG.md`. Merging a release PR tags
and publishes the affected connect(s) to JSR automatically.

## Reporting issues

- 🐛 [Bug reports / feature requests](https://github.com/TundraSoft/tundra-connect/issues/new/choose)
- 🔒 [Security vulnerabilities](https://github.com/TundraSoft/tundra-connect/security/advisories/new) — please do **not** open a public issue
- 💬 [Discussions](https://github.com/TundraSoft/tundra-connect/discussions)

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
