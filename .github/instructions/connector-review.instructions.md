---
description: "Use when reviewing a new or modified connect (connector) for structure, error/schema conventions, exports, and release-please compliance before merge."
---
# Connect (Connector) Review Checklist

Before approving a PR that adds or changes a connect, verify it matches
[CONVENTIONS.md](../../CONVENTIONS.md):

- **Layout**: `deno.json` + `package.json` (matching `exports`), `mod.ts` as
  the single re-export site, `<Connect>.ts` at the connect root,
  `errors/Base.ts` + `errors/<Connect>ErrorCodes.ts` + `errors/mod.ts`,
  request/response validation in `schema/` with a `mod.ts` barrel, and
  `<Connect>-*.md` guides in `docs/`.
- **Errors**: one `<Connect>Error extends RESTlerError` class, one
  `<CONNECT>ErrorCodes` registry object (`UPPER_SNAKE_CASE` keys,
  `${template}` messages) — not one class per failure mode. Reuse vendor error
  codes where available; otherwise use stable connect-specific codes. Metadata
  is read back via the public `getContextValue()`, never `.context` directly.
- **Config**: no `this.getOption(...)` calls (it doesn't exist) — public
  values are exposed via named getters wrapping the protected
  `this._getOption(...)`.
- **Credentials**: go through the `auth: RESTlerAuth` option, never a bespoke
  top-level field. BASIC/BEARER vendors need no `_authInjector` override at
  all. Anything else uses `auth: { type: 'CUSTOM', ...fields }`, with
  `_authInjector` overridden to call `super._authInjector(endpoint)` first
  before adding the vendor-specific injection — a full override that skips
  `super()` silently drops BASIC/BEARER support for any consumer who
  configured it.
- **Response handling**: vendor error-code mapping goes through a
  connect-wide `_responseHandler` set once in the constructor (or a per-call
  handler passed as `_makeRequest`'s second argument when one endpoint
  genuinely differs) — not a private `__handle(resp, schema)` method every
  endpoint method has to remember to call. It must **return** the value the
  request resolves to on its success path (`response.body`, or an unwrapped
  envelope) — as of `@tundralibs/restler@1.1.3` this return value is
  load-bearing (`_makeRequest` overwrites `response.body` with it
  unconditionally), so a handler that only mutates `response.body` and
  returns nothing silently turns every successful response into
  `undefined`. Success-body validation goes through a shared private
  `__requestAndValidate(endpoint, guard)` helper using `_makeRequest`'s
  `responseSchema` option (`guard.parse`), which unwraps the generic
  `RESTlerResponseValidationError` it throws back into the connect's own
  `<Connect>Error('RESPONSE_ERROR', ...)` — not a per-endpoint
  `.safeParse()` + branch. `responseSchema` only ever sees `response.body`,
  so an endpoint whose result is validated from response *headers* (or has
  no body to validate) keeps a local `__parse`-style helper or calls
  `_makeRequest` directly instead — don't force it into
  `__requestAndValidate`.
- **Schemas**: every `schema/<Thing>.ts` builds with `Guardian.object({...})`
  directly (no `GuardianProxy` — removed upstream), models the vendor
  documentation precisely, uses unions or `.passthrough()` where documented,
  calls `.describe()`, exports both the schema object and its inferred type,
  has a matching `.test.ts` for valid and invalid payloads, and is re-exported
  from `schema/mod.ts`. A flat `schema/<Thing>.ts` list is fine while small;
  once it stops being scannable it should split into subfolders (by role —
  `request/`/`response/`/`common/` — or by endpoint), still barreled in full
  through `schema/mod.ts`.
- **Runtime**: implementation only uses `fetch`/`URL`/standard Web APIs —
  no `node:*` or `Deno.*` calls — so it stays portable to Cloudflare Workers
  and the browser even without dedicated CI for them yet.
- **Tests**: prefer environment-gated live coverage when a vendor sandbox is
  available; otherwise use mocked transport or fixtures. Tests are co-located,
  cover every reachable error code, and validate every schema.
- **Versioning**: no hand-edited `version` fields or `CHANGELOG.md` —
  release-please owns both; a new connect starts at `0.0.0` via
  `deno task workspace:add`.
- **Generated config**: if `deno.json`/`workspace-meta.json` changed,
  `deno task workspace:sync` was run and `workspace:sync:check` is clean.
- **Scope**: PR touches exactly one connect directory, or carries the
  `multi-connector` label.
