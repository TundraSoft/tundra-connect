# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0](https://github.com/TundraSoft/tundra-connect/compare/openexchange-v0.1.1...openexchange-v0.2.0) (2026-09-25)


### ⚠ BREAKING CHANGES

* **openexchange:** the App ID moves under `auth` — `new OpenExchange({ appId })` becomes `new OpenExchange({ auth: { type: 'CUSTOM', appId } })`. Error codes also change for callers that branch on them: an HTTP 429 is now `RATE_LIMITED` (was `RESPONSE_ERROR`); an undocumented 4xx is now `UNKNOWN_ERROR` (was `SERVICE_UNAVAILABLE`, or returned as a success if the body happened to validate); and `getHistoricalRates()` rejects a non-YYYY-MM-DD date locally with `INVALID_DATE` instead of sending it.

### Features

* add live vendor testing infra + Cloudflare Workers/browser badge ([f4c060c](https://github.com/TundraSoft/tundra-connect/commit/f4c060c4cb628d4a79c8324000d3537ef992fc55))
* idempotency keys, retry-after hints, in-class webhook verification, and @tundralibs/crypt + id ([cdd29b8](https://github.com/TundraSoft/tundra-connect/commit/cdd29b82601e6e3ff967991215b0e737b9df80a7))
* **release:** restructure into connectors/ and add 10 new vendor connectors ([aca53ef](https://github.com/TundraSoft/tundra-connect/commit/aca53efba0dfd30bab7cbab480366af35e22f3cc))
* rename connects to connectors/, migrate to RESTler 1.1.3/Guardian 1.1.0, harden all connects, add Slack/Razorpay/PayPal ([893393a](https://github.com/TundraSoft/tundra-connect/commit/893393ace0fe0acfdf08c4fa981a1be9eb692e5d))


### Bug Fixes

* classify 429s in Razorpay/OpenExchange/Upstash, cover Twilio's optional fields, verify Discord interactions ([0431605](https://github.com/TundraSoft/tundra-connect/commit/043160540535106ec6c5e0b53541404782819902))
* close path-traversal and credential-echo findings, add custody and path-safety tests ([36c0cf3](https://github.com/TundraSoft/tundra-connect/commit/36c0cf356f01e37ce7dd09db19db287da822ac4e))
* stop exposing credentials through public getters ([b463446](https://github.com/TundraSoft/tundra-connect/commit/b46344698194fbd792a4fcfea1c6885302814251))


### Refactoring

* hand rate-limit parsing to RESTler 1.3.0 ([199f214](https://github.com/TundraSoft/tundra-connect/commit/199f2146409c1b8c5b948eef78ab736bb1fa797e))


### Documentation

* `[@throws](https://github.com/throws)` on the twenty public methods that lacked it. ([36c0cf3](https://github.com/TundraSoft/tundra-connect/commit/36c0cf356f01e37ce7dd09db19db287da822ac4e))
* add JSR descriptions, module docs and full symbol JSDoc ([5278ad5](https://github.com/TundraSoft/tundra-connect/commit/5278ad526482b9ff3cee5a046bdb4a21e74bf860))
* bring rate-limit docs up to date with restler 1.3.1 ([a1116d5](https://github.com/TundraSoft/tundra-connect/commit/a1116d5655c33d3a91edacf72a7adf550b58e78a))
* drop per-connect badges, generate ROADMAP's shipped list, refresh Polymarket/Kalshi READMEs ([2d0c9b3](https://github.com/TundraSoft/tundra-connect/commit/2d0c9b3c186b4153319a71c0119eca8672d8d85e))
* **openexchange:** record the real 0.1.x -&gt; 0.2.0 break and add a migration guide ([6f6a9ff](https://github.com/TundraSoft/tundra-connect/commit/6f6a9ffebbf5be17d5b81dd5cb64825e6ca78133))

## [Unreleased]

## [0.1.1] - 2025-07-18

### Fixed

- Bug fixes and improvements
