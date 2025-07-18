# 📖 OpenExchange Class Documentation

This document provides comprehensive documentation for the `OpenExchange` class, including initialization, configuration, and all available methods.

## 📑 Table of Contents

- [Class Overview](#class-overview)
- [Constructor](#constructor)
- [Configuration Options](#configuration-options)
- [API Methods](#api-methods)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)

## 🏗️ Class Overview

The `OpenExchange` class is the main client for interacting with the OpenExchange Rates API. It provides a type-safe interface with built-in validation and error handling.

```typescript
import { OpenExchange } from 'jsr:@tundraconnect/openexchange';

const client = new OpenExchange({
  appId: 'your-app-id-here',
  baseCurrency: 'USD',
  timeout: 10,
});
```

## 🔧 Constructor

### OpenExchange(options: OpenExchangeOptions)

Creates a new OpenExchange client instance with the specified configuration.

```typescript
const client = new OpenExchange({
  appId: 'your-app-id-here',
  baseCurrency: 'USD',
  timeout: 10,
});
```

**Parameters:**

- `options`: Configuration object of type `OpenExchangeOptions`

**Throws:**

- `OpenExchangeError` with code `CONFIG_INVALID_APP_ID` if app ID is invalid
- `OpenExchangeError` with code `CONFIG_INVALID_BASE_CURRENCY` if base currency is invalid

## ⚙️ Configuration Options

### OpenExchangeOptions

| Property       | Type     | Required | Default | Description                            |
| -------------- | -------- | -------- | ------- | -------------------------------------- |
| `appId`        | `string` | ✅       | -       | Your OpenExchange Rates API key        |
| `baseCurrency` | `string` | ❌       | `'USD'` | Default base currency for all requests |
| `timeout`      | `number` | ❌       | `10`    | Request timeout in seconds             |

### Examples

```typescript
// Basic configuration
const client = new OpenExchange({
  appId: 'your-app-id-here',
});

// With custom base currency
const eurClient = new OpenExchange({
  appId: 'your-app-id-here',
  baseCurrency: 'EUR',
});

// With custom timeout
const fastClient = new OpenExchange({
  appId: 'your-app-id-here',
  timeout: 5,
});
```

## 📊 API Methods

### getRates(options?: GetRatesOptions)

Retrieves the latest exchange rates from the API.

```typescript
const rates = await client.getRates();
console.log('EUR rate:', rates.EUR);
```

**Parameters:**

- `options` (optional): Configuration object for the request

**GetRatesOptions:**

- `symbols?: string[]` - Array of currency codes to retrieve
- `showAlternative?: boolean` - Include alternative currency data

**Returns:** `Promise<Record<string, number>>` - Object with currency codes as keys and exchange rates as values

**Examples:**

```typescript
// Get all rates
const allRates = await client.getRates();

// Get specific currencies
const specificRates = await client.getRates({
  symbols: ['EUR', 'GBP', 'JPY'],
});

// Include alternative currencies
const withAlternatives = await client.getRates({
  showAlternative: true,
});
```

### getHistoricalRates(date: string, options?: GetRatesOptions)

Retrieves historical exchange rates for a specific date.

```typescript
const historical = await client.getHistoricalRates('2023-01-01');
console.log('Historical EUR rate:', historical.rates.EUR);
```

**Parameters:**

- `date`: Date in YYYY-MM-DD format
- `options` (optional): Same as `getRates` options

**Returns:** `Promise<HistoricalRatesResponse>` - Historical rates with metadata

**HistoricalRatesResponse:**

- `disclaimer`: API disclaimer text
- `license`: License information
- `timestamp`: Unix timestamp of the rates
- `base`: Base currency used
- `rates`: Object with currency rates

**Examples:**

```typescript
// Get historical rates for a specific date
const rates = await client.getHistoricalRates('2023-01-01');

// Get specific currencies for a historical date
const specificRates = await client.getHistoricalRates('2023-01-01', {
  symbols: ['EUR', 'GBP'],
});
```

### getCurrencies()

Retrieves the list of all available currencies with their descriptions.

```typescript
const currencies = await client.getCurrencies();
console.log('Available currencies:', currencies);
```

**Returns:** `Promise<Record<string, string>>` - Object with currency codes as keys and descriptions as values

**Example:**

```typescript
const currencies = await client.getCurrencies();
console.log('Euro description:', currencies.EUR); // "Euro"
console.log('British Pound description:', currencies.GBP); // "British Pound Sterling"
```

### getTimeSeries(start: string, end: string, options?: GetRatesOptions)

Retrieves time-series data for a specified date range.

```typescript
const timeSeries = await client.getTimeSeries('2023-01-01', '2023-01-07');
```

**Parameters:**

- `start`: Start date in YYYY-MM-DD format
- `end`: End date in YYYY-MM-DD format
- `options` (optional): Same as `getRates` options

**Returns:** `Promise<TimeSeriesResponse>` - Time-series data with rates for each date

**TimeSeriesResponse:**

- `disclaimer`: API disclaimer text
- `license`: License information
- `start_date`: Start date of the series
- `end_date`: End date of the series
- `base`: Base currency used
- `rates`: Object with dates as keys and rate objects as values

**Examples:**

```typescript
// Get time series for a week
const timeSeries = await client.getTimeSeries('2023-01-01', '2023-01-07');

// Get specific currencies for time series
const specificTimeSeries = await client.getTimeSeries(
  '2023-01-01',
  '2023-01-07',
  {
    symbols: ['EUR', 'GBP'],
  },
);
```

### convert(amount: number, from: string, to: string)

Converts an amount from one currency to another.

```typescript
const conversion = await client.convert(100, 'USD', 'EUR');
console.log(`Result: ${conversion.result} EUR`);
```

**Parameters:**

- `amount`: Amount to convert
- `from`: Source currency code
- `to`: Target currency code

**Returns:** `Promise<ConversionResponse>` - Conversion result with rate information

**ConversionResponse:**

- `disclaimer`: API disclaimer text
- `license`: License information
- `request`: Object with conversion request details
- `info`: Object with conversion rate information
- `result`: Final converted amount

**Example:**

```typescript
const conversion = await client.convert(100, 'USD', 'EUR');
console.log(`100 USD = ${conversion.result} EUR`);
console.log(`Exchange rate: ${conversion.info.rate}`);
```

### getOHLC(start: string, end: string, options?: GetRatesOptions)

Retrieves OHLC (Open, High, Low, Close) data for a specified date range.

```typescript
const ohlc = await client.getOHLC('2023-01-01', '2023-01-07');
```

**Parameters:**

- `start`: Start date in YYYY-MM-DD format
- `end`: End date in YYYY-MM-DD format
- `options` (optional): Same as `getRates` options

**Returns:** `Promise<OHLCResponse>` - OHLC data for each currency

**OHLCResponse:**

- `disclaimer`: API disclaimer text
- `license`: License information
- `start_date`: Start date of the period
- `end_date`: End date of the period
- `base`: Base currency used
- `rates`: Object with currency codes as keys and OHLC data as values

**Example:**

```typescript
const ohlc = await client.getOHLC('2023-01-01', '2023-01-07');
console.log('EUR OHLC:', ohlc.rates.EUR);
// { open: 1.0651, high: 1.0721, low: 1.0598, close: 1.0663, average: 1.0658 }
```

### getStatus()

Retrieves account status and usage information.

```typescript
const status = await client.getStatus();
console.log(
  `Requests used: ${status.usage.requests}/${status.usage.requests_quota}`,
);
```

**Returns:** `Promise<StatusResponse>` - Account status and usage data

**StatusResponse:**

- `disclaimer`: API disclaimer text
- `license`: License information
- `usage`: Object with usage statistics
- `plan`: Object with plan information

**Example:**

```typescript
const status = await client.getStatus();
console.log(`Plan: ${status.plan.name}`);
console.log(
  `Requests used: ${status.usage.requests}/${status.usage.requests_quota}`,
);
console.log(`Requests remaining: ${status.usage.requests_remaining}`);
```

## 📝 Usage Examples

### Basic Currency Conversion Service

```typescript
import { OpenExchange } from 'jsr:@tundraconnect/openexchange';

class CurrencyService {
  private client: OpenExchange;

  constructor(appId: string) {
    this.client = new OpenExchange({
      appId,
      baseCurrency: 'USD',
      timeout: 30,
    });
  }

  async getCurrentRate(currency: string): Promise<number> {
    const rates = await this.client.getRates({
      symbols: [currency],
    });
    return rates[currency];
  }

  async convertCurrency(
    amount: number,
    from: string,
    to: string,
  ): Promise<number> {
    const conversion = await this.client.convert(amount, from, to);
    return conversion.result;
  }

  async getHistoricalTrend(currency: string, days: number): Promise<number[]> {
    const dates = Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    });

    const historicalData = await Promise.all(
      dates.map((date) =>
        this.client.getHistoricalRates(date, {
          symbols: [currency],
        })
      ),
    );

    return historicalData.map((data) => data.rates[currency]);
  }
}

// Usage
const service = new CurrencyService('your-app-id');

// Get current EUR rate
const eurRate = await service.getCurrentRate('EUR');
console.log('Current EUR rate:', eurRate);

// Convert 100 USD to EUR
const converted = await service.convertCurrency(100, 'USD', 'EUR');
console.log('Converted amount:', converted);

// Get 7-day EUR trend
const trend = await service.getHistoricalTrend('EUR', 7);
console.log('7-day EUR trend:', trend);
```

### Portfolio Tracker

```typescript
class PortfolioTracker {
  private client: OpenExchange;

  constructor(appId: string) {
    this.client = new OpenExchange({ appId });
  }

  async calculatePortfolioValue(
    holdings: Record<string, number>,
  ): Promise<number> {
    const currencies = Object.keys(holdings).filter((c) => c !== 'USD');
    const rates = await this.client.getRates({
      symbols: currencies,
    });

    let totalValue = holdings.USD || 0;

    for (const [currency, amount] of Object.entries(holdings)) {
      if (currency !== 'USD') {
        totalValue += amount / rates[currency];
      }
    }

    return totalValue;
  }

  async getPortfolioTrend(
    holdings: Record<string, number>,
    days: number,
  ): Promise<number[]> {
    const dates = Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    });

    const currencies = Object.keys(holdings).filter((c) => c !== 'USD');
    const values = await Promise.all(
      dates.map(async (date) => {
        const rates = await this.client.getHistoricalRates(date, {
          symbols: currencies,
        });

        let totalValue = holdings.USD || 0;
        for (const [currency, amount] of Object.entries(holdings)) {
          if (currency !== 'USD') {
            totalValue += amount / rates.rates[currency];
          }
        }
        return totalValue;
      }),
    );

    return values;
  }
}

// Usage
const tracker = new PortfolioTracker('your-app-id');

const portfolio = {
  USD: 1000,
  EUR: 500,
  GBP: 300,
  JPY: 50000,
};

const currentValue = await tracker.calculatePortfolioValue(portfolio);
console.log('Portfolio value in USD:', currentValue);

const trend = await tracker.getPortfolioTrend(portfolio, 30);
console.log('30-day portfolio trend:', trend);
```

### Rate Alert System

```typescript
class RateAlertSystem {
  private client: OpenExchange;
  private alerts: Map<
    string,
    { target: number; callback: (rate: number) => void }
  > = new Map();

  constructor(appId: string) {
    this.client = new OpenExchange({ appId });
  }

  addAlert(
    currency: string,
    targetRate: number,
    callback: (rate: number) => void,
  ) {
    this.alerts.set(currency, { target: targetRate, callback });
  }

  async checkAlerts(): Promise<void> {
    if (this.alerts.size === 0) return;

    const currencies = Array.from(this.alerts.keys());
    const rates = await this.client.getRates({ symbols: currencies });

    for (const [currency, alert] of this.alerts) {
      const currentRate = rates[currency];
      if (currentRate <= alert.target) {
        alert.callback(currentRate);
        this.alerts.delete(currency); // Remove triggered alert
      }
    }
  }

  startMonitoring(intervalMinutes: number = 5): void {
    setInterval(async () => {
      try {
        await this.checkAlerts();
      } catch (error) {
        console.error('Error checking alerts:', error);
      }
    }, intervalMinutes * 60 * 1000);
  }
}

// Usage
const alertSystem = new RateAlertSystem('your-app-id');

// Alert when EUR drops below 1.05
alertSystem.addAlert('EUR', 1.05, (rate) => {
  console.log(`EUR alert triggered! Current rate: ${rate}`);
});

// Start monitoring every 5 minutes
alertSystem.startMonitoring(5);
```

## 🎯 Best Practices

### 1. Error Handling

Always wrap API calls in try-catch blocks and handle specific error types:

```typescript
import {
  OpenExchange,
  OpenExchangeError,
} from 'jsr:@tundraconnect/openexchange';

try {
  const rates = await client.getRates();
} catch (error) {
  if (error instanceof OpenExchangeError) {
    switch (error.code) {
      case 'INVALID_APP_ID':
        console.error('Invalid API key');
        break;
      case 'NOT_ALLOWED':
        console.error('Feature not available on current plan');
        break;
      default:
        console.error('API error:', error.message);
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### 2. Rate Limiting

Implement caching to avoid hitting rate limits:

```typescript
class CachedOpenExchange {
  private client: OpenExchange;
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(appId: string) {
    this.client = new OpenExchange({ appId });
  }

  async getRates(options?: GetRatesOptions): Promise<Record<string, number>> {
    const cacheKey = JSON.stringify(options);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const rates = await this.client.getRates(options);
    this.cache.set(cacheKey, { data: rates, timestamp: Date.now() });
    return rates;
  }
}
```

### 3. Configuration Management

Use environment variables for sensitive configuration:

```typescript
const client = new OpenExchange({
  appId: Deno.env.get('OPENEXCHANGE_APP_ID')!,
  baseCurrency: Deno.env.get('OPENEXCHANGE_BASE_CURRENCY') || 'USD',
  timeout: parseInt(Deno.env.get('OPENEXCHANGE_TIMEOUT') || '10'),
});
```

### 4. Type Safety

Leverage TypeScript types for better development experience:

```typescript
import type {
  ConversionResponse,
  GetRatesOptions,
} from 'jsr:@tundraconnect/openexchange';

async function convertWithValidation(
  amount: number,
  from: string,
  to: string,
): Promise<ConversionResponse> {
  // Validate input parameters
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  if (from.length !== 3 || to.length !== 3) {
    throw new Error('Currency codes must be 3 characters');
  }

  return await client.convert(amount, from, to);
}
```

### 5. Graceful Degradation

Implement fallback mechanisms for better reliability:

```typescript
async function getRatesWithFallback(
  options?: GetRatesOptions,
): Promise<Record<string, number>> {
  try {
    return await client.getRates(options);
  } catch (error) {
    if (error instanceof OpenExchangeError && error.code === 'NOT_ALLOWED') {
      // Fallback to getting all rates if specific symbols aren't allowed
      return await client.getRates();
    }
    throw error;
  }
}
```

## 🔗 Related Documentation

- [Error Handling Guide](./errors.md) - Comprehensive error handling documentation
- [Schema Documentation](./schemas.md) - Response schemas and validation information
- [Documentation Hub](./README.md) - Main documentation index
