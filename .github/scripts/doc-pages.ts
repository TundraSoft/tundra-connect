/**
 * The wiki page map — which repo markdown becomes a wiki page, and under
 * what name.
 *
 * Shared by `wiki-sync.ts`, which emits the pages, and `doc-links.ts`, which
 * points connect-README links at them. The two must agree exactly: a README
 * link to a page the sync never emits is a 404 on JSR, on GitHub, and on the
 * wiki at once, so the mapping lives here rather than in either script.
 *
 * Paths are repo-relative; every script calls {@link enterRepoRoot} first.
 *
 * @module
 */

import * as path from 'node:path';
import { fromFileUrl } from 'jsr:@std/path@^1.1.6';

export const CONNECTORS_DIR = 'connectors';

/** Make repo-relative paths resolve no matter where the script was run. */
export const enterRepoRoot = (): void => {
  Deno.chdir(fromFileUrl(new URL('../../', import.meta.url)));
};

/**
 * Connect directory → wiki page name, from the workspace metadata file
 * maintained by `workspace.ts`. The wiki name cannot be derived
 * mechanically (gcs → GCS, paypal → PayPal, ntfy → ntfy), and READMEs of
 * unmapped connects fail the sync, so the map cannot silently go stale.
 */
export const CONNECTS: Record<string, string> = JSON.parse(
  Deno.readTextFileSync(new URL('../workspace-meta.json', import.meta.url)),
);

/** Recursively list every file under `dir` (repo-relative paths). */
export const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of Deno.readDirSync(dir)) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory) out.push(...walk(p));
    else out.push(p);
  }
  return out;
};

/** Whether `file` is a file or a directory; undefined for a missing path. */
export const kindOf = (file: string): 'file' | 'dir' | undefined => {
  try {
    return Deno.statSync(file).isDirectory ? 'dir' : 'file';
  } catch {
    return undefined;
  }
};

/**
 * Source path → wiki page file name (`PayPal-API.md`). The root README is
 * `Home.md`, a connect README is `{WikiName}.md`, and any
 * `{WikiName}-{Topic}.md` under the connect keeps its own file name.
 *
 * The prefix match is case-insensitive, so a sub-doc whose casing drifts
 * from the display name (`Ntfy-API.md` for `ntfy`) still reaches the wiki
 * instead of silently vanishing from it.
 */
export const wikiPages = (): Map<string, string> => {
  const pages = new Map<string, string>();
  if (kindOf('README.md') === 'file') pages.set('README.md', 'Home.md');

  for (const [dir, wikiName] of Object.entries(CONNECTS)) {
    const root = path.join(CONNECTORS_DIR, dir);
    if (kindOf(root) !== 'dir') continue;

    const readme = path.join(root, 'README.md');
    if (kindOf(readme) === 'file') pages.set(readme, `${wikiName}.md`);

    const prefix = `${wikiName.toLowerCase()}-`;
    for (const file of walk(root)) {
      const base = path.basename(file);
      if (base.toLowerCase().startsWith(prefix) && base.endsWith('.md')) {
        pages.set(file, base);
      }
    }
  }
  return pages;
};

/**
 * Connect directories with a README but no wiki-name mapping — the sync
 * fails on these rather than dropping a connect's documentation unannounced.
 */
export const unmappedConnects = (): string[] => {
  const missing: string[] = [];
  for (const entry of Deno.readDirSync(CONNECTORS_DIR)) {
    if (!entry.isDirectory || CONNECTS[entry.name]) continue;
    if (kindOf(path.join(CONNECTORS_DIR, entry.name, 'README.md')) === 'file') {
      missing.push(entry.name);
    }
  }
  return missing;
};
