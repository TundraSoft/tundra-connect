/**
 * Generates GitHub-wiki pages from each connect's documentation.
 *
 * Each connect's README is its wiki main page. Supplemental documents named
 * `{Connect}-{Topic}.md` are discovered recursively and published as separate
 * wiki pages. Connects live under `connectors/<name>/`.
 */

import * as path from 'node:path';
import { fromFileUrl } from 'jsr:@std/path@^1.1.6';

const ROOT = fromFileUrl(new URL('../../', import.meta.url));
const CONNECTORS_DIR = 'connectors';
const CONNECTS: Record<string, string> = JSON.parse(
  Deno.readTextFileSync(`${ROOT}.github/workspace-meta.json`),
);

type Args = { out: string; repo: string | undefined; ref: string };

function parseArgs(): Args {
  const args: Args = {
    out: 'wiki',
    repo: Deno.env.get('GITHUB_REPOSITORY') ?? undefined,
    ref: 'main',
  };
  for (const argument of Deno.args) {
    const [key, value] = argument.split('=', 2);
    if (key === '--out' && value) args.out = value;
    else if (key === '--repo' && value) args.repo = value;
    else if (key === '--ref' && value) args.ref = value;
  }
  return args;
}

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of Deno.readDirSync(directory)) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory) files.push(...walk(file));
    else files.push(file);
  }
  return files;
}

function collectPages(errors: string[]): Map<string, string> {
  const pages = new Map<string, string>();

  if (Deno.statSync(`${ROOT}README.md`).isFile) pages.set('README.md', 'Home.md');

  for (const [directory, displayName] of Object.entries(CONNECTS)) {
    const readme = `${CONNECTORS_DIR}/${directory}/README.md`;
    try {
      if (Deno.statSync(`${ROOT}${readme}`).isFile) {
        pages.set(readme, `${displayName}.md`);
      }
    } catch {
      errors.push(`${readme}: connect has no README.md`);
      continue;
    }

    const prefix = `${displayName}-`;
    for (const file of walk(`${ROOT}${CONNECTORS_DIR}/${directory}`)) {
      const relative = path.relative(ROOT, file);
      const base = path.basename(relative);
      if (base.startsWith(prefix) && base.endsWith('.md')) {
        pages.set(relative, base);
      }
    }
  }
  return pages;
}

function rewriteLinks(
  content: string,
  source: string,
  pages: ReadonlyMap<string, string>,
  repo: string | undefined,
  ref: string,
  warnings: string[],
  errors: string[],
): string {
  const directory = path.dirname(source);
  const linkPattern = /\]\(([^)\s]+)\)/g;
  return content.replace(linkPattern, (match, target: string) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) {
      return match;
    }
    const [file = '', anchor] = target.split('#', 2);
    if (!file.endsWith('.md')) return match;
    const resolved = path.normalize(path.join(directory, file));
    const suffix = anchor ? `#${anchor}` : '';
    const wikiPage = pages.get(resolved);
    if (wikiPage) return `](${wikiPage.replace(/\.md$/, '')}${suffix})`;

    try {
      if (Deno.statSync(`${ROOT}${resolved}`).isFile && repo) {
        return `](https://github.com/${repo}/blob/${ref}/${resolved}${suffix})`;
      }
      if (Deno.statSync(`${ROOT}${resolved}`).isFile) {
        warnings.push(`${source}: non-wiki link '${target}' left unchanged`);
        return match;
      }
    } catch {
      // Report the unresolved link below.
    }
    errors.push(`${source}: dead link '${target}'`);
    return match;
  });
}

function prunePages(out: string): void {
  let entries: Deno.DirEntry[];
  try {
    entries = [...Deno.readDirSync(out)];
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isFile && entry.name.endsWith('.md')) {
      Deno.removeSync(path.join(out, entry.name));
    }
  }
}

function writePages(
  pages: ReadonlyMap<string, string>,
  args: Args,
  warnings: string[],
  errors: string[],
): void {
  Deno.mkdirSync(args.out, { recursive: true });
  prunePages(args.out);
  for (const [source, page] of pages) {
    const content = rewriteLinks(
      Deno.readTextFileSync(`${ROOT}${source}`),
      source,
      pages,
      args.repo,
      args.ref,
      warnings,
      errors,
    );
    Deno.writeTextFileSync(path.join(args.out, page), content);
    console.log(`Created: ${page} (from ${source})`);
  }
}

function writeSidebar(pages: ReadonlyMap<string, string>, out: string): void {
  const pagesByName = new Set(pages.values());
  const sidebar = ['## Tundra Connect', '', '- [[Home]]', '', '### Connects', ''];
  for (const displayName of Object.values(CONNECTS).sort((left, right) =>
    left.localeCompare(right)
  )) {
    if (!pagesByName.has(`${displayName}.md`)) continue;
    sidebar.push(`- [[${displayName}]]`);
    const subpages = [...pagesByName]
      .filter((page) => page.startsWith(`${displayName}-`) && page.endsWith('.md'))
      .sort((left, right) => left.localeCompare(right));
    for (const subpage of subpages) {
      const stem = subpage.slice(0, -3);
      const segments = stem.split('-');
      const indent = '  '.repeat(segments.length - 1);
      sidebar.push(`${indent}- [[${segments.at(-1)}|${stem}]]`);
    }
  }
  Deno.writeTextFileSync(path.join(out, '_Sidebar.md'), sidebar.join('\n') + '\n');
}

function main(): void {
  const args = parseArgs();
  const warnings: string[] = [];
  const errors: string[] = [];
  const pages = collectPages(errors);
  writePages(pages, args, warnings, errors);
  writeSidebar(pages, args.out);

  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    Deno.exit(1);
  }
  console.log(`Synced ${pages.size} page(s) to '${args.out}'.`);
}

main();
