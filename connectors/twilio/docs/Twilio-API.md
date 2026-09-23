# Twilio API

## Configuration

```ts
import { Twilio } from '@tundraconnect/twilio';

// Account SID + Auth Token
const client = new Twilio({
  accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  authToken: 'your-auth-token',
});

// API Key SID + Secret (accountSid is still required — it's part of every
// request path — but the API Key SID replaces it as the Basic-Auth username)
const apiKeyClient = new Twilio({
  accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  apiKeySid: 'SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  apiKeySecret: 'your-api-key-secret',
});
```

`accountSid` is always required and must match `^AC[0-9a-fA-F]{32}$`. Either
`authToken`, or both `apiKeySid` and `apiKeySecret`, must be supplied — an
incomplete or missing credential pair throws immediately at construction
(see [Errors](Twilio-Errors.md)).

There is a single fixed base URL (`https://api.twilio.com`) — Twilio has no
separate sandbox host. Test credentials hit the identical URL; use Twilio's
documented ["magic" test phone numbers](https://www.twilio.com/docs/iam/test-credentials) to exercise
success/failure paths without sending real messages.

## Endpoints

| Method                         | Endpoint                                                    | Result                              |
| ------------------------------ | ----------------------------------------------------------- | ----------------------------------- |
| `sendMessage(options)`         | `POST /2010-04-01/Accounts/{AccountSid}/Messages.json`      | The created Message resource        |
| `createCall(options)`          | `POST /2010-04-01/Accounts/{AccountSid}/Calls.json`         | The created Call resource           |
| `getCall(callSid)`             | `GET /2010-04-01/Accounts/{AccountSid}/Calls/{Sid}.json`    | The fetched Call resource           |
| `listCalls(options?)`          | `GET /2010-04-01/Accounts/{AccountSid}/Calls.json`          | A page of Call resources            |
| `updateCall(callSid, options)` | `POST /2010-04-01/Accounts/{AccountSid}/Calls/{Sid}.json`   | The updated Call resource           |
| `deleteCall(callSid)`          | `DELETE /2010-04-01/Accounts/{AccountSid}/Calls/{Sid}.json` | Nothing (`void`) — `204 No Content` |

```ts
import { Twilio } from '@tundraconnect/twilio';

const client = new Twilio({
  accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  authToken: 'your-auth-token',
});

const message = await client.sendMessage({
  to: '+14155552671',
  messagingServiceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  body: 'Your order has shipped!',
});

console.log(message.sid, message.status);
```

`sendMessage()` requires one of `from` / `messagingServiceSid` (the sender)
and one of `body` / `mediaUrl` / `contentSid` (the content) — both
constraints are validated locally before any request is sent. See
[Schemas](Twilio-Schemas.md) for the full option list.

### Voice calls

```ts
const call = await client.createCall({
  to: '+14155552671',
  from: '+15017122661',
  url: 'http://demo.twilio.com/docs/voice.xml',
});
console.log(call.sid, call.status); // 'queued'

const fetched = await client.getCall(call.sid);

const page = await client.listCalls({ status: 'completed', pageSize: 20 });
for (const c of page.calls) console.log(c.sid, c.status);

// Page through every result. `nextPageToken` is a convenience field —
// Twilio's `PageToken` cursor, already extracted from `next_page_uri` —
// so there's no need to parse the URI yourself.
let pageToken: string | undefined;
do {
  const p = await client.listCalls({ status: 'completed', pageToken });
  for (const c of p.calls) console.log(c.sid, c.status);
  pageToken = p.nextPageToken;
} while (pageToken);

// Redirect a live call to new TwiML, or end it.
await client.updateCall(call.sid, {
  twiml: '<Response><Say>Please hold.</Say></Response>',
});
await client.updateCall(call.sid, { status: 'completed' });

// Delete the call detail record once the call has ended.
await client.deleteCall(call.sid);
```

`createCall()` requires `to`, `from`, and exactly one of `url` / `twiml` /
`applicationSid` to supply the call's TwiML instructions. `updateCall()`
modifies a _live_ call — redirect it to new TwiML (`url`/`method` or
`twiml`), or set `status: 'canceled'` (ends a queued/ringing call before
it's answered) or `status: 'completed'` (hangs up an in-progress call); at
least one field is required, and Twilio requires `url` in the same request
whenever `statusCallback` is set. `deleteCall()` removes the call's detail
record from the account's logs — it does **not** terminate a live call, and
Twilio rejects the delete while the call is still active. This connect
covers the Calls REST resource only, not TwiML/IVR generation (the markup
that tells Twilio what a call should say/do). See
[Schemas](Twilio-Schemas.md) for the full option lists.

See [Errors](Twilio-Errors.md) for failure handling and
[Schemas](Twilio-Schemas.md) for request/response validation.

---

[← Back to Twilio](../README.md)

## Webhooks

### `verifyWebhook(options)`

Verifies an inbound webhook from Twilio — a method on the client, not an HTTP call.

**Scheme** (`X-Twilio-Signature`): HMAC-SHA1 over the **exact** request URL (query included, never re-encoded) followed by every POST parameter as `key` immediately followed by `value`, sorted by key, no separators; keyed by the **account** auth token; base64. For a JSON body Twilio instead appends `bodySHA256=<hex>` to the URL — the method checks that hash against `payload` and signs the URL alone.

| Option      | Type                    | Required | Description                                                                                                                                                 |
| ----------- | ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`       | `string`                | yes      | The exact URL Twilio requested.                                                                                                                             |
| `headers`   | `Headers \| object`     | yes      | Case-insensitive lookup.                                                                                                                                    |
| `params`    | `Record<string,string>` | no       | Form parameters, for `application/x-www-form-urlencoded`.                                                                                                   |
| `payload`   | `string`                | no       | Raw JSON body, for `application/json`.                                                                                                                      |
| `authToken` | `string`                | no       | Defaults to the configured auth token in account-SID mode. **Required** under API-key auth — Twilio signs with the account token, never the API-key secret. |

**Returns:** Nothing — resolves on success; the caller already holds the parameters.

**Throws:** `TwilioError` with `WEBHOOK_INVALID_HEADERS`, `WEBHOOK_INVALID_AUTH_TOKEN`, `WEBHOOK_SIGNATURE_INVALID`.

```ts
const raw = await req.text(); // text(), never json()
await client.verifyWebhook({ url: req.url, headers: req.headers, params }); // form
await client.verifyWebhook({
  url: req.url,
  headers: req.headers,
  payload: raw,
}); // JSON
```

Comparison is constant-time via `@tundralibs/crypt`. Treat `WEBHOOK_SIGNATURE_INVALID` as a forged request.
