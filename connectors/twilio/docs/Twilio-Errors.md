# Twilio Errors

Twilio throws `TwilioError` for invalid configuration, local request
validation failures, documented vendor responses, and malformed payloads.

```ts
import { TwilioError, TwilioErrorCodes } from '@tundraconnect/twilio/errors';

const error = new TwilioError('INVALID_TO_NUMBER', { to: '123' });
console.log(error.message);
console.log(TwilioErrorCodes.INVALID_TO_NUMBER);
```

## Codes

| Code                              | Meaning                                                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_INVALID_ACCOUNT_SID`      | `accountSid` is missing or doesn't match `^AC[0-9a-fA-F]{32}$`.                                                                                    |
| `CONFIG_INCOMPLETE_API_KEY`       | Only one of `apiKeySid` / `apiKeySecret` was supplied.                                                                                             |
| `CONFIG_MISSING_CREDENTIALS`      | Neither `authToken` nor a complete API Key pair was supplied.                                                                                      |
| `INVALID_REQUEST`                 | Request options failed local Guardian validation (`sendMessage()`, `createCall()`, `getCall()`, `listCalls()`, `updateCall()`, or `deleteCall()`). |
| `AUTH_FAILED`                     | Twilio error 20003 — bad Account SID/Auth Token or API Key.                                                                                        |
| `RATE_LIMITED`                    | Twilio error 20429 — too many requests / concurrency limit.                                                                                        |
| `INVALID_TO_NUMBER`               | Twilio error 21211 — `to` is not a valid phone number.                                                                                             |
| `NON_SMS_CAPABLE_FROM_NUMBER`     | Twilio error 21606 — `from` is not SMS-capable.                                                                                                    |
| `UNVERIFIED_TO_NUMBER`            | Twilio error 21608 — `to` is unverified (trial accounts, SMS).                                                                                     |
| `UNSUBSCRIBED_RECIPIENT`          | Twilio error 21610 — `to` has unsubscribed from this sender.                                                                                       |
| `UNROUTABLE_TO_NUMBER`            | Twilio error 21612 — `to` is unroutable.                                                                                                           |
| `NON_SMS_CAPABLE_TO_NUMBER`       | Twilio error 21614 — `to` is not SMS-capable.                                                                                                      |
| `INTERNATIONAL_PERMISSION_DENIED` | Twilio error 21408 — international permissions not enabled.                                                                                        |
| `INVALID_FROM_NUMBER`             | Twilio error 21212 — `from` is not a valid phone number, Alphanumeric Sender ID, or approved WhatsApp Sender.                                      |
| `UNREACHABLE_TO_NUMBER`           | Twilio error 21214 — the `to` phone number cannot be reached (Voice).                                                                              |
| `UNVERIFIED_TO_NUMBER_VOICE`      | Twilio error 21219 — `to` is unverified (trial accounts, Voice).                                                                                   |
| `TWIML_FETCH_FAILED`              | Twilio error 11200 — Twilio couldn't retrieve a successful response from the call's TwiML/webhook URL.                                             |
| `ACCOUNT_SUSPENDED`               | Twilio error 10001 — the account is not active.                                                                                                    |
| `RESPONSE_ERROR`                  | A 4xx response parsed, but its vendor code is undocumented here.                                                                                   |
| `SERVICE_UNAVAILABLE`             | A 5xx response, or a response body that failed to parse at all.                                                                                    |
| `UNKNOWN_ERROR`                   | An unknown constructor code was supplied.                                                                                                          |

`INVALID_TO_NUMBER` (21211) and `AUTH_FAILED`/`RATE_LIMITED` (20003/20429)
are shared across the Messages and Calls resources — Twilio documents them
identically for both, and `TwilioError`'s vendor-code mapping isn't
endpoint-specific. `UNVERIFIED_TO_NUMBER` (21608, SMS) and
`UNVERIFIED_TO_NUMBER_VOICE` (21219, Voice) are kept as distinct codes
because Twilio assigns them different numeric codes with different
messages, even though both describe "trial account, recipient not
verified".

The resolved code is also available as a public, readonly `error.code`
property — branch on failure mode without matching against `.message`:

```ts
if (error instanceof TwilioError && error.code === 'RATE_LIMITED') {
  // ...
}
```

Use `getContextValue()` to read diagnostic metadata such as `vendor`,
`status`, `vendorCode`, `vendorMessage`, or `moreInfo` (Twilio's
[error reference](https://www.twilio.com/docs/api/errors) URL, when the
vendor supplies one).

---

[← Back to Twilio](../README.md)
