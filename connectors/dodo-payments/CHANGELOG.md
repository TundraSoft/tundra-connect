# Changelog

## [0.1.1](https://github.com/TundraSoft/tundra-connect/compare/dodo-payments-v0.1.0...dodo-payments-v0.1.1) (2026-09-25)


### Documentation

* make every README example compile on its own ([f9ba1e0](https://github.com/TundraSoft/tundra-connect/commit/f9ba1e05238b4ed7656e768112245c66cdc520ec))
* **multi:** make every README example compile on its own ([ffa3f44](https://github.com/TundraSoft/tundra-connect/commit/ffa3f449ff1a0d3eab3fa4b1b63358d91369eab0))

## 0.1.0 (2026-09-25)


### Features

* **dodo-payments:** add getCustomer and auto-paging, document the flows ([7a42ba9](https://github.com/TundraSoft/tundra-connect/commit/7a42ba97bccdf1795049d413742ee8132a2db719))
* **dodo-payments:** add payments, subscriptions, and webhook verification ([66d49f4](https://github.com/TundraSoft/tundra-connect/commit/66d49f42815dc9e143421b897e02408b57dc4208))
* idempotency keys, retry-after hints, in-class webhook verification, and @tundralibs/crypt + id ([cdd29b8](https://github.com/TundraSoft/tundra-connect/commit/cdd29b82601e6e3ff967991215b0e737b9df80a7))
* **release:** restructure into connectors/ and add 10 new vendor connectors ([aca53ef](https://github.com/TundraSoft/tundra-connect/commit/aca53efba0dfd30bab7cbab480366af35e22f3cc))


### Bug Fixes

* close path-traversal and credential-echo findings, add custody and path-safety tests ([36c0cf3](https://github.com/TundraSoft/tundra-connect/commit/36c0cf356f01e37ce7dd09db19db287da822ac4e))


### Refactoring

* hand rate-limit parsing to RESTler 1.3.0 ([199f214](https://github.com/TundraSoft/tundra-connect/commit/199f2146409c1b8c5b948eef78ab736bb1fa797e))
* move every base64/hex codec onto @std/encoding; sanction crypto.randomUUID ([49fb4fe](https://github.com/TundraSoft/tundra-connect/commit/49fb4fe7d4506ddce76ed9161a1c8eb6a0be3b0d))


### Documentation

* `[@throws](https://github.com/throws)` on the twenty public methods that lacked it. ([36c0cf3](https://github.com/TundraSoft/tundra-connect/commit/36c0cf356f01e37ce7dd09db19db287da822ac4e))
* add JSR descriptions, module docs and full symbol JSDoc ([5278ad5](https://github.com/TundraSoft/tundra-connect/commit/5278ad526482b9ff3cee5a046bdb4a21e74bf860))
* bring rate-limit docs up to date with restler 1.3.1 ([a1116d5](https://github.com/TundraSoft/tundra-connect/commit/a1116d5655c33d3a91edacf72a7adf550b58e78a))
* drop per-connect badges, generate ROADMAP's shipped list, refresh Polymarket/Kalshi READMEs ([2d0c9b3](https://github.com/TundraSoft/tundra-connect/commit/2d0c9b3c186b4153319a71c0119eca8672d8d85e))
