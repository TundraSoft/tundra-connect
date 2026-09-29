/**
 * Generates GitHub-wiki pages from each connect's documentation.
 *
 * Each connect's README is its wiki main page. Supplemental documents named
 * `{Connect}-{Topic}.md` are discovered recursively and published as separate
 * wiki pages; the page map is shared with `doc-links.ts` via `doc-pages.ts`.
 * Relative links are rewritten for the flat wiki namespace: a wiki-synced
 * page becomes its page name, any other repo file or directory becomes a
 * GitHub `blob`/`tree` URL, and a missing target fails the run.
 *
 * Usage:
 *   deno run --allow-read --allow-write --allow-env .github/scripts/wiki-sync.ts \
 *     [--out=wiki] [--repo=owner/name] [--ref=main]
 *
 * `--repo` defaults to the GITHUB_REPOSITORY env var; without it, links to
 * non-synced paths are left untouched (with a warning).
 */

import * as path from 'node:path';
import {
  CONNECTS,
  enterRepoRoot,
  kindOf,
  unmappedConnects,
  wikiPages,
} from './doc-pages.ts';

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
    const resolved = path.normalize(path.join(directory, file)).replace(
      /\/$/,
      '',
    );
    const suffix = anchor ? `#${anchor}` : '';

    // Drop the `.md`: a wiki page is served at `/wiki/<PageName>`, and a
    // link that keeps the extension resolves to the raw file instead.
    const wikiPage = pages.get(resolved);
    if (wikiPage) return `](${wikiPage.replace(/\.md$/, '')}${suffix})`;

    // Exists in the repo but is not a wiki page: deep-link to GitHub. Left
    // relative, it would resolve against the flat wiki and 404.
    const kind = kindOf(resolved);
    if (kind) {
      if (repo) {
        const verb = kind === 'dir' ? 'tree' : 'blob';
        return `](https://github.com/${repo}/${verb}/${ref}/${resolved}${suffix})`;
      }
      warnings.push(`${source}: non-wiki link '${target}' left unchanged`);
      return match;
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
      Deno.readTextFileSync(source),
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
  for (
    const displayName of Object.values(CONNECTS).sort((left, right) =>
      left.localeCompare(right)
    )
  ) {
    if (!pagesByName.has(`${displayName}.md`)) continue;
    sidebar.push(`- [[${displayName}]]`);
    // Case-insensitive, exactly like the page map in doc-pages.ts.
    const prefix = `${displayName.toLowerCase()}-`;
    const subpages = [...pagesByName]
      .filter((page) =>
        page.toLowerCase().startsWith(prefix) && page.endsWith('.md')
      )
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
  // Resolve --out before moving to the repo root, so a relative path means
  // what it meant where the script was invoked.
  args.out = path.resolve(args.out);
  enterRepoRoot();

  const warnings: string[] = [];
  const errors: string[] = [];
  for (const dir of unmappedConnects()) {
    errors.push(
      `connectors/${dir}/README.md: connect '${dir}' has no wiki-name mapping — add it to .github/workspace-meta.json and run \`deno task workspace:sync\``,
    );
  }
  for (const dir of Object.keys(CONNECTS)) {
    const readme = `connectors/${dir}/README.md`;
    if (kindOf(readme) !== 'file') errors.push(`${readme}: connect has no README.md`);
  }
  const pages = wikiPages();
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
