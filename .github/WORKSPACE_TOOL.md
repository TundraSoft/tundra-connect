# 🔧 Workspace Management Tool

This tool helps manage workspaces in the Tundra Connect project. It automatically updates configuration files and templates when workspaces are added or removed.

## Usage

```bash
# Add a new workspace
deno task workspace:add <workspace-name>

# Remove a workspace
deno task workspace:remove <workspace-name>

# Sync all workflows with current workspaces
deno task workspace:sync
```

## What it does

When you add a new workspace, the tool:

1. **Creates workspace directory** with basic structure:
   - `deno.json` with proper JSR package name (`@tundrasoft/workspace-name`)
   - Empty `mod.ts` file

2. **Updates root `deno.json`** to include the new workspace in the workspace array

3. **Updates GitHub configurations**:
   - `.github/labeler.yml` - Adds auto-labeling for files in the workspace
   - `.github/ISSUE_TEMPLATE/issue.bug.yml` - Adds workspace to dropdown options
   - `.github/ISSUE_TEMPLATE/issue.documentation.yml` - Adds workspace to dropdown options
   - `.github/workflows/pr-title.yaml` - Adds workspace to valid scopes for semantic PR validation
   - `codecov.yml` - Adds workspace to component management and flags

## Configuration

The tool uses these constants that can be modified:

- `WORKSPACE_SCOPE` - JSR scope for packages (currently `tundrasoft`)
- `WORKSPACE_NAME_PATTERN` - Regex pattern for valid workspace names
- Template file paths and dropdown IDs

## File Structure

After adding a workspace named `my-connect`, you'll get:

```
my-connect/
├── deno.json          # Package configuration with @tundrasoft/my-connect
└── mod.ts            # Empty main module file
```

## Template Updates

The tool automatically updates these templates:

### Bug Report Template
Adds the new workspace to the "Connect Name" dropdown with format `@tundrasoft/workspace-name`

### Documentation Template  
Adds the new workspace to the "Connect Name" dropdown for documentation requests

### Labeler Configuration
Adds auto-labeling rule to tag PRs that modify files in the workspace directory

### PR Title Validation (Semantic PR)
Adds the workspace name to the valid scopes for conventional commit format validation

### Codecov Configuration
- Adds individual component tracking for the workspace
- Sets up flag-based coverage reporting
- Configures path patterns to include TypeScript files and exclude test files

## Workflows Integration

The tool integrates with these GitHub workflows:

### PR Title Validation
- **File**: `.github/workflows/pr-title.yaml`
- **Action**: Uses `amannn/action-semantic-pull-request@v5`
- **Integration**: Adds workspace names to valid scopes
- **Format**: Conventional commits with scopes (e.g., `feat(stripe-connect): add payment methods`)

### Security Scanning
- **File**: `.github/workflows/security.yaml` 
- **Note**: No integration needed - automatically scans all workspace files

### Code Coverage
- **File**: `codecov.yml`
- **Integration**: Adds per-workspace component tracking and coverage flags
- **Benefits**: Individual coverage reports per workspace

## Notes

- Workspace names must follow the pattern `@scope/name` (validated automatically)
- When removing a workspace, the physical directory is NOT deleted automatically
- The tool preserves existing non-workspace entries in configuration files
- Uses semantic PR title validation instead of custom bracket format
- Codecov integration provides detailed per-workspace coverage metrics

## Examples

```bash
# Add a Stripe integration workspace
deno task workspace:add stripe-connect

# Add a database utilities workspace  
deno task workspace:add database-utils

# Remove a workspace (directory remains)
deno task workspace:remove old-connect

# Sync after manual changes to deno.json
deno task workspace:sync
```

## PR Title Format

After adding workspaces, PRs should use conventional commit format:

```
feat(stripe-connect): add payment intent support
fix(database-utils): resolve connection pooling issue  
docs(core): update authentication examples
```

The tool is designed to be idempotent - running it multiple times with the same workspace will not cause issues.
