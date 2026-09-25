#!/usr/bin/env -S deno run --allow-read --allow-net --allow-run --allow-write
/**
 * Consumer doc-drift check ("health" workflow).
 *
 * For every connect, extracts fenced ```ts/```typescript code blocks from
 * its README.md (skipping blocks tagged ` ```ts ignore `) and type-checks
 * them as if a consumer had installed the package from JSR — using the
 * public import specifier (`@tundraconnect/<name>`) rather than a relative
 * path, so a doc example that only works because of a local relative import
 * is caught.
 *
 * Usage: deno run --allow-read --allow-net --allow-run --allow-write \
 *          .github/scripts/consumer-doc-check.ts
 */

import { fromFileUrl } from 'jsr:@std/path@^1.1.6';

const ROOT = fromFileUrl(new URL('../../', import.meta.url));
const CONNECTORS_DIR = 'connectors';

type WorkspaceMeta = Record<string, string>;

async function readMeta(): Promise<WorkspaceMeta> {
  return JSON.parse(
    await Deno.readTextFile(`${ROOT}.github/workspace-meta.json`),
  );
}

function extractExamples(markdown: string): string[] {
  const examples: string[] = [];
  const fence = /```(ts|typescript)\b([^\n]*)\n([\s\S]*?)```/g;
  for (const match of markdown.matchAll(fence)) {
    const [, , attrs, code] = match;
    if (attrs.includes('ignore')) continue;
    examples.push(code);
  }
  return examples;
}

async function checkConnect(name: string): Promise<boolean> {
  const readme = await Deno.readTextFile(
    `${ROOT}${CONNECTORS_DIR}/${name}/README.md`,
  ).catch(() => '');
  const examples = extractExamples(readme);
  if (examples.length === 0) return true;

  const jsrName =
    await Deno.readTextFile(`${ROOT}${CONNECTORS_DIR}/${name}/deno.json`)
      .then((text) => (JSON.parse(text) as { name?: string }).name)
      .catch(() => undefined) ?? `@tundraconnect/${name}`;

  let ok = true;
  for (const [index, code] of examples.entries()) {
    // An isolated dir with only an import map (no ambient workspace deno.json
    // in scope) forces the bare specifier to resolve over the network from
    // JSR, exactly as it would for a consumer who ran `deno add jsr:<name>`.
    const tmpDir = await Deno.makeTempDir();
    await Deno.writeTextFile(
      `${tmpDir}/deno.json`,
      JSON.stringify({ imports: { [jsrName]: `jsr:${jsrName}` } }),
    );
    const tmp = `${tmpDir}/example.ts`;
    await Deno.writeTextFile(tmp, code);
    const cmd = new Deno.Command('deno', {
      args: ['check', '--no-lock', tmp],
      cwd: tmpDir,
      stdout: 'piped',
      stderr: 'piped',
    });
    const { success, stderr } = await cmd.output();
    if (!success) {
      ok = false;
      console.error(`✗ ${name} README example #${index + 1} failed:`);
      console.error(new TextDecoder().decode(stderr));
    }
    await Deno.remove(tmpDir, { recursive: true });
  }
  return ok;
}

async function main() {
  const meta = await readMeta();
  let allOk = true;
  for (const name of Object.keys(meta).sort()) {
    const ok = await checkConnect(name);
    allOk &&= ok;
  }
  if (!allOk) Deno.exit(1);
  console.log('All README examples type-check cleanly.');
}

if (import.meta.main) {
  await main();
}
