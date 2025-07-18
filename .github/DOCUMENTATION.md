# 📚 Documentation Structure Guide

This guide outlines the simplified documentation structure for Tundra Connect workspaces and automated wiki publishing system.

## 🎯 Documentation Philosophy

The simplified documentation approach provides:

- **📁 Clean Structure**: Each workspace has a simple `.docs/` folder with a single README.md
- **📖 Comprehensive Coverage**: All essential information in one consolidated document
- **🔗 Wiki Integration**: Automatically published to GitHub Wiki via `.wiki` directory
- **🔍 Link Validation**: Automated checks for broken links
- **📋 Index Generation**: Automatic documentation overview generation

## 📋 Simplified Documentation Architecture

Each workspace follows this streamlined documentation structure:

```
workspace-name/
├── README.md           # Main workspace documentation (overview)
├── deno.json          # Workspace configuration
├── mod.ts             # Main entry point
├── CHANGELOG.md       # Version history
├── .docs/             # Detailed documentation
│   ├── README.md      # Complete documentation in single file
│   └── assets/        # Images, diagrams, and other media
│       └── .gitkeep   # Ensures empty folder is tracked
└── *.test.ts          # Tests
```

## 🎯 Documentation Structure

### README.md (Workspace Root)
- **Purpose**: Quick overview and getting started
- **Audience**: Developers looking for quick implementation  
- **Content**: Installation, basic usage, link to detailed docs

### .docs/README.md
- **Purpose**: Complete documentation in one file
- **Audience**: Users wanting comprehensive information
- **Content**: 
  - Quick start guide
  - Configuration options
  - API methods with examples
  - Type definitions
  - Error handling
  - Links to external resources

### .docs/assets/
- **Purpose**: Store images, diagrams, screenshots
- **Structure**: Contains `.gitkeep` to ensure empty folder is tracked
- **Usage**: Reference assets in documentation using relative paths

## 📝 Documentation Standards

### Writing Guidelines

1. **Clear Structure**: Use consistent headings and sections in the single README.md
2. **Code Examples**: Include working code samples with proper context
3. **Type Information**: Document parameters and return types clearly
4. **Error Scenarios**: Explain error handling and common issues
5. **Links**: Reference related documentation and external resources

### Single File Approach

The simplified approach consolidates all essential information into one comprehensive `.docs/README.md` file:

```markdown
# Workspace Documentation

## Quick Start
- Installation
- Basic usage examples

## Configuration
- Configuration options table
- Environment setup

## API Methods
- Method documentation with examples
- Parameter descriptions
- Return type information

## Types
- Interface definitions
- Type documentation

## Error Handling
- Error types and handling examples
- Common troubleshooting

## Links
- External resources
- Related documentation
```

## 🔧 Documentation Templates

### README.md Template (Workspace Root)

```markdown
# 🔗 [Workspace Name] Connect

> Brief description of what this connect does

## 🚀 Quick Start

\`\`\`bash
# Install
deno add jsr:@tundraconnect/workspace-name
\`\`\`

\`\`\`typescript
// Basic usage
import { YourConnect } from '@tundraconnect/workspace-name';

const connect = new YourConnect({ apiKey: 'your-key' });
const result = await connect.basicMethod();
\`\`\`

## 📚 Documentation

- **[Complete Documentation](.docs/README.md)** - Full API documentation and guides

## 🔗 Links

- [JSR Package](https://jsr.io/@tundraconnect/workspace-name)
- [Official API Docs](https://service.com/docs)
- [GitHub Issues](https://github.com/TundraSoft/tundra-connect/issues)
```

### .docs/README.md Template

```markdown
# [Workspace Name] Documentation

Welcome to the documentation for the [workspace-name] connect.

## � Quick Start

\`\`\`typescript
import { YourConnect } from '@tundraconnect/workspace-name';

const connect = new YourConnect({
  apiKey: 'your-api-key',
  environment: 'sandbox'
});

const result = await connect.basicMethod({
  // parameters
});
\`\`\`

## 📋 Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| \`apiKey\` | \`string\` | Yes | Your API key |
| \`environment\` | \`'sandbox' \\| 'production'\` | No | Environment |

## � API Methods

### \`basicMethod(data: InputData): Promise<OutputData>\`

Description of the method.

## 🏗️ Types

Interface definitions and type documentation.

## ⚠️ Error Handling

Error types and handling examples.

## 🔗 Links

External resources and documentation.
```

## 🤖 Automation Tools

### Documentation Validation

Create validation scripts to ensure documentation quality:

```typescript
// .docs/validate.ts
export async function validateDocumentation(workspacePath: string): Promise<boolean> {
  const requiredFiles = [
    'README.md',
    '.docs/index.md',
    '.docs/getting-started.md',
    '.docs/api-reference.md'
  ];
  
  for (const file of requiredFiles) {
    if (!await Deno.stat(path.join(workspacePath, file)).catch(() => false)) {
      console.error(`Missing required documentation: ${file}`);
      return false;
    }
  }
  
  return true;
}
```

### Wiki Publishing

Automation to publish docs to GitHub Wiki:

```typescript
// .github/publish-docs.ts
export async function publishToWiki(workspace: string): Promise<void> {
  // Read all .docs/ markdown files
  // Transform relative links to wiki links
  // Upload to GitHub Wiki API
  // Update wiki navigation
}
```

## 🤖 Automated Features

### ✅ Workspace Creation
When you create a new workspace with `deno task workspace:add workspace-name`, the system automatically:
- Creates simple `.docs/` folder structure
- Generates consolidated README.md template
- Sets up workspace README.md with link to detailed documentation
- Creates assets folder with `.gitkeep`

### ✅ Documentation Validation
```bash
# Validate all workspace documentation
deno task docs:validate

# Check for broken links
deno task docs:links
```

### ✅ Wiki Publishing
```bash
# Generate wiki content for all workspaces
deno task docs:wiki

# Generate for specific workspace
deno task docs:wiki --workspace stripe-connect
```

### ✅ Documentation Index
```bash
# Generate overview of all workspace documentation
deno task docs:index
```

### ✅ GitHub Integration
The system includes a GitHub workflow (`.github/workflows/docs-wiki.yml`) that automatically:
- Validates documentation when changes are made
- Generates wiki content from `.docs/` folders to `.wiki/` directory
- Updates the GitHub Wiki repository
- Creates comprehensive documentation index

## 🔄 Wiki Publishing Process

1. **Trigger**: Changes to `.docs/` folders or README.md files
2. **Validation**: Checks documentation structure and links
3. **Generation**: Converts `.docs/` content to wiki format in `.wiki/` directory
4. **Publishing**: Updates GitHub Wiki with new content from `.wiki/`
5. **Indexing**: Updates main documentation index
6. **Cleanup**: `.wiki/` directory is ignored by git (temporary working directory)

## 📝 Usage Examples

### Creating a New Workspace with Documentation
```bash
# Create workspace (includes simplified documentation structure)
deno task workspace:add stripe-connect

# Generated structure:
# stripe-connect/
# ├── README.md              # Main workspace documentation (overview)
# ├── .docs/                 # Detailed documentation
# │   ├── README.md          # Complete documentation in one file
# │   └── assets/            # Images and media
# │       └── .gitkeep       # Ensures folder is tracked
# ├── mod.ts                # Main entry point
# └── deno.json            # Configuration
```

### Documentation Workflow
```bash
# 1. Validate documentation
deno task docs:validate

# 2. Check links
deno task docs:links

# 3. Generate documentation index
deno task docs:index

# 4. Generate wiki content (creates .wiki/ directory)
deno task docs:wiki

# 5. Commit changes (triggers automatic wiki update)
git add . && git commit -m "docs: update workspace documentation"
# Note: .wiki/ directory is not committed (in .gitignore)
```

## 🔧 Technical Notes

### Wiki Directory Structure
- **`.wiki/`**: Temporary directory for wiki content generation (ignored by git)
- **`wiki/`**: Old directory name (should not be used to avoid confusion with workspaces)
- The `.wiki/` directory is automatically cleaned and regenerated each time
- Content is copied from workspace `.docs/` folders and transformed for wiki compatibility

### Assets Handling
- Assets in `.docs/assets/` are copied to `.wiki/workspace-name/assets/`
- Relative links in documentation are preserved
- `.gitkeep` files are not copied to wiki content

### Link Transformation
- Internal workspace links are transformed for wiki compatibility
- External links remain unchanged
- Asset references are updated to work in wiki context
