/**
 * Plain-V8 test target: runs connect test suites in a minimal web-standard
 * runtime with NO `Deno`, `process` or `Bun` globals.
 *
 * Each `*.test.ts` file is bundled with esbuild (browser platform; `@test`
 * swapped for the tiny runner in `plain-v8/bdd.ts`) and executed inside a
 * Deno Web Worker — `deno_core` plus the web extensions (fetch, crypto,
 * URL, WebSocket, timers, encoding), the same shape as an embedder's
 * minimal runtime such as the Outsmart bot's `deno_core`. Deno 2 workers
 * still expose `Deno` and `process`, so the bundle's first statement
 * deletes them (and `Bun`, `Buffer`, `global`, `setImmediate`, `require`)
 * before any module code runs; the runner then checks they are really
 * gone before trusting a result. Code that reaches for a runtime global —
 * including runtime detection in `@tundralibs/compat` — sees exactly what
 * it would see in the bare embed.
 *
 * `node:`/`bun:` imports are refused: a static one fails the bundle, a
 * dynamic one is replaced by a module that throws when loaded — so a code
 * path that only works through a runtime built-in fails here instead of
 * being quietly served by Deno's Node compatibility.
 *
 * Suites that need a server (`@wss`, the WebSocket mock server) can't run
 * in a bare isolate and are skipped, as are live (`— live`) blocks, which
 * already skip without credentials.
 *
 * Usage: deno run -A .github/scripts/plain-v8.ts [connect ...]  (default: every connect)
 */
import { build, type Plugin } from 'npm:esbuild@^0.28.2';
import { fromFileUrl, join, relative } from 'jsr:@std/path@^1.1.0';

const ROOT = fromFileUrl(new URL('../../', import.meta.url));
const SHIM = fromFileUrl(new URL('./plain-v8/bdd.ts', import.meta.url));
const NEEDS_SERVER = 'plain-v8: needs a WebSocket server';
const requested = Deno.args.filter((a) => !a.startsWith('-'));
const connects = requested.length > 0 ? requested : [];
if (connects.length === 0) {
  for await (const entry of Deno.readDir(join(ROOT, 'connectors'))) {
    if (entry.isDirectory) connects.push(entry.name);
  }
  connects.sort();
}

const guard: Plugin = {
  name: 'plain-v8-guard',
  setup(b) {
    b.onResolve({ filter: /^@test$/ }, () => ({ path: SHIM }));
    // The socket suites' loopback server can't exist inside an isolate.
    b.onResolve({ filter: /^@wss$/ }, () => ({
      errors: [{ text: NEEDS_SERVER }],
    }));
    b.onResolve({ filter: /^(node|bun):/ }, (args) => {
      if (args.kind !== 'dynamic-import') {
        return {
          errors: [{
            text:
              `static import of '${args.path}' (from ${args.importer}) — not available in a plain V8 runtime`,
          }],
        };
      }
      return { path: args.path, namespace: 'unavailable' };
    });
    b.onLoad({ filter: /.*/, namespace: 'unavailable' }, (args) => ({
      contents: `throw new Error(${
        JSON.stringify(`'${args.path}' is not available in a plain V8 runtime`)
      });`,
      loader: 'js',
    }));
  },
};

async function testFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) {
      if (entry.name === 'node_modules' || entry.name === 'fixtures') continue;
      out.push(...await testFiles(path));
    } else if (entry.name.endsWith('.test.ts')) {
      out.push(path);
    }
  }
  return out.sort();
}

type Report = {
  passed: number;
  failed: { name: string; error: string }[];
  ignored: number;
};

/** Runs before any bundled module: strip every runtime-specific global. */
const BANNER = [
  'Deno',
  'process',
  'Bun',
  'Buffer',
  'global',
  'setImmediate',
  'clearImmediate',
  'require',
  'module',
  '__dirname',
  '__filename',
].map((g) => `delete globalThis[${JSON.stringify(g)}];`).join(' ');

async function runInWorker(bundlePath: string): Promise<
  { globals: Record<string, string>; report: Report }
> {
  const worker = new Worker(new URL(`file://${bundlePath}`), {
    type: 'module',
  });
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data);
      worker.onerror = (e) => {
        e.preventDefault();
        reject(new Error(e.message));
      };
    });
  } finally {
    worker.terminate();
  }
}

const tmp = await Deno.makeTempDir({ prefix: 'plain-v8-' });
let failures = 0;
let total = 0;
let skipped = 0;
for (const connect of connects) {
  const files = await testFiles(join(ROOT, 'connectors', connect));
  for (const file of files) {
    const entry = join(tmp, 'entry.ts');
    await Deno.writeTextFile(
      entry,
      `import { run } from ${JSON.stringify(SHIM)};
import ${JSON.stringify(file)};
const globals = {
  Deno: typeof Deno,
  process: typeof process,
  Bun: typeof Bun,
  Buffer: typeof Buffer,
};
self.postMessage({ globals, report: await run() });
`,
    );
    const name = relative(ROOT, file);
    const bundlePath = join(tmp, 'bundle.mjs');
    try {
      const result = await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        tsconfig: join(ROOT, 'tsconfig.json'),
        absWorkingDir: ROOT,
        logLevel: 'silent',
        plugins: [guard],
        banner: { js: BANNER },
      });
      await Deno.writeTextFile(bundlePath, result.outputFiles[0]!.text);
    } catch (err) {
      const message = String((err as Error).message);
      if (message.includes(NEEDS_SERVER)) {
        skipped++;
        console.log(`- ${name} — skipped (needs a WebSocket server)`);
        continue;
      }
      failures++;
      console.log(`✗ ${name} — bundle failed: ${message.slice(0, 800)}`);
      continue;
    }
    let outcome;
    try {
      outcome = await runInWorker(bundlePath);
    } catch (err) {
      failures++;
      console.log(`✗ ${name} — failed to load: ${(err as Error).message}`);
      continue;
    }
    const leaked = Object.entries(outcome.globals).filter(([, t]) =>
      t !== 'undefined'
    );
    if (leaked.length > 0) {
      console.error(
        `runtime is not plain: ${leaked.map(([g]) => g).join(', ')} defined`,
      );
      Deno.exit(1);
    }
    const { passed, failed, ignored } = outcome.report;
    total += passed + failed.length;
    if (failed.length > 0) {
      failures += failed.length;
      console.log(`✗ ${name} — ${failed.length} failed, ${passed} passed`);
      for (const f of failed) {
        console.log(`    ✗ ${f.name}\n      ${f.error.split('\n').slice(0, 6).join('\n      ')}`);
      }
    } else {
      console.log(`✓ ${name} — ${passed} passed${ignored ? `, ${ignored} ignored` : ''}`);
    }
  }
}
await Deno.remove(tmp, { recursive: true });
console.log(
  `\n${total - failures}/${total} tests passed in a plain V8 runtime (no Deno, process or Bun)${
    skipped ? `; ${skipped} server-dependent file(s) skipped` : ''
  }`,
);
Deno.exit(failures ? 1 : 0);
