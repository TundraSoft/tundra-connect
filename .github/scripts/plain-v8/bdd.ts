/**
 * Minimal BDD runner standing in for `@tundralibs/compat/test` inside the
 * plain-V8 target (see `../plain-v8.ts`). It uses nothing but ECMAScript
 * and timers, so a suite bundled against it runs in any bare V8 isolate
 * with the web extensions — no `Deno`, `process` or `Bun`.
 *
 * Supports exactly the surface the connect suites use: `describe`/`it`
 * (name+fn or the options form with `ignore`, `only` and per-runtime
 * flags), nested suites, and the four hooks at file or suite scope.
 */

type Fn = () => void | Promise<void>;
type Options = {
  name?: string;
  fn?: Fn;
  ignore?: boolean;
  only?: boolean;
  beforeAll?: Fn;
  afterAll?: Fn;
  beforeEach?: Fn;
  afterEach?: Fn;
  [flag: string]: unknown;
};

type Test = { kind: 'test'; name: string; fn: Fn; ignore: boolean };
type Suite = {
  kind: 'suite';
  name: string;
  ignore: boolean;
  children: (Test | Suite)[];
  beforeAll: Fn[];
  afterAll: Fn[];
  beforeEach: Fn[];
  afterEach: Fn[];
};

const newSuite = (name: string, ignore = false): Suite => ({
  kind: 'suite',
  name,
  ignore,
  children: [],
  beforeAll: [],
  afterAll: [],
  beforeEach: [],
  afterEach: [],
});

const root = newSuite('');
let current = root;

/** A runtime flag set to `false` skips the test here, like it does on the named runtime elsewhere; this target is none of them. */
const skipped = (o: Options): boolean => o.ignore === true;

function normalize(a: string | Options, b?: Fn): Options {
  return typeof a === 'string' ? { name: a, fn: b } : a;
}

export function describe(a: string | Options, b?: Fn): void {
  const o = normalize(a, b);
  const suite = newSuite(o.name ?? '', skipped(o));
  if (o.beforeAll) suite.beforeAll.push(o.beforeAll);
  if (o.afterAll) suite.afterAll.push(o.afterAll);
  if (o.beforeEach) suite.beforeEach.push(o.beforeEach);
  if (o.afterEach) suite.afterEach.push(o.afterEach);
  current.children.push(suite);
  const parent = current;
  current = suite;
  try {
    const result = o.fn?.();
    if (result instanceof Promise) {
      throw new Error(`describe('${o.name}') must be synchronous`);
    }
  } finally {
    current = parent;
  }
}

export function it(a: string | Options, b?: Fn): void {
  const o = normalize(a, b);
  current.children.push({
    kind: 'test',
    name: o.name ?? '',
    fn: o.fn ?? (() => {}),
    ignore: skipped(o),
  });
}

export const test = it;
export const beforeAll = (fn: Fn): void => void current.beforeAll.push(fn);
export const afterAll = (fn: Fn): void => void current.afterAll.push(fn);
export const beforeEach = (fn: Fn): void => void current.beforeEach.push(fn);
export const afterEach = (fn: Fn): void => void current.afterEach.push(fn);

export type Report = {
  passed: number;
  failed: { name: string; error: string }[];
  ignored: number;
};

const TIMEOUT_MS = 30_000;

async function timed(fn: Fn, name: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(fn),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${TIMEOUT_MS}ms: ${name}`)),
          TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const describeError = (err: unknown): string =>
  err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);

/** Runs everything registered so far. */
export async function run(): Promise<Report> {
  const report: Report = { passed: 0, failed: [], ignored: 0 };
  const count = (s: Suite): number =>
    s.children.reduce((n, c) => n + (c.kind === 'test' ? 1 : count(c)), 0);

  async function walk(
    suite: Suite,
    path: string[],
    each: { before: Fn[]; after: Fn[] },
  ): Promise<void> {
    if (suite.ignore) {
      report.ignored += count(suite);
      return;
    }
    const before = [...each.before, ...suite.beforeEach];
    const after = [...suite.afterEach, ...each.after];
    try {
      for (const hook of suite.beforeAll) await timed(hook, 'beforeAll');
    } catch (err) {
      report.failed.push({
        name: [...path, '(beforeAll)'].join(' > '),
        error: describeError(err),
      });
      return;
    }
    for (const child of suite.children) {
      const name = [...path, child.name].join(' > ');
      if (child.kind === 'suite') {
        await walk(child, [...path, child.name], { before, after });
        continue;
      }
      if (child.ignore) {
        report.ignored++;
        continue;
      }
      try {
        for (const hook of before) await timed(hook, 'beforeEach');
        await timed(child.fn, name);
        report.passed++;
      } catch (err) {
        report.failed.push({ name, error: describeError(err) });
      } finally {
        for (const hook of after) {
          try {
            await timed(hook, 'afterEach');
          } catch (err) {
            report.failed.push({
              name: `${name} (afterEach)`,
              error: describeError(err),
            });
          }
        }
      }
    }
    for (const hook of suite.afterAll) {
      try {
        await timed(hook, 'afterAll');
      } catch (err) {
        report.failed.push({
          name: [...path, '(afterAll)'].join(' > '),
          error: describeError(err),
        });
      }
    }
  }

  await walk(root, [], { before: [], after: [] });
  return report;
}
