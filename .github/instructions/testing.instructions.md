---
description: "Use when writing or reviewing .test.ts files for a connect. Covers live or mocked testing, cross-runtime imports, and schema coverage."
applyTo: "**/*.test.ts"
---
# Testing Guidelines

- Prefer live tests when the vendor provides a stable sandbox/test endpoint and
  credentials are available through the environment. Never commit credentials;
  skip live tests when their required environment is absent. When live testing
  is not possible, mock `@restler`'s transport (inject a fake
  `fetch`/response) or use fixed fixture payloads captured from real responses.
- One `.test.ts` per source file, co-located (`OpenExchange.ts` ↔
  `OpenExchange.test.ts`).
- Import `describe`/`it` (+ hooks) from `@test` (resolves to
  `@tundralibs/compat/test`, dispatching to `@std/testing/bdd`/`bun:test`/
  `node:test`) and assertions from `@asserts` — `@test` does **not**
  re-export assertions. Skip a case per runtime/OS with the options form
  (`it({ name: '...', node: false, fn: () => {...} })`), never by branching
  on a runtime global.
- Cover: the happy path, every `<Connect>ErrorCodes` entry that the code can
  actually throw, and accepted plus rejected payloads for every schema created
  with `@guardian`.
- Don't test `@restler`/`@guardian` internals — only this connect's usage
  of them.
- Run `deno task test` locally before opening a PR; CI additionally runs the
  same suite under Bun and Node.
