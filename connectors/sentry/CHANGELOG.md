# Changelog

## [0.2.0](https://github.com/TundraSoft/tundra-connect/compare/sentry-v0.1.1...sentry-v0.2.0) (2026-10-04)


### ⚠ BREAKING CHANGES

* a timeout or network failure used to surface as a raw RESTlerTimeoutError / RESTlerRequestError and now throws the connect's own error with code TIMEOUT or NETWORK_ERROR (still an instanceof RESTlerError, no longer an instanceof RESTlerTimeoutError / RESTlerRequestError). In gcs and paypal, a timeout or network failure during token exchange is now TIMEOUT / NETWORK_ERROR instead of TOKEN_EXCHANGE_FAILED, and a PayPal token-endpoint 429 under maxRetryWait is now RATE_LIMITED. Branch on `err.code` or `err.transient` instead of RESTler error classes.

### Features

* Cloudflare DNS, SaaS and Turnstile connects, GA4 Measurement Protocol, and transient errors everywhere ([28ded82](https://github.com/TundraSoft/tundra-connect/commit/28ded82331929060100dbb6a0d6c6a3e956ec6a3))
* flag transient failures and wrap transport errors in every connect ([1022f6f](https://github.com/TundraSoft/tundra-connect/commit/1022f6fbc8d21fed752426a63502d1aab8dbbc6e))

## [0.1.1](https://github.com/TundraSoft/tundra-connect/compare/sentry-v0.1.0...sentry-v0.1.1) (2026-09-30)


### Documentation

* make every connect README work on JSR and read well in search ([11bc5e6](https://github.com/TundraSoft/tundra-connect/commit/11bc5e6006bfdbc155cce141f63bb080daffa87d))
* make READMEs work on JSR, GitHub and the wiki, and read well in search ([6d142ac](https://github.com/TundraSoft/tundra-connect/commit/6d142aca51f74200bce414c487c91e80bae5b6aa))

## 0.1.0 (2026-09-25)


### Features

* add live vendor testing infra + Cloudflare Workers/browser badge ([f4c060c](https://github.com/TundraSoft/tundra-connect/commit/f4c060c4cb628d4a79c8324000d3537ef992fc55))
* add Sentry/Algolia/Upstash Redis connects, let workspace:add preserve case-sensitive display names ([05d0e9d](https://github.com/TundraSoft/tundra-connect/commit/05d0e9d20fbce8bd15793f55343d901ce68b95e3))
* export the public option, auth and schema types entrypoints reference ([cbcfb43](https://github.com/TundraSoft/tundra-connect/commit/cbcfb43e45d1b8a6ea90a9d64d3b24b1c04fa432))
* idempotency keys, retry-after hints, in-class webhook verification, and @tundralibs/crypt + id ([cdd29b8](https://github.com/TundraSoft/tundra-connect/commit/cdd29b82601e6e3ff967991215b0e737b9df80a7))
* **release:** restructure into connectors/ and add 10 new vendor connectors ([aca53ef](https://github.com/TundraSoft/tundra-connect/commit/aca53efba0dfd30bab7cbab480366af35e22f3cc))


### Bug Fixes

* close path-traversal and credential-echo findings, add custody and path-safety tests ([36c0cf3](https://github.com/TundraSoft/tundra-connect/commit/36c0cf356f01e37ce7dd09db19db287da822ac4e))


### Refactoring

* hand rate-limit parsing to RESTler 1.3.0 ([199f214](https://github.com/TundraSoft/tundra-connect/commit/199f2146409c1b8c5b948eef78ab736bb1fa797e))


### Documentation

* `[@throws](https://github.com/throws)` on the twenty public methods that lacked it. ([36c0cf3](https://github.com/TundraSoft/tundra-connect/commit/36c0cf356f01e37ce7dd09db19db287da822ac4e))
* add JSR descriptions, module docs and full symbol JSDoc ([5278ad5](https://github.com/TundraSoft/tundra-connect/commit/5278ad526482b9ff3cee5a046bdb4a21e74bf860))
* bring rate-limit docs up to date with restler 1.3.1 ([a1116d5](https://github.com/TundraSoft/tundra-connect/commit/a1116d5655c33d3a91edacf72a7adf550b58e78a))
* drop per-connect badges, generate ROADMAP's shipped list, refresh Polymarket/Kalshi READMEs ([2d0c9b3](https://github.com/TundraSoft/tundra-connect/commit/2d0c9b3c186b4153319a71c0119eca8672d8d85e))
