# Publishing Guide

This document explains how to publish Tundra Connect workspaces to JSR (JavaScript Registry).

## Automatic Publishing

### Push to Main (Automatic)

When changes are pushed to the `main` branch, the system automatically:

1. **Detects Changed Workspaces**: Analyzes git diff to identify which workspaces have changes
2. **Version Bumping**: Automatically increments patch version using `@deno/bump-workspaces`
3. **Changelog Updates**: Adds new version entry to workspace `CHANGELOG.md`
4. **Testing**: Runs tests and type checking
5. **JSR Publishing**: Publishes to `jsr:@tundraconnect/workspace-name`
6. **GitHub Release**: Creates tagged release with package information

### Workflow Triggers

- **Push to main**: Automatic detection and publishing of changed workspaces
- **Manual trigger**: Force publish all workspaces or specific workspace
- **Manual release workflow**: Full control over version type and changelog notes

## Manual Publishing

### Local Development

Use the local publishing script for testing and development:

```bash
# Show help
deno task publish:workspace --help

# Dry run (validate without publishing)
deno task publish:workspace -w workspace-name --dry-run

# Publish specific workspace (patch version)
deno task publish:workspace -w stripe-connect

# Publish with minor version bump and custom notes
deno task publish:workspace -w stripe-connect -t minor -n "Added new authentication methods"

# Publish all workspaces
deno task publish:workspace --all

# Skip tests (not recommended)
deno task publish:workspace -w workspace-name --skip-tests
```

### GitHub Actions (Manual Release)

Use the manual release workflow for controlled releases:

1. Go to **Actions** → **Manual Release** in GitHub
2. Click **Run workflow**
3. Select:
   - **Workspace**: Choose specific workspace or 'all'
   - **Version Type**: patch, minor, or major
   - **Custom Notes**: Optional changelog entry

## Version Bumping

### Semantic Versioning

- **Patch** (0.1.0 → 0.1.1): Bug fixes, small improvements
- **Minor** (0.1.0 → 0.2.0): New features, backward compatible
- **Major** (0.1.0 → 1.0.0): Breaking changes

### Automatic Detection

The system automatically bumps patch versions for:
- Code changes in workspace directories
- Documentation updates affecting functionality
- Bug fixes and small improvements

### Manual Control

Use manual release for:
- **Minor versions**: New features, enhancements
- **Major versions**: Breaking changes, API redesigns
- **Custom changelog notes**: Detailed release descriptions

## Changelog Management

### Automatic Entries

The system automatically adds changelog entries with:
- Version number and date
- Change type based on version bump
- Generic description for automated releases

### Custom Entries

For manual releases, you can:
- Add detailed descriptions
- Document breaking changes
- List new features and improvements
- Include migration notes

### Format

All changelogs follow [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
## [1.2.0] - 2025-01-15

### Added
- New authentication provider for OAuth2
- Support for custom headers in requests

### Changed
- Improved error handling for network timeouts

### Fixed
- Race condition in token refresh logic

### ⚠️ BREAKING CHANGES
- Removed deprecated `connect()` method, use `initialize()` instead
```

## JSR Publishing

### Package Naming

All packages use the `@tundraconnect/` scope:
- Workspace: `stripe-connect` → Package: `@tundraconnect/stripe-connect`
- Installation: `deno add jsr:@tundraconnect/stripe-connect`

### Requirements

Before publishing, each workspace must have:
- ✅ Valid `deno.json` with name, version, exports
- ✅ `mod.ts` file as main entry point
- ✅ Tests passing (can be skipped with `--skip-tests`)
- ✅ Type checking successful
- ✅ Valid JSR package structure

### Publication Process

1. **Validation**: Check package structure and configuration
2. **Testing**: Run workspace tests and type checking
3. **Version Update**: Bump version in `deno.json`
4. **Changelog**: Update `CHANGELOG.md` with new version
5. **Publish**: Upload to JSR registry
6. **Release**: Create GitHub release with tag

## Troubleshooting

### Common Issues

**Publishing Fails**
```bash
# Check workspace structure
ls -la workspace-name/
# Verify deno.json is valid
deno check workspace-name/mod.ts
```

**Tests Fail**
```bash
# Run tests manually
cd workspace-name
deno test --allow-all
```

**Version Conflicts**
```bash
# Check current version
jq .version workspace-name/deno.json
# Check JSR registry for latest
```

**Workflow Permissions**
- Ensure `GITHUB_TOKEN` has write permissions
- Check repository settings for Actions permissions

### Manual Recovery

If automatic publishing fails:

1. **Local Fix**: Use local publishing script with `--dry-run`
2. **Manual Version**: Edit `deno.json` version manually
3. **Changelog Update**: Add manual changelog entry
4. **Force Publish**: Use manual release workflow

### Getting Help

- Check workflow logs in GitHub Actions
- Review JSR publishing documentation
- Use `--dry-run` to validate without publishing
- Test locally before triggering workflows
