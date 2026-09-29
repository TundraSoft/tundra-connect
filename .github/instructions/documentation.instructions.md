---
description: "Use when writing or reviewing README.md, JSDoc, or docs/ content for a connect. Covers Tundra Connect-style document names, example specifiers, and wiki-sync requirements."
applyTo: "**/*.md,**/*.ts"
---
# Documentation Guidelines

- A connect's `README.md` is its main documentation and wiki page: a
  keyword-rich first paragraph, the JSR version and score badges, overview,
  documentation table, installation, and one minimal
  `@tundraconnect/<connect>` example. Long-form topic guides belong in `docs/`
  and are published to the wiki by `wiki-sync.yml`. No static runtime
  badges: they cannot go red, so they live once in the root README.
- Discoverability: JSR search indexes the README and `deno.json`
  `description`, and has no keywords field. The first paragraph names the
  vendor's product, the concrete operations, the runtimes (Deno, Bun,
  Node.js, Cloudflare Workers), and the official SDK it stands in for where
  that is honest. Keep it true to what the connect covers; no stuffing.
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
- Links follow two contracts, enforced by `deno task docs:links` (and
  applied by `docs:links:fix`) in CI:
  - A connect `README.md` links absolutely. JSR rewrites relative links to
    `github.com/<repo>/blob/HEAD/<target>` from the repo root, dropping
    `connectors/<connect>/`, so they 404 there. Use the wiki URL for a
    wiki-synced page (`https://github.com/TundraSoft/tundra-connect/wiki/Stripe-API#webhooks`)
    and a `blob`/`tree` URL for anything else.
  - Every other markdown (`docs/` guides, root docs) links relatively, with
    the `.md` extension. `wiki-sync.ts` rewrites wiki pages to their flat
    names and other repo paths to GitHub URLs, and fails on a dead link.
  - Never link to a wiki page that is not synced: a page exists only when the
    file name starts with the connect's display name.
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
