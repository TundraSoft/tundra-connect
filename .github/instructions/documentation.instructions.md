---
description: "Use when writing or reviewing README.md, JSDoc, or docs/ content for a connect. Covers Tundra Connect-style document names, example specifiers, and wiki-sync requirements."
applyTo: "**/*.md,**/*.ts"
---
# Documentation Guidelines

- A connect's `README.md` is its main documentation and wiki page: include the
  runtime badges, overview, documentation table, installation, and one minimal
  `@tundraconnect/<connect>` example. Long-form topic guides belong in `docs/`
  and are published to the wiki by `wiki-sync.yml`.
- A vendor connect README includes an **Upstream** section with its official
  API-reference link and signup link. Use the vendor signup URL with this
  repository's referral code when one is available; never invent a referral
  parameter.
- Topic guides are named `{Connect}-{Topic}.md` (for example,
  `OpenExchange-Schemas.md`). The name starts with the display name in
  `.github/workspace-meta.json`; never create `{Connect}.md`, because the wiki
  generates that page from the root README.
- Every fenced ` ```ts ` / ` ```typescript ` block in a README is
  type-checked verbatim by `.github/scripts/consumer-doc-check.ts` as a
  standalone consumer file — it must import from the public specifier
  (`@tundraconnect/<connect>[/schemas|/errors]`), never a relative path, and
  must be self-contained (no implicit dependency on a previous block).
  Tag non-runnable snippets with ` ```ts ignore `.
- Documentation links use relative Markdown paths and include the `.md`
  extension. `wiki-sync.ts` rewrites known pages to their flat wiki names and
  fails on any dead link.
- JSDoc on every exported symbol: one-line summary, `{@link}` for
  non-builtin referenced types, `@throws` on every method that can throw
  (name the `<Connect>Error` code), and one `@example` where practical.
  Unlike Markdown examples, JSDoc examples omit public imports because the
  documented module is already in scope.
- Don't restate what the code already shows; document intent, constraints,
  and error conditions instead.
- Schema descriptions are documentation: require `.describe()` text on the
  schema and meaningful fields, and ensure it matches the vendor reference.
- Document the vendor error codes a method can throw. When the vendor has no
  code, document the generated `<CONNECT>ErrorCodes` value instead.
