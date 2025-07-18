#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net

import * as fs from 'jsr:@std/fs@^1.0.0';
import * as path from 'jsr:@std/path@^1.0.0';
import { parseArgs } from 'jsr:@std/cli@^1.0.14';

type DenoSchema = {
  name?: string;
  version?: string;
  description?: string;
  exports?: Record<string, string>;
  imports?: Record<string, string>;
  workspace?: string[];
};

/**
 * Get all workspaces from deno.json
 */
const getWorkspaces = async (): Promise<string[]> => {
  const denoJSONPath = './deno.json';
  if (await fs.exists(denoJSONPath)) {
    const denoJSON = JSON.parse(
      await Deno.readTextFile(denoJSONPath),
    ) as DenoSchema;
    if (
      denoJSON.workspace && Array.isArray(denoJSON.workspace) &&
      denoJSON.workspace.length > 0
    ) {
      return denoJSON.workspace
        .map((workspace) => path.parse(workspace).name)
        .filter((workspace) => workspace && workspace.length > 0)
        .sort();
    }
    return [];
  } else {
    throw new Error('deno.json not found in current directory');
  }
};

/**
 * Validate documentation structure for a workspace
 */
const validateDocumentation = async (workspacePath: string): Promise<{
  valid: boolean;
  missing: string[];
  warnings: string[];
}> => {
  const requiredFiles = [
    'README.md',
    '.docs/README.md',
    '.docs/assets/.gitkeep'
  ];

  const missing: string[] = [];
  const warnings: string[] = [];

  for (const file of requiredFiles) {
    const filePath = path.join(workspacePath, file);
    if (!(await fs.exists(filePath))) {
      missing.push(file);
    } else if (file.endsWith('.md')) {
      // Check if file has TODO markers
      const content = await Deno.readTextFile(filePath);
      if (content.includes('TODO:')) {
        warnings.push(`${file} contains TODO markers`);
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings
  };
};

/**
 * Generate documentation index for all workspaces
 */
const generateDocumentationIndex = async (): Promise<void> => {
  const workspaces = await getWorkspaces();
  
  if (workspaces.length === 0) {
    console.log('No workspaces found');
    return;
  }

  let indexContent = `# 📚 Tundra Connect Documentation

Welcome to the comprehensive documentation for all Tundra Connect workspaces.

## 🔗 Available Connects

`;

  for (const workspace of workspaces) {
    const workspacePath = `./${workspace}`;
    const readmePath = path.join(workspacePath, 'README.md');
    
    if (await fs.exists(readmePath)) {
      const readmeContent = await Deno.readTextFile(readmePath);
      const titleMatch = readmeContent.match(/^# (.+)$/m);
      const descMatch = readmeContent.match(/^> (.+)$/m);
      
      const title = titleMatch ? titleMatch[1] : workspace;
      const description = descMatch ? descMatch[1] : 'No description available';
      
      indexContent += `### [${title}](${workspace}/README.md)

${description}

**Documentation:** [Complete Documentation](${workspace}/.docs/README.md)

**Package:** \`jsr:@tundraconnect/${workspace}\`

---

`;
    }
  }

  indexContent += `
## 🛠️ Development

- [Contributing Guide](CONTRIBUTING.md)
- [Publishing Guide](.github/PUBLISHING.md)
- [Documentation Guide](.github/DOCUMENTATION.md)

## 🔗 Links

- [GitHub Repository](https://github.com/TundraSoft/tundra-connect)
- [JSR Organization](https://jsr.io/@tundraconnect)
- [Issues & Support](https://github.com/TundraSoft/tundra-connect/issues)
`;

  await Deno.writeTextFile('./DOCS.md', indexContent);
  console.log('✅ Generated documentation index: DOCS.md');
};

/**
 * Validate all workspace documentation
 */
const validateAllDocumentation = async (): Promise<void> => {
  const workspaces = await getWorkspaces();
  
  if (workspaces.length === 0) {
    console.log('No workspaces found');
    return;
  }

  console.log('🔍 Validating documentation for all workspaces...\n');

  let allValid = true;
  
  for (const workspace of workspaces) {
    const workspacePath = `./${workspace}`;
    const result = await validateDocumentation(workspacePath);
    
    console.log(`📁 ${workspace}:`);
    
    if (result.valid) {
      console.log('  ✅ Documentation complete');
    } else {
      console.log('  ❌ Missing documentation:');
      for (const missing of result.missing) {
        console.log(`    - ${missing}`);
      }
      allValid = false;
    }
    
    if (result.warnings.length > 0) {
      console.log('  ⚠️ Warnings:');
      for (const warning of result.warnings) {
        console.log(`    - ${warning}`);
      }
    }
    
    console.log('');
  }
  
  if (allValid) {
    console.log('🎉 All workspace documentation is complete!');
  } else {
    console.log('❌ Some workspaces have incomplete documentation');
    Deno.exit(1);
  }
};

/**
 * Extract documentation links from markdown content
 */
const extractLinks = (content: string): string[] => {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: string[] = [];
  let match;
  
  while ((match = linkRegex.exec(content)) !== null) {
    const link = match[2]!;
    if (link.startsWith('./') || link.startsWith('../') || (!link.startsWith('http') && !link.startsWith('#'))) {
      links.push(link);
    }
  }
  
  return links;
};

/**
 * Validate documentation links
 */
const validateLinks = async (workspacePath: string): Promise<{
  valid: boolean;
  brokenLinks: string[];
}> => {
  const brokenLinks: string[] = [];
  
  // Find all markdown files
  const markdownFiles: string[] = [];
  
  for await (const entry of fs.walk(workspacePath, { exts: ['.md'] })) {
    if (entry.isFile) {
      markdownFiles.push(entry.path);
    }
  }
  
  for (const file of markdownFiles) {
    const content = await Deno.readTextFile(file);
    const links = extractLinks(content);
    
    for (const link of links) {
      const linkPath = path.resolve(path.dirname(file), link);
      
      if (!(await fs.exists(linkPath))) {
        brokenLinks.push(`${file}: ${link}`);
      }
    }
  }
  
  return {
    valid: brokenLinks.length === 0,
    brokenLinks
  };
};

/**
 * Validate links in all workspaces
 */
const validateAllLinks = async (): Promise<void> => {
  const workspaces = await getWorkspaces();
  
  console.log('🔗 Validating documentation links...\n');
  
  let allValid = true;
  
  for (const workspace of workspaces) {
    const workspacePath = `./${workspace}`;
    const result = await validateLinks(workspacePath);
    
    console.log(`📁 ${workspace}:`);
    
    if (result.valid) {
      console.log('  ✅ All links valid');
    } else {
      console.log('  ❌ Broken links:');
      for (const link of result.brokenLinks) {
        console.log(`    - ${link}`);
      }
      allValid = false;
    }
    
    console.log('');
  }
  
  if (allValid) {
    console.log('🎉 All documentation links are valid!');
  } else {
    console.log('❌ Some documentation has broken links');
    Deno.exit(1);
  }
};

/**
 * Generate Wiki content from workspace documentation
 */
const generateWikiContent = async (workspace: string): Promise<void> => {
  const workspacePath = `./${workspace}`;
  const wikiPath = `./.wiki/${workspace}`;
  
  await fs.ensureDir(wikiPath);
  
  const docsPath = path.join(workspacePath, '.docs');
  
  if (!(await fs.exists(docsPath))) {
    console.warn(`No .docs directory found for ${workspace}`);
    return;
  }
  
  // Copy the main README.md from .docs
  const docsReadmePath = path.join(docsPath, 'README.md');
  if (await fs.exists(docsReadmePath)) {
    let content = await Deno.readTextFile(docsReadmePath);
    
    // Transform relative links to work in wiki context
    content = content.replace(/\]\(\.\.\/([^)]+)\)/g, '](../$1)');
    content = content.replace(/\]\(\.\/([^)]+)\)/g, ']($1)');
    
    await Deno.writeTextFile(path.join(wikiPath, 'README.md'), content);
  }
  
  // Copy assets if they exist
  const assetsPath = path.join(docsPath, 'assets');
  if (await fs.exists(assetsPath)) {
    const wikiAssetsPath = path.join(wikiPath, 'assets');
    await fs.ensureDir(wikiAssetsPath);
    
    // Copy all assets except .gitkeep
    for await (const entry of fs.walk(assetsPath)) {
      if (entry.isFile && !entry.name.endsWith('.gitkeep')) {
        const relativePath = path.relative(assetsPath, entry.path);
        const targetPath = path.join(wikiAssetsPath, relativePath);
        
        await fs.ensureDir(path.dirname(targetPath));
        await fs.copy(entry.path, targetPath);
      }
    }
  }
  
  // Copy workspace README.md as Home.md
  const workspaceReadmePath = path.join(workspacePath, 'README.md');
  if (await fs.exists(workspaceReadmePath)) {
    let content = await Deno.readTextFile(workspaceReadmePath);
    // Transform documentation links for wiki
    content = content.replace(/\]\(\.docs\/README\.md\)/g, '](README.md)');
    await Deno.writeTextFile(path.join(wikiPath, 'Home.md'), content);
  }
  
  console.log(`✅ Generated wiki content for ${workspace} in ./.wiki/${workspace}/`);
};

/**
 * Generate wiki content for all workspaces
 */
const generateAllWikiContent = async (): Promise<void> => {
  const workspaces = await getWorkspaces();
  
  console.log('📝 Generating wiki content for all workspaces...\n');
  
  // Clean .wiki directory
  await fs.emptyDir('./.wiki');
  
  for (const workspace of workspaces) {
    await generateWikiContent(workspace);
  }
  
  // Generate main wiki index
  let wikiIndex = `# Tundra Connect Wiki

Welcome to the Tundra Connect documentation wiki.

## Available Connects

`;
  
  for (const workspace of workspaces) {
    wikiIndex += `- [${workspace}](${workspace}/Home.md)\n`;
  }
  
  await Deno.writeTextFile('./.wiki/Home.md', wikiIndex);
  
  console.log('\n🎉 Wiki content generated in ./.wiki/ directory');
  console.log('📋 You can now upload this content to your GitHub Wiki');
};

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    boolean: ['validate', 'links', 'wiki', 'index', 'help'],
    string: ['workspace'],
    alias: {
      v: 'validate',
      l: 'links',
      w: 'wiki',
      i: 'index',
      h: 'help'
    }
  });

  if (args.help) {
    console.log(`
Tundra Connect Documentation Tool

Usage:
  deno run docs.ts [options]

Options:
  -v, --validate     Validate documentation completeness
  -l, --links        Validate documentation links
  -w, --wiki         Generate wiki content
  -i, --index        Generate documentation index
  --workspace <name> Target specific workspace (for wiki generation)
  -h, --help         Show this help

Examples:
  deno run docs.ts --validate
  deno run docs.ts --links
  deno run docs.ts --wiki
  deno run docs.ts --index
  deno run docs.ts --wiki --workspace stripe-connect
`);
    Deno.exit(0);
  }

  try {
    if (args.validate) {
      await validateAllDocumentation();
    } else if (args.links) {
      await validateAllLinks();
    } else if (args.wiki) {
      if (args.workspace) {
        await generateWikiContent(args.workspace);
      } else {
        await generateAllWikiContent();
      }
    } else if (args.index) {
      await generateDocumentationIndex();
    } else {
      console.log('Please specify an action. Use --help for usage information.');
      Deno.exit(1);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Documentation tool failed:', errorMessage);
    Deno.exit(1);
  }
}
