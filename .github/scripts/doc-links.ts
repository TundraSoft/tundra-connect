/**
 * Enforces the documentation link contract across the repo.
 *
 * The same markdown is rendered in three places, and one link spelling
 * cannot be right in all of them. JSR rewrites a README's relative links to
 * `github.com/<repo>/blob/HEAD/<target>` resolved against the repository
 * root. In this monorepo that drops the `connectors/<connect>/` prefix, so
 * every one of them 404s on jsr.io. Hence two contracts:
 *
 * - **Connect `README.md`**, the file JSR renders. Every link into this repo
 *   is absolute: a wiki URL when the target is wiki-synced (see
 *   `doc-pages.ts`), a GitHub `blob`/`tree` URL otherwise.
 * - **Every other markdown**: `docs/` topic guides and the root docs. Links
 *   into the repo stay relative, so they resolve while browsing the repo;
 *   `wiki-sync.ts` rewrites them when it publishes the wiki.
 *
 * Dead links are errors under both contracts, as is a wiki link naming a
 * page the sync will never emit. Code fences and external URLs are left
 * alone, and a relative link that already resolves is left exactly as
 * written.
 *
 * Usage:
 *   deno run --allow-read --allow-write --allow-env .github/scripts/doc-links.ts
 *     [--fix] [--repo=owner/name] [--ref=main]
 *
 * @module
 */

import * as path from 'node:path';
import {
  CONNECTORS_DIR,
  enterRepoRoot,
  kindOf,
  walk,
  wikiPages,
} from './doc-pages.ts';

type Args = { fix: boolean; repo: string; ref: string };

const parseArgs = (): Args => {
  const args: Args = {
    fix: false,
    repo: Deno.env.get('GITHUB_REPOSITORY') ?? 'TundraSoft/tundra-connect',
    ref: 'main',
  };
  for (const a of Deno.args) {
    const [k, v] = a.split('=', 2);
    if (k === '--fix') args.fix = true;
    else if (k === '--repo' && v) args.repo = v;
    else if (k === '--ref' && v) args.ref = v;
  }
  return args;
};

/** `](target)`, the only link form this repo uses outside code fences. */
const LINK = /\]\(([^)\s]+)\)/g;

/** A markdown file and which of the two link contracts governs it. */
type Doc = { file: string; contract: 'absolute' | 'relative' };

const README_PATTERN = new RegExp(`^${CONNECTORS_DIR}/[^/]+/README\\.md$`);

/**
 * Every markdown file the contract covers: connect READMEs under the
 * absolute contract, all other connect and root docs under the relative
 * one. `CHANGELOG.md` belongs to release-please and is skipped.
 */
const docs = (): Doc[] => {
  const out: Doc[] = [];
  for (const file of walk(CONNECTORS_DIR)) {
    if (!file.endsWith('.md') || path.basename(file) === 'CHANGELOG.md') {
      continue;
    }
    out.push({
      file,
      contract: README_PATTERN.test(file) ? 'absolute' : 'relative',
    });
  }
  const roots = [
    'README.md',
    'ROADMAP.md',
    'CONTRIBUTING.md',
    'CONVENTIONS.md',
    'SECURITY.md',
  ];
  for (const root of roots) {
    if (kindOf(root) === 'file') out.push({ file: root, contract: 'relative' });
  }
  return out;
};

const main = () => {
  enterRepoRoot();
  const { fix, repo, ref } = parseArgs();
  const pages = wikiPages();
  /** Wiki page name (no `.md`) → source path, for the relative direction. */
  const sourceOfPage = new Map<string, string>();
  for (const [src, page] of pages) {
    sourceOfPage.set(page.replace(/\.md$/, ''), src);
  }

  const base = `https://github.com/${repo}`;
  const prefix = `${base}/`;

  /** Split one of this repo's own URLs into its verb and remainder. */
  const ownUrl = (
    url: string,
  ): { verb: string; rest: string } | undefined => {
    if (!url.startsWith(prefix)) return undefined;
    const rest = url.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash <= 0) return undefined;
    return { verb: rest.slice(0, slash), rest: rest.slice(slash + 1) };
  };

  /**
   * The repo path an own-URL points at. Undefined when it is not a path URL
   * at all (an issue, a workflow badge, the bare `/wiki` link), which this
   * script deliberately leaves alone.
   */
  const repoPathOf = (url: string): string | undefined => {
    const own = ownUrl(url);
    if (!own) return undefined;
    const [target = ''] = own.rest.split('#', 2);
    if (own.verb === 'wiki') return sourceOfPage.get(target);
    if (own.verb !== 'blob' && own.verb !== 'tree') return undefined;
    // blob/tree carry a ref segment ahead of the repo-relative path.
    const segments = target.split('/');
    segments.shift();
    const p = segments.join('/');
    return p.length > 0 ? p : undefined;
  };

  /** The canonical absolute URL for a repo path. */
  const absoluteFor = (
    resolved: string,
    anchor: string,
  ): string | undefined => {
    const page = pages.get(resolved);
    if (page) return `${base}/wiki/${page.replace(/\.md$/, '')}${anchor}`;
    const kind = kindOf(resolved);
    if (!kind) return undefined;
    return `${base}/${
      kind === 'dir' ? 'tree' : 'blob'
    }/${ref}/${resolved}${anchor}`;
  };

  const fixable: string[] = [];
  const fatal: string[] = [];
  let rewrites = 0;
  let touched = 0;

  for (const { file, contract } of docs()) {
    const dir = path.dirname(file);
    const lines = Deno.readTextFileSync(file).split('\n');
    let inFence = false;
    let changed = false;

    const out = lines.map((line, i) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;

      return line.replace(LINK, (match, target: string) => {
        if (target.startsWith('#')) return match;
        const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(target);
        const own = isAbsolute ? repoPathOf(target) : undefined;

        if (isAbsolute && own === undefined) {
          // Not a link into this repo's tree. Still catch a wiki link that
          // names a page the sync will never emit: it looks absolute and
          // canonical, and is the exact failure this contract prevents.
          const parsed = ownUrl(target);
          if (parsed?.verb === 'wiki') {
            const [page] = parsed.rest.split('#', 2);
            if (page && !sourceOfPage.has(page)) {
              fatal.push(
                `${file}:${i + 1}: wiki link '${target}' names no synced page`,
              );
            }
          }
          return match;
        }

        const [rawFile = '', rawAnchor] = target.split('#', 2);
        const anchor = rawAnchor ? `#${rawAnchor}` : '';
        const resolved = isAbsolute
          ? own!
          : path.normalize(path.join(dir, rawFile)).replace(/\/$/, '');

        if (kindOf(resolved) === undefined) {
          fatal.push(`${file}:${i + 1}: dead link '${target}'`);
          return match;
        }

        // Relative contract: a relative link that resolves is already
        // correct. Only an absolute link into the repo has to come back.
        if (contract === 'relative' && !isAbsolute) return match;

        const want = contract === 'absolute'
          ? absoluteFor(resolved, anchor)
          : `${path.relative(dir, resolved) || '.'}${anchor}`;
        if (want === undefined || want === target) return match;

        fixable.push(
          `${file}:${
            i + 1
          }: ${contract} contract — '${target}' should be '${want}'`,
        );
        changed = true;
        rewrites++;
        return `](${want})`;
      });
    });

    if (fix && changed) {
      Deno.writeTextFileSync(file, out.join('\n'));
      touched++;
    }
  }

  for (const f of fatal) console.error(`ERROR: ${f}`);

  if (fix) {
    console.log(`Rewrote ${rewrites} link(s) across ${touched} file(s).`);
    if (fatal.length) {
      console.error(`\n${fatal.length} problem(s) --fix cannot repair.`);
      Deno.exit(1);
    }
    return;
  }

  for (const f of fixable) console.error(`ERROR: ${f}`);
  const total = fatal.length + fixable.length;
  if (total) {
    console.error(
      `\n${total} link problem(s). Run \`deno task docs:links:fix\` for the ${fixable.length} rewritable one(s).`,
    );
    Deno.exit(1);
  }
  console.log('Documentation links OK.');
};

main();
