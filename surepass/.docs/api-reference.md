# API Reference

Complete reference for all Surepass KYC API methods and configurations.

## Table of Contents

- [Configuration](#configuration)
- [Core Methods](#core-methods)
  - [compareNames()](#comparenames)
  - [verifyBankAccount()](#verifybankaccount)
  - [verifyPAN()](#verifypan)
  - [initiateAadhaar()](#initiateaadhaar)
  - [fetchAadhaar()](#fetchaadhaar)
  - [verifyCIN()](#verifycin)
  - [verifyGSTIN()](#verifygstin)
- [Error Handling](#error-handling)
- [Response Schemas](#response-schemas)

## Configuration

### Constructor: `new Surepass(options)`

**Parameters:**

| Parameter | Type              | Required | Description          |
| --------- | ----------------- | -------- | -------------------- |
| `options` | `SurepassOptions` | Yes      | Configuration object |

#### SurepassOptions

```typescript
interface SurepassOptions extends RESTlerOptions {
  mode: 'SANDBOX' | 'PRODUCTION'; // Environment mode
  auth: string; // JWT authentication token
  timeout?: number; // Request timeout in seconds (default: 10)
}
```

**Example:**

```typescript
const surepass = new Surepass({
  mode: 'PRODUCTION',
  auth: 'your-jwt-token',
  timeout: 15,
});
```

**Base URLs:**

- Sandbox: `https://sandbox.surepass.app/api/v1`
- Production: `https://kyc-api.surepass.app/api/v1`

## Core Methods

### compareNames()

Compare two names and get a similarity score.

**Signature:** `compareNames(name1: string, name2: string, isCompany?: boolean): Promise<SurepassNameMatch>`

**Parameters:**

| Parameter   | Type      | Required | Description                                      |
| ----------- | --------- | -------- | ------------------------------------------------ |
| `name1`     | `string`  | Yes      | First name to compare                            |
| `name2`     | `string`  | Yes      | Second name to compare                           |
| `isCompany` | `boolean` | No       | Whether names are company names (default: false) |

**Response:** Returns a `SurepassNameMatch` with similarity score and match status.

**Example:**

```typescript
const result = await surepass.compareNames(
  'Rahul Kumar Singh',
  'Rahul Kumar',
);

console.log(result.match_score); // e.g. 85
console.log(result.match_status); // true/false
```

### verifyBankAccount()

Verify bank account details.

**Signature:** `verifyBankAccount(accountNumber: string, ifsc: string): Promise<SurepassBankVerification>`

**Parameters:**

| Parameter       | Type     | Required | Description         |
| --------------- | -------- | -------- | ------------------- |
| `accountNumber` | `string` | Yes      | Bank account number |
| `ifsc`          | `string` | Yes      | Bank IFSC code      |

**Response:** Returns verification status and account holder details.

**Example:**

```typescript
const result = await surepass.verifyBankAccount(
  '1234567890',
  'SBIN0001234',
);

console.log(result.account_exists); // true/false
console.log(result.full_name); // account holder name
console.log(result.ifsc_details.bank_name); // bank name
```

### verifyPAN()

Verify PAN (Permanent Account Number) details.

**Signature:** `verifyPAN(pan: string): Promise<SurepassPanComprehensive>`

**Parameters:**

| Parameter | Type     | Required | Description                     |
| --------- | -------- | -------- | ------------------------------- |
| `pan`     | `string` | Yes      | PAN number (format: ABCDE1234F) |

**Response:** Returns PAN verification status and holder details.

**Example:**

```typescript
const result = await surepass.verifyPAN('ABCDE1234F');

console.log(result.pan_details.full_name); // PAN holder name
console.log(result.pan_details.category); // person/company
console.log(result.pan_details.dob_verified); // true/false
```

### initiateAadhaar()

Initiate Aadhaar verification (sends OTP).

**Signature:** `initiateAadhaar(aadhaar: string): Promise<SurepassInitiateAadhaarVerification>`

**Parameters:**

| Parameter | Type     | Required | Description             |
| --------- | -------- | -------- | ----------------------- |
| `aadhaar` | `string` | Yes      | 12-digit Aadhaar number |

**Response:** Returns client_id for OTP verification.

**Example:**

```typescript
const result = await surepass.initiateAadhaar('123456789012');

console.log(result.client_id); // Use this for fetchAadhaar()
console.log(result.mobile_number); // Masked mobile: "XXXXXX9876"
```

### fetchAadhaar()

Complete Aadhaar verification with OTP.

**Signature:** `fetchAadhaar(clientId: string, otp: string): Promise<SurepassAadhaarVerification>`

**Parameters:**

| Parameter  | Type     | Required | Description                      |
| ---------- | -------- | -------- | -------------------------------- |
| `clientId` | `string` | Yes      | Client ID from initiateAadhaar() |
| `otp`      | `string` | Yes      | 6-digit OTP received by user     |

**Response:** Returns complete Aadhaar verification details.

**Example:**

```typescript
const result = await surepass.fetchAadhaar(
  'client_id_from_initiate',
  '123456',
);

console.log(result.name); // Verified name
console.log(result.address); // Complete address object
console.log(result.date_of_birth); // Date of birth
console.log(result.gender); // M/F
```

### verifyCIN()

Verify Corporate Identification Number (CIN).

**Signature:** `verifyCIN(cin: string): Promise<SurepassCompanyDetails>`

**Parameters:**

| Parameter | Type     | Required | Description      |
| --------- | -------- | -------- | ---------------- |
| `cin`     | `string` | Yes      | 21-character CIN |

**Response:** Returns company registration details.

**Example:**

```typescript
const result = await surepass.verifyCIN('U72900DL2015PTC123456');

console.log(result.company_name);
console.log(result.details.company_info.company_status); // Active/Inactive
console.log(result.details.directors); // Array of directors
```

### verifyGSTIN()

Verify GST Identification Number (GSTIN).

**Signature:** `verifyGSTIN(gstin: string): Promise<SurepassGSTINDetails>`

**Parameters:**

| Parameter | Type     | Required | Description        |
| --------- | -------- | -------- | ------------------ |
| `gstin`   | `string` | Yes      | 15-character GSTIN |

**Response:** Returns GST registration details.

**Example:**

```typescript
const result = await surepass.verifyGSTIN('29AABCU9603R1ZL');

console.log(result.legal_name);
console.log(result.gstin_status); // Active/Cancelled
console.log(result.registration_date);
```

## Error Handling

All methods can throw `SurepassError` with structured error information:

```typescript
class SurepassError extends Error {
  code: string; // Error code (e.g., "INVALID_INPUT")
  statusCode?: number; // HTTP status code
  response?: any; // Original API response
}
```

### Common Error Codes

| Code                   | Description              | Action                  |
| ---------------------- | ------------------------ | ----------------------- |
| `INVALID_INPUT`        | Invalid input parameters | Check parameter format  |
| `INVALID_ID_NUMBER`    | Invalid ID number format | Verify ID number format |
| `INSUFFICIENT_BALANCE` | Account balance too low  | Top up account          |
| `RATE_LIMIT`           | Too many requests        | Wait and retry          |
| `SERVICE_UNAVAILABLE`  | Service temporarily down | Retry later             |
| `UNAUTHORIZED`         | Invalid authentication   | Check JWT token         |

**Example Error Handling:**

```typescript
try {
  const result = await surepass.verifyPAN({ id_number: 'INVALID' });
} catch (error) {
  if (error instanceof SurepassError) {
    console.error(`Error ${error.code}: ${error.message}`);

    if (error.code === 'INSUFFICIENT_BALANCE') {
      // Handle low balance
      await notifyAdminLowBalance();
    }
  }
}
```

## Response Schemas

All API responses follow a consistent structure:

```typescript
interface BaseResponse {
  status_code: number; // Response status (200 = success)
  message: string; // Response message
  success: boolean; // Operation success flag
  data?: any; // Response data (varies by endpoint)
}
```

For detailed schema definitions, see the [Schema Reference](./schemas.md).

## Request Timeout

All requests have a configurable timeout (default: 5 seconds):

```typescript
const surepass = new Surepass({
  token: 'your-token',
  timeout: 15000, // 15 seconds
});
```

## Rate Limiting

Surepass API has rate limits. The client will throw `SurepassError` with code `RATE_LIMIT` when limits are exceeded. Implement exponential backoff for retry logic:

```typescript
async function verifyWithRetry(data: any, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await surepass.verifyPAN(data);
    } catch (error) {
      if (error instanceof SurepassError && error.code === 'RATE_LIMIT') {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, i) * 1000)
        );
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```
