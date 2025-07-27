# Schema Reference

Complete reference for all input and output schemas used in the Surepass KYC API client.

## Table of Contents

- [Request Schemas](#request-schemas)
- [Response Schemas](#response-schemas)
- [Common Types](#common-types)
- [Validation Rules](#validation-rules)

## Request Schemas

### NameMatchRequest

Used for name comparison operations.

```typescript
interface NameMatchRequest {
  name1: string; // First name to compare
  name2: string; // Second name to compare
}
```

**Validation:**

- Both names are required
- Names should be non-empty strings
- Maximum length: 100 characters each

### BankVerificationRequest

Used for bank account verification.

```typescript
interface BankVerificationRequest {
  id_number: string; // Account holder's Aadhaar number
  account_number: string; // Bank account number
  ifsc: string; // Bank IFSC code
}
```

**Validation:**

- `id_number`: 12-digit Aadhaar number
- `account_number`: 9-18 digit account number
- `ifsc`: 11-character IFSC code (format: ABCD0123456)

### PanComprehensiveRequest

Used for PAN verification.

```typescript
interface PanComprehensiveRequest {
  id_number: string; // PAN number
}
```

**Validation:**

- `id_number`: 10-character PAN (format: ABCDE1234F)
- First 5 characters: alphabets
- Next 4 characters: numbers
- Last character: alphabet

### AadhaarVerificationRequest

Used to initiate Aadhaar verification.

```typescript
interface AadhaarVerificationRequest {
  id_number: string; // 12-digit Aadhaar number
}
```

**Validation:**

- `id_number`: Exactly 12 digits
- Must pass Aadhaar checksum validation

### AadhaarOTPRequest

Used to complete Aadhaar verification with OTP.

```typescript
interface AadhaarOTPRequest {
  client_id: string; // Client ID from initiate call
  otp: string; // 6-digit OTP
}
```

**Validation:**

- `client_id`: Non-empty string from initiate response
- `otp`: Exactly 6 digits

### CINRequest

Used for Corporate Identification Number verification.

```typescript
interface CINRequest {
  id_number: string; // 21-character CIN
}
```

**Validation:**

- `id_number`: Exactly 21 characters
- Format: U12345AB1234PTC123456

### GSTINRequest

Used for GST Identification Number verification.

```typescript
interface GSTINRequest {
  id_number: string; // 15-character GSTIN
}
```

**Validation:**

- `id_number`: Exactly 15 characters
- Format: 29AABCU9603R1ZL

## Response Schemas

### BaseResponse

All API responses extend this base structure.

```typescript
interface BaseResponse {
  status_code: number; // HTTP status code
  message: string; // Response message
  success: boolean; // Operation success flag
  data?: any; // Response data (varies by endpoint)
}
```

### NameMatchResponse

Response for name comparison operations.

```typescript
interface NameMatchResponse extends BaseResponse {
  data?: {
    score: number; // Similarity score (0-100)
    match_type: string; // Type of match (exact, partial, etc.)
  };
}
```

**Example:**

```json
{
  "status_code": 200,
  "message": "Name match completed successfully",
  "success": true,
  "data": {
    "score": 87.5,
    "match_type": "partial"
  }
}
```

### BankVerificationResponse

Response for bank account verification.

```typescript
interface BankVerificationResponse extends BaseResponse {
  data?: {
    account_exists: boolean; // Account existence status
    name_match: boolean; // Name matching result
    account_holder_name: string; // Account holder's name
    bank_name: string; // Bank name
    branch: string; // Branch name
    ifsc: string; // IFSC code
    account_type: string; // Account type (Savings/Current)
  };
}
```

**Example:**

```json
{
  "status_code": 200,
  "message": "Bank verification completed",
  "success": true,
  "data": {
    "account_exists": true,
    "name_match": true,
    "account_holder_name": "RAHUL KUMAR",
    "bank_name": "State Bank of India",
    "branch": "New Delhi Main Branch",
    "ifsc": "SBIN0001234",
    "account_type": "Savings"
  }
}
```

### PanComprehensiveResponse

Response for PAN verification.

```typescript
interface PanComprehensiveResponse extends BaseResponse {
  data?: {
    valid: boolean; // PAN validity status
    name: string; // PAN holder's name
    category: string; // Individual/Company
    pan_status: string; // Active/Inactive
    last_updated: string; // Last update date
    aadhaar_seeding: boolean; // Aadhaar linking status
  };
}
```

**Example:**

```json
{
  "status_code": 200,
  "message": "PAN verification completed",
  "success": true,
  "data": {
    "valid": true,
    "name": "RAHUL KUMAR",
    "category": "Individual",
    "pan_status": "Active",
    "last_updated": "2024-01-15",
    "aadhaar_seeding": true
  }
}
```

### AadhaarVerificationResponse

Response for both initiate and fetch Aadhaar operations.

```typescript
interface AadhaarVerificationResponse extends BaseResponse {
  data?: {
    // For initiate response
    client_id?: string; // Client ID for OTP verification
    mobile_number?: string; // Masked mobile number

    // For fetch response (after OTP)
    full_name?: string; // Full name from Aadhaar
    dob?: string; // Date of birth (YYYY-MM-DD)
    gender?: string; // M/F
    address?: {
      house: string;
      street: string;
      landmark: string;
      locality: string;
      vtc: string; // Village/Town/City
      district: string;
      state: string;
      pincode: string;
      country: string;
    };
    photo?: string; // Base64 encoded photo
    has_image: boolean; // Photo availability
  };
}
```

**Initiate Example:**

```json
{
  "status_code": 200,
  "message": "OTP sent successfully",
  "success": true,
  "data": {
    "client_id": "AV_12345_67890",
    "mobile_number": "XXXXXX9876"
  }
}
```

**Fetch Example:**

```json
{
  "status_code": 200,
  "message": "Aadhaar verification completed",
  "success": true,
  "data": {
    "full_name": "Rahul Kumar Singh",
    "dob": "1990-05-15",
    "gender": "M",
    "address": {
      "house": "123",
      "street": "MG Road",
      "locality": "Sector 15",
      "vtc": "Gurgaon",
      "district": "Gurgaon",
      "state": "Haryana",
      "pincode": "122001",
      "country": "India"
    },
    "has_image": true
  }
}
```

### CompanyDetailsResponse

Response for CIN verification.

```typescript
interface CompanyDetailsResponse extends BaseResponse {
  data?: {
    company_name: string; // Company name
    registration_number: string; // Registration number
    company_status: string; // Active/Inactive/Dissolved
    company_category: string; // Public/Private
    company_subcategory: string; // Limited/Unlimited
    class_of_company: string; // Class of company
    roc: string; // Registrar of Companies
    registration_date: string; // Registration date
    authorized_capital: number; // Authorized capital
    paid_up_capital: number; // Paid up capital
    number_of_members: number; // Number of members
    date_of_last_agm: string; // Last AGM date
    email: string; // Registered email
    registered_address: string; // Registered address
  };
}
```

### GSTINDetailsResponse

Response for GSTIN verification.

```typescript
interface GSTINDetailsResponse extends BaseResponse {
  data?: {
    business_name: string; // Business name
    gstin_status: string; // Active/Cancelled/Suspended
    registration_date: string; // Registration date
    constitution_of_business: string; // Business constitution
    taxpayer_type: string; // Type of taxpayer
    gstin: string; // GSTIN number
    state_jurisdiction: string; // State jurisdiction
    central_jurisdiction: string; // Central jurisdiction
    principal_place_of_business: {
      address: string;
      pincode: string;
      state: string;
    };
    nature_of_business: string[]; // Business activities
    last_update_date: string; // Last update date
  };
}
```

## Common Types

### Address

Address structure used in various responses.

```typescript
interface Address {
  house?: string; // House/building number
  street?: string; // Street name
  landmark?: string; // Landmark
  locality?: string; // Locality/area
  vtc?: string; // Village/Town/City
  district?: string; // District
  state?: string; // State
  pincode?: string; // PIN code
  country?: string; // Country
}
```

### ErrorResponse

Error response structure.

```typescript
interface ErrorResponse {
  status_code: number; // HTTP error status
  message: string; // Error message
  success: false; // Always false for errors
  error_code?: string; // Specific error code
  details?: any; // Additional error details
}
```

## Validation Rules

### PAN Number Format

- **Pattern:** `^[A-Z]{5}[0-9]{4}[A-Z]{1}$`
- **Example:** `ABCDE1234F`
- **Description:** 5 uppercase letters, 4 digits, 1 uppercase letter

### Aadhaar Number Format

- **Pattern:** `^[0-9]{12}$`
- **Example:** `123456789012`
- **Description:** Exactly 12 digits with valid checksum

### IFSC Code Format

- **Pattern:** `^[A-Z]{4}0[A-Z0-9]{6}$`
- **Example:** `SBIN0001234`
- **Description:** 4 letters, one zero, 6 alphanumeric characters

### GSTIN Format

- **Pattern:** `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$`
- **Example:** `29AABCU9603R1ZL`
- **Description:** 2 digits (state), 5 letters (PAN), 4 digits, 1 letter, 1 alphanumeric, Z, 1 alphanumeric

### CIN Format

- **Pattern:** Complex 21-character format
- **Example:** `U72900DL2015PTC123456`
- **Description:** Industry code, state code, year, company type, registration number

### Mobile Number Format

- **Pattern:** `^[6-9][0-9]{9}$`
- **Example:** `9876543210`
- **Description:** 10 digits starting with 6, 7, 8, or 9

## Schema Validation

All schemas are validated using the Guardian library for runtime type safety:

```typescript
import { g } from '@guardian/core';

const NameMatchRequestSchema = g.object({
  name1: g.string().max(100),
  name2: g.string().max(100),
});

// Automatic validation in API calls
const isValid = NameMatchRequestSchema.safeParse(inputData);
```

The client automatically validates all inputs and outputs, throwing `SurepassError` for validation failures.
