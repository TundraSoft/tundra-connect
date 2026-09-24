# 🗺️ Roadmap

Tundra Connect is meant to be a launchpad for shipping apps fast — typed,
tested clients for the vendor APIs developers reach for most often.

This file has two halves. **Shipped** is generated from
`.github/workspace-meta.json` by `.github/scripts/workspace.ts` — never
hand-edit it; run `deno task workspace:sync`. Everything after it is a
hand-written backlog of **candidates**: nothing there is committed or
scheduled. Open a
[feature request](https://github.com/TundraSoft/tundra-connect/issues/new/choose)
if you'd like to champion one.

## ✅ Shipped

<!-- workspace:shipped:start -->

22 connects are implemented today:

- **[Algolia](connectors/algolia/README.md)** — Algolia Search REST API client for search, indexing, and index browsing
- **[AzureBlob](connectors/azure-blob/README.md)** — Azure Blob Storage REST API client with Shared Key (HMAC-SHA256) request signing
- **[CloudflareEmail](connectors/cloudflare-email/README.md)** — Cloudflare Email Sending REST API client for transactional email
- **[CoinGecko](connectors/coingecko/README.md)** — CoinGecko API client for cryptocurrency price, market, and coin-list data
- **[Discord](connectors/discord/README.md)** — Discord REST API client for sending channel messages via webhooks or a bot token
- **[DodoPayments](connectors/dodo-payments/README.md)** — Dodo Payments client for payments, subscriptions, and webhook verification
- **[GCS](connectors/gcs/README.md)** — Google Cloud Storage JSON API client for object upload, download, listing, and metadata
- **[Kalshi](connectors/kalshi/README.md)** — Kalshi market data and RSA-PSS-authenticated trading API client
- **[ntfy](connectors/ntfy/README.md)** — ntfy.sh client for simple pub-sub push notifications
- **[OpenExchange](connectors/openexchange/README.md)** — OpenExchangeRates API client for currency exchange rates and conversions
- **[OpenWeatherMap](connectors/openweathermap/README.md)** — OpenWeatherMap API client for current weather conditions and 5-day/3-hour forecasts
- **[PayPal](connectors/paypal/README.md)** — Typed client for PayPal's REST API — Orders v2 create/get/capture and capture refunds, with automatic OAuth2 client-credentials token exchange.
- **[Polymarket](connectors/polymarket/README.md)** — Polymarket Gamma (market discovery) and CLOB (trading) API client
- **[Razorpay](connectors/razorpay/README.md)** — Typed client for the Razorpay REST API — Orders, Payments, and Payment Links.
- **[S3](connectors/s3/README.md)** — AWS S3 (and S3-compatible: R2, MinIO) object storage client with SigV4 request signing
- **[SendGrid](connectors/sendgrid/README.md)** — Twilio SendGrid API client for transactional email
- **[Sentry](connectors/sentry/README.md)** — Sentry organization/project REST API client for issues, projects, and releases
- **[Slack](connectors/slack/README.md)** — Slack Web API client for messaging, conversations, and users
- **[Stripe](connectors/stripe/README.md)** — Stripe REST API client for PaymentIntents and Customers
- **[Telegram](connectors/telegram/README.md)** — Telegram Bot API client for sending messages via bot HTTPS API
- **[Twilio](connectors/twilio/README.md)** — Twilio REST API client for sending SMS/MMS messages and placing/managing voice calls
- **[UpstashRedis](connectors/upstash-redis/README.md)** — Typed client for the Upstash Redis REST API — GET/SET/DEL/EXPIRE/INCR/hash/list commands plus pipelining.

<!-- workspace:shipped:end -->

## Candidates

### Crypto exchanges

- **Binance** — market data, account/order endpoints
- **Coinbase** — market data, account/order endpoints
- **Kraken** — market data, account/order endpoints
- **Bybit** — market data, account/order endpoints

### Messaging / notifications

Ordered by how cheaply/easily a real account can be tested (free/no-signup
first) — relevant for docs examples and manual smoke testing, since CI itself
always stubs the transport regardless.

- **Resend** — transactional email; modern API, generous free tier, popular
  in indie/fast-shipping app stacks

### Payments

Popular processors developers reach for when shipping an app fast:

- **Lemon Squeezy** — merchant-of-record billing for indie SaaS (handles
  tax/VAT), minimal setup
- **Paddle** — merchant-of-record billing, similar niche to Lemon Squeezy
- **Skydo** — cross-border business payments; **blocked pending accessible
  API documentation or vendor access** (the current docs site requires
  login)

### Infrastructure / dev tools

- **Docker Engine API** — container/image management over the Docker
  socket (`/var/run/docker.sock` or TCP), not a plain HTTPS vendor API. This
  is the one connect expected to break the "Web-API-only" runtime goal below
  — Unix-socket transport needs `Deno.connect({ transport: 'unix' })` /
  Node's `http.request({ socketPath })`, neither of which exist in a browser
  or Cloudflare Workers. Scope it to Deno/Bun/Node only and call that out
  explicitly in its README.

## Covered without a separate connect

Some vendors need no connect of their own because an existing one already
speaks their API:

- **DigitalOcean Spaces**, **Cloudflare R2**, **MinIO** — S3-API-compatible,
  supported today through the [`s3`](connectors/s3/README.md) connect's
  custom-endpoint option (same REST API, same SigV4 signing). See its README
  for the exact `baseURL`/`region`/`forcePathStyle` configuration.

## Not planned

- **Surepass** (KYC verification) — removed. Its former docs URL redirects
  into a console/login flow and the public API reference could not be
  reached. Re-add only when vendor documentation or access is available.

## Documentation gate

An integration is not implementation-ready until its public API reference,
authentication model, request/response shapes, and sandbox/test path are
available to us. Current quick-pass results:

- **Blocked:** Skydo. The public docs URL currently redirects to a login
  page, so endpoint and authentication details cannot be verified.

## Design goals for new connects

- Cross-runtime by default (Deno, Bun, Node; Web-API-only so Cloudflare
  Workers and browsers work too). **Docker Engine** is the sanctioned
  exception — its Unix-socket transport is Deno/Bun/Node only; state that
  limitation explicitly in the connect's README rather than silently
  dropping Workers/browser support elsewhere.
- Typed request/response via `@guardian`.
- Prefer live testing against documented vendor sandboxes; use mocked transport
  or fixtures where live testing is unavailable.

See [CONVENTIONS.md](CONVENTIONS.md) for the required connect layout.
