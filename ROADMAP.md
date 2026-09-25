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

- **[Algolia](connectors/algolia/README.md)** — Typed Algolia Search client: search, save, fetch, delete and browse index records, and wait for indexing tasks to finish.
- **[AzureBlob](connectors/azure-blob/README.md)** — Typed Azure Blob Storage client with Shared Key or SAS auth: upload, download, list, inspect and delete blobs, including streamed block uploads and downloads for large files.
- **[CloudflareEmail](connectors/cloudflare-email/README.md)** — Typed Cloudflare Email Sending client: send transactional email with attachments, validated locally before the request is made.
- **[CoinGecko](connectors/coingecko/README.md)** — Typed CoinGecko client for the demo and pro tiers: coin prices, market data and the full coin list.
- **[Discord](connectors/discord/README.md)** — Typed Discord client: post messages through a webhook or a bot token, and verify Ed25519-signed interaction webhooks.
- **[DodoPayments](connectors/dodo-payments/README.md)** — Typed Dodo Payments client: create and verify payments, manage subscriptions, page through a customer's history, and verify Standard Webhooks signatures.
- **[GCS](connectors/gcs/README.md)** — Typed Google Cloud Storage client with bearer or service-account auth: upload, download, list, inspect and delete objects, including resumable streamed uploads for large files.
- **[Kalshi](connectors/kalshi/README.md)** — Typed Kalshi client: public market data, plus RSA-PSS-signed trading — balance, positions, fills and orders; place, amend and cancel orders.
- **[ntfy](connectors/ntfy/README.md)** — Typed ntfy.sh client for publishing push notifications to a topic.
- **[OpenExchange](connectors/openexchange/README.md)** — Typed Open Exchange Rates client: latest and historical rates, time series, currency conversion, OHLC data and account usage.
- **[OpenWeatherMap](connectors/openweathermap/README.md)** — Typed OpenWeatherMap client: current weather and 5-day / 3-hour forecasts by city name or coordinates.
- **[PayPal](connectors/paypal/README.md)** — Typed PayPal client for Orders v2: create, fetch, capture and refund, with automatic OAuth2 tokens, idempotency keys and webhook verification.
- **[Polymarket](connectors/polymarket/README.md)** — Typed Polymarket client: Gamma market discovery, CLOB trading with secp256k1/EIP-712 order signing, portfolio positions and value, and gasless split/merge/redeem.
- **[Razorpay](connectors/razorpay/README.md)** — Typed Razorpay client: create and fetch orders; capture, fetch and list payments; create payment links; and verify webhook signatures.
- **[S3](connectors/s3/README.md)** — Typed S3 client with SigV4 signing for AWS S3, Cloudflare R2, MinIO and DigitalOcean Spaces: object CRUD and listing, plus streamed multipart uploads and downloads.
- **[SendGrid](connectors/sendgrid/README.md)** — Typed Twilio SendGrid client: send transactional email, inspect API-key scopes, and verify ECDSA-signed event webhooks.
- **[Sentry](connectors/sentry/README.md)** — Typed Sentry API client: list projects; list, fetch and update issues; read issue events; and create releases.
- **[Slack](connectors/slack/README.md)** — Typed Slack Web API client: post, update and delete messages, list channels and read history, look up users, and verify request signatures.
- **[Stripe](connectors/stripe/README.md)** — Typed Stripe client: create and retrieve PaymentIntents and create customers, with idempotency keys and webhook signature verification.
- **[Telegram](connectors/telegram/README.md)** — Typed Telegram Bot API client: send messages and fetch the bot's own identity.
- **[Twilio](connectors/twilio/README.md)** — Typed Twilio client: send SMS/MMS; place, list, update and delete voice calls; and verify webhook signatures.
- **[UpstashRedis](connectors/upstash-redis/README.md)** — Typed Upstash Redis REST client: string, hash and list commands, TTLs, counters and pipelining over plain HTTPS — no TCP connection needed.

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
