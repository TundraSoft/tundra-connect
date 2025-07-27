# Examples

Real-world usage examples and implementation patterns for the Surepass KYC API client.

## Table of Contents

- [Basic Examples](#basic-examples)
- [Advanced Patterns](#advanced-patterns)
- [Production Use Cases](#production-use-cases)
- [Integration Examples](#integration-examples)
- [Testing Examples](#testing-examples)

## Basic Examples

### Simple PAN Verification

```typescript
import { Surepass, SurepassError } from '@tundraconnect/surepass';

const surepass = new Surepass({
  mode: 'SANDBOX',
  auth: 'your-jwt-token',
});

async function verifyPAN(panNumber: string) {
  try {
    const result = await surepass.verifyPAN(panNumber);

    console.log(`✅ PAN ${panNumber} verified`);
    console.log(`   Holder: ${result.pan_details.full_name}`);
    console.log(`   Category: ${result.pan_details.category}`);
    console.log(`   DOB Verified: ${result.pan_details.dob_verified}`);
    return true;
  } catch (error) {
    if (error instanceof SurepassError) {
      console.error(`Error: ${error.message} (${error.code})`);
    }
    return false;
  }
}

// Usage
await verifyPAN('ABCDE1234F');
```

### Bank Account Verification

```typescript
async function verifyBankAccount(
  accountNumber: string,
  ifsc: string,
) {
  try {
    const result = await surepass.verifyBankAccount(
      accountNumber,
      ifsc,
    );

    return {
      valid: result.account_exists,
      accountHolder: result.full_name,
      bankName: result.ifsc_details?.bank_name,
    };
  } catch (error) {
    console.error('Bank verification failed:', error);
    return { valid: false, error: error.message };
  }
}

// Usage
const bankResult = await verifyBankAccount('1234567890', 'SBIN0001234');

console.log(bankResult);
```

### Complete Aadhaar Verification Flow

```typescript
async function completeAadhaarVerification(aadhaarNumber: string) {
  try {
    // Step 1: Initiate verification
    console.log('🔄 Initiating Aadhaar verification...');
    const initResult = await surepass.initiateAadhaar(aadhaarNumber);

    if (!initResult.client_id) {
      throw new Error('Failed to initiate Aadhaar verification');
    }

    console.log(`📱 OTP sent to: ${initResult.mobile_number}`);

    // Step 2: Get OTP from user (in real app, this would be from UI)
    const otp = await getUserOTPInput(); // Implement this function

    // Step 3: Complete verification
    console.log('🔄 Verifying OTP...');
    const verifyResult = await surepass.fetchAadhaar(
      initResult.client_id,
      otp,
    );

    console.log('✅ Aadhaar verification successful!');
    console.log(`   Name: ${verifyResult.name}`);
    console.log(`   DOB: ${verifyResult.date_of_birth}`);
    console.log(`   Gender: ${verifyResult.gender}`);

    return {
      success: true,
      data: verifyResult,
    };
  } catch (error) {
    console.error('Aadhaar verification failed:', error);
    return { success: false, error: error.message };
  }
}

// Mock function - replace with actual UI implementation
async function getUserOTPInput(): Promise<string> {
  // In a real application, this would prompt the user for OTP
  return '123456';
}
```

## Advanced Patterns

### Bulk Verification Service

```typescript
class BulkVerificationService {
  private surepass: Surepass;
  private concurrency: number;
  private rateLimiter: RateLimiter;

  constructor(
    options: {
      mode: 'SANDBOX' | 'PRODUCTION';
      auth: string;
      concurrency?: number;
    } = { mode: 'SANDBOX', auth: '' },
  ) {
    this.surepass = new Surepass({
      mode: options.mode,
      auth: options.auth,
    });
    this.concurrency = options.concurrency || 5;
    this.rateLimiter = new RateLimiter(10, 60000); // 10 requests per minute
  }

  async verifyMultiplePANs(
    panNumbers: string[],
  ): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];

    // Process in batches to respect rate limits
    for (let i = 0; i < panNumbers.length; i += this.concurrency) {
      const batch = panNumbers.slice(i, i + this.concurrency);

      const batchPromises = batch.map(async (pan, index) => {
        await this.rateLimiter.wait();

        try {
          const result = await this.surepass.verifyPAN(pan);
          return {
            pan,
            success: true,
            data: result,
            index: i + index,
          };
        } catch (error) {
          return {
            pan,
            success: false,
            error: error instanceof SurepassError
              ? error.code
              : 'UNKNOWN_ERROR',
            index: i + index,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Progress callback
      console.log(
        `Processed ${
          Math.min(i + this.concurrency, panNumbers.length)
        }/${panNumbers.length} PANs`,
      );
    }

    return results.sort((a, b) => a.index - b.index);
  }
}

interface VerificationResult {
  pan: string;
  success: boolean;
  data?: any;
  error?: string;
  index: number;
}

class RateLimiter {
  private queue: Array<() => void> = [];
  private requests: number[] = [];

  constructor(private maxRequests: number, private timeWindow: number) {}

  async wait(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.queue.length === 0) return;

    const now = Date.now();
    this.requests = this.requests.filter((time) =>
      now - time < this.timeWindow
    );

    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      const resolve = this.queue.shift()!;
      resolve();

      // Process next item if available
      setTimeout(() => this.processQueue(), 0);
    } else {
      // Wait for the oldest request to expire
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.timeWindow - (now - oldestRequest);
      setTimeout(() => this.processQueue(), waitTime);
    }
  }
}

// Usage
const bulkService = new BulkVerificationService({
  mode: 'PRODUCTION',
  auth: 'your-jwt-token',
});
const results = await bulkService.verifyMultiplePANs([
  'ABCDE1234F',
  'BCDEF2345G',
  'CDEFG3456H',
]);

console.log('Verification results:', results);
```

### Verification Cache with TTL

```typescript
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

class VerificationCache {
  private cache = new Map<string, CacheEntry>();

  constructor(private defaultTTL = 24 * 60 * 60 * 1000) {} // 24 hours

  set(key: string, data: any, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

class CachedVerificationService {
  private surepass: Surepass;
  private cache: VerificationCache;

  constructor(options: { mode: 'SANDBOX' | 'PRODUCTION'; auth: string }) {
    this.surepass = new Surepass(options);
    this.cache = new VerificationCache();

    // Cleanup expired entries every hour
    setInterval(() => this.cache.cleanup(), 60 * 60 * 1000);
  }

  async verifyPAN(panNumber: string, useCache = true): Promise<any> {
    const cacheKey = `pan:${panNumber}`;

    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        console.log('📄 Using cached result for PAN:', panNumber);
        return cached;
      }
    }

    console.log('🔄 Fetching fresh data for PAN:', panNumber);
    const result = await this.surepass.verifyPAN(panNumber);

    // Cache the result for 24 hours
    this.cache.set(cacheKey, result, 24 * 60 * 60 * 1000);

    return result;
  }
}

// Usage
const cachedService = new CachedVerificationService({
  mode: 'PRODUCTION',
  auth: 'your-jwt-token',
});
const result1 = await cachedService.verifyPAN('ABCDE1234F'); // Fresh API call
const result2 = await cachedService.verifyPAN('ABCDE1234F'); // From cache
```

## Production Use Cases

### KYC Onboarding Flow

```typescript
interface UserKYCData {
  pan: string;
  aadhaar: string;
  bankAccount: {
    number: string;
    ifsc: string;
  };
  companyGSTIN?: string;
}

interface KYCResult {
  panVerified: boolean;
  aadhaarVerified: boolean;
  bankVerified: boolean;
  gstVerified?: boolean;
  overallStatus: 'PENDING' | 'PARTIAL' | 'COMPLETE' | 'FAILED';
  details: any;
}

class KYCOnboardingService {
  private surepass: Surepass;

  constructor(options: { mode: 'SANDBOX' | 'PRODUCTION'; auth: string }) {
    this.surepass = new Surepass({
      ...options,
      timeout: 15,
    });
  }

  async performKYC(userData: UserKYCData): Promise<KYCResult> {
    const result: KYCResult = {
      panVerified: false,
      aadhaarVerified: false,
      bankVerified: false,
      overallStatus: 'PENDING',
      details: {},
    };

    try {
      // Step 1: Verify PAN
      console.log('🔄 Verifying PAN...');
      const panResult = await this.surepass.verifyPAN(userData.pan);

      result.panVerified = !!panResult.pan_details.full_name;
      result.details.pan = panResult;

      if (!result.panVerified) {
        result.overallStatus = 'FAILED';
        return result;
      }

      // Step 2: Verify Aadhaar (requires OTP flow in real implementation)
      console.log('🔄 Initiating Aadhaar verification...');
      const aadhaarInitResult = await this.surepass.initiateAadhaar(
        userData.aadhaar,
      );

      if (aadhaarInitResult.client_id) {
        result.details.aadhaar = {
          initiated: true,
          clientId: aadhaarInitResult.client_id,
          mobileNumber: aadhaarInitResult.mobile_number,
        };
        // In real implementation, user would provide OTP here
      }

      // Step 3: Verify Bank Account
      console.log('🔄 Verifying bank account...');
      const bankResult = await this.surepass.verifyBankAccount(
        userData.bankAccount.number,
        userData.bankAccount.ifsc,
      );

      result.bankVerified = bankResult.account_exists;
      result.details.bank = bankResult;

      // Step 4: Verify GSTIN (if provided)
      if (userData.companyGSTIN) {
        console.log('🔄 Verifying GSTIN...');
        const gstResult = await this.surepass.verifyGSTIN(
          userData.companyGSTIN,
        );

        result.gstVerified = gstResult.gstin_status === 'Active';
        result.details.gst = gstResult;
      }

      // Determine overall status
      const requiredVerifications = [result.panVerified, result.bankVerified];
      if (userData.companyGSTIN) {
        requiredVerifications.push(result.gstVerified!);
      }

      const allPassed = requiredVerifications.every((v) => v);
      const somePassed = requiredVerifications.some((v) => v);

      if (allPassed) {
        result.overallStatus = 'COMPLETE';
      } else if (somePassed) {
        result.overallStatus = 'PARTIAL';
      } else {
        result.overallStatus = 'FAILED';
      }

      return result;
    } catch (error) {
      console.error('KYC process failed:', error);
      result.overallStatus = 'FAILED';
      result.details.error = error instanceof SurepassError
        ? error.code
        : 'UNKNOWN_ERROR';
      return result;
    }
  }
}

// Usage
const kycService = new KYCOnboardingService('your-jwt-token');

const userData: UserKYCData = {
  pan: 'ABCDE1234F',
  aadhaar: '123456789012',
  bankAccount: {
    number: '1234567890',
    ifsc: 'SBIN0001234',
  },
  companyGSTIN: '29AABCU9603R1ZL',
};

const kycResult = await kycService.performKYC(userData);
console.log('KYC Result:', kycResult);
```

### Name Matching Service

```typescript
class NameMatchingService {
  private surepass: Surepass;

  constructor(token: string) {
    this.surepass = new Surepass({ token });
  }

  async findBestMatch(targetName: string, candidates: string[]): Promise<{
    bestMatch: string | null;
    score: number;
    allScores: Array<{ name: string; score: number }>;
  }> {
    const scores: Array<{ name: string; score: number }> = [];

    for (const candidate of candidates) {
      try {
        const result = await this.surepass.compareNames(
          targetName,
          candidate,
        );

        if (result.match_score !== undefined) {
          scores.push({
            name: candidate,
            score: result.match_score,
          });
        }
      } catch (error) {
        console.warn(`Failed to compare with ${candidate}:`, error);
        scores.push({ name: candidate, score: 0 });
      }
    }

    // Sort by score (highest first)
    scores.sort((a, b) => b.score - a.score);

    const bestMatch = scores[0];
    return {
      bestMatch: bestMatch?.score > 70 ? bestMatch.name : null,
      score: bestMatch?.score || 0,
      allScores: scores,
    };
  }

  async validateNameConsistency(names: {
    pan: string;
    aadhaar: string;
    bank: string;
  }): Promise<{
    consistent: boolean;
    scores: Record<string, number>;
    recommendation: string;
  }> {
    const comparisons = [
      { pair: 'pan-aadhaar', name1: names.pan, name2: names.aadhaar },
      { pair: 'pan-bank', name1: names.pan, name2: names.bank },
      { pair: 'aadhaar-bank', name1: names.aadhaar, name2: names.bank },
    ];

    const scores: Record<string, number> = {};

    for (const comparison of comparisons) {
      try {
        const result = await this.surepass.compareNames(
          comparison.name1,
          comparison.name2,
        );

        scores[comparison.pair] = result.match_score || 0;
      } catch (error) {
        scores[comparison.pair] = 0;
      }
    }

    const averageScore = Object.values(scores).reduce((a, b) => a + b, 0) /
      Object.values(scores).length;
    const consistent = averageScore > 80;

    let recommendation = '';
    if (consistent) {
      recommendation = 'Names are consistent across documents';
    } else if (averageScore > 60) {
      recommendation = 'Names are similar but may need manual review';
    } else {
      recommendation =
        'Names show significant differences, manual verification required';
    }

    return { consistent, scores, recommendation };
  }
}

// Usage
const nameService = new NameMatchingService('your-jwt-token');

// Find best matching name
const match = await nameService.findBestMatch('Rahul Kumar', [
  'RAHUL KUMAR SINGH',
  'R KUMAR',
  'RAHUL K SINGH',
  'ROHIT KUMAR',
]);

console.log('Best match:', match);

// Validate name consistency
const consistency = await nameService.validateNameConsistency({
  pan: 'RAHUL KUMAR',
  aadhaar: 'RAHUL KUMAR SINGH',
  bank: 'RAHUL K SINGH',
});

console.log('Name consistency:', consistency);
```

## Integration Examples

### Express.js REST API

```typescript
import express from 'express';
import { Surepass, SurepassError } from '@tundrasoft/connect-surepass';

const app = express();
app.use(express.json());

const surepass = new Surepass({
  token: process.env.SUREPASS_TOKEN!,
  environment: 'production',
});

// PAN verification endpoint
app.post('/api/verify/pan', async (req, res) => {
  try {
    const { panNumber } = req.body;

    if (!panNumber || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid PAN format',
      });
    }

    const result = await surepass.verifyPAN({
      id_number: panNumber,
    });

    res.json({
      success: true,
      data: {
        valid: result.data?.valid,
        name: result.data?.name,
        category: result.data?.category,
      },
    });
  } catch (error) {
    if (error instanceof SurepassError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
});

// Aadhaar verification endpoints
app.post('/api/verify/aadhaar/initiate', async (req, res) => {
  try {
    const { aadhaarNumber } = req.body;

    const result = await surepass.initiateAadhaar({
      id_number: aadhaarNumber,
    });

    res.json({
      success: true,
      data: {
        clientId: result.data?.client_id,
        mobileNumber: result.data?.mobile_number,
      },
    });
  } catch (error) {
    if (error instanceof SurepassError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
});

app.post('/api/verify/aadhaar/complete', async (req, res) => {
  try {
    const { clientId, otp } = req.body;

    const result = await surepass.fetchAadhaar({
      client_id: clientId,
      otp: otp,
    });

    res.json({
      success: true,
      data: {
        name: result.data?.full_name,
        dob: result.data?.dob,
        gender: result.data?.gender,
        address: result.data?.address,
      },
    });
  } catch (error) {
    if (error instanceof SurepassError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
});

app.listen(3000, () => {
  console.log('KYC API server running on port 3000');
});
```

### Next.js API Routes

```typescript
// pages/api/kyc/verify-pan.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Surepass, SurepassError } from '@tundrasoft/connect-surepass';

const surepass = new Surepass({
  token: process.env.SUREPASS_TOKEN!,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { panNumber } = req.body;

    const result = await surepass.verifyPAN({
      id_number: panNumber,
    });

    res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    if (error instanceof SurepassError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
}
```

## Testing Examples

### Unit Tests

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Surepass, SurepassError } from '@tundrasoft/connect-surepass';

// Mock the HTTP client
vi.mock('@tundrasoft/connect-surepass', () => ({
  Surepass: vi.fn(),
  SurepassError: class extends Error {
    constructor(message: string, public code: string) {
      super(message);
    }
  },
}));

describe('Surepass KYC Integration', () => {
  let surepass: Surepass;

  beforeEach(() => {
    surepass = new Surepass({
      token: 'test-token',
      environment: 'sandbox',
    });
  });

  describe('PAN Verification', () => {
    it('should verify valid PAN successfully', async () => {
      // Mock successful response
      const mockResponse = {
        success: true,
        status_code: 200,
        message: 'Success',
        data: {
          valid: true,
          name: 'TEST USER',
          category: 'Individual',
        },
      };

      vi.spyOn(surepass, 'verifyPAN').mockResolvedValue(mockResponse);

      const result = await surepass.verifyPAN({
        id_number: 'ABCDE1234F',
      });

      expect(result.success).toBe(true);
      expect(result.data?.valid).toBe(true);
      expect(result.data?.name).toBe('TEST USER');
    });

    it('should handle invalid PAN format', async () => {
      vi.spyOn(surepass, 'verifyPAN').mockRejectedValue(
        new SurepassError('Invalid PAN format', 'INVALID_ID_NUMBER'),
      );

      await expect(surepass.verifyPAN({
        id_number: 'INVALID_PAN',
      })).rejects.toThrow(SurepassError);
    });
  });

  describe('Name Matching', () => {
    it('should return similarity score for name comparison', async () => {
      const mockResponse = {
        match_score: 85.5,
        match_type: 'partial',
        details: {
          name1_normalized: 'rahul kumar',
          name2_normalized: 'rahul kumar singh',
          algorithm: 'fuzzy',
        },
      };

      vi.spyOn(surepass, 'compareNames').mockResolvedValue(mockResponse);

      const result = await surepass.compareNames(
        'Rahul Kumar',
        'Rahul Kumar Singh',
      );

      expect(result.match_score).toBe(85.5);
      expect(result.match_type).toBe('partial');
    });
  });
});
```

### Integration Tests

```typescript
import { beforeAll, describe, expect, it } from 'vitest';
import { Surepass } from '@tundrasoft/connect-surepass';

describe('Surepass Integration Tests', () => {
  let surepass: Surepass;

  beforeAll(() => {
    // Use test credentials
    surepass = new Surepass({
      token: process.env.SUREPASS_TEST_TOKEN!,
      environment: 'sandbox',
    });
  });

  it('should perform real PAN verification', async () => {
    // Use test PAN number provided by Surepass for testing
    const testPAN = 'BNZAA2318J'; // Test PAN from Surepass docs

    const result = await surepass.verifyPAN({
      id_number: testPAN,
    });

    expect(result.success).toBe(true);
    expect(result.status_code).toBe(200);
    expect(result.data).toBeDefined();
  });

  it('should handle rate limiting gracefully', async () => {
    const promises = Array(20).fill(null).map(() =>
      surepass.verifyPAN({ id_number: 'BNZAA2318J' })
    );

    // Some requests should succeed, others might be rate limited
    const results = await Promise.allSettled(promises);

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    expect(successful + failed).toBe(20);
    console.log(`${successful} successful, ${failed} failed/rate-limited`);
  });
});
```

These examples provide comprehensive patterns for implementing Surepass KYC verification in various scenarios, from simple scripts to production applications with proper error handling, caching, and testing.
