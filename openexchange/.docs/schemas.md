# � Schema Documentation

This document explains the validation system used in OpenExchange Connect, powered by the [Guardian validation library](https://github.com/TundraSoft/TundraLibs/). All API responses are validated at runtime to ensure type safety and data integrity.

## 📑 Table of Contents

- [Validation System Overview](#validation-system-overview)
- [Guardian Library Integration](#guardian-library-integration)
- [Schema Definitions](#schema-definitions)
- [Validation Rules](#validation-rules)
- [Error Handling](#error-handling)
- [Type Safety](#type-safety)

## 🔍 Validation System Overview

OpenExchange Connect uses runtime schema validation to ensure all API responses conform to expected structures. This provides:

- **Type Safety**: Runtime validation that complements TypeScript's compile-time checks
- **Data Integrity**: Ensures API responses contain valid data structures
- **Error Prevention**: Catches malformed responses before they reach your application
- **Developer Experience**: Clear error messages when validation fails

## 🛡️ Guardian Library Integration

The validation system is built on the [Guardian library](https://github.com/TundraSoft/TundraLibs/), which provides:

### Key Features

- **Schema-based validation**: Define schemas and validate data against them
- **TypeScript integration**: Automatic type inference from schemas
- **Extensible**: Custom validation rules and transformations
- **Performance optimized**: Efficient validation for high-throughput applications

### Usage in OpenExchange Connect

```typescript
import { Guardian } from 'jsr:@tundrasoft/guardian';

// All API responses are validated using Guardian schemas
const validatedData = Guardian.validate(responseData, schema);
```

## 📋 Schema Definitions

### Exchange Rates Schema

The core schema for validating exchange rate data:

```typescript
const RatesSchema = Guardian.object({
  // Currency codes must be exactly 3 characters
  [Guardian.string().length(3)]: Guardian.number().min(0),
});
```

**Validation Rules:**

- **Currency Codes**: Must be exactly 3 characters (e.g., "USD", "EUR", "GBP")
- **Rate Values**: Must be positive numbers
- **Data Structure**: Object with currency codes as keys and rates as values

### Historical Rates Schema

Schema for historical exchange rate responses:

```typescript
const HistoricalRatesSchema = Guardian.object({
  disclaimer: Guardian.string(),
  license: Guardian.string(),
  timestamp: Guardian.number().min(0),
  base: Guardian.string().length(3),
  rates: RatesSchema,
});
```

**Validation Rules:**

- **Timestamp**: Must be a positive Unix timestamp
- **Base Currency**: Must be exactly 3 characters
- **Rates**: Must conform to the RatesSchema validation
- **Disclaimer/License**: Must be non-empty strings

### Time Series Schema

Schema for time-series data responses:

```typescript
const TimeSeriesSchema = Guardian.object({
  disclaimer: Guardian.string(),
  license: Guardian.string(),
  start_date: Guardian.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: Guardian.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  base: Guardian.string().length(3),
  rates: Guardian.object({
    [Guardian.string().regex(/^\d{4}-\d{2}-\d{2}$/)]: RatesSchema,
  }),
});
```

**Validation Rules:**

- **Date Format**: All dates must be in YYYY-MM-DD format
- **Date Range**: End date must be after start date
- **Base Currency**: Must be exactly 3 characters
- **Nested Rates**: Each date must have valid rates object

### Conversion Schema

Schema for currency conversion responses:

```typescript
const ConversionSchema = Guardian.object({
  disclaimer: Guardian.string(),
  license: Guardian.string(),
  request: Guardian.object({
    query: Guardian.string(),
    amount: Guardian.number().min(0),
    from: Guardian.string().length(3),
    to: Guardian.string().length(3),
  }),
  info: Guardian.object({
    rate: Guardian.number().min(0),
  }),
  result: Guardian.number().min(0),
});
```

**Validation Rules:**

- **Amount**: Must be a positive number
- **Currency Codes**: Both 'from' and 'to' must be exactly 3 characters
- **Exchange Rate**: Must be a positive number
- **Result**: Must be a positive number

### OHLC Schema

Schema for OHLC (Open, High, Low, Close) data:

```typescript
const OHLCDataSchema = Guardian.object({
  open: Guardian.number().min(0),
  high: Guardian.number().min(0),
  low: Guardian.number().min(0),
  close: Guardian.number().min(0),
  average: Guardian.number().min(0),
});

const OHLCSchema = Guardian.object({
  disclaimer: Guardian.string(),
  license: Guardian.string(),
  start_date: Guardian.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: Guardian.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  base: Guardian.string().length(3),
  rates: Guardian.object({
    [Guardian.string().length(3)]: OHLCDataSchema,
  }),
});
```

**Validation Rules:**

- **OHLC Values**: All values must be positive numbers
- **High/Low Logic**: High must be ≥ Low (validated at runtime)
- **Open/Close**: Must be within High/Low range
- **Average**: Must be calculated average of OHLC values

### Usage/Status Schema

Schema for account status and usage information:

```typescript
const UsageSchema = Guardian.object({
  requests: Guardian.number().min(0),
  requests_quota: Guardian.number().min(0),
  requests_remaining: Guardian.number().min(0),
  days_elapsed: Guardian.number().min(0),
  days_remaining: Guardian.number().min(0),
  daily_average: Guardian.number().min(0),
});

const StatusSchema = Guardian.object({
  disclaimer: Guardian.string(),
  license: Guardian.string(),
  usage: UsageSchema,
  plan: Guardian.object({
    name: Guardian.string(),
    quota: Guardian.string(),
    update_frequency: Guardian.string(),
    features: Guardian.object({
      base: Guardian.boolean(),
      symbols: Guardian.boolean(),
      experimental: Guardian.boolean(),
      'time-series': Guardian.boolean(),
      convert: Guardian.boolean(),
      'bid-ask': Guardian.boolean(),
      ohlc: Guardian.boolean(),
      spot: Guardian.boolean(),
    }),
  }),
});
```

**Validation Rules:**

- **Usage Numbers**: All usage statistics must be non-negative
- **Quota Logic**: Remaining requests must be ≤ Total quota
- **Plan Features**: All feature flags must be boolean values
- **Plan Information**: Plan name and quota must be non-empty strings

## 🔧 Validation Rules

### Currency Code Validation

```typescript
const CurrencyCodeRule = Guardian.string()
  .length(3)
  .regex(/^[A-Z]{3}$/)
  .transform((value) => value.toUpperCase());
```

**Rules Applied:**

- **Length**: Exactly 3 characters
- **Format**: Only uppercase letters
- **Transformation**: Automatically converts to uppercase

### Date Validation

```typescript
const DateRule = Guardian.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value) => {
    const date = new Date(value);
    return !isNaN(date.getTime()) && date.toISOString().startsWith(value);
  });
```

**Rules Applied:**

- **Format**: YYYY-MM-DD pattern
- **Validity**: Must be a valid date
- **Range**: Must be within reasonable date range

### Numeric Validation

```typescript
const PositiveNumberRule = Guardian.number()
  .min(0)
  .custom((value) => Number.isFinite(value));
```

**Rules Applied:**

- **Type**: Must be a number
- **Range**: Must be non-negative
- **Validity**: Must be finite (not NaN or Infinity)

### Exchange Rate Validation

```typescript
const ExchangeRateRule = Guardian.number()
  .min(0.000001) // Minimum realistic exchange rate
  .max(1000000) // Maximum realistic exchange rate
  .custom((value) => {
    // Additional validation for realistic exchange rates
    return Number.isFinite(value) && value > 0;
  });
```

**Rules Applied:**

- **Realistic Range**: Between 0.000001 and 1,000,000
- **Precision**: Supports up to 6 decimal places
- **Validity**: Must be a positive finite number

## ❌ Error Handling

### Validation Errors

When validation fails, Guardian provides detailed error information:

```typescript
try {
  const validatedData = Guardian.validate(responseData, schema);
} catch (error) {
  if (error instanceof Guardian.ValidationError) {
    console.error('Validation failed:', error.message);
    console.error('Error path:', error.path);
    console.error('Expected:', error.expected);
    console.error('Received:', error.received);
  }
}
```

### Common Validation Scenarios

**Invalid Currency Code:**

```typescript
// Will throw validation error
const invalidData = { base: 'INVALID', rates: { EUR: 1.1 } };
Guardian.validate(invalidData, HistoricalRatesSchema);
// Error: Currency code must be exactly 3 characters
```

**Invalid Date Format:**

```typescript
// Will throw validation error
const invalidData = { start_date: '2023/01/01', end_date: '2023-01-07' };
Guardian.validate(invalidData, TimeSeriesSchema);
// Error: Date must be in YYYY-MM-DD format
```

**Invalid Exchange Rate:**

```typescript
// Will throw validation error
const invalidData = { rates: { EUR: -1.1 } };
Guardian.validate(invalidData, RatesSchema);
// Error: Exchange rate must be positive
```

## 🔒 Type Safety

### Automatic Type Inference

Guardian automatically infers TypeScript types from schemas:

```typescript
// Type is automatically inferred as:
// {
//   disclaimer: string;
//   license: string;
//   base: string;
//   rates: Record<string, number>;
// }
type HistoricalRates = Guardian.Infer<typeof HistoricalRatesSchema>;
```

### Runtime Type Checking

```typescript
function processRates(data: unknown): Record<string, number> {
  // Runtime validation ensures type safety
  const validated = Guardian.validate(data, HistoricalRatesSchema);

  // TypeScript now knows 'validated' conforms to the schema
  return validated.rates;
}
```

### Type Guards

```typescript
function isValidRatesResponse(data: unknown): data is HistoricalRates {
  try {
    Guardian.validate(data, HistoricalRatesSchema);
    return true;
  } catch {
    return false;
  }
}
```

## 🎯 Best Practices

### Schema Composition

```typescript
// Reusable base schema
const BaseResponseSchema = Guardian.object({
  disclaimer: Guardian.string(),
  license: Guardian.string(),
});

// Compose with specific schemas
const RatesResponseSchema = BaseResponseSchema.extend({
  base: Guardian.string().length(3),
  rates: RatesSchema,
});
```

### Custom Validation Rules

```typescript
const CustomCurrencyRule = Guardian.string()
  .length(3)
  .custom((value, context) => {
    // Custom validation logic
    const supportedCurrencies = ['USD', 'EUR', 'GBP', 'JPY'];
    if (!supportedCurrencies.includes(value)) {
      throw new Guardian.ValidationError(
        `Currency ${value} is not supported`,
        context.path,
      );
    }
    return value;
  });
```

### Validation Middleware

```typescript
class OpenExchangeClient {
  private validateResponse<T>(data: unknown, schema: Guardian.Schema<T>): T {
    try {
      return Guardian.validate(data, schema);
    } catch (error) {
      if (error instanceof Guardian.ValidationError) {
        throw new OpenExchangeError(
          'RESPONSE_VALIDATION_ERROR',
          { originalError: error.message, path: error.path },
        );
      }
      throw error;
    }
  }
}
```

## � Related Documentation

- [Guardian Library Documentation](https://github.com/TundraSoft/TundraLibs/)
- [OpenExchange Class Documentation](./OpenExchange.md)
- [Error Handling Guide](./errors.md)
- [Documentation Hub](./README.md)

All schemas in the OpenExchange Connect client are built using the [Guardian](https://github.com/TundraSoft/guardian) validation library. Each schema provides runtime validation and TypeScript type safety.

## 📋 Response Schemas

### UsageResponseSchema

Schema for account status and usage information returned by `getStatus()`.

**Type Definition:**

```typescript
interface UsageResponseSchema {
  status: number;
  data: {
    app_id: string;
    status: string;
    plan: {
      name: string;
      quota: string;
      update_frequency: string;
      features: {
        base: boolean;
        symbols: boolean;
        experimental: boolean;
        'time-series': boolean;
        convert: boolean;
        'bid-ask': boolean;
        ohlc: boolean;
        spot: boolean;
      };
    };
  };
  usage: {
    requests: number;
    requests_quota: number;
    requests_remaining: number;
    days_elapsed: number;
    days_remaining: number;
    daily_average: number;
  };
}
```

**Example Response:**

```json
{
  "status": 200,
  "data": {
    "app_id": "your-app-id",
    "status": "ACTIVE",
    "plan": {
      "name": "Free",
      "quota": "1,000 requests/month",
      "update_frequency": "60 minutes",
      "features": {
        "base": true,
        "symbols": true,
        "experimental": false,
        "time-series": false,
        "convert": false,
        "bid-ask": false,
        "ohlc": false,
        "spot": true
      }
    }
  },
  "usage": {
    "requests": 42,
    "requests_quota": 1000,
    "requests_remaining": 958,
    "days_elapsed": 15,
    "days_remaining": 15,
    "daily_average": 2.8
  }
}
```

### CurrenciesSchema

Schema for currency list returned by `listCurrencies()`.

**Type Definition:**

```typescript
interface CurrenciesSchema {
  [currencyCode: string]: string;
}
```

**Example Response:**

```json
{
  "USD": "United States Dollar",
  "EUR": "Euro",
  "GBP": "British Pound Sterling",
  "JPY": "Japanese Yen",
  "CAD": "Canadian Dollar",
  "AUD": "Australian Dollar",
  "CHF": "Swiss Franc",
  "CNY": "Chinese Yuan"
}
```

### LatestRatesSchema

Schema for latest exchange rates returned by `getRates()`.

**Type Definition:**

```typescript
interface LatestRatesSchema {
  disclaimer: string;
  license: string;
  timestamp: number;
  base: string;
  rates: Record<string, number>;
}
```

**Example Response:**

```json
{
  "disclaimer": "Exchange rates are provided for informational purposes only and do not constitute financial advice.",
  "license": "https://openexchangerates.org/license",
  "timestamp": 1640995200,
  "base": "USD",
  "rates": {
    "EUR": 0.883,
    "GBP": 0.741,
    "JPY": 115.01,
    "CAD": 1.264,
    "AUD": 1.421
  }
}
```

### HistoricalRatesSchema

Schema for historical exchange rates returned by `getHistoricalRates()`.

**Type Definition:**

```typescript
interface HistoricalRatesSchema {
  disclaimer: string;
  license: string;
  timestamp: number;
  historical: boolean;
  base: string;
  rates: Record<string, number>;
}
```

**Example Response:**

```json
{
  "disclaimer": "Exchange rates are provided for informational purposes only and do not constitute financial advice.",
  "license": "https://openexchangerates.org/license",
  "timestamp": 1640995200,
  "historical": true,
  "base": "USD",
  "rates": {
    "EUR": 0.883,
    "GBP": 0.741,
    "JPY": 115.01,
    "CAD": 1.264
  }
}
```

### TimeSeriesSchema

Schema for time series data returned by `getTimeSeries()`.

**Type Definition:**

```typescript
interface TimeSeriesSchema {
  disclaimer: string;
  license: string;
  start_date: string;
  end_date: string;
  base: string;
  rates: {
    [date: string]: Record<string, number>;
  };
}
```

**Example Response:**

```json
{
  "disclaimer": "Exchange rates are provided for informational purposes only and do not constitute financial advice.",
  "license": "https://openexchangerates.org/license",
  "start_date": "2023-01-01",
  "end_date": "2023-01-03",
  "base": "USD",
  "rates": {
    "2023-01-01": {
      "EUR": 0.883,
      "GBP": 0.741,
      "JPY": 115.01
    },
    "2023-01-02": {
      "EUR": 0.885,
      "GBP": 0.739,
      "JPY": 115.23
    },
    "2023-01-03": {
      "EUR": 0.884,
      "GBP": 0.740,
      "JPY": 115.12
    }
  }
}
```

### ConvertRequestSchema

Schema for currency conversion results returned by `convert()`.

**Type Definition:**

```typescript
interface ConvertRequestSchema {
  disclaimer: string;
  license: string;
  query: {
    from: string;
    to: string;
    amount: number;
  };
  info: {
    rate: number;
  };
  historical: boolean;
  date: string;
  result: number;
}
```

**Example Response:**

```json
{
  "disclaimer": "Exchange rates are provided for informational purposes only and do not constitute financial advice.",
  "license": "https://openexchangerates.org/license",
  "query": {
    "from": "USD",
    "to": "EUR",
    "amount": 100
  },
  "info": {
    "rate": 0.883
  },
  "historical": false,
  "date": "2023-01-01",
  "result": 88.3
}
```

### OHLCSchema

Schema for OHLC (Open, High, Low, Close) data returned by `getOHLC()`.

**Type Definition:**

```typescript
interface OHLCSchema {
  disclaimer: string;
  license: string;
  start_date: string;
  end_date: string;
  base: string;
  rates: {
    [date: string]: {
      [currency: string]: {
        open: number;
        high: number;
        low: number;
        close: number;
        average: number;
      };
    };
  };
}
```

**Example Response:**

```json
{
  "disclaimer": "Exchange rates are provided for informational purposes only and do not constitute financial advice.",
  "license": "https://openexchangerates.org/license",
  "start_date": "2023-01-01",
  "end_date": "2023-01-03",
  "base": "USD",
  "rates": {
    "2023-01-01": {
      "EUR": {
        "open": 0.883,
        "high": 0.885,
        "low": 0.881,
        "close": 0.884,
        "average": 0.883
      },
      "GBP": {
        "open": 0.741,
        "high": 0.743,
        "low": 0.739,
        "close": 0.740,
        "average": 0.741
      }
    }
  }
}
```

## 🔧 Common Types

### Individual Guards

Common validation guards used across schemas:

```typescript
// Currency code validation (3-letter uppercase)
const currencyCodeGuard = string().pattern(/^[A-Z]{3}$/);

// Positive number validation
const positiveNumberGuard = number().min(0);

// ISO date string validation (YYYY-MM-DD)
const dateStringGuard = string().pattern(/^\d{4}-\d{2}-\d{2}$/);

// Unix timestamp validation
const timestampGuard = number().integer().min(0);

// Rate value validation (positive number)
const rateGuard = number().min(0);
```

### Currency Rates Object

```typescript
interface CurrencyRates {
  [currencyCode: string]: number;
}
```

### OHLC Data Object

```typescript
interface OHLCData {
  open: number;
  high: number;
  low: number;
  close: number;
  average: number;
}
```

## ❌ Error Schema

Schema for API error responses:

**Type Definition:**

```typescript
interface ErrorSchema {
  error: boolean;
  status: number;
  message: string;
  description: string;
}
```

**Example Error Response:**

```json
{
  "error": true,
  "status": 401,
  "message": "invalid_app_id",
  "description": "Invalid application ID provided"
}
```

## ✅ Schema Validation

All schemas are validated at runtime using Guardian validators. When a response doesn't match the expected schema, an `OpenExchangeError` is thrown with details about the validation failure.

### Validation Process

1. **Response Received**: Raw response from OpenExchange API
2. **Schema Validation**: Guardian validates against expected schema
3. **Success**: Returns typed data if validation passes
4. **Failure**: Throws `OpenExchangeError` with validation details

### Example Validation Usage

```typescript
import { LatestRatesSchemaObject } from '@tundraconnect/openexchange';

// Validate response data
const [error, validatedData] = LatestRatesSchemaObject.validate(responseData);

if (error) {
  console.error('Validation failed:', error.message);
  throw new OpenExchangeError('RESPONSE_ERROR', {
    validationError: error.toJSON(),
  });
}

// Use validated data with full type safety
console.log('Base currency:', validatedData.base);
console.log('EUR rate:', validatedData.rates.EUR);
```

## 🔗 Related Files

- [`./errors.md`](./errors.md) - Error handling documentation
- [`./README.md`](./README.md) - Main documentation
