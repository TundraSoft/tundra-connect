# Quick Start Guide

This guide will help you get up and running with the Surepass KYC API client in minutes.

## Prerequisites

- Deno 1.40+ or Node.js 18+
- Surepass API account
- API authentication token/JWT

## Installation

### For Deno Projects

```typescript
import { Surepass } from 'jsr:@tundrasoft/connect-surepass';
```

### For Node.js Projects

```bash
npm install @tundrasoft/connect-surepass
```

```typescript
import { Surepass } from '@tundrasoft/connect-surepass';
```

## Authentication

First, obtain your JWT token from Surepass:

1. Log into your Surepass dashboard
2. Navigate to API credentials
3. Generate or copy your JWT token
4. Store it securely (preferably in environment variables)

## Basic Setup

```typescript
import { Surepass } from '@tundraconnect/surepass';

// Initialize the client
const surepass = new Surepass({
  mode: 'sandbox', // or "PRODUCTION"
  auth: 'your-jwt-token-here',
});
```

## Your First Verification

Let's start with a basic PAN verification:

```typescript
try {
  const result = await surepass.verifyPAN('ABCDE1234F');

  console.log('PAN verification result:', result);
  console.log('Status:', result.status);
  console.log('Name:', result.name);
  console.log('Category:', result.category);
} catch (error) {
  if (error instanceof SurepassError) {
    console.error('Surepass error:', error.message);
    console.error('Error code:', error.code);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Common Verification Examples

### Bank Account Verification

```typescript
const bankResult = await surepass.verifyBankAccount(
  '1234567890', // account number
  'SBIN0001234', // IFSC code
);

console.log('Account exists:', bankResult.account_exists);
console.log('Account holder:', bankResult.full_name);
console.log('Bank name:', bankResult.ifsc_details.bank_name);
```

### Aadhaar Verification (Two-step process)

```typescript
// Step 1: Initiate verification
const initResult = await surepass.initiateAadhaar('123456789012');

console.log('OTP sent to:', initResult.mobile_number);

// Step 2: Verify with OTP (user provides OTP)
const verifyResult = await surepass.fetchAadhaar(
  initResult.client_id,
  '123456', // OTP received by user
);

console.log('Name:', verifyResult.name);
console.log('Address:', verifyResult.address);
```

### Company/GST Verification

```typescript
// Company verification
const companyResult = await surepass.verifyCIN('L72900DL2015PTC123456');
console.log('Company:', companyResult.company_name);

// GST verification
const gstResult = await surepass.verifyGSTIN('29ABCDE1234F1Z5');
console.log('Business:', gstResult.legal_name);
```

### Name Matching

```typescript
const nameResult = await surepass.compareNames(
  'Rahul Kumar',
  'Rahul Kumar Singh',
);

console.log('Match score:', nameResult.match_score);
console.log('Match status:', nameResult.match_status);
```

## Error Handling

The client provides structured error handling:

```typescript
import { Surepass, SurepassError } from '@tundraconnect/surepass';

try {
  const result = await surepass.verifyPAN('INVALID_PAN');
} catch (error) {
  if (error instanceof SurepassError) {
    console.error(`Error ${error.code}: ${error.message}`);

    // Handle specific error types
    switch (error.code) {
      case 'INVALID_TOKEN':
        console.log('Please check your authentication token');
        break;
      case 'RATE_LIMIT_EXCEEDED':
        console.log('Too many requests, please wait and retry');
        break;
      case 'SERVICE_UNAVAILABLE':
        console.log('Service temporarily down, please retry later');
        break;
      default:
        console.log('An unexpected error occurred');
    }
  }
}
```

## Environment Configuration

For production usage, always use environment variables:

```typescript
const surepass = new Surepass({
  mode: 'PRODUCTION',
  auth: Deno.env.get('SUREPASS_TOKEN') || process.env.SUREPASS_TOKEN,
  timeout: 10, // seconds
});
```

## Next Steps

- [API Reference](./api-reference.md) - Complete method documentation
- [Schema Reference](./schemas.md) - Input/output type definitions
- [Error Handling](./error-handling.md) - Detailed error handling guide
- [Best Practices](./best-practices.md) - Production recommendations
- [Examples](./examples.md) - Real-world usage examples

## Need Help?

- Check the [troubleshooting section](./best-practices.md#troubleshooting)
- Review the [Surepass API documentation](https://docs.surepass.io/)
- Open an [issue on GitHub](https://github.com/TundraSoft/tundra-connect/issues)
