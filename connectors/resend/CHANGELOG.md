# Changelog

## [0.2.0](https://github.com/TundraSoft/tundra-connect/compare/resend-v0.1.0...resend-v0.2.0) (2026-10-04)


### ⚠ BREAKING CHANGES

* a timeout or network failure used to surface as a raw RESTlerTimeoutError / RESTlerRequestError and now throws the connect's own error with code TIMEOUT or NETWORK_ERROR (still an instanceof RESTlerError, no longer an instanceof RESTlerTimeoutError / RESTlerRequestError). In gcs and paypal, a timeout or network failure during token exchange is now TIMEOUT / NETWORK_ERROR instead of TOKEN_EXCHANGE_FAILED, and a PayPal token-endpoint 429 under maxRetryWait is now RATE_LIMITED. Branch on `err.code` or `err.transient` instead of RESTler error classes.

### Features

* Cloudflare DNS, SaaS and Turnstile connects, GA4 Measurement Protocol, and transient errors everywhere ([28ded82](https://github.com/TundraSoft/tundra-connect/commit/28ded82331929060100dbb6a0d6c6a3e956ec6a3))
* flag transient failures and wrap transport errors in every connect ([1022f6f](https://github.com/TundraSoft/tundra-connect/commit/1022f6fbc8d21fed752426a63502d1aab8dbbc6e))

## 0.1.0 (2026-09-30)


### Features

* **resend:** add Resend transactional email connect ([37c19d3](https://github.com/TundraSoft/tundra-connect/commit/37c19d38fb2f7dca29559b328d3fbf725f541fd5))
* **resend:** add Resend transactional email connect ([88dab77](https://github.com/TundraSoft/tundra-connect/commit/88dab7744baa1a26b30b5edfa779d779d6d75b9f))


### Documentation

* **resend:** fix API doc examples, document constants and message template ([f087050](https://github.com/TundraSoft/tundra-connect/commit/f0870509a8ecc3ec9f009b76b78990107cd7f65e))
* **resend:** make the README work on JSR and read well in search ([69a68d7](https://github.com/TundraSoft/tundra-connect/commit/69a68d70974cf6bbca671fa60931163b6ca27499))
