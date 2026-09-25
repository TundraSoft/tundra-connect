# Changelog

## 0.1.0 (2026-09-25)


### Features

* add Kalshi and Polymarket connectors ([8e779f8](https://github.com/TundraSoft/tundra-connect/commit/8e779f88fe9a862cfe898a80e907a38ee11729f7))
* export the public option, auth and schema types entrypoints reference ([cbcfb43](https://github.com/TundraSoft/tundra-connect/commit/cbcfb43e45d1b8a6ea90a9d64d3b24b1c04fa432))
* idempotency keys, retry-after hints, in-class webhook verification, and @tundralibs/crypt + id ([cdd29b8](https://github.com/TundraSoft/tundra-connect/commit/cdd29b82601e6e3ff967991215b0e737b9df80a7))
* **polymarket,kalshi:** portfolio reads, order book and cancel-all parity ([0d8fbd3](https://github.com/TundraSoft/tundra-connect/commit/0d8fbd309a19b6cb3b40b6929458861a97af35af))
* **release:** restructure into connectors/ and add 10 new vendor connectors ([aca53ef](https://github.com/TundraSoft/tundra-connect/commit/aca53efba0dfd30bab7cbab480366af35e22f3cc))


### Bug Fixes

* close path-traversal and credential-echo findings, add custody and path-safety tests ([36c0cf3](https://github.com/TundraSoft/tundra-connect/commit/36c0cf356f01e37ce7dd09db19db287da822ac4e))
* rewrap RESTlerRateLimitError on every request path, not only __requestAndValidate ([f495362](https://github.com/TundraSoft/tundra-connect/commit/f49536243dbcb93d49a92d51f07aefd26907428e))


### Refactoring

* hand rate-limit parsing to RESTler 1.3.0 ([199f214](https://github.com/TundraSoft/tundra-connect/commit/199f2146409c1b8c5b948eef78ab736bb1fa797e))
* move every base64/hex codec onto @std/encoding; sanction crypto.randomUUID ([49fb4fe](https://github.com/TundraSoft/tundra-connect/commit/49fb4fe7d4506ddce76ed9161a1c8eb6a0be3b0d))


### Documentation

* `[@throws](https://github.com/throws)` on the twenty public methods that lacked it. ([36c0cf3](https://github.com/TundraSoft/tundra-connect/commit/36c0cf356f01e37ce7dd09db19db287da822ac4e))
* add JSR descriptions, module docs and full symbol JSDoc ([5278ad5](https://github.com/TundraSoft/tundra-connect/commit/5278ad526482b9ff3cee5a046bdb4a21e74bf860))
* bring rate-limit docs up to date with restler 1.3.1 ([a1116d5](https://github.com/TundraSoft/tundra-connect/commit/a1116d5655c33d3a91edacf72a7adf550b58e78a))
* drop per-connect badges, generate ROADMAP's shipped list, refresh Polymarket/Kalshi READMEs ([2d0c9b3](https://github.com/TundraSoft/tundra-connect/commit/2d0c9b3c186b4153319a71c0119eca8672d8d85e))
