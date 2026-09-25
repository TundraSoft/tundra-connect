# Changelog

## 0.1.0 (2026-09-25)


### Features

* add live vendor testing infra + Cloudflare Workers/browser badge ([f4c060c](https://github.com/TundraSoft/tundra-connect/commit/f4c060c4cb628d4a79c8324000d3537ef992fc55))
* idempotency keys, retry-after hints, in-class webhook verification, and @tundralibs/crypt + id ([cdd29b8](https://github.com/TundraSoft/tundra-connect/commit/cdd29b82601e6e3ff967991215b0e737b9df80a7))
* **release:** restructure into connectors/ and add 10 new vendor connectors ([aca53ef](https://github.com/TundraSoft/tundra-connect/commit/aca53efba0dfd30bab7cbab480366af35e22f3cc))
* rename connects to connectors/, migrate to RESTler 1.1.3/Guardian 1.1.0, harden all connects, add Slack/Razorpay/PayPal ([893393a](https://github.com/TundraSoft/tundra-connect/commit/893393ace0fe0acfdf08c4fa981a1be9eb692e5d))


### Bug Fixes

* close path-traversal and credential-echo findings, add custody and path-safety tests ([36c0cf3](https://github.com/TundraSoft/tundra-connect/commit/36c0cf356f01e37ce7dd09db19db287da822ac4e))


### Refactoring

* hand rate-limit parsing to RESTler 1.3.0 ([199f214](https://github.com/TundraSoft/tundra-connect/commit/199f2146409c1b8c5b948eef78ab736bb1fa797e))


### Documentation

* `[@throws](https://github.com/throws)` on the twenty public methods that lacked it. ([36c0cf3](https://github.com/TundraSoft/tundra-connect/commit/36c0cf356f01e37ce7dd09db19db287da822ac4e))
* add JSR descriptions, module docs and full symbol JSDoc ([5278ad5](https://github.com/TundraSoft/tundra-connect/commit/5278ad526482b9ff3cee5a046bdb4a21e74bf860))
* bring rate-limit docs up to date with restler 1.3.1 ([a1116d5](https://github.com/TundraSoft/tundra-connect/commit/a1116d5655c33d3a91edacf72a7adf550b58e78a))
* drop per-connect badges, generate ROADMAP's shipped list, refresh Polymarket/Kalshi READMEs ([2d0c9b3](https://github.com/TundraSoft/tundra-connect/commit/2d0c9b3c186b4153319a71c0119eca8672d8d85e))
