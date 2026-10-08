# 🔗 Tundra Connect

> Vendor API integrations for Deno, Bun, and Node — built on
> [`@tundralibs/restler`](https://jsr.io/@tundralibs/restler) and
> [`@tundralibs/guardian`](https://jsr.io/@tundralibs/guardian)

[![Deno 2.0+](https://img.shields.io/badge/Deno-2.0+-000000?logo=deno)](#-connects)
[![Bun 1.0+](https://img.shields.io/badge/Bun-1.0+-f9f1e1?logo=bun)](#-connects)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](#-connects)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](#-connects)
[![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)](#-connects)

[![CI](https://github.com/TundraSoft/tundra-connect/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/TundraSoft/tundra-connect/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/TundraSoft/tundra-connect/graph/badge.svg)](https://codecov.io/gh/TundraSoft/tundra-connect)

Tundra Connect wraps popular third-party vendor APIs in typed, tested,
cross-runtime TypeScript clients. Each connect is an independently versioned
package published to [JSR](https://jsr.io/@tundraconnect) under the
`@tundraconnect` scope. Requests and responses are validated at runtime, and
failures surface as one typed error class per vendor.

- **Payments:** Stripe, PayPal, Razorpay, Dodo Payments
- **Object storage:** AWS S3 and S3-compatible stores (Cloudflare R2, MinIO,
  DigitalOcean Spaces), Google Cloud Storage, Azure Blob Storage
- **Messaging and notifications:** Slack, Discord, Telegram, Twilio SMS and
  voice, SendGrid and Cloudflare email, ntfy push
- **Market data and prediction markets:** CoinGecko, Open Exchange Rates,
  Kalshi, Polymarket
- **Search, data and operations:** Algolia, Upstash Redis, Sentry,
  OpenWeatherMap
- **URL safety:** Google Web Risk, URLhaus (abuse.ch)
- **Analytics:** Google Analytics 4 server-side events (Measurement Protocol)
- **Cloudflare platform:** DNS records and zones, Cloudflare for SaaS custom
  hostnames, Turnstile token verification

See [CONVENTIONS.md](CONVENTIONS.md) for the shared structure and
[CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

Runs on Deno, Bun and Node; Web-APIs-only, so it also works on Cloudflare
Workers (smoke-tested in CI inside workerd) and in the browser (not
CI-verified).

<!-- workspace:connectors:start -->

## 📦 Connects

- **[Algolia](./connectors/algolia/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/algolia)](https://jsr.io/@tundraconnect/algolia) — Typed Algolia Search client: search, save, fetch, delete and browse index records, and wait for indexing tasks to finish.
- **[AzureBlob](./connectors/azure-blob/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/azure-blob)](https://jsr.io/@tundraconnect/azure-blob) — Typed Azure Blob Storage client with Shared Key or SAS auth: upload, download, list, inspect and delete blobs, including streamed block uploads and downloads for large files.
- **[CloudflareDNS](./connectors/cloudflare-dns/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/cloudflare-dns)](https://jsr.io/@tundraconnect/cloudflare-dns) — Typed Cloudflare DNS client: list, create, update, replace, delete and batch-edit DNS records in a zone, export the zone as BIND, and look up zones by name.
- **[CloudflareEmail](./connectors/cloudflare-email/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/cloudflare-email)](https://jsr.io/@tundraconnect/cloudflare-email) — Typed Cloudflare Email Sending client: send transactional email with attachments, validated locally before the request is made.
- **[CloudflareSaaS](./connectors/cloudflare-saas/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/cloudflare-saas)](https://jsr.io/@tundraconnect/cloudflare-saas) — Typed Cloudflare for SaaS client: create, list, inspect, update and delete custom hostnames with their TLS and ownership validation state, manage the fallback origin, and read the hostname quota.
- **[CloudflareTurnstile](./connectors/cloudflare-turnstile/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/cloudflare-turnstile)](https://jsr.io/@tundraconnect/cloudflare-turnstile) — Typed Cloudflare Turnstile client: verify a widget token server-side with siteverify, with hostname and action checks, a hard per-call deadline, and failed challenges as answers instead of errors.
- **[CoinGecko](./connectors/coingecko/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/coingecko)](https://jsr.io/@tundraconnect/coingecko) — Typed CoinGecko client for the demo and pro tiers: coin prices, market data and the full coin list.
- **[Discord](./connectors/discord/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/discord)](https://jsr.io/@tundraconnect/discord) — Typed Discord client: post messages through a webhook or a bot token, and verify Ed25519-signed interaction webhooks.
- **[DodoPayments](./connectors/dodo-payments/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/dodo-payments)](https://jsr.io/@tundraconnect/dodo-payments) — Typed Dodo Payments client: create, verify and refund payments, manage subscriptions and plan changes, sync products and discount codes, open the customer portal, and verify Standard Webhooks signatures.
- **[GCS](./connectors/gcs/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/gcs)](https://jsr.io/@tundraconnect/gcs) — Typed Google Cloud Storage client with bearer or service-account auth: upload, download, list, inspect and delete objects, including resumable streamed uploads for large files.
- **[GoogleAnalytics](./connectors/google-analytics/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/google-analytics)](https://jsr.io/@tundraconnect/google-analytics) — Typed Google Analytics 4 Measurement Protocol client: send server-side events and validate them against the debug endpoint, with GA4's event, parameter and user-property limits checked before the request is made.
- **[GoogleWebRisk](./connectors/google-web-risk/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/google-web-risk)](https://jsr.io/@tundraconnect/google-web-risk) — Typed Google Web Risk client: check a URL against Google's malware, phishing and unwanted-software lists with the Lookup API's uris:search, under a hard per-call deadline.
- **[Kalshi](./connectors/kalshi/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/kalshi)](https://jsr.io/@tundraconnect/kalshi) — Typed Kalshi client: public market data, plus RSA-PSS-signed trading — balance, positions, fills and orders; place, amend and cancel orders.
- **[ntfy](./connectors/ntfy/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/ntfy)](https://jsr.io/@tundraconnect/ntfy) — Typed ntfy.sh client for publishing push notifications to a topic.
- **[OpenExchange](./connectors/openexchange/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/openexchange)](https://jsr.io/@tundraconnect/openexchange) — Typed Open Exchange Rates client: latest and historical rates, time series, currency conversion, OHLC data and account usage.
- **[OpenWeatherMap](./connectors/openweathermap/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/openweathermap)](https://jsr.io/@tundraconnect/openweathermap) — Typed OpenWeatherMap client: current weather and 5-day / 3-hour forecasts by city name or coordinates.
- **[PayPal](./connectors/paypal/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/paypal)](https://jsr.io/@tundraconnect/paypal) — Typed PayPal client for Orders v2: create, fetch, capture and refund, with automatic OAuth2 tokens, idempotency keys and webhook verification.
- **[Polymarket](./connectors/polymarket/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/polymarket)](https://jsr.io/@tundraconnect/polymarket) — Typed Polymarket client: Gamma market discovery, CLOB trading with secp256k1/EIP-712 order signing, portfolio positions and value, and gasless split/merge/redeem.
- **[Razorpay](./connectors/razorpay/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/razorpay)](https://jsr.io/@tundraconnect/razorpay) — Typed Razorpay client: create and fetch orders; capture, fetch and list payments; create payment links; and verify webhook signatures.
- **[Resend](./connectors/resend/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/resend)](https://jsr.io/@tundraconnect/resend) — Typed Resend client: send single and batch transactional email with idempotency keys, retrieve delivery status, reschedule or cancel scheduled email, and verify Svix-signed webhooks.
- **[S3](./connectors/s3/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/s3)](https://jsr.io/@tundraconnect/s3) — Typed S3 client with SigV4 signing for AWS S3, Cloudflare R2, MinIO and DigitalOcean Spaces: object CRUD and listing, plus streamed multipart uploads and downloads.
- **[SendGrid](./connectors/sendgrid/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/sendgrid)](https://jsr.io/@tundraconnect/sendgrid) — Typed Twilio SendGrid client: send transactional email, inspect API-key scopes, and verify ECDSA-signed event webhooks.
- **[Sentry](./connectors/sentry/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/sentry)](https://jsr.io/@tundraconnect/sentry) — Typed Sentry API client: list projects; list, fetch and update issues; read issue events; and create releases.
- **[Slack](./connectors/slack/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/slack)](https://jsr.io/@tundraconnect/slack) — Typed Slack Web API client: post, update and delete messages, list channels and read history, look up users, and verify request signatures.
- **[Stripe](./connectors/stripe/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/stripe)](https://jsr.io/@tundraconnect/stripe) — Typed Stripe client: create and retrieve PaymentIntents and create customers, with idempotency keys and webhook signature verification.
- **[Telegram](./connectors/telegram/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/telegram)](https://jsr.io/@tundraconnect/telegram) — Typed Telegram Bot API client for webhook bots: send, edit and delete messages with inline keyboards, answer callback queries, manage the webhook and command menu, and verify and parse webhook updates and commands.
- **[Twilio](./connectors/twilio/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/twilio)](https://jsr.io/@tundraconnect/twilio) — Typed Twilio client: send SMS/MMS; place, list, update and delete voice calls; and verify webhook signatures.
- **[UpstashRedis](./connectors/upstash-redis/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/upstash-redis)](https://jsr.io/@tundraconnect/upstash-redis) — Typed Upstash Redis REST client: string, hash and list commands, TTLs, counters and pipelining over plain HTTPS — no TCP connection needed.
- **[URLhaus](./connectors/urlhaus/README.md)** [![JSR](https://jsr.io/badges/@tundraconnect/urlhaus)](https://jsr.io/@tundraconnect/urlhaus) — Typed URLhaus (abuse.ch) client: look up URLs, hosts and payloads in the malware-URL database, with not-listed results instead of errors and a hard per-call deadline.

<!-- workspace:connectors:end -->

Each connect's README is its main documentation. The API, error and schema
guides for every connect live in the
[wiki](https://github.com/TundraSoft/tundra-connect/wiki).

## 🔎 Looking for a familiar SDK?

Each connect covers a focused subset of its vendor's API with no Node-only
dependencies. Check the connect's README for exactly which endpoints.

| If you use…                                       | Reach for                             |
| ------------------------------------------------- | ------------------------------------- |
| `stripe`                                          | `@tundraconnect/stripe`               |
| `@aws-sdk/client-s3` (also for R2, MinIO, Spaces) | `@tundraconnect/s3`                   |
| `@google-cloud/storage`                           | `@tundraconnect/gcs`                  |
| `@google-cloud/web-risk`, for URL lookups         | `@tundraconnect/google-web-risk`      |
| `@azure/storage-blob`                             | `@tundraconnect/azure-blob`           |
| `@slack/web-api`                                  | `@tundraconnect/slack`                |
| `discord.js`, for webhook and bot messages        | `@tundraconnect/discord`              |
| `twilio`                                          | `@tundraconnect/twilio`               |
| `@sendgrid/mail`                                  | `@tundraconnect/sendgrid`             |
| `razorpay`                                        | `@tundraconnect/razorpay`             |
| `algoliasearch`                                   | `@tundraconnect/algolia`              |
| `@upstash/redis`                                  | `@tundraconnect/upstash-redis`        |
| `@polymarket/clob-client`                         | `@tundraconnect/polymarket`           |
| `cloudflare`, for DNS records                     | `@tundraconnect/cloudflare-dns`       |
| `cloudflare`, for custom hostnames                | `@tundraconnect/cloudflare-saas`      |
| `cloudflare`, for Turnstile siteverify            | `@tundraconnect/cloudflare-turnstile` |

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
