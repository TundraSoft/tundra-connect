import * as fs from 'jsr:@std/fs@^1.0.0';
import * as path from 'jsr:@std/path@^1.0.0';
import * as yaml from 'jsr:@std/yaml@^1.0.5';
import { parseArgs } from 'jsr:@std/cli@^1.0.14';

type DenoSchema = {
  name?: string;
  version?: string;
  description?: string;
  exports?: Record<string, string>;
  imports?: Record<string, string>;
  workspace?: string[];
};

type PRTitleSchema = {
  jobs: {
    main: {
      steps: Array<{
        with?: {
          scopes?: string;
          [key: string]: unknown;
        };
        [key: string]: unknown;
      }>;
    };
  };
};

type IssueTemplateSchema = {
  name: string;
  description: string;
  title: string;
  labels: string[];
  body: Array<{
    type: string;
    id?: string;
    attributes: {
      label?: string;
      description?: string;
      multiple?: boolean;
      options?: string[];
      [key: string]: unknown;
    };
    validations?: Record<string, unknown>;
  }>;
};

// File paths
const LABELER_YML = '.github/labeler.yml';
const PR_TITLE_YML = '.github/workflows/pr-title.yaml';
const ISSUE_BUG_YML = '.github/ISSUE_TEMPLATE/issue.bug.yml';
const ISSUE_DOCUMENTATION_YML = '.github/ISSUE_TEMPLATE/issue.documentation.yml';
const CODECOV_YML = './codecov.yml';

// Project configuration
const WORKSPACE_NAME_PATTERN = new RegExp(/^@[a-z0-9-]+\/[a-z0-9-]+$/);
const WORKSPACE_SCOPE = 'tundraconnect';

const makeWorkspaceDeno = (
  name: string,
  description: string,
  version: string = '0.1.0',
): DenoSchema => {
  return {
    name: name,
    version: version,
    description: description.trim(),
    exports: {
      '.': './mod.ts',
    },
    imports: {},
  };
};

const getWorkspaces = async (root: string = './'): Promise<string[]> => {
  const denoJSONPath = path.join(root, 'deno.json');
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
    throw new Error(`deno.json not found in ${root}`);
  }
};

const checkWorkspaces = async (
  workspaces: Array<string>,
  root: string = './',
): Promise<void> => {
  for (const workspace of workspaces) {
    const workspacePath = path.join(root, workspace);
    if (!(await fs.exists(workspacePath))) {
      throw new Error(`Workspace not found: ${workspacePath}`);
    }
  }
};

const updateWorkflows = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  workspaces = workspaces.filter((workspace) =>
    workspace && workspace.length > 0
  );
  await checkWorkspaces(workspaces);
  workspaces = workspaces.sort();
  
  // Update individual components
  await updateLabelerConfig(workspaces, deleteList);
  await updatePRTitleWorkflow(workspaces, deleteList);
  await updateCodecovConfig(workspaces, deleteList);
  await updateIssueTemplates(workspaces, deleteList);
  await updateManualReleaseWorkflow(workspaces, deleteList);
};

/**
 * Updates the codecov.yml configuration
 */
const updateCodecovConfig = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  if (!(await fs.exists(CODECOV_YML))) {
    console.log(`Codecov config not found at ${CODECOV_YML}, skipping update`);
    return;
  }

  try {
    const codecovContent = yaml.parse(
      await Deno.readTextFile(CODECOV_YML),
    ) as Record<string, unknown>;
    
    updateCodecovComponents(codecovContent, workspaces, deleteList);
    updateCodecovFlags(codecovContent, workspaces, deleteList);
    
    // Write the updated content back to file
    await Deno.writeTextFile(CODECOV_YML, yaml.stringify(codecovContent));
    console.log(`Updated codecov config with workspaces: ${workspaces.join(', ')}`);
  } catch (error) {
    console.warn(`Failed to update codecov config: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Helper function to update codecov components
 */
const updateCodecovComponents = (
  codecovContent: Record<string, unknown>,
  workspaces: string[],
  deleteList?: string[],
): void => {
  const componentManagement = codecovContent.component_management as Record<string, unknown>;
  if (!componentManagement) {
    console.warn('No component_management section found in codecov.yml');
    return;
  }
  
  let individualComponents = (componentManagement.individual_components || []) as Array<Record<string, unknown>>;
  
  // Remove components in delete list
  if (deleteList?.length) {
    individualComponents = individualComponents.filter(
      (component) => !deleteList.includes(component.component_id as string)
    );
  }
  
  // Add new workspace components
  for (const name of workspaces) {
    if (!individualComponents.some(component => component.component_id === name)) {
      individualComponents.push({
        component_id: name,
        name: name,
        paths: [`${name}/**.ts`, `!${name}/**.test.ts`],
        statuses: [{ type: "project", target: "75%" }]
      });
    }
  }
  
  componentManagement.individual_components = individualComponents;
};

/**
 * Helper function to update codecov flags
 */
const updateCodecovFlags = (
  codecovContent: Record<string, unknown>,
  workspaces: string[],
  deleteList?: string[],
): void => {
  const coverage = codecovContent.coverage as Record<string, unknown> || {};
  const status = coverage.status as Record<string, unknown> || {};
  const project = status.project as Record<string, unknown> || {};
  
  // Remove flags in delete list
  if (deleteList?.length) {
    for (const workspace of deleteList) {
      delete project[workspace];
    }
  }
  
  // Add new workspace flags
  for (const name of workspaces) {
    if (!project[name]) {
      project[name] = {
        target: "75%",
        flags: [name]
      };
    }
  }
  
  status.project = project;
  coverage.status = status;
  codecovContent.coverage = coverage;
};

/**
 * Updates the labeler.yml configuration
 */
const updateLabelerConfig = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  if (!(await fs.exists(LABELER_YML))) {
    console.log(`Labeler config not found at ${LABELER_YML}, skipping update`);
    return;
  }

  try {
    const labelerContent = yaml.parse(
      await Deno.readTextFile(LABELER_YML),
    ) as Record<string, unknown>;
    
    // Remove labels for deleted workspaces
    if (deleteList?.length) {
      for (const workspace of deleteList) {
        delete labelerContent[`connect:${workspace}`];
      }
    }
    
    // Add or update labels for each workspace
    for (const workspace of workspaces) {
      const labelKey = `connect:${workspace}`;
      labelerContent[labelKey] = [`${workspace}/**`];
    }
    
    // Write the updated content back to file
    await Deno.writeTextFile(LABELER_YML, yaml.stringify(labelerContent));
    console.log(`Updated labeler config with workspaces: ${workspaces.join(', ')}`);
  } catch (error) {
    console.warn(`Failed to update labeler config: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Updates the PR title workflow
 */
const updatePRTitleWorkflow = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  if (!(await fs.exists(PR_TITLE_YML))) {
    console.log(`PR title workflow not found at ${PR_TITLE_YML}, skipping update`);
    return;
  }

  try {
    const workflowContent = yaml.parse(
      await Deno.readTextFile(PR_TITLE_YML),
    ) as PRTitleSchema;
    
    // Find the step with scopes
    const steps = workflowContent.jobs.main.steps;
    const scopesStep = steps.find(step => step.with?.scopes);
    
    if (scopesStep?.with) {
      const currentScopes = scopesStep.with.scopes?.split('\n').filter(Boolean) || [];
      
      // Remove scopes for deleted workspaces
      let updatedScopes = currentScopes;
      if (deleteList?.length) {
        updatedScopes = currentScopes.filter(scope => 
          !deleteList.some(workspace => scope.trim() === workspace)
        );
      }
      
      // Add new workspace scopes
      for (const workspace of workspaces) {
        if (!updatedScopes.some(scope => scope.trim() === workspace)) {
          updatedScopes.push(workspace);
        }
      }
      
      scopesStep.with.scopes = updatedScopes.sort().join('\n');
    }
    
    // Write the updated content back to file
    await Deno.writeTextFile(PR_TITLE_YML, yaml.stringify(workflowContent));
    console.log(`Updated PR title workflow with workspaces: ${workspaces.join(', ')}`);
  } catch (error) {
    console.warn(`Failed to update PR title workflow: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Updates issue templates with workspace options
 */
const updateIssueTemplates = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  const templates = [ISSUE_BUG_YML, ISSUE_DOCUMENTATION_YML];
  
  for (const templatePath of templates) {
    if (!(await fs.exists(templatePath))) {
      console.log(`Issue template not found at ${templatePath}, skipping update`);
      continue;
    }

    try {
      const templateContent = yaml.parse(
        await Deno.readTextFile(templatePath),
      ) as IssueTemplateSchema;
      
      // Find the workspace/connect dropdown
      const connectField = templateContent.body.find(field => 
        field.type === 'dropdown' && 
        (field.id === 'workspace' || field.id === 'connect')
      );
      
      if (connectField?.attributes?.options) {
        let currentOptions = connectField.attributes.options as string[];
        
        // Filter out deleted workspaces
        if (deleteList?.length) {
          currentOptions = currentOptions.filter(option => 
            !deleteList.includes(option) || option === 'Other'
          );
        }
        
        // Add new workspaces (keeping "Other" at the end)
        const otherIndex = currentOptions.indexOf('Other');
        let optionsWithoutOther = currentOptions.filter(opt => opt !== 'Other');
        
        for (const workspace of workspaces) {
          if (!optionsWithoutOther.includes(workspace)) {
            optionsWithoutOther.push(workspace);
          }
        }
        
        optionsWithoutOther.sort();
        
        // Add "Other" back at the end if it existed
        if (otherIndex !== -1) {
          optionsWithoutOther.push('Other');
        }
        
        connectField.attributes.options = optionsWithoutOther;
      }
      
      // Write the updated content back to file
      await Deno.writeTextFile(templatePath, yaml.stringify(templateContent));
      console.log(`Updated issue template ${templatePath} with workspaces: ${workspaces.join(', ')}`);
    } catch (error) {
      console.warn(`Failed to update issue template ${templatePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

/**
 * Updates the manual release workflow
 */
const updateManualReleaseWorkflow = async (
  workspaces: string[],
  deleteList?: string[],
): Promise<void> => {
  const manualReleaseFile = '.github/workflows/manual-release.yml';
  
  if (!(await fs.exists(manualReleaseFile))) {
    console.log(`Manual release workflow not found at ${manualReleaseFile}, skipping update`);
    return;
  }

  try {
    const workflowContent = yaml.parse(
      await Deno.readTextFile(manualReleaseFile),
    ) as Record<string, unknown>;
    
    const on = workflowContent.on as Record<string, unknown>;
    const workflowDispatch = on.workflow_dispatch as Record<string, unknown>;
    const inputs = workflowDispatch.inputs as Record<string, unknown>;
    const workspace = inputs.workspace as Record<string, unknown>;
    
    if (workspace?.options && Array.isArray(workspace.options)) {
      let currentOptions = workspace.options as string[];
      
      // Remove deleted workspaces
      if (deleteList?.length) {
        currentOptions = currentOptions.filter(option => !deleteList.includes(option));
      }
      
      // Add new workspaces
      for (const ws of workspaces) {
        if (!currentOptions.includes(ws)) {
          currentOptions.push(ws);
        }
      }
      
      workspace.options = currentOptions.sort();
    }
    
    // Write the updated content back to file
    await Deno.writeTextFile(manualReleaseFile, yaml.stringify(workflowContent));
    console.log(`Updated manual release workflow with workspaces: ${workspaces.join(', ')}`);
  } catch (error) {
    console.warn(`Failed to update manual release workflow: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Creates the simplified documentation structure for a workspace
 */
const createDocumentationStructure = async (
  workspacePath: string,
  workspaceName: string,
  scopedName: string,
): Promise<void> => {
  const docsPath = path.join(workspacePath, '.docs');
  
  // Create main .docs directory
  await fs.ensureDir(docsPath);
  
  // Create assets directory with .gitkeep
  const assetsPath = path.join(docsPath, 'assets');
  await fs.ensureDir(assetsPath);
  await Deno.writeTextFile(path.join(assetsPath, '.gitkeep'), '');

  // Create simplified README.md for .docs folder
  const readmeContent = `# ${workspaceName} Documentation

Welcome to the documentation for the ${workspaceName} connect.

## 🚀 Quick Start

\`\`\`typescript
import { ${workspaceName.split('-').map(part => 
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('')}Connect } from '${scopedName}';

const connect = new ${workspaceName.split('-').map(part => 
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('')}Connect({
  apiKey: 'your-api-key',
  environment: 'sandbox' // or 'production'
});

// Basic usage example
const result = await connect.basicMethod({
  // TODO: Add example parameters
});

console.log('Result:', result);
\`\`\`

## 📋 Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| \`apiKey\` | \`string\` | Yes | Your API key from the service |
| \`environment\` | \`'sandbox' \\| 'production'\` | No | Environment to use (default: 'sandbox') |
| \`timeout\` | \`number\` | No | Request timeout in milliseconds (default: 5000) |

## 🔧 API Methods

### \`basicMethod(data: InputData): Promise<OutputData>\`

Brief description of what this method does.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| \`data\` | \`InputData\` | Yes | Input data description |

**Returns:** \`Promise<OutputData>\`

**Example:**

\`\`\`typescript
const result = await connect.basicMethod({
  // TODO: Add example data
});
\`\`\`

## 🏗️ Types

### \`${workspaceName.split('-').map(part => 
  part.charAt(0).toUpperCase() + part.slice(1)
).join('')}Config\`

\`\`\`typescript
interface ${workspaceName.split('-').map(part => 
  part.charAt(0).toUpperCase() + part.slice(1)
).join('')}Config {
  apiKey: string;
  environment?: 'sandbox' | 'production';
  timeout?: number;
}
\`\`\`

### \`InputData\`

\`\`\`typescript
interface InputData {
  // TODO: Define your input types
}
\`\`\`

### \`OutputData\`

\`\`\`typescript
interface OutputData {
  // TODO: Define your output types
}
\`\`\`

## ⚠️ Error Handling

All methods can throw the following errors:

- \`ValidationError\` - Input validation failed
- \`APIError\` - API request failed
- \`TimeoutError\` - Request timed out
- \`AuthenticationError\` - Invalid credentials

\`\`\`typescript
try {
  const result = await connect.basicMethod(data);
} catch (error) {
  if (error.name === 'ValidationError') {
    console.error('Validation failed:', error.message);
  } else if (error.name === 'APIError') {
    console.error('API error:', error.message, error.statusCode);
  } else if (error.name === 'TimeoutError') {
    console.error('Request timed out');
  }
}
\`\`\`

## 🔗 Links

- [JSR Package](https://jsr.io/${scopedName})
- [Official API Docs](https://service.com/docs) <!-- TODO: Update with actual service docs -->
- [GitHub Issues](https://github.com/TundraSoft/tundra-connect/issues)
- [Main Project Documentation](../README.md)

## 📄 License

MIT License - see [LICENSE](../../LICENSE) file for details.
`;

  // Write the single README.md file
  await Deno.writeTextFile(path.join(docsPath, 'README.md'), readmeContent);
  
  console.log(`Created simplified documentation structure for ${workspaceName}`);
};

/**
 * Adds a new workspace to the project
 * @param name - The name of the workspace to add
 * @param scope - The scope for the workspace (defaults to WORKSPACE_SCOPE)
 * @throws Error if workspace name is invalid or already exists
 */
const addWorkspace = async (name: string, scope: string = WORKSPACE_SCOPE) => {
  // Construct the full workspace name with scope
  const workspaceName = `@${scope}/${name}`;

  // Validate workspace name
  if (WORKSPACE_NAME_PATTERN.test(workspaceName) === false) {
    throw new Error(
      `Invalid workspace name: ${name} (scoped - ${workspaceName})`,
    );
  }

  // Check if workspace already exists
  const workspaces = await getWorkspaces();
  if (workspaces.includes(name)) {
    throw new Error(`Workspace already exists: ${name}`);
  }

  // Create workspace directory
  const workspacePath = path.join('./', name);
  await fs.ensureDir(workspacePath);

  // Create workspace files
  await Deno.writeFile(
    path.join(workspacePath, 'deno.json'),
    new TextEncoder().encode(
      JSON.stringify(
        makeWorkspaceDeno(workspaceName, 'TODO: Add description'),
        null,
        2,
      ),
    ),
  );
  
  // Create main entry point
  await Deno.writeFile(
    path.join(workspacePath, 'mod.ts'),
    new TextEncoder().encode('// TODO: Implement your connect here\n'),
  );
  
  // Create README.md with proper template
  const readmeContent = `# 🔗 ${name} Connect

> TODO: Brief description of what this connect does

## 🚀 Quick Start

\`\`\`bash
# Install
deno add jsr:${workspaceName}
\`\`\`

\`\`\`typescript
// Basic usage
import { ${name.split('-').map(part => 
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('')}Connect } from '${workspaceName}';

const connect = new ${name.split('-').map(part => 
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('')}Connect({ 
  apiKey: 'your-key' 
});

// TODO: Add basic usage example
const result = await connect.basicMethod();
\`\`\`

## 📚 Documentation

- **[Complete Documentation](.docs/README.md)** - Full API documentation and guides

## 🔗 Links

- [JSR Package](https://jsr.io/${workspaceName})
- [Official API Docs](https://service.com/docs) <!-- TODO: Update with actual service docs -->
- [GitHub Issues](https://github.com/TundraSoft/tundra-connect/issues)

## 📄 License

MIT License - see [LICENSE](../LICENSE) file for details.
`;
  
  await Deno.writeTextFile(path.join(workspacePath, 'README.md'), readmeContent);
  
  // Create documentation structure
  await createDocumentationStructure(workspacePath, name, workspaceName);

  // Update root deno.json to include new workspace
  workspaces.push(name);
  const denoJSONPath = path.join('./', 'deno.json');
  const denoJSON = JSON.parse(
    await Deno.readTextFile(denoJSONPath),
  ) as DenoSchema;
  denoJSON.workspace = workspaces.sort().map((workspace) => `./${workspace}`);
  await Deno.writeTextFile(denoJSONPath, JSON.stringify(denoJSON, null, 2));

  // Update workflows to include new workspace
  await updateWorkflows(workspaces);

  console.log(`✅ Created workspace: ${name}`);
  console.log(`📁 Directory: ${workspacePath}`);
  console.log(`📦 Package: ${workspaceName}`);
  console.log(`📚 Documentation: ${workspacePath}/.docs/README.md`);
};

/**
 * Removes a workspace from the project
 * @param name - The name of the workspace to remove
 * @throws Error if workspace name is invalid or doesn't exist
 */
const removeWorkspace = async (name: string) => {
  // Construct the full workspace name with scope
  const workspaceName = `@${WORKSPACE_SCOPE}/${name}`;

  // Validate workspace name
  if (WORKSPACE_NAME_PATTERN.test(workspaceName) === false) {
    console.error(
      `Invalid workspace name: ${name} (scoped - ${workspaceName})`,
    );
    Deno.exit(1);
  }

  // Check if workspace exists
  const workspaces = await getWorkspaces();
  if (!workspaces.includes(name)) {
    console.error(`Workspace ${name} doesn't exist.`);
    Deno.exit(1);
  }

  // Update root deno.json to remove workspace
  const updatedWorkspaces = workspaces.filter((workspace) =>
    workspace !== name
  );
  const denoJSONPath = path.join('./', 'deno.json');
  const denoJSON = JSON.parse(
    await Deno.readTextFile(denoJSONPath),
  ) as DenoSchema;
  denoJSON.workspace = updatedWorkspaces.sort().map((workspace) =>
    `./${workspace}`
  );
  await Deno.writeTextFile(denoJSONPath, JSON.stringify(denoJSON, null, 2));

  // Update workflows to remove workspace
  await updateWorkflows(updatedWorkspaces, [name]);

  console.log(`Workspace ${name} removed from project configuration.`);
  console.warn(
    `Note: You may want to manually delete the ${name} directory if it's no longer needed.`,
  );
};

if (import.meta.main) {
  const args = parseArgs(Deno.args);
  switch (args._[0]) {
    case 'add': {
      const name = args._[1] as string;
      if (!name) {
        console.log('Usage: workspace-simple.ts add <workspace-name>');
        break;
      }
      await addWorkspace(name);
      break;
    }
    case 'remove': {
      const name = args._[1] as string;
      if (!name) {
        console.log('Usage: workspace-simple.ts remove <workspace-name>');
        break;
      }
      await removeWorkspace(name);
      break;
    }
    case 'sync':
      await updateWorkflows(await getWorkspaces());
      break;
    default:
      console.log('Usage: workspace-simple.ts <add|remove|sync> [workspace-name]');
      break;
  }
}
