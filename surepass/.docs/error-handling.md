# Error Handling Guide

Comprehensive guide to handling errors when using the Surepass KYC API client.

## Table of Contents

- [Error Types](#error-types)
- [Error Codes](#error-codes)
- [Handling Strategies](#handling-strategies)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Error Types

### SurepassError

The primary error class thrown by the API client.

```typescript
class SurepassError extends Error {
  code: string; // Structured error code
  statusCode?: number; // HTTP status code
  response?: any; // Original API response

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    response?: any,
  ) {
    super(message);
    this.name = 'SurepassError';
    this.code = code;
    this.statusCode = statusCode;
    this.response = response;
  }
}
```

### Native JavaScript Errors

The client may also throw standard JavaScript errors for:

- Network connectivity issues
- JSON parsing errors
- Configuration errors

## Error Codes

### Authentication & Authorization

| Code            | Description                                             | Resolution               |
| --------------- | ------------------------------------------------------- | ------------------------ |
| `INVALID_TOKEN` | Invalid, expired, or insufficient permissions JWT token | Refresh or replace token |

### Input Validation

| Code                  | Description            | Resolution                          |
| --------------------- | ---------------------- | ----------------------------------- |
| `VERIFICATION_FAILED` | Data validation issues | Check input format and data quality |

### Business Logic

| Code                  | Description                        | Resolution                              |
| --------------------- | ---------------------------------- | --------------------------------------- |
| `RATE_LIMIT_EXCEEDED` | API rate limits exceeded           | Implement rate limiting and retry logic |
| `SERVICE_UNAVAILABLE` | Surepass services temporarily down | Retry after some time                   |

### System Errors

| Code                     | Description                  | Resolution                                      |
| ------------------------ | ---------------------------- | ----------------------------------------------- |
| `RESPONSE_ERROR`         | Invalid API response format  | Check API status, contact support if persistent |
| `PARSE_ERROR`            | Response parsing failed      | Verify response format                          |
| `UNHANDLED_ERROR`        | Generic unhandled error      | Check logs for underlying cause                 |
| `UNKNOWN_ERROR`          | Unknown error occurred       | Contact support with details                    |
| `UNKNOWN_RESPONSE_ERROR` | Unknown response status code | Check API documentation                         |

## Handling Strategies

### Basic Error Handling

```typescript
import { Surepass, SurepassError } from '@tundraconnect/surepass';

async function verifyPAN(panNumber: string) {
  try {
    const result = await surepass.verifyPAN(panNumber);
    return result;
  } catch (error) {
    if (error instanceof SurepassError) {
      console.error(`Surepass Error [${error.code}]: ${error.message}`);

      // Handle specific error cases
      switch (error.code) {
        case 'VERIFICATION_FAILED':
          throw new Error('Please provide a valid PAN number');
        case 'RATE_LIMIT_EXCEEDED':
          throw new Error('Too many requests. Please try again later');
        case 'SERVICE_UNAVAILABLE':
          throw new Error('Service temporarily unavailable');
        case 'INVALID_TOKEN':
          throw new Error('Authentication failed. Please check your token');
        default:
          throw new Error('Verification failed. Please try again');
      }
    } else {
      // Handle non-Surepass errors
      console.error('Unexpected error:', error);
      throw new Error('Service temporarily unavailable');
    }
  }
}
```

### Retry Logic

```typescript
async function verifyWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SurepassError) {
        // Don't retry on client errors (4xx)
        if (
          error.statusCode && error.statusCode >= 400 && error.statusCode < 500
        ) {
          if (error.code !== 'RATE_LIMIT_EXCEEDED') {
            throw error;
          }
        }

        // Retry on server errors or rate limits
        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff
        const waitTime = delay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        throw error;
      }
    }
  }

  throw new Error('Max retries exceeded');
}

// Usage
const result = await verifyWithRetry(() => surepass.verifyPAN('ABCDE1234F'));
```

### Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private failureThreshold = 5,
    private recoveryTimeout = 60000,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}

// Usage
const circuitBreaker = new CircuitBreaker();

async function verifyWithCircuitBreaker(panNumber: string) {
  return circuitBreaker.execute(() =>
    surepass.verifyPAN({ id_number: panNumber })
  );
}
```

### Rate Limiting

```typescript
class RateLimiter {
  private requests: number[] = [];

  constructor(
    private maxRequests: number = 10,
    private timeWindow: number = 60000, // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // Remove old requests outside time window
    this.requests = this.requests.filter((time) =>
      now - time < this.timeWindow
    );

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.timeWindow - (now - oldestRequest);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return this.execute(operation);
    }

    this.requests.push(now);
    return operation();
  }
}

// Usage
const rateLimiter = new RateLimiter(5, 60000); // 5 requests per minute

async function verifyWithRateLimit(panNumber: string) {
  return rateLimiter.execute(() =>
    surepass.verifyPAN({ id_number: panNumber })
  );
}
```

## Best Practices

### 1. Always Use Try-Catch

```typescript
// ✅ Good
async function verifyUser(data: any) {
  try {
    const result = await surepass.verifyPAN(data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ❌ Bad
async function verifyUser(data: any) {
  const result = await surepass.verifyPAN(data); // May throw unhandled error
  return result;
}
```

### 2. Check Error Types

```typescript
// ✅ Good
catch (error) {
  if (error instanceof SurepassError) {
    // Handle Surepass-specific errors
    handleSurepassError(error);
  } else if (error instanceof TypeError) {
    // Handle type errors
    handleTypeError(error);
  } else {
    // Handle other errors
    handleGenericError(error);
  }
}

// ❌ Bad
catch (error) {
  console.log(error.message); // May not exist on all error types
}
```

### 3. Log Errors Appropriately

```typescript
// ✅ Good
catch (error) {
  if (error instanceof SurepassError) {
    console.error(`Surepass API Error:`, {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      timestamp: new Date().toISOString()
    });
  }
}

// ❌ Bad
catch (error) {
  console.log(error); // Too verbose, may log sensitive data
}
```

### 4. Provide User-Friendly Messages

```typescript
function getUserFriendlyMessage(error: SurepassError): string {
  switch (error.code) {
    case 'INVALID_ID_NUMBER':
      return 'Please check the ID number format and try again';
    case 'INSUFFICIENT_BALANCE':
      return 'Service temporarily unavailable. Please try again later';
    case 'RATE_LIMIT':
      return 'Too many requests. Please wait a moment and try again';
    case 'SERVICE_UNAVAILABLE':
      return 'Service is temporarily down. Please try again in a few minutes';
    default:
      return 'An error occurred. Please try again';
  }
}
```

### 5. Implement Monitoring

```typescript
class ErrorMonitor {
  private errorCounts: Map<string, number> = new Map();
  
  recordError(error: SurepassError) {
    const key = `${error.code}:${error.statusCode}`;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);
    
    // Alert on critical errors
    if (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN") {
      this.alertCriticalError(error);
    }
  }
  
  private alertCriticalError(error: SurepassError) {
    // Send alert to monitoring system
    console.error("CRITICAL ERROR:", error);
  }
  
  getErrorStats() {
    return Object.fromEntries(this.errorCounts);
  }
}

const errorMonitor = new ErrorMonitor();

// Use in error handling
catch (error) {
  if (error instanceof SurepassError) {
    errorMonitor.recordError(error);
  }
  throw error;
}
```

## Examples

### Complete Error Handling Example

```typescript
import { Surepass, SurepassError } from '@tundrasoft/connect-surepass';

class VerificationService {
  private surepass: Surepass;
  private maxRetries = 3;

  constructor(token: string) {
    this.surepass = new Surepass({
      token,
      environment: 'production',
      timeout: 10000,
    });
  }

  async verifyPAN(panNumber: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
    errorCode?: string;
  }> {
    // Input validation
    if (!panNumber || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber)) {
      return {
        success: false,
        error: 'Invalid PAN format',
        errorCode: 'INVALID_INPUT',
      };
    }

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.surepass.verifyPAN({
          id_number: panNumber,
        });

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        if (error instanceof SurepassError) {
          // Don't retry on client errors (except rate limit)
          if (
            error.statusCode && error.statusCode >= 400 &&
            error.statusCode < 500
          ) {
            if (error.code !== 'RATE_LIMIT') {
              return {
                success: false,
                error: this.getUserFriendlyMessage(error),
                errorCode: error.code,
              };
            }
          }

          // Last attempt failed
          if (attempt === this.maxRetries) {
            return {
              success: false,
              error: this.getUserFriendlyMessage(error),
              errorCode: error.code,
            };
          }

          // Wait before retry (exponential backoff)
          await this.delay(1000 * Math.pow(2, attempt - 1));
        } else {
          // Non-Surepass error
          return {
            success: false,
            error: 'Service temporarily unavailable',
            errorCode: 'UNKNOWN_ERROR',
          };
        }
      }
    }

    return {
      success: false,
      error: 'Maximum retry attempts exceeded',
      errorCode: 'MAX_RETRIES_EXCEEDED',
    };
  }

  private getUserFriendlyMessage(error: SurepassError): string {
    const messages: Record<string, string> = {
      'INVALID_ID_NUMBER': 'Please provide a valid PAN number',
      'INSUFFICIENT_BALANCE': 'Service temporarily unavailable',
      'RATE_LIMIT': 'Too many requests. Please try again later',
      'SERVICE_UNAVAILABLE': 'Service is temporarily down',
      'UNAUTHORIZED': 'Authentication failed. Please contact support',
      'PAN_NOT_FOUND': 'PAN number not found in records',
    };

    return messages[error.code] || 'An error occurred. Please try again';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Usage
const verificationService = new VerificationService('your-jwt-token');

const result = await verificationService.verifyPAN('ABCDE1234F');
if (result.success) {
  console.log('PAN verified:', result.data);
} else {
  console.error('Verification failed:', result.error);
  console.error('Error code:', result.errorCode);
}
```

This comprehensive error handling approach ensures robust, user-friendly, and maintainable error management in your applications.
