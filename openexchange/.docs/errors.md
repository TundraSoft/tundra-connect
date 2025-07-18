# ❌ Error Handling Documentation

This document provides comprehensive information about error handling in the OpenExchange Connect client library.

## 📑 Table of Contents

- [Overview](#overview)
- [OpenExchangeError Class](#openexchangeerror-class)
- [Error Codes](#error-codes)
- [Error Handling Patterns](#error-handling-patterns)
- [HTTP Status Code Mapping](#http-status-code-mapping)
- [Examples](#examples)
- [Best Practices](#best-practices)

## 🔍 Overview

The OpenExchange Connect client uses a structured error handling system with the `OpenExchangeError` class. All errors thrown by the client are instances of this class, providing consistent error information and metadata.

## 🏗️ OpenExchangeError Class

The `OpenExchangeError` class extends the base `BaseError` class and provides OpenExchange-specific error handling.

### Class Structure

```typescript
class OpenExchangeError<
  M extends { originalCode?: string } & Record<string, unknown>,
> extends BaseError<M> {
  constructor(code: string, meta?: M, cause?: Error);
}
```

### Properties

- **`message`**: Human-readable error message
- **`code`**: Error code identifier
- **`metadata`**: Additional error context and data
- **`cause`**: Original error that caused this error (if any)
- **`timestamp`**: When the error occurred

### Error Message Format

All error messages follow this template:

```
[OpenExchange] ${timestamp}: ${message}
```

Example:

```
[OpenExchange] 2023-01-01T12:00:00.000Z: Invalid application ID provided (expired or de-activated application id).
```

## 📋 Error Codes

### Configuration Errors

#### CONFIG_INVALID_APP_ID

**Message**: "Application ID must be a non-empty string."
**Cause**: Empty or invalid app ID provided during client initialization
**Solution**: Provide a valid app ID from OpenExchange Rates

```typescript
// ❌ Invalid
const client = new OpenExchange({ appId: '' });

// ✅ Valid
const client = new OpenExchange({ appId: 'your-app-id-here' });
```

#### CONFIG_INVALID_BASE_CURRENCY

**Message**: "Base currency must be a 3-character string, got ${baseCurrency}."
**Cause**: Invalid base currency format provided
**Solution**: Use a valid 3-letter currency code

```typescript
// ❌ Invalid
const client = new OpenExchange({
  appId: 'your-app-id',
  baseCurrency: 'INVALID',
});

// ✅ Valid
const client = new OpenExchange({
  appId: 'your-app-id',
  baseCurrency: 'EUR',
});
```

### API Errors

#### MISSING_APP_ID

**Message**: "Application ID is required for the API request."
**HTTP Status**: 400
**Cause**: API request made without app ID
**Solution**: Ensure app ID is properly configured

#### INVALID_APP_ID

**Message**: "Invalid application ID provided (expired or de-activated application id)."
**HTTP Status**: 401
**Cause**: App ID is invalid, expired, or deactivated
**Solution**: Check your app ID and account status

#### NOT_ALLOWED

**Message**: "This operation is not allowed with the current application ID."
**HTTP Status**: 403, 429
**Cause**: Feature not available on current plan or rate limit exceeded
**Solution**: Upgrade plan or wait for rate limit reset

#### NOT_FOUND

**Message**: "The requested resource was not found."
**HTTP Status**: 404
**Cause**: Invalid endpoint or resource not available
**Solution**: Check API documentation and endpoint URLs

#### RESPONSE_ERROR

**Message**: "Got an invalid response/response status: ${status} from Open Exchange API."
**Cause**: Unexpected response format or status code
**Solution**: Check API status and response format

#### SERVICE_UNAVAILABLE

**Message**: "Open Exchange service is currently unavailable."
**Cause**: API service is temporarily down
**Solution**: Retry after some time

### Unknown Errors

#### UNKNOWN_ERROR

**Message**: "An unknown error occurred in Open Exchange."
**Cause**: Unexpected error condition
**Solution**: Check error metadata for more details

## 🔄 Error Handling Patterns

### Basic Error Handling

```typescript
import {
  OpenExchange,
  OpenExchangeError,
} from 'jsr:@tundraconnect/openexchange';

const client = new OpenExchange({
  appId: 'your-app-id-here',
});

try {
  const rates = await client.getRates();
  console.log('Rates:', rates);
} catch (error) {
  if (error instanceof OpenExchangeError) {
    console.error('OpenExchange Error:', error.message);
    console.error('Error Code:', error.code);
    console.error('Metadata:', error.metadata);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Specific Error Code Handling

```typescript
try {
  const rates = await client.getRates();
} catch (error) {
  if (error instanceof OpenExchangeError) {
    switch (error.code) {
      case 'INVALID_APP_ID':
        console.error('Invalid app ID. Please check your credentials.');
        break;
      case 'NOT_ALLOWED':
        console.error('Feature not available on your plan.');
        break;
      case 'RESPONSE_ERROR':
        console.error('API response error. Please try again.');
        break;
      default:
        console.error('Unknown error:', error.message);
    }
  }
}
```

### Retry Logic for Temporary Errors

```typescript
async function getRatesWithRetry(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.getRates();
    } catch (error) {
      if (error instanceof OpenExchangeError) {
        // Retry on temporary errors
        if (
          error.code === 'SERVICE_UNAVAILABLE' ||
          error.code === 'RESPONSE_ERROR'
        ) {
          if (attempt < maxRetries) {
            console.log(`Attempt ${attempt} failed, retrying...`);
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            continue;
          }
        }
      }
      throw error; // Re-throw if not retryable or max attempts reached
    }
  }
}
```

## 🌐 HTTP Status Code Mapping

| HTTP Status | Error Code            | Description                         |
| ----------- | --------------------- | ----------------------------------- |
| 400         | `MISSING_APP_ID`      | Missing application ID              |
| 401         | `INVALID_APP_ID`      | Invalid or expired app ID           |
| 403         | `NOT_ALLOWED`         | Feature not allowed on current plan |
| 404         | `NOT_FOUND`           | Resource not found                  |
| 429         | `NOT_ALLOWED`         | Rate limit exceeded                 |
| 500+        | `SERVICE_UNAVAILABLE` | Server error or service unavailable |

## 📝 Examples

### Complete Error Handling Example

```typescript
import {
  OpenExchange,
  OpenExchangeError,
} from 'jsr:@tundraconnect/openexchange';

class ExchangeRateService {
  private client: OpenExchange;

  constructor(appId: string) {
    try {
      this.client = new OpenExchange({
        appId,
        baseCurrency: 'USD',
        timeout: 30,
      });
    } catch (error) {
      if (error instanceof OpenExchangeError) {
        throw new Error(`Failed to initialize client: ${error.message}`);
      }
      throw error;
    }
  }

  async getCurrentRates(
    currencies?: string[],
  ): Promise<Record<string, number>> {
    try {
      const options = currencies ? { symbols: currencies } : undefined;
      return await this.client.getRates(options);
    } catch (error) {
      if (error instanceof OpenExchangeError) {
        switch (error.code) {
          case 'INVALID_APP_ID':
            throw new Error(
              'Invalid API credentials. Please check your app ID.',
            );
          case 'NOT_ALLOWED':
            throw new Error(
              'Rate limit exceeded or feature not available on your plan.',
            );
          case 'SERVICE_UNAVAILABLE':
            throw new Error(
              'Exchange rate service is temporarily unavailable.',
            );
          default:
            throw new Error(`Exchange rate error: ${error.message}`);
        }
      }
      throw error;
    }
  }

  async convertCurrency(
    amount: number,
    from: string,
    to: string,
  ): Promise<number> {
    try {
      const conversion = await this.client.convert(amount, from, to);
      return conversion.result;
    } catch (error) {
      if (error instanceof OpenExchangeError) {
        if (error.code === 'NOT_ALLOWED') {
          // Fall back to manual conversion using rates
          const rates = await this.getCurrentRates([from, to]);
          if (from === 'USD') {
            return amount * rates[to];
          } else if (to === 'USD') {
            return amount / rates[from];
          } else {
            // Convert via USD
            const usdAmount = amount / rates[from];
            return usdAmount * rates[to];
          }
        }
        throw new Error(`Conversion failed: ${error.message}`);
      }
      throw error;
    }
  }
}

// Usage
const service = new ExchangeRateService('your-app-id');

try {
  const rates = await service.getCurrentRates(['EUR', 'GBP']);
  console.log('Current rates:', rates);

  const converted = await service.convertCurrency(100, 'USD', 'EUR');
  console.log('Converted amount:', converted);
} catch (error) {
  console.error('Service error:', error.message);
}
```

### Error Logging and Monitoring

```typescript
class ErrorLogger {
  static logOpenExchangeError(error: OpenExchangeError, context: string) {
    const errorInfo = {
      timestamp: new Date().toISOString(),
      context,
      code: error.code,
      message: error.message,
      metadata: error.metadata,
      stack: error.stack,
    };

    // Log to your monitoring service
    console.error('OpenExchange Error:', JSON.stringify(errorInfo, null, 2));

    // Send to error tracking service (e.g., Sentry, Rollbar)
    // errorTracker.captureException(error, { extra: errorInfo });
  }
}

// Usage
try {
  const rates = await client.getRates();
} catch (error) {
  if (error instanceof OpenExchangeError) {
    ErrorLogger.logOpenExchangeError(error, 'getRates');
  }
  throw error;
}
```

## 🎯 Best Practices

### 1. Always Check Error Types

```typescript
// ✅ Good
if (error instanceof OpenExchangeError) {
  // Handle OpenExchange-specific errors
}

// ❌ Bad
if (error.code === 'INVALID_APP_ID') {
  // Might fail if error is not an OpenExchangeError
}
```

### 2. Use Specific Error Handling

```typescript
// ✅ Good - Handle specific error codes
switch (error.code) {
  case 'INVALID_APP_ID':
    // Handle authentication error
    break;
  case 'NOT_ALLOWED':
    // Handle permission/rate limit error
    break;
  default:
    // Handle other errors
}

// ❌ Bad - Generic error handling
console.error('Error:', error.message);
```

### 3. Provide User-Friendly Messages

```typescript
// ✅ Good
function getUserFriendlyMessage(error: OpenExchangeError): string {
  switch (error.code) {
    case 'INVALID_APP_ID':
      return 'Authentication failed. Please check your API credentials.';
    case 'NOT_ALLOWED':
      return 'Rate limit exceeded. Please try again later.';
    case 'SERVICE_UNAVAILABLE':
      return 'Exchange rate service is temporarily unavailable.';
    default:
      return 'An error occurred while fetching exchange rates.';
  }
}
```

### 4. Implement Retry Logic

```typescript
// ✅ Good - Retry on temporary errors
const retryableErrors = ['SERVICE_UNAVAILABLE', 'RESPONSE_ERROR'];

if (
  error instanceof OpenExchangeError && retryableErrors.includes(error.code)
) {
  // Implement retry logic
}
```

### 5. Log Error Details

```typescript
// ✅ Good - Log detailed error information
console.error('OpenExchange Error:', {
  code: error.code,
  message: error.message,
  metadata: error.metadata,
  timestamp: new Date().toISOString(),
});
```

## 🔗 Related Files

- [`./README.md`](./README.md) - Main documentation
- [`./schemas.md`](./schemas.md) - Schema documentation
