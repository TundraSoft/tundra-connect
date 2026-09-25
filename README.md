# 🔗 Tundra Connect

> Vendor API integrations for Deno, Bun, and Node — built on
> [`@tundralibs/restler`](https://jsr.io/@tundralibs/restler) and
> [`@tundralibs/guardian`](https://jsr.io/@tundralibs/guardian)

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers & Browser](https://img.shields.io/badge/Cloudflare_Workers_%26_Browser-compatible-orange?logo=cloudflareworkers)

Tundra Connect wraps popular third-party vendor APIs (payments, object
storage, messaging, market data, ...) in typed, tested, cross-runtime
clients. Each connect is an independently versioned package published to JSR
under the `@tundraconnect` scope, living under `connectors/<name>/`. See
[CONVENTIONS.md](CONVENTIONS.md) for the shared structure and
[CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

Runs on Deno, Bun and Node; Web-APIs-only, so it also works on Cloudflare
Workers (smoke-tested in CI inside workerd) and in the browser (not
CI-verified).

<!-- workspace:connectors:start -->

## 📦 Connects

- **[Algolia](./connectors/algolia/README.md)** — [`@tundraconnect/algolia`](https://jsr.io/@tundraconnect/algolia) — Typed Algolia Search client: search, save, fetch, delete and browse index records, and wait for indexing tasks to finish.
- **[AzureBlob](./connectors/azure-blob/README.md)** — [`@tundraconnect/azure-blob`](https://jsr.io/@tundraconnect/azure-blob) — Typed Azure Blob Storage client with Shared Key or SAS auth: upload, download, list, inspect and delete blobs, including streamed block uploads and downloads for large files.
- **[CloudflareEmail](./connectors/cloudflare-email/README.md)** — [`@tundraconnect/cloudflare-email`](https://jsr.io/@tundraconnect/cloudflare-email) — Typed Cloudflare Email Sending client: send transactional email with attachments, validated locally before the request is made.
- **[CoinGecko](./connectors/coingecko/README.md)** — [`@tundraconnect/coingecko`](https://jsr.io/@tundraconnect/coingecko) — Typed CoinGecko client for the demo and pro tiers: coin prices, market data and the full coin list.
- **[Discord](./connectors/discord/README.md)** — [`@tundraconnect/discord`](https://jsr.io/@tundraconnect/discord) — Typed Discord client: post messages through a webhook or a bot token, and verify Ed25519-signed interaction webhooks.
- **[DodoPayments](./connectors/dodo-payments/README.md)** — [`@tundraconnect/dodo-payments`](https://jsr.io/@tundraconnect/dodo-payments) — Typed Dodo Payments client: create and verify payments, manage subscriptions, page through a customer's history, and verify Standard Webhooks signatures.
- **[GCS](./connectors/gcs/README.md)** — [`@tundraconnect/gcs`](https://jsr.io/@tundraconnect/gcs) — Typed Google Cloud Storage client with bearer or service-account auth: upload, download, list, inspect and delete objects, including resumable streamed uploads for large files.
- **[Kalshi](./connectors/kalshi/README.md)** — [`@tundraconnect/kalshi`](https://jsr.io/@tundraconnect/kalshi) — Typed Kalshi client: public market data, plus RSA-PSS-signed trading — balance, positions, fills and orders; place, amend and cancel orders.
- **[ntfy](./connectors/ntfy/README.md)** — [`@tundraconnect/ntfy`](https://jsr.io/@tundraconnect/ntfy) — Typed ntfy.sh client for publishing push notifications to a topic.
- **[OpenExchange](./connectors/openexchange/README.md)** — [`@tundraconnect/openexchange`](https://jsr.io/@tundraconnect/openexchange) — Typed Open Exchange Rates client: latest and historical rates, time series, currency conversion, OHLC data and account usage.
- **[OpenWeatherMap](./connectors/openweathermap/README.md)** — [`@tundraconnect/openweathermap`](https://jsr.io/@tundraconnect/openweathermap) — Typed OpenWeatherMap client: current weather and 5-day / 3-hour forecasts by city name or coordinates.
- **[PayPal](./connectors/paypal/README.md)** — [`@tundraconnect/paypal`](https://jsr.io/@tundraconnect/paypal) — Typed PayPal client for Orders v2: create, fetch, capture and refund, with automatic OAuth2 tokens, idempotency keys and webhook verification.
- **[Polymarket](./connectors/polymarket/README.md)** — [`@tundraconnect/polymarket`](https://jsr.io/@tundraconnect/polymarket) — Typed Polymarket client: Gamma market discovery, CLOB trading with secp256k1/EIP-712 order signing, portfolio positions and value, and gasless split/merge/redeem.
- **[Razorpay](./connectors/razorpay/README.md)** — [`@tundraconnect/razorpay`](https://jsr.io/@tundraconnect/razorpay) — Typed Razorpay client: create and fetch orders; capture, fetch and list payments; create payment links; and verify webhook signatures.
- **[S3](./connectors/s3/README.md)** — [`@tundraconnect/s3`](https://jsr.io/@tundraconnect/s3) — Typed S3 client with SigV4 signing for AWS S3, Cloudflare R2, MinIO and DigitalOcean Spaces: object CRUD and listing, plus streamed multipart uploads and downloads.
- **[SendGrid](./connectors/sendgrid/README.md)** — [`@tundraconnect/sendgrid`](https://jsr.io/@tundraconnect/sendgrid) — Typed Twilio SendGrid client: send transactional email, inspect API-key scopes, and verify ECDSA-signed event webhooks.
- **[Sentry](./connectors/sentry/README.md)** — [`@tundraconnect/sentry`](https://jsr.io/@tundraconnect/sentry) — Typed Sentry API client: list projects; list, fetch and update issues; read issue events; and create releases.
- **[Slack](./connectors/slack/README.md)** — [`@tundraconnect/slack`](https://jsr.io/@tundraconnect/slack) — Typed Slack Web API client: post, update and delete messages, list channels and read history, look up users, and verify request signatures.
- **[Stripe](./connectors/stripe/README.md)** — [`@tundraconnect/stripe`](https://jsr.io/@tundraconnect/stripe) — Typed Stripe client: create and retrieve PaymentIntents and create customers, with idempotency keys and webhook signature verification.
- **[Telegram](./connectors/telegram/README.md)** — [`@tundraconnect/telegram`](https://jsr.io/@tundraconnect/telegram) — Typed Telegram Bot API client: send messages and fetch the bot's own identity.
- **[Twilio](./connectors/twilio/README.md)** — [`@tundraconnect/twilio`](https://jsr.io/@tundraconnect/twilio) — Typed Twilio client: send SMS/MMS; place, list, update and delete voice calls; and verify webhook signatures.
- **[UpstashRedis](./connectors/upstash-redis/README.md)** — [`@tundraconnect/upstash-redis`](https://jsr.io/@tundraconnect/upstash-redis) — Typed Upstash Redis REST client: string, hash and list commands, TTLs, counters and pipelining over plain HTTPS — no TCP connection needed.

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
