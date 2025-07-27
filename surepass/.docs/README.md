# Surepass KYC API Client Documentation

Welcome to the comprehensive documentation for the Surepass KYC API Client. This documentation provides detailed information about all features, APIs, schemas, and usage patterns.

## Table of Contents

- [Quick Start Guide](./quick-start.md)
- [API Reference](./api-reference.md)
- [Schema Documentation](./schemas.md)
- [Error Handling](./error-handling.md)
- [Examples](./examples.md)
- [Best Practices](./best-practices.md)

## Overview

The Surepass KYC API Client is a comprehensive TypeScript library for integrating with Surepass Know Your Customer (KYC) verification services. It provides:

- **Type-safe API interactions** with full TypeScript support
- **Runtime schema validation** using Guardian schemas
- **Comprehensive error handling** with detailed error codes
- **Multiple verification types** including Aadhaar, PAN, bank accounts, and more
- **Environment support** for both sandbox and production

## Supported Verification Types

| Verification Type | Description                           | Method                                 |
| ----------------- | ------------------------------------- | -------------------------------------- |
| **Name Matching** | Compare two names for similarity      | `compareNames()`                       |
| **Bank Account**  | Verify bank account details           | `verifyBankAccount()`                  |
| **PAN Card**      | Comprehensive PAN verification        | `verifyPAN()`                          |
| **Aadhaar**       | Two-step OTP-based verification       | `initiateAadhaar()` + `fetchAadhaar()` |
| **Company (CIN)** | Corporate identification verification | `verifyCIN()`                          |
| **GSTIN**         | Tax identification verification       | `verifyGSTIN()`                        |

## Quick Example

```typescript
import { Surepass } from '@tundraconnect/surepass';

const surepass = new Surepass({
  mode: 'SANDBOX',
  auth: 'your-jwt-token'
});

// Verify a PAN number
try {
  const result = await surepass.verifyPAN('ABCDE1234F');
  console.log('PAN Status:', result.status);
  console.log('Name:', result.name);
} catch (error) {
  if (error instanceof SurepassError) {
    console.error('Error:', error.code, error.message);
  }
}
  console.error('Verification failed:', error.message);
}
```

## Getting Started

1. **Installation**: Add the package to your project
2. **Authentication**: Obtain JWT token from Surepass
3. **Configuration**: Initialize client with appropriate environment
4. **Verification**: Call the relevant verification methods

For detailed setup instructions, see the [Quick Start Guide](./quick-start.md).

## Support

- **API Documentation**: [Surepass Official Docs](https://docs.surepass.io/)
- **Issues**: [GitHub Issues](https://github.com/TundraSoft/tundra-connect/issues)
- **Type Definitions**: Full TypeScript support with intellisense
- **Schema Validation**: Runtime validation with detailed error messages

## License

This package is part of the TundraConnect suite of API clients and is released under the MIT License.

### `OutputData`

```typescript
interface OutputData {
  // TODO: Define your output types
}
```

## ⚠️ Error Handling

All methods can throw the following errors:

- `ValidationError` - Input validation failed
- `APIError` - API request failed
- `TimeoutError` - Request timed out
- `AuthenticationError` - Invalid credentials

```typescript
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
```

## 🔗 Links

- [JSR Package](https://jsr.io/@tundraconnect/surepass)
- [Official API Docs](https://app.surepass.app/docs) <!-- TODO: Update with actual service docs -->
- [GitHub Issues](https://github.com/TundraSoft/tundra-connect/issues)
- [Main Project Documentation](../README.md)

## 📄 License

MIT License - see [LICENSE](../../LICENSE) file for details.
