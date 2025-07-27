# Surepass KYC API Client

A comprehensive TypeScript client for integrating with Surepass KYC (Know Your Customer) verification services. This client provides type-safe access to various verification endpoints including Aadhaar, PAN, bank accounts, company details, GSTIN, and name matching.

## Features

- 🔒 **Type-safe** - Full TypeScript support with runtime validation
- 🏗️ **Modular** - Built on the RESTler framework for consistent API interactions
- 🛡️ **Error Handling** - Comprehensive error handling with detailed error codes
- 📋 **Schema Validation** - Runtime response validation using Guardian schemas
- 🌍 **Environment Support** - Separate SANDBOX and PRODUCTION modes

## 🚀 Quick Start

```bash
# Install
deno add jsr:@tundraconnect/surepass
```

```typescript
import { Surepass } from '@tundraconnect/surepass';

// Initialize the client
const surepass = new Surepass({
  mode: 'SANDBOX', // or 'PRODUCTION'
  auth: 'your-jwt-token',
});

// Verify a PAN number
try {
  const panResult = await surepass.verifyPAN('ABCDE1234F');
  console.log('PAN verified:', panResult.name);
} catch (error) {
  console.error('Verification failed:', error.message);
}
```

## 📚 Documentation

- **[Complete Documentation](.docs/README.md)** - Full API documentation and guides

## 🔗 Links

- [JSR Package](https://jsr.io/@tundraconnect/surepass)
- [Official API Docs](https://app.surepass.app/docs)
- [GitHub Issues](https://github.com/TundraSoft/tundra-connect/issues)

## 📄 License

MIT License - see [LICENSE](../LICENSE) file for details.
