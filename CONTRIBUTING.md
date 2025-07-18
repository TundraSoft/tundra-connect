# 🤝 Contributing to Tundra Connect

Thank you for your interest in contributing to Tundra Connect! This guide will help you get started with contributing to our API integration framework.

## 📋 Table of Contents

- [Getting Started](#-getting-started)
- [Development Workflow](#-development-workflow)
- [Code Guidelines](#-code-guidelines)
- [Issue Reporting](#-issue-reporting)
- [Pull Requests](#-pull-requests)
- [Publishing & Releases](#-publishing--releases)
- [Testing](#-testing)
- [Documentation](#-documentation)
- [Community Guidelines](#-community-guidelines)

## 🚀 Getting Started

### Prerequisites

- [Deno](https://deno.land/) v1.x or later
- Git
- Basic knowledge of TypeScript/JavaScript

### Setting Up Your Development Environment

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/tundra-connect.git
   cd tundra-connect
   ```

2. **Install Dependencies**
   ```bash
   # Cache dependencies
   deno cache mod.ts
   ```

3. **Verify Setup**
   ```bash
   # Run tests
   deno task test

   # Check formatting
   deno task check:fmt

   # Run linting
   deno task check:lint
   ```

## 🛠️ Development Workflow

### Working on a Connect

Tundra Connect uses a workspace-based architecture. Each connect should be developed in isolation.

1. **Create a Branch**
   ```bash
   # Use descriptive branch names that indicate the connect being worked on
   git checkout -b stripe-connect/add-payment-intents
   git checkout -b database-connect/fix-connection-pooling
   git checkout -b docs/update-auth-guide
   git checkout -b core/improve-error-handling
   ```

   **Branch Naming Convention**: `[connect-name]/[brief-description]`

2. **Create or Work on a Workspace**
   ```bash
   # Add a new workspace
   deno task workspace:add stripe-connect

   # Work in the specific connect directory
   cd stripe-connect/
   ```

3. **Develop Your Changes**
   - Follow the [architecture guidelines](#-architecture)
   - Write tests for your code
   - Update documentation as needed
   - Ensure type safety

4. **Test Your Changes**
   ```bash
   # Run all checks
   deno task check

   # Run tests
   deno task test

   # Test publishing (dry run)
   deno task publish:workspace -w your-workspace --dry-run
   ```

### Workspace Management

Our project uses automated workspace management:

```bash
# Add a new workspace
deno task workspace:add new-connect-name

# Remove a workspace
deno task workspace:remove old-connect-name

# Sync workspace configurations
deno task workspace:sync
```

## 📝 Code Guidelines

### TypeScript Standards

- **Strict Mode**: All code must pass TypeScript strict mode
- **Type Safety**: Use explicit types, avoid `any`
- **JSDoc**: Document all public APIs
- **Naming**: Use clear, descriptive names

### Code Style

- **Formatting**: Use `deno fmt` (2 spaces, single quotes)
- **Linting**: Pass `deno lint` without warnings
- **Imports**: Use JSR imports where possible

### Connect Structure

Each connect should follow this structure:

```typescript
// workspace-name/mod.ts
export class YourConnect extends BaseConnect {
  constructor(config: YourConfig) {
    super(config);
  }

  async yourMethod(data: InputData): Promise<OutputData> {
    try {
      // Implementation with proper error handling
      return result;
    } catch (error) {
      throw this.createError('OPERATION_FAILED', 'Description', error);
    }
  }
}

// Export types and interfaces
export type { InputData, OutputData, YourConfig };
```

### Required Files

Each workspace must include:

- ✅ `deno.json` - Workspace configuration
- ✅ `mod.ts` - Main entry point
- ✅ `README.md` - Usage documentation
- ✅ `CHANGELOG.md` - Version history
- ✅ `.docs/` - Detailed documentation folder
- ✅ Tests (`.test.ts` files)

### Documentation Structure

Each workspace includes a `.docs/` folder with:

- ✅ `index.md` - Documentation overview and navigation
- ✅ `getting-started.md` - Step-by-step tutorial
- ✅ `api-reference.md` - Complete API documentation
- ✅ `troubleshooting.md` - Common issues and solutions
- ✅ `examples/` - Code examples and use cases
- ✅ `guides/` - How-to guides and tutorials
- ✅ `assets/` - Images, diagrams, and media files

## 🐛 Issue Reporting

We use GitHub issue templates for structured reporting:

### Bug Reports & Enhancements

Use the **🐛 Bug Report / ✨ Enhancement Request** template for:

- Issues with existing connects
- Workflow improvements
- Performance problems
- Feature requests for existing connects

### New Connect Requests

Use the **🔌 New Connect Request** template for:

- Requesting new API integrations
- Suggesting new service connects
- Proposing new utility connects

### Documentation Issues

Use the **📚 Documentation Request** template for:

- Missing documentation
- Unclear explanations
- Tutorial requests
- API reference improvements

## 🔀 Pull Requests

### PR Guidelines

1. **One Connect Per PR**: Each PR should focus on a single connect
2. **Descriptive Titles**: Follow the format `[connect-name] Brief description`
3. **Complete Template**: Fill out our PR template completely
4. **Tests Required**: Include tests for new functionality
5. **Documentation**: Update relevant documentation

### PR Title Format

```
[workspace-name] Brief description

Examples:
[stripe-connect] Add webhook signature validation
[database-connect] Fix connection pooling issue
[docs] Update authentication guide
[core] Improve error handling system
```

### Automated Checks

All PRs are automatically validated for:

- ✅ **Title Format**: Semantic commit format validation
- ✅ **Code Quality**: Formatting and linting
- ✅ **Spell Check**: Documentation and comments
- ✅ **Auto-labeling**: Based on file changes
- ✅ **Tests**: All tests must pass

### Review Process

1. **Automated Checks**: Must pass all CI checks
2. **Code Review**: At least one maintainer review required
3. **Testing**: Manual testing for significant changes
4. **Documentation**: Verify documentation is updated

## 📦 Publishing & Releases

Tundra Connect uses automated publishing to JSR (JavaScript Registry).

### Automatic Publishing

When your PR is merged to `main`:

1. **Change Detection**: System detects which workspaces changed
2. **Version Bump**: Automatically increments patch version
3. **Changelog**: Updates `CHANGELOG.md` with release notes
4. **Testing**: Runs tests and type checking
5. **JSR Publishing**: Publishes to `@tundraconnect/workspace-name`
6. **GitHub Release**: Creates tagged release

### Manual Releases

For major/minor versions or custom releases:

1. **GitHub Actions**: Go to Actions → Manual Release
2. **Select Options**:
   - Workspace (specific or all)
   - Version type (patch/minor/major)
   - Custom changelog notes
3. **Trigger Release**: Click "Run workflow"

### Local Testing

Test publishing locally before submitting:

```bash
# Validate package structure
deno task publish:workspace -w your-workspace --dry-run

# Test with custom version
deno task publish:workspace -w your-workspace -t minor --dry-run

# Check all workspaces
deno task publish:workspace --all --dry-run
```

### Version Guidelines

- **Patch** (0.1.0 → 0.1.1): Bug fixes, small improvements
- **Minor** (0.1.0 → 0.2.0): New features, backward compatible
- **Major** (0.1.0 → 1.0.0): Breaking changes

## 🧪 Testing

### Test Requirements

- **Unit Tests**: Test individual functions and methods
- **Integration Tests**: Test connect functionality end-to-end
- **Type Tests**: Verify TypeScript types work correctly
- **Coverage**: Aim for >75% code coverage

### Writing Tests

```typescript
// your-workspace/test.ts
import { assertEquals, assertRejects } from '$asserts';
import { YourConnect } from './mod.ts';

Deno.test('YourConnect - should handle valid input', async () => {
  const connect = new YourConnect({ apiKey: 'test' });
  const result = await connect.yourMethod({ data: 'test' });
  assertEquals(result.success, true);
});

Deno.test('YourConnect - should reject invalid input', async () => {
  const connect = new YourConnect({ apiKey: 'test' });
  await assertRejects(
    () => connect.yourMethod({ data: '' }),
    Error,
    'Invalid input',
  );
});
```

### Running Tests

```bash
# Run all tests
deno task test

# Run specific workspace tests
cd your-workspace && deno test --allow-all

# Run with coverage
deno task test:run
deno task test:report
```

## 📚 Documentation

### Documentation Standards

Each connect must include comprehensive documentation:

1. **README.md**: Basic usage, quick start, links to detailed docs
2. **`.docs/` folder**: Complete documentation structure
3. **JSDoc Comments**: Inline code documentation
4. **Examples**: Working code samples in `.docs/examples/`
5. **Guides**: How-to documentation in `.docs/guides/`

### Documentation Tools

Use our documentation tools for validation and publishing:

```bash
# Validate documentation completeness
deno task docs:validate

# Check for broken links
deno task docs:links

# Generate documentation index
deno task docs:index

# Generate wiki content
deno task docs:wiki

# Generate for specific workspace
deno task docs:wiki --workspace your-workspace
```

### Automated Wiki Publishing

Documentation is automatically published to the GitHub Wiki when:

- Changes are made to `.docs/` folders
- README.md files are updated
- Documentation files are modified

The system automatically:

- ✅ Validates documentation structure
- ✅ Checks for broken links
- ✅ Generates wiki-formatted content
- ✅ Updates the GitHub Wiki
- ✅ Creates documentation index

### Documentation Style

- **Clear Examples**: Show real-world usage
- **Type Information**: Document all parameters and return types
- **Error Handling**: Explain possible errors and solutions
- **Configuration**: Document all configuration options

### Example Documentation

````typescript
/**
 * Creates a payment using the Stripe API
 * 
 * @param data - Payment data including amount, currency, and customer
 * @param options - Optional configuration for the payment
 * @returns Promise that resolves to the created payment object
 * 
 * @throws {ConnectError} When payment creation fails
 * @throws {ValidationError} When input data is invalid
 * 
 * @example
 * ```typescript
 * const payment = await stripeConnect.createPayment({
 *   amount: 2000,
 *   currency: 'usd',
 *   customer: 'cus_123'
 * });
 * ```
 */
async createPayment(
  data: PaymentData,
  options?: PaymentOptions
): Promise<Payment> {
  // Implementation
}
````

## 🏗️ Architecture

### Core Framework

All connects must extend the `BaseConnect` class:

```typescript
import { BaseConnect } from '../core/base.ts';

export class YourConnect extends BaseConnect {
  constructor(config: YourConfig) {
    super(config);
  }

  // Your implementation
}
```

### Error Handling

Use the standardized error system:

```typescript
// Create typed errors
throw this.createError(
  'API_ERROR',
  'Failed to connect to service',
  originalError,
);

// Handle retries
const result = await this.retry(
  () => this.apiCall(),
  { maxAttempts: 3, backoff: 'exponential' },
);
```

### Configuration

Follow the configuration pattern:

```typescript
export interface YourConfig extends BaseConfig {
  apiKey: string;
  endpoint?: string;
  timeout?: number;
}
```

## 🌟 Community Guidelines

### Code of Conduct

- **Be Respectful**: Treat all contributors with respect
- **Be Helpful**: Help others learn and contribute
- **Be Patient**: Remember that everyone is learning
- **Be Inclusive**: Welcome contributors from all backgrounds

### Communication

- **GitHub Discussions**: General questions and community topics
- **Issues**: Bug reports and feature requests
- **PRs**: Code contributions and reviews
- **Discord**: Real-time community chat (if available)

### Recognition

Contributors are recognized through:

- **GitHub Contributors**: Listed in repository
- **Release Notes**: Mentioned in changelog
- **Community Highlights**: Featured in discussions

## 🔧 Advanced Topics

### Custom Workflows

For complex integrations, you may need to:

- Add custom GitHub Actions workflows
- Update workspace management tools
- Modify publishing configurations

### Dependency Management

- **JSR Packages**: Prefer JSR for Deno-specific packages
- **External APIs**: Use proven HTTP libraries
- **Testing**: Use standard Deno testing utilities

### Performance Considerations

- **Async/Await**: Use proper async patterns
- **Resource Management**: Clean up connections and resources
- **Caching**: Implement appropriate caching strategies
- **Rate Limiting**: Respect API rate limits

## 🆘 Getting Help

### Before Asking for Help

1. **Check Documentation**: Read existing docs and examples
2. **Search Issues**: Look for similar problems
3. **Review Code**: Check existing connects for patterns

### Where to Get Help

- **GitHub Discussions**: Community support
- **Issues**: Bug reports and feature requests
- **Discord**: Real-time community chat
- **Email**: Direct contact for sensitive issues

### Providing Context

When asking for help, include:

- **Environment**: Deno version, OS, etc.
- **Code**: Minimal reproducible example
- **Error Messages**: Complete error logs
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens

---

Thank you for contributing to Tundra Connect! Your contributions help make API integrations easier for the entire Deno community. 🚀

**Happy coding!** ❤️
