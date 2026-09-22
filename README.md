# 🔗 Tundra Connect

> Vendor API integrations for Deno, Bun, and Node — built on
> [`@tundralibs/restler`](https://jsr.io/@tundralibs/restler) and
> [`@tundralibs/guardian`](https://jsr.io/@tundralibs/guardian)

Tundra Connect wraps popular third-party vendor APIs (currency exchange
rates, SMS/communications, KYC verification, ...) in typed, tested,
cross-runtime clients. Each connect is an independently versioned package
published to JSR under the `@tundraconnect` scope, living under
`connectors/<name>/`. See [CONVENTIONS.md](CONVENTIONS.md) for the shared
structure and [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

<!-- workspace:connectors:start -->

## 📦 Connects

- **[Algolia](./connectors/algolia/README.md)** — [`@tundraconnect/algolia`](https://jsr.io/@tundraconnect/algolia) — Algolia Search REST API client for search, indexing, and index browsing
- **[AzureBlob](./connectors/azure-blob/README.md)** — [`@tundraconnect/azure-blob`](https://jsr.io/@tundraconnect/azure-blob) — Azure Blob Storage REST API client with Shared Key (HMAC-SHA256) request signing
- **[CoinGecko](./connectors/coingecko/README.md)** — [`@tundraconnect/coingecko`](https://jsr.io/@tundraconnect/coingecko) — CoinGecko API client for cryptocurrency price, market, and coin-list data
- **[Discord](./connectors/discord/README.md)** — [`@tundraconnect/discord`](https://jsr.io/@tundraconnect/discord) — Discord REST API client for sending channel messages via webhooks or a bot token
- **[GCS](./connectors/gcs/README.md)** — [`@tundraconnect/gcs`](https://jsr.io/@tundraconnect/gcs) — Google Cloud Storage JSON API client for object upload, download, listing, and metadata
- **[Kalshi](./connectors/kalshi/README.md)** — [`@tundraconnect/kalshi`](https://jsr.io/@tundraconnect/kalshi) — Kalshi market data and RSA-PSS-authenticated trading API client
- **[ntfy](./connectors/ntfy/README.md)** — [`@tundraconnect/ntfy`](https://jsr.io/@tundraconnect/ntfy) — ntfy.sh client for simple pub-sub push notifications
- **[OpenExchange](./connectors/openexchange/README.md)** — [`@tundraconnect/openexchange`](https://jsr.io/@tundraconnect/openexchange) — OpenExchangeRates API client for currency exchange rates and conversions
- **[OpenWeatherMap](./connectors/openweathermap/README.md)** — [`@tundraconnect/openweathermap`](https://jsr.io/@tundraconnect/openweathermap) — OpenWeatherMap API client for current weather conditions and 5-day/3-hour forecasts
- **[PayPal](./connectors/paypal/README.md)** — [`@tundraconnect/paypal`](https://jsr.io/@tundraconnect/paypal) — Typed client for PayPal's REST API — Orders v2 create/get/capture and capture refunds, with automatic OAuth2 client-credentials token exchange.
- **[Polymarket](./connectors/polymarket/README.md)** — [`@tundraconnect/polymarket`](https://jsr.io/@tundraconnect/polymarket) — Polymarket Gamma (market discovery) and CLOB (trading) API client
- **[Razorpay](./connectors/razorpay/README.md)** — [`@tundraconnect/razorpay`](https://jsr.io/@tundraconnect/razorpay) — Typed client for the Razorpay REST API — Orders, Payments, and Payment Links.
- **[S3](./connectors/s3/README.md)** — [`@tundraconnect/s3`](https://jsr.io/@tundraconnect/s3) — AWS S3 (and S3-compatible: R2, MinIO) object storage client with SigV4 request signing
- **[SendGrid](./connectors/sendgrid/README.md)** — [`@tundraconnect/sendgrid`](https://jsr.io/@tundraconnect/sendgrid) — Twilio SendGrid API client for transactional email
- **[Sentry](./connectors/sentry/README.md)** — [`@tundraconnect/sentry`](https://jsr.io/@tundraconnect/sentry) — Sentry organization/project REST API client for issues, projects, and releases
- **[Slack](./connectors/slack/README.md)** — [`@tundraconnect/slack`](https://jsr.io/@tundraconnect/slack) — Slack Web API client for messaging, conversations, and users
- **[Stripe](./connectors/stripe/README.md)** — [`@tundraconnect/stripe`](https://jsr.io/@tundraconnect/stripe) — Stripe REST API client for PaymentIntents and Customers
- **[Telegram](./connectors/telegram/README.md)** — [`@tundraconnect/telegram`](https://jsr.io/@tundraconnect/telegram) — Telegram Bot API client for sending messages via bot HTTPS API
- **[Twilio](./connectors/twilio/README.md)** — [`@tundraconnect/twilio`](https://jsr.io/@tundraconnect/twilio) — Twilio REST API client for sending SMS/MMS messages and placing/managing voice calls
- **[UpstashRedis](./connectors/upstash-redis/README.md)** — [`@tundraconnect/upstash-redis`](https://jsr.io/@tundraconnect/upstash-redis) — Typed client for the Upstash Redis REST API — GET/SET/DEL/EXPIRE/INCR/hash/list commands plus pipelining.

<!-- workspace:connectors:end -->

## 🚀 Quick start

```bash
deno add jsr:@tundraconnect/openexchange
```

```typescript
import { OpenExchange } from '@tundraconnect/openexchange';

const client = new OpenExchange({
  auth: { type: 'CUSTOM', appId: 'your-app-id' },
});
const rates = await client.getRates();
```

## 🤝 Community & support

- **[🐛 Bug reports](https://github.com/TundraSoft/tundra-connect/issues/new/choose)**
- **[✨ Feature requests](https://github.com/TundraSoft/tundra-connect/issues/new/choose)**
- **[🔒 Security issues](https://github.com/TundraSoft/tundra-connect/security/advisories/new)**
- **[💬 Discussions](https://github.com/TundraSoft/tundra-connect/discussions)**
- **[📖 Contributing guide](./CONTRIBUTING.md)**

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
