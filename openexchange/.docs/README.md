# � OpenExchange Connect Documentation

Welcome to the comprehensive documentation for OpenExchange Connect, a robust TypeScript/Deno client library for the OpenExchange Rates API.

## 🏢 About OpenExchange Rates

[OpenExchange Rates](https://openexchangerates.org/) is a reliable, real-time exchange rate API service that provides accurate currency exchange rates for over 170 currencies worldwide. The service offers:

- **Real-time exchange rates** updated every 60 seconds (paid plans) or hourly (free plan)
- **Historical data** going back to 1999
- **Time-series data** for trend analysis
- **Currency conversion** with precise calculations
- **OHLC data** (Open, High, Low, Close) for financial analysis
- **Multiple base currencies** (USD default)

## 🗂️ Documentation Structure

This documentation is organized into specialized sections for easy navigation:

### 📖 [OpenExchange Class Documentation](./OpenExchange.md)

Comprehensive guide to the OpenExchange client class including:

- Class initialization and configuration
- All available methods with examples
- Parameter descriptions and return types
- Usage patterns and best practices

### ❌ [Error Handling Guide](./errors.md)

Complete error handling documentation covering:

- OpenExchangeError class structure
- All error codes and their meanings
- HTTP status code mapping
- Error handling patterns and retry logic

### 🔧 [Schema Documentation](./schemas.md)

Detailed schema validation information including:

- Response type definitions
- Guardian validation rules
- Schema validation examples
- Type safety explanations

## 🚀 Quick Start

```typescript
import { OpenExchange } from 'jsr:@tundraconnect/openexchange';

const client = new OpenExchange({
  appId: 'your-app-id-here',
  baseCurrency: 'USD',
  timeout: 10,
});

// Get latest rates
const rates = await client.getRates();
console.log('EUR rate:', rates.EUR);
```

## 🔗 External Resources

- [OpenExchange Rates Official API Documentation](https://docs.openexchangerates.org/)
- [Guardian Validation Library](https://github.com/TundraSoft/TundraLibs/)
- [JSR Package Registry](https://jsr.io/@tundraconnect/openexchange)
- [GitHub Repository](https://github.com/TundraSoft/tundra-connect)

## 🤝 Support

- **Issues**: Report bugs and request features on [GitHub Issues](https://github.com/TundraSoft/tundra-connect/issues)
- **Discussions**: Join the community on [GitHub Discussions](https://github.com/TundraSoft/tundra-connect/discussions)
- **Security**: Report security issues privately through [GitHub Security](https://github.com/TundraSoft/tundra-connect/security)

---

**Navigate to the specific documentation sections using the links above to dive deeper into any topic.**
const client = new OpenExchange({
appId: 'your-app-id-here'
});

````
### Advanced Initialization

```typescript
const client = new OpenExchange({
  appId: 'your-app-id-here',
  baseCurrency: 'EUR',
  timeout: 30,
  headers: {
    'User-Agent': 'MyApp/1.0'
  }
});
````

## 📊 API Methods

### getStatus()

Get account status and usage information.

```typescript
getStatus(): Promise<UsageResponseSchema>
```

**Returns**: Account status, plan information, and usage statistics.

```typescript
const status = await client.getStatus();
console.log('Plan:', status.data.plan.name);
console.log('Requests used:', status.usage.requests);
console.log('Requests remaining:', status.usage.requests_remaining);
```

### listCurrencies()

Get the list of all supported currencies.

```typescript
listCurrencies(): Promise<CurrenciesSchema>
```

**Returns**: Object mapping currency codes to currency names.

```typescript
const currencies = await client.listCurrencies();
console.log('USD:', currencies.USD); // "United States Dollar"
console.log('EUR:', currencies.EUR); // "Euro"
```

### getRates()

Get the latest exchange rates.

```typescript
getRates(options?: {
  base?: string;
  symbols?: string[];
}): Promise<Record<string, number>>
```

**Parameters**:

- `options.base`: Base currency (defaults to client's baseCurrency)
- `options.symbols`: Array of currency codes to limit results

**Returns**: Object mapping currency codes to exchange rates.

```typescript
// Get all rates with default base (USD)
const allRates = await client.getRates();

// Get rates with specific base currency
const eurRates = await client.getRates({
  base: 'EUR',
});

// Get rates for specific currencies only
const specificRates = await client.getRates({
  base: 'USD',
  symbols: ['EUR', 'GBP', 'JPY'],
});
```

### getHistoricalRates()

Get historical exchange rates for a specific date.

```typescript
getHistoricalRates(
  date: string,
  options?: {
    base?: string;
    symbols?: string[];
  }
): Promise<HistoricalRatesSchema>
```

**Parameters**:

- `date`: Date in YYYY-MM-DD format
- `options.base`: Base currency (defaults to client's baseCurrency)
- `options.symbols`: Array of currency codes to limit results

**Returns**: Historical rates data with metadata.

```typescript
// Get historical rates for a specific date
const historicalRates = await client.getHistoricalRates('2023-01-01');
console.log('EUR rate on 2023-01-01:', historicalRates.rates.EUR);

// Get historical rates with specific base and symbols
const specificHistorical = await client.getHistoricalRates('2023-01-01', {
  base: 'EUR',
  symbols: ['USD', 'GBP'],
});
```

### getTimeSeries()

Get time series exchange rate data for a date range.

```typescript
getTimeSeries(
  startDate: string,
  endDate: string,
  options?: {
    base?: string;
    symbols?: string[];
  }
): Promise<TimeSeriesSchema>
```

**Parameters**:

- `startDate`: Start date in YYYY-MM-DD format
- `endDate`: End date in YYYY-MM-DD format
- `options.base`: Base currency (defaults to client's baseCurrency)
- `options.symbols`: Array of currency codes to limit results

**Returns**: Time series data with rates for each date.

```typescript
// Get time series data for a date range
const timeSeries = await client.getTimeSeries('2023-01-01', '2023-01-31');
console.log('EUR rates:', timeSeries.rates['2023-01-01'].EUR);

// Get time series for specific currencies
const specificTimeSeries = await client.getTimeSeries(
  '2023-01-01',
  '2023-01-31',
  {
    base: 'EUR',
    symbols: ['USD', 'GBP'],
  },
);
```

### convert()

Convert an amount from one currency to another.

```typescript
convert(
  amount: number,
  from: string,
  to: string,
  options?: {
    date?: string;
  }
): Promise<ConvertRequestSchema>
```

**Parameters**:

- `amount`: Amount to convert
- `from`: Source currency code
- `to`: Target currency code
- `options.date`: Specific date for historical conversion (YYYY-MM-DD format)

**Returns**: Conversion result with detailed information.

```typescript
// Convert using current rates
const conversion = await client.convert(100, 'USD', 'EUR');
console.log('Result:', conversion.result);
console.log('Rate:', conversion.info.rate);

// Convert using historical rates
const historicalConversion = await client.convert(100, 'USD', 'EUR', {
  date: '2023-01-01',
});
```

### getOHLC()

Get OHLC (Open, High, Low, Close) data for currency pairs.

```typescript
getOHLC(
  startDate: string,
  period: string,
  options?: {
    base?: string;
    symbols?: string[];
  }
): Promise<OHLCSchema>
```

**Parameters**:

- `startDate`: Start date in YYYY-MM-DD format
- `period`: Time period ('1d', '1w', '1m', etc.)
- `options.base`: Base currency (defaults to client's baseCurrency)
- `options.symbols`: Array of currency codes to limit results

**Returns**: OHLC data with open, high, low, close values.

```typescript
// Get OHLC data for a specific period
const ohlc = await client.getOHLC('2023-01-01', '1d', {
  base: 'EUR',
  symbols: ['USD'],
});

const usdData = ohlc.rates['2023-01-01'].USD;
console.log('Open:', usdData.open);
console.log('High:', usdData.high);
console.log('Low:', usdData.low);
console.log('Close:', usdData.close);
```

## ⚙️ Configuration Options

### Setting Base Currency

```typescript
const client = new OpenExchange({
  appId: 'your-app-id',
  baseCurrency: 'EUR',
});

// All requests will use EUR as base by default
const rates = await client.getRates();
```

### Custom Timeout

```typescript
const client = new OpenExchange({
  appId: 'your-app-id',
  timeout: 30, // 30 seconds timeout
});
```

### Custom Headers

```typescript
const client = new OpenExchange({
  appId: 'your-app-id',
  headers: {
    'User-Agent': 'MyApp/1.0',
    'X-Custom-Header': 'custom-value',
  },
});
```

## 🔍 Error Handling

The client throws `OpenExchangeError` instances for various error conditions. See the [Error Handling Guide](./errors.md) for complete details.

```typescript
import { OpenExchangeError } from '@tundraconnect/openexchange';

try {
  const rates = await client.getRates();
} catch (error) {
  if (error instanceof OpenExchangeError) {
    console.log('Error code:', error.code);
    console.log('Error message:', error.message);
    console.log('Error metadata:', error.metadata);
  }
}
```

## 📝 Examples

### Complete Rate Monitoring Example

```typescript
import { OpenExchange } from '@tundraconnect/openexchange';

const client = new OpenExchange({
  appId: 'your-app-id-here',
  baseCurrency: 'USD',
});

async function monitorRates() {
  try {
    // Check account status
    const status = await client.getStatus();
    console.log(`Plan: ${status.data.plan.name}`);
    console.log(`Requests remaining: ${status.usage.requests_remaining}`);

    // Get current rates for major currencies
    const rates = await client.getRates({
      symbols: ['EUR', 'GBP', 'JPY', 'CAD', 'AUD'],
    });

    console.log('Current rates:');
    Object.entries(rates).forEach(([currency, rate]) => {
      console.log(`  ${currency}: ${rate}`);
    });

    // Get historical comparison
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const historicalRates = await client.getHistoricalRates(yesterdayStr, {
      symbols: ['EUR', 'GBP', 'JPY'],
    });

    console.log('Rate changes from yesterday:');
    ['EUR', 'GBP', 'JPY'].forEach((currency) => {
      const current = rates[currency];
      const previous = historicalRates.rates[currency];
      const change = ((current - previous) / previous * 100).toFixed(2);
      console.log(`  ${currency}: ${change}%`);
    });
  } catch (error) {
    console.error('Error monitoring rates:', error);
  }
}

monitorRates();
```

### Currency Conversion Service

```typescript
import { OpenExchange } from '@tundraconnect/openexchange';

const client = new OpenExchange({
  appId: 'your-app-id-here',
});

async function convertCurrency(amount: number, from: string, to: string) {
  try {
    const conversion = await client.convert(amount, from, to);

    return {
      originalAmount: amount,
      originalCurrency: from,
      convertedAmount: conversion.result,
      targetCurrency: to,
      exchangeRate: conversion.info.rate,
      timestamp: new Date(conversion.timestamp * 1000),
    };
  } catch (error) {
    console.error('Conversion failed:', error);
    throw error;
  }
}

// Usage
const result = await convertCurrency(100, 'USD', 'EUR');
console.log(
  `${result.originalAmount} ${result.originalCurrency} = ${result.convertedAmount} ${result.targetCurrency}`,
);
```

## 📚 Additional Resources

- [Schema Documentation](./schemas.md) - Detailed schema definitions
- [Error Handling Guide](./errors.md) - Complete error reference
- [OpenExchange API Documentation](https://docs.openexchangerates.org/reference/api-introduction)
- [Create API Account](https://openexchangerates.org/signup)

## � Related Files

- [`../OpenExchange.ts`](../OpenExchange.ts) - Main client implementation
- [`../OpenExchangeError.ts`](../OpenExchangeError.ts) - Error handling
- [`../schema/`](../schema/) - Schema definitions
