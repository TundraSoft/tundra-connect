#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net

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
 * Bump version in workspace deno.json
 */
const bumpVersion = async (
  workspace: string,
  versionType: 'patch' | 'minor' | 'major' = 'patch',
): Promise<string> => {
  const workspacePath = path.join('./', workspace);
  const denoJsonPath = path.join(workspacePath, 'deno.json');
  
  if (!(await fs.exists(denoJsonPath))) {
    throw new Error(`deno.json not found in workspace: ${workspace}`);
  }
  
  const config = JSON.parse(await Deno.readTextFile(denoJsonPath)) as DenoSchema;
  const currentVersion = config.version || '0.1.0';
  
  const versionParts = currentVersion.split('.').map(Number);
  const [major = 0, minor = 0, patch = 0] = versionParts;
  
  let newVersion: string;
  switch (versionType) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
  }
  
  config.version = newVersion;
  await Deno.writeTextFile(denoJsonPath, JSON.stringify(config, null, 2));
  
  console.log(`✅ Bumped ${workspace} version: ${currentVersion} → ${newVersion}`);
  return newVersion;
};

/**
 * Update CHANGELOG.md for workspace
 */
const updateChangelog = async (
  workspace: string,
  version: string,
  versionType: 'patch' | 'minor' | 'major',
  customNotes?: string,
): Promise<void> => {
  const changelogPath = path.join('./', workspace, 'CHANGELOG.md');
  const date = new Date().toISOString().split('T')[0];
  
  let changeType: string;
  let defaultDescription: string;
  
  switch (versionType) {
    case 'major':
      changeType = '### ⚠️ BREAKING CHANGES';
      defaultDescription = '- Major version release with potential breaking changes';
      break;
    case 'minor':
      changeType = '### Added';
      defaultDescription = '- New features and enhancements';
      break;
    case 'patch':
      changeType = '### Fixed';
      defaultDescription = '- Bug fixes and improvements';
      break;
  }
  
  if (!(await fs.exists(changelogPath))) {
    // Create new CHANGELOG.md
    const content = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [${version}] - ${date}

${changeType}
${defaultDescription}
${customNotes ? `- ${customNotes}` : ''}

`;
    await Deno.writeTextFile(changelogPath, content);
  } else {
    // Update existing CHANGELOG.md
    const content = await Deno.readTextFile(changelogPath);
    const newEntry = `
## [${version}] - ${date}

${changeType}
${defaultDescription}
${customNotes ? `- ${customNotes}` : ''}

`;
    
    if (content.includes('## [Unreleased]')) {
      const updatedContent = content.replace(
        '## [Unreleased]',
        `## [Unreleased]${newEntry}`,
      );
      await Deno.writeTextFile(changelogPath, updatedContent);
    } else {
      // Add after first heading
      const lines = content.split('\n');
      const titleIndex = lines.findIndex(line => line.startsWith('# '));
      if (titleIndex !== -1) {
        lines.splice(titleIndex + 1, 0, newEntry);
        await Deno.writeTextFile(changelogPath, lines.join('\n'));
      }
    }
  }
  
  console.log(`✅ Updated CHANGELOG.md for ${workspace}`);
};

/**
 * Run tests for workspace
 */
const runTests = async (workspace: string): Promise<boolean> => {
  console.log(`🧪 Running tests for ${workspace}...`);
  
  const cmd = new Deno.Command('deno', {
    args: ['test', '--allow-all'],
    cwd: workspace,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  
  const result = await cmd.output();
  return result.success;
};

/**
 * Type check workspace
 */
const typeCheck = async (workspace: string): Promise<boolean> => {
  console.log(`🔍 Type checking ${workspace}...`);
  
  const cmd = new Deno.Command('deno', {
    args: ['check', 'mod.ts'],
    cwd: workspace,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  
  const result = await cmd.output();
  return result.success;
};

/**
 * Publish workspace to JSR
 */
const publishToJSR = async (workspace: string, dryRun: boolean = false): Promise<boolean> => {
  console.log(`📦 ${dryRun ? 'Dry run - ' : ''}Publishing ${workspace} to JSR...`);
  
  const args = ['publish'];
  if (dryRun) args.push('--dry-run');
  args.push('--allow-slow-types', '--allow-dirty');
  
  const cmd = new Deno.Command('deno', {
    args,
    cwd: workspace,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  
  const result = await cmd.output();
  return result.success;
};

/**
 * Main publish function
 */
const publishWorkspace = async (
  workspace: string,
  options: {
    versionType?: 'patch' | 'minor' | 'major';
    customNotes?: string;
    skipTests?: boolean;
    dryRun?: boolean;
  } = {},
): Promise<void> => {
  console.log(`\n🚀 Publishing workspace: ${workspace}`);
  
  const {
    versionType = 'patch',
    customNotes,
    skipTests = false,
    dryRun = false,
  } = options;
  
  try {
    // Check if workspace exists
    if (!(await fs.exists(workspace))) {
      throw new Error(`Workspace directory not found: ${workspace}`);
    }
    
    if (!(await fs.exists(path.join(workspace, 'deno.json')))) {
      throw new Error(`deno.json not found in workspace: ${workspace}`);
    }
    
    // Bump version
    const newVersion = await bumpVersion(workspace, versionType);
    
    // Update changelog
    await updateChangelog(workspace, newVersion, versionType, customNotes);
    
    if (!skipTests) {
      // Run tests
      const testsPass = await runTests(workspace);
      if (!testsPass) {
        console.warn(`⚠️ Tests failed for ${workspace}, continuing anyway...`);
      }
      
      // Type check
      const typeCheckPass = await typeCheck(workspace);
      if (!typeCheckPass) {
        console.warn(`⚠️ Type check failed for ${workspace}, continuing anyway...`);
      }
    }
    
    // Publish to JSR
    const publishSuccess = await publishToJSR(workspace, dryRun);
    if (!publishSuccess) {
      throw new Error(`Failed to publish ${workspace} to JSR`);
    }
    
    console.log(`✅ Successfully ${dryRun ? 'validated' : 'published'} ${workspace} v${newVersion}`);
    
    if (!dryRun) {
      console.log(`📦 Package: jsr:@tundraconnect/${workspace}@^${newVersion}`);
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to publish ${workspace}:`, errorMessage);
    throw error;
  }
};

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    string: ['workspace', 'version-type', 'notes'],
    boolean: ['all', 'dry-run', 'skip-tests', 'help'],
    alias: {
      w: 'workspace',
      t: 'version-type',
      n: 'notes',
      a: 'all',
      d: 'dry-run',
      s: 'skip-tests',
      h: 'help',
    },
  });
  
  if (args.help) {
    console.log(`
Tundra Connect Publishing Tool

Usage:
  deno task publish:workspace [options]

Options:
  -w, --workspace <name>     Publish specific workspace
  -a, --all                  Publish all workspaces
  -t, --version-type <type>  Version bump type: patch, minor, major (default: patch)
  -n, --notes <text>         Custom changelog notes
  -d, --dry-run              Validate without publishing
  -s, --skip-tests           Skip tests and type checking
  -h, --help                 Show this help

Examples:
  deno task publish:workspace -w stripe-connect
  deno task publish:workspace -w stripe-connect -t minor -n "Added new features"
  deno task publish:workspace -a --dry-run
`);
    Deno.exit(0);
  }
  
  try {
    const workspaces = await getWorkspaces();
    
    if (workspaces.length === 0) {
      console.log('ℹ️ No workspaces found in deno.json');
      Deno.exit(0);
    }
    
    const publishOptions = {
      versionType: (args['version-type'] as 'patch' | 'minor' | 'major') || 'patch',
      customNotes: args.notes,
      skipTests: args['skip-tests'],
      dryRun: args['dry-run'],
    };
    
    if (args.all) {
      console.log(`📦 Publishing all workspaces: ${workspaces.join(', ')}`);
      for (const workspace of workspaces) {
        await publishWorkspace(workspace, publishOptions);
      }
    } else if (args.workspace) {
      if (!workspaces.includes(args.workspace)) {
        console.error(`❌ Workspace '${args.workspace}' not found`);
        console.log(`Available workspaces: ${workspaces.join(', ')}`);
        Deno.exit(1);
      }
      await publishWorkspace(args.workspace, publishOptions);
    } else {
      console.error('❌ Please specify a workspace with -w or use -a for all workspaces');
      console.log('Use --help for usage information');
      Deno.exit(1);
    }
    
    console.log('\n🎉 Publishing completed successfully!');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Publishing failed:', errorMessage);
    Deno.exit(1);
  }
}
