# 🔗 OpenExchange Connect

> A comprehensive TypeScript/Deno client for the OpenExchange Rates API, providing real-time and historical exchange rate data with robust error handling and schema validation.

## 🏢 About OpenExchange Rates

[OpenExchange Rates](https://openexchangerates.org/) is a reliable, real-time exchange rate API service that provides accurate currency exchange rates for over 170 currencies worldwide. The service offers:

- **Real-time exchange rates** updated every 60 seconds (paid plans) or hourly (free plan)
- **Historical data** going back to 1999
- **Time-series data** for trend analysis
- **Currency conversion** with precise calculations
- **OHLC data** (Open, High, Low, Close) for financial analysis
- **Multiple base currencies** (USD default, others available on paid plans)

## 🚀 Quick Start

```bash
# Install via JSR
deno add jsr:@tundraconnect/openexchange
```

```typescript
// Basic usage
import { OpenExchange } from 'jsr:@tundraconnect/openexchange';

const client = new OpenExchange({
  appId: 'your-app-id-here',
  baseCurrency: 'USD', // Optional, defaults to USD
  timeout: 10, // Optional, request timeout in seconds
});

// Get latest exchange rates
const rates = await client.getRates();
console.log('EUR rate:', rates.EUR);
console.log('GBP rate:', rates.GBP);

// Get historical rates
const historicalRates = await client.getHistoricalRates('2023-01-01');
console.log('Historical EUR rate:', historicalRates.rates.EUR);

// Convert currencies
const conversion = await client.convert(100, 'USD', 'EUR');
console.log(`100 USD = ${conversion.result} EUR`);
console.log(`Exchange rate: ${conversion.info.rate}`);

// Get account status and usage
const status = await client.getStatus();
console.log(
  `Requests used: ${status.usage.requests}/${status.usage.requests_quota}`,
);
```

## 📚 Documentation

For detailed documentation, please visit our [Documentation Hub](.docs/README.md).

## 🔗 Links

- [JSR Package](https://jsr.io/@tundraconnect/openexchange)
- [Official API Docs](https://docs.openexchangerates.org/reference/api-introduction)
- [Create Account](https://openexchangerates.org/signup)
- [GitHub Issues](https://github.com/TundraSoft/tundra-connect/issues)

## 📄 License

MIT License - see [LICENSE](../LICENSE) file for details.

**Made with 🏔️ by the TundraLibs team**
