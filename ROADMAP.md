# 🗺️ Roadmap

Tundra Connect is meant to be a launchpad for shipping apps fast — typed,
tested clients for the vendor APIs developers reach for most often. Nothing
below is committed or scheduled, this is a backlog of candidates. Open a
[feature request](https://github.com/TundraSoft/tundra-connect/issues/new/choose)
if you'd like to champion one.

## Prediction markets

- **Polymarket** — markets, prices, order book
- **Kalshi** — markets, prices, order book

## Crypto exchanges

- **Binance** — market data, account/order endpoints
- **Coinbase** — market data, account/order endpoints
- **Kraken** — market data, account/order endpoints
- **Bybit** — market data, account/order endpoints

## Messaging / notifications

Ordered by how cheaply/easily a real account can be tested (free/no-signup
first) — relevant for docs examples and manual smoke testing, since CI itself
always stubs the transport regardless.

- **Slack** — implemented, see the [`slack`](connectors/slack/README.md) connect
- **Resend** — transactional email; modern API, generous free tier, popular
  in indie/fast-shipping app stacks

## Payments

Popular processors developers reach for when shipping an app fast:

- **Razorpay** — implemented, see the [`razorpay`](connectors/razorpay/README.md) connect
- **PayPal** — implemented, see the [`paypal`](connectors/paypal/README.md) connect
- **Skydo** — cross-border business payments; **blocked pending accessible
  API documentation or vendor access** (the current docs site requires
  login)
- **Lemon Squeezy** — merchant-of-record billing for indie SaaS (handles
  tax/VAT), minimal setup
- **Paddle** — merchant-of-record billing, similar niche to Lemon Squeezy

## Infrastructure / dev tools

- **Docker Engine API** — container/image management over the Docker
  socket (`/var/run/docker.sock` or TCP), not a plain HTTPS vendor API. This
  is the one connect expected to break the "Web-API-only" runtime goal below
  — Unix-socket transport needs `Deno.connect({ transport: 'unix' })` /
  Node's `http.request({ socketPath })`, neither of which exist in a browser
  or Cloudflare Workers. Scope it to Deno/Bun/Node only and call that out
  explicitly in its README.

## Observability

- **Sentry** — implemented, see the [`sentry`](connectors/sentry/README.md)
  connect (issues/releases via Sentry's organization REST API, not the
  DSN-based event-ingestion protocol — see its docs for why)

## Search

- **Algolia** — implemented, see the [`algolia`](connectors/algolia/README.md)
  connect

## Data & caching

- **Upstash Redis** — implemented, see the
  [`upstash-redis`](connectors/upstash-redis/README.md) connect (REST-based
  Redis, Web-API-only — no TCP client needed)

## Object storage

- **DigitalOcean Spaces** — S3-API-compatible; supported today via the
  [`s3`](connectors/s3/README.md) connect's custom-endpoint option rather than a
  separate connect (Spaces speaks the same REST API and SigV4 signing) — see
  its README for the exact `baseURL`/`region` configuration.

## Documentation gate

An integration is not implementation-ready until its public API reference,
authentication model, request/response shapes, and sandbox/test path are
available to us. Current quick-pass results:

- **Blocked:** Skydo. The public docs URL currently redirects to a login
  page, so endpoint and authentication details cannot be verified.
- **Removed for now:** Surepass. Its former docs URL currently redirects into
  a console/login flow and the public API reference could not be reached.
  Re-add only when vendor documentation or access is available.

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
