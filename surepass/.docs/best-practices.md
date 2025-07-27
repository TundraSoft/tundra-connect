# Best Practices

Production-ready guidelines and recommendations for using the Surepass KYC API client effectively and securely.

## Table of Contents

- [Security](#security)
- [Performance](#performance)
- [Error Handling](#error-handling)
- [Monitoring & Logging](#monitoring--logging)
- [Testing](#testing)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

## Security

### Token Management

```typescript
// ✅ Good - Use environment variables
const surepass = new Surepass({
  token: process.env.SUREPASS_JWT_TOKEN,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
});

// ❌ Bad - Hardcoded tokens
const surepass = new Surepass({
  token: 'your-actual-jwt-token-here', // Never do this!
  environment: 'production',
});
```

### Data Privacy

```typescript
// ✅ Good - Sanitize logs
function sanitizeForLogging(data: any): any {
  const sensitive = ['id_number', 'account_number', 'otp', 'aadhaar'];
  const sanitized = { ...data };

  sensitive.forEach((field) => {
    if (sanitized[field]) {
      // Mask sensitive data
      sanitized[field] = `${sanitized[field].slice(0, 2)}****${
        sanitized[field].slice(-2)
      }`;
    }
  });

  return sanitized;
}

// Log sanitized data
console.log('Request data:', sanitizeForLogging(requestData));

// ❌ Bad - Logging sensitive data
console.log('Request data:', requestData); // Contains PAN, Aadhaar, etc.
```

### Input Validation

```typescript
const validators = {
  pan: (pan: string): boolean => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan),
  aadhaar: (aadhaar: string): boolean => /^[0-9]{12}$/.test(aadhaar),
  ifsc: (ifsc: string): boolean => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc),
  gstin: (gstin: string): boolean =>
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/.test(
      gstin,
    ),
};

function validateInput(type: keyof typeof validators, value: string): void {
  if (!validators[type](value)) {
    throw new Error(`Invalid ${type.toUpperCase()} format: ${value}`);
  }
}

// Use before API calls
validateInput('pan', panNumber);
const result = await surepass.verifyPAN({ id_number: panNumber });
```

## Performance

### Connection Pooling & Reuse

```typescript
// ✅ Good - Singleton pattern for client reuse
class SurepassService {
  private static instance: SurepassService;
  private surepass: Surepass;

  private constructor() {
    this.surepass = new Surepass({
      token: process.env.SUREPASS_TOKEN!,
      environment: 'production',
      timeout: 30, // Longer timeout for production
    });
  }

  static getInstance(): SurepassService {
    if (!SurepassService.instance) {
      SurepassService.instance = new SurepassService();
    }
    return SurepassService.instance;
  }

  getSurepassClient(): Surepass {
    return this.surepass;
  }
}

// Usage across your application
const surepassService = SurepassService.getInstance();
const client = surepassService.getSurepassClient();

// ❌ Bad - Creating new instances repeatedly
function verifyPAN(pan: string) {
  const surepass = new Surepass({ token: '...' }); // Inefficient!
  return surepass.verifyPAN({ id_number: pan });
}
```

### Batching & Rate Limiting

```typescript
class OptimizedVerificationService {
  private queue: Array<{
    request: any;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];

  private processing = false;
  private readonly batchSize = 5;
  private readonly batchDelay = 1000; // 1 second between batches

  constructor(private surepass: Surepass) {}

  async verifyPAN(panNumber: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        request: { type: 'pan', data: { id_number: panNumber } },
        resolve,
        reject,
      });

      this.processBatch();
    });
  }

  private async processBatch() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);

      const promises = batch.map(async ({ request, resolve, reject }) => {
        try {
          let result;
          switch (request.type) {
            case 'pan':
              result = await this.surepass.verifyPAN(request.data);
              break;
              // Add other verification types as needed
          }
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      await Promise.all(promises);

      // Wait before processing next batch
      if (this.queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.batchDelay));
      }
    }

    this.processing = false;
  }
}
```

### Caching Strategy

```typescript
interface CacheConfig {
  panTTL: number; // PAN data changes rarely
  bankTTL: number; // Bank account status can change
  aadhaarTTL: number; // Aadhaar data is sensitive, shorter TTL
  gstTTL: number; // GST status can change
}

class SmartCache {
  private cache = new Map<string, any>();
  private config: CacheConfig = {
    panTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
    bankTTL: 24 * 60 * 60 * 1000, // 1 day
    aadhaarTTL: 4 * 60 * 60 * 1000, // 4 hours
    gstTTL: 2 * 24 * 60 * 60 * 1000, // 2 days
  };

  getCacheKey(type: string, identifier: string): string {
    return `${type}:${identifier}`;
  }

  getTTL(type: string): number {
    switch (type) {
      case 'pan':
        return this.config.panTTL;
      case 'bank':
        return this.config.bankTTL;
      case 'aadhaar':
        return this.config.aadhaarTTL;
      case 'gst':
        return this.config.gstTTL;
      default:
        return 60 * 60 * 1000; // 1 hour default
    }
  }

  set(type: string, identifier: string, data: any): void {
    const key = this.getCacheKey(type, identifier);
    const ttl = this.getTTL(type);

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  get(type: string, identifier: string): any | null {
    const key = this.getCacheKey(type, identifier);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }
}
```

## Error Handling

### Structured Error Response

```typescript
interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
  requestId: string;
}

class VerificationAPI {
  async verifyPAN(panNumber: string): Promise<APIResponse> {
    const requestId = generateRequestId();

    try {
      const result = await surepass.verifyPAN({ id_number: panNumber });

      return {
        success: true,
        data: result.data,
        timestamp: new Date().toISOString(),
        requestId,
      };
    } catch (error) {
      console.error(`[${requestId}] PAN verification failed:`, error);

      if (error instanceof SurepassError) {
        return {
          success: false,
          error: {
            code: error.code,
            message: this.getUserFriendlyMessage(error.code),
            details: process.env.NODE_ENV === 'development'
              ? error.response
              : undefined,
          },
          timestamp: new Date().toISOString(),
          requestId,
        };
      }

      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
        timestamp: new Date().toISOString(),
        requestId,
      };
    }
  }

  private getUserFriendlyMessage(errorCode: string): string {
    const messages = {
      'INVALID_ID_NUMBER': 'Please provide a valid PAN number',
      'INSUFFICIENT_BALANCE': 'Service temporarily unavailable',
      'RATE_LIMIT': 'Too many requests. Please try again later',
      'UNAUTHORIZED': 'Service authentication failed',
    };

    return messages[errorCode] || 'Verification failed';
  }
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
```

### Circuit Breaker Implementation

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state = CircuitState.CLOSED;

  constructor(
    private failureThreshold = 5,
    private recoveryTimeout = 60000,
    private monitorWindow = 300000, // 5 minutes
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.shouldReject()) {
      throw new Error(`Circuit breaker is ${this.state}. Service unavailable.`);
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

  private shouldReject(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return false;
    }

    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.recoveryTimeout) {
        this.state = CircuitState.HALF_OPEN;
        return false;
      }
      return true;
    }

    return false; // HALF_OPEN allows one request
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}
```

## Monitoring & Logging

### Comprehensive Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

class LoggingVerificationService {
  private requestCounter = 0;

  async verifyPAN(panNumber: string): Promise<any> {
    const requestId = `pan_${++this.requestCounter}_${Date.now()}`;
    const startTime = Date.now();

    logger.info('PAN verification started', {
      requestId,
      panNumber: this.maskPAN(panNumber),
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await surepass.verifyPAN({ id_number: panNumber });
      const duration = Date.now() - startTime;

      logger.info('PAN verification completed', {
        requestId,
        duration,
        success: result.success,
        statusCode: result.status_code,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('PAN verification failed', {
        requestId,
        duration,
        error: error instanceof SurepassError
          ? {
            code: error.code,
            message: error.message,
            statusCode: error.statusCode,
          }
          : {
            message: error.message,
          },
      });

      throw error;
    }
  }

  private maskPAN(pan: string): string {
    if (pan.length < 6) return '****';
    return `${pan.slice(0, 2)}****${pan.slice(-2)}`;
  }
}
```

### Metrics Collection

```typescript
class MetricsCollector {
  private metrics = {
    requests: {
      total: 0,
      successful: 0,
      failed: 0,
      byErrorCode: new Map<string, number>(),
    },
    performance: {
      totalResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
    },
  };

  recordRequest(
    success: boolean,
    responseTime: number,
    errorCode?: string,
  ): void {
    this.metrics.requests.total++;

    if (success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
      if (errorCode) {
        const current = this.metrics.requests.byErrorCode.get(errorCode) || 0;
        this.metrics.requests.byErrorCode.set(errorCode, current + 1);
      }
    }

    // Update performance metrics
    this.metrics.performance.totalResponseTime += responseTime;
    this.metrics.performance.minResponseTime = Math.min(
      this.metrics.performance.minResponseTime,
      responseTime,
    );
    this.metrics.performance.maxResponseTime = Math.max(
      this.metrics.performance.maxResponseTime,
      responseTime,
    );
  }

  getMetrics() {
    const { requests, performance } = this.metrics;
    const avgResponseTime = requests.total > 0
      ? performance.totalResponseTime / requests.total
      : 0;

    return {
      requests: {
        total: requests.total,
        successful: requests.successful,
        failed: requests.failed,
        successRate: requests.total > 0
          ? requests.successful / requests.total
          : 0,
        errorBreakdown: Object.fromEntries(requests.byErrorCode),
      },
      performance: {
        averageResponseTime: avgResponseTime,
        minResponseTime: performance.minResponseTime === Infinity
          ? 0
          : performance.minResponseTime,
        maxResponseTime: performance.maxResponseTime,
      },
    };
  }

  reset(): void {
    this.metrics = {
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        byErrorCode: new Map(),
      },
      performance: {
        totalResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
      },
    };
  }
}

// Global metrics instance
const metricsCollector = new MetricsCollector();

// Expose metrics endpoint (Express example)
app.get('/metrics', (req, res) => {
  res.json(metricsCollector.getMetrics());
});
```

## Testing

### Test Environment Setup

```typescript
// test-setup.ts
import { afterAll, beforeAll } from 'vitest';

let testSurepass: Surepass;

beforeAll(async () => {
  // Use test credentials
  testSurepass = new Surepass({
    token: process.env.SUREPASS_TEST_TOKEN!,
    environment: 'sandbox',
    timeout: 30000, // Longer timeout for tests
  });
});

afterAll(async () => {
  // Cleanup if needed
});

export { testSurepass };
```

### Mock Implementation

```typescript
// __mocks__/@tundrasoft/connect-surepass.ts
export class MockSurepass {
  private responses = new Map();

  setMockResponse(method: string, input: any, response: any) {
    const key = `${method}:${JSON.stringify(input)}`;
    this.responses.set(key, response);
  }

  async verifyPAN(data: any) {
    const key = `verifyPAN:${JSON.stringify(data)}`;
    const response = this.responses.get(key);

    if (response) {
      if (response.error) {
        throw response.error;
      }
      return response;
    }

    // Default successful response
    return {
      success: true,
      status_code: 200,
      message: 'Success',
      data: {
        valid: true,
        name: 'TEST USER',
        category: 'Individual',
      },
    };
  }

  // Implement other methods similarly...
}

export const Surepass = MockSurepass;
```

### Test Utilities

```typescript
// test-utils.ts
export const testData = {
  validPAN: 'BNZAA2318J',
  invalidPAN: 'INVALID123',
  validAadhaar: '123456789012',
  validIFSC: 'SBIN0001234',
  validGSTIN: '29AABCU9603R1ZL',
};

export function createMockSurepassResponse(overrides: any = {}) {
  return {
    success: true,
    status_code: 200,
    message: 'Success',
    data: {},
    ...overrides,
  };
}

export function createMockSurepassError(code: string, message: string) {
  const error = new Error(message);
  (error as any).code = code;
  return error;
}
```

## Production Deployment

### Environment Configuration

```typescript
// config.ts
interface Config {
  surepass: {
    token: string;
    environment: 'sandbox' | 'production';
    timeout: number;
  };
  cache: {
    enabled: boolean;
    ttl: {
      pan: number;
      bank: number;
      aadhaar: number;
      gst: number;
    };
  };
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
  monitoring: {
    enabled: boolean;
    metricsEndpoint: boolean;
  };
}

const config: Config = {
  surepass: {
    token: process.env.SUREPASS_TOKEN!,
    environment: process.env.NODE_ENV === 'production'
      ? 'production'
      : 'sandbox',
    timeout: parseInt(process.env.SUREPASS_TIMEOUT || '15000'),
  },
  cache: {
    enabled: process.env.CACHE_ENABLED === 'true',
    ttl: {
      pan: parseInt(process.env.CACHE_PAN_TTL || '604800000'), // 7 days
      bank: parseInt(process.env.CACHE_BANK_TTL || '86400000'), // 1 day
      aadhaar: parseInt(process.env.CACHE_AADHAAR_TTL || '14400000'), // 4 hours
      gst: parseInt(process.env.CACHE_GST_TTL || '172800000'), // 2 days
    },
  },
  rateLimit: {
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'),
  },
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    metricsEndpoint: process.env.METRICS_ENDPOINT === 'true',
  },
};

export default config;
```

### Health Checks

```typescript
// health.ts
class HealthChecker {
  async checkSurepassConnectivity(): Promise<boolean> {
    try {
      // Use a lightweight operation to test connectivity
      await surepass.compareNames({
        name1: 'TEST',
        name2: 'TEST',
      });
      return true;
    } catch (error) {
      console.error('Surepass health check failed:', error);
      return false;
    }
  }

  async getHealthStatus() {
    const checks = {
      surepass: await this.checkSurepassConnectivity(),
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };

    const isHealthy = Object.values(checks).every((check) =>
      typeof check === 'boolean' ? check : true
    );

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      checks,
    };
  }
}

// Express health endpoint
app.get('/health', async (req, res) => {
  const healthChecker = new HealthChecker();
  const health = await healthChecker.getHealthStatus();

  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

## Troubleshooting

### Common Issues

#### 1. Token Expiry

```typescript
// Issue: JWT token expired
// Error: UNAUTHORIZED

// Solution: Implement token refresh
class TokenManager {
  private token: string | null = null;
  private expiryTime: number = 0;

  async getValidToken(): Promise<string> {
    if (!this.token || Date.now() >= this.expiryTime) {
      await this.refreshToken();
    }
    return this.token!;
  }

  private async refreshToken() {
    // Fetch new token from your auth service
    const newToken = await this.fetchTokenFromAuthService();
    this.token = newToken;
    this.expiryTime = Date.now() + (23 * 60 * 60 * 1000); // 23 hours
  }
}
```

#### 2. Rate Limiting

```typescript
// Issue: Too many requests
// Error: RATE_LIMIT

// Solution: Implement exponential backoff
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SurepassError && error.code === 'RATE_LIMIT') {
        if (attempt === maxRetries) throw error;

        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

#### 3. Network Timeouts

```typescript
// Issue: Requests timing out
// Error: TIMEOUT

// Solution: Adjust timeout and implement retry
const surepass = new Surepass({
  token: 'your-token',
  environment: 'production',
  timeout: 30000, // Increase timeout to 30 seconds
});

// Implement retry for network issues
async function reliableVerify(data: any, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await surepass.verifyPAN(data);
    } catch (error) {
      if (error.message.includes('timeout') && attempt < maxRetries) {
        console.log(`Attempt ${attempt} timed out, retrying...`);
        continue;
      }
      throw error;
    }
  }
}
```

### Debugging Checklist

1. **Check Environment Variables**
   ```bash
   echo $SUREPASS_TOKEN
   echo $NODE_ENV
   ```

2. **Verify Token Format**
   ```typescript
   // JWT should have 3 parts separated by dots
   const parts = token.split('.');
   console.log('Token parts:', parts.length); // Should be 3
   ```

3. **Test Connectivity**
   ```typescript
   // Simple connectivity test
   try {
     await surepass.compareNames({ name1: 'TEST', name2: 'TEST' });
     console.log('✅ Surepass API is reachable');
   } catch (error) {
     console.error('❌ Cannot reach Surepass API:', error);
   }
   ```

4. **Check Request/Response Format**
   ```typescript
   // Enable debug logging
   const surepass = new Surepass({
     token: 'your-token',
     environment: 'sandbox',
     // Add debug option if available
   });
   ```

5. **Monitor API Quotas**
   ```typescript
   // Track usage to avoid quota limits
   let requestCount = 0;
   const originalVerifyPAN = surepass.verifyPAN.bind(surepass);

   surepass.verifyPAN = async (data: any) => {
     requestCount++;
     console.log(`Request #${requestCount}`);
     return originalVerifyPAN(data);
   };
   ```

Following these best practices ensures robust, secure, and maintainable integration with the Surepass KYC API in production environments.
