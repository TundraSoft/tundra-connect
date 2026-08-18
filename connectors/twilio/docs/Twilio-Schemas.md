# Twilio Schemas

The `@tundraconnect/twilio/schemas` subpath exports Guardian validators and
inferred types. `sendMessage()`/`createCall()`/`updateCall()`/`listCalls()`
validate their options before sending, and validate the response body
before returning it.

```ts
import {
  type SendMessageRequestSchema,
  SendMessageRequestSchemaObject,
} from '@tundraconnect/twilio/schemas';

const payload: unknown = {
  to: '+14155552671',
  from: '+15017122661',
  body: 'Hello!',
};

const [error, options] = SendMessageRequestSchemaObject.safeParse(payload);
if (error || !options) throw error;

const typedOptions: SendMessageRequestSchema = options;
console.log(typedOptions.to);
```

## Request Schemas

| Schema                           | Purpose                                            |
| -------------------------------- | -------------------------------------------------- |
| `SendMessageRequestSchemaObject` | Options accepted by `Twilio.sendMessage()`         |
| `CreateCallRequestSchemaObject`  | Options accepted by `Twilio.createCall()`          |
| `UpdateCallRequestSchemaObject`  | Options accepted by `Twilio.updateCall()`          |
| `ListCallsRequestSchemaObject`   | Filter/pagination options for `Twilio.listCalls()` |

`SendMessageRequestSchemaObject` requires `to` (E.164), one of `from` /
`messagingServiceSid`, and one of `body` / `mediaUrl` / `contentSid` —
enforced via `.refine()` so a malformed request never reaches the API.

`CreateCallRequestSchemaObject` requires `to`, `from`, and exactly one of
`url` / `twiml` / `applicationSid`. `to`/`from` are validated as non-empty
strings rather than E.164-only, since Twilio's Calls resource also accepts
a SIP address or Client identifier there. `UpdateCallRequestSchemaObject`
models the full — and only the — documented "Update a Call" field set
(`url`, `method`, `status` restricted to `'canceled'`/`'completed'`,
`fallbackUrl`, `fallbackMethod`, `statusCallback`, `statusCallbackMethod`,
`twiml`, `timeLimit`); it rejects an empty update and enforces Twilio's
documented rule that `statusCallback` requires `url` in the same request.
`ListCallsRequestSchemaObject`'s date filters (`startTime`, `endTime`, and
their `Before`/`After` variants) use `dateOnlyGuard` (`YYYY-MM-DD`), not
`iso8601Guard` — Twilio documents these as plain dates, not datetimes.

## Response Schemas

| Schema                          | Endpoint                                                               |
| ------------------------------- | ---------------------------------------------------------------------- |
| `MessageSchemaObject`           | `POST /2010-04-01/Accounts/{AccountSid}/Messages.json`                 |
| `CallSchemaObject`              | Create/Fetch/Update Call — `.../Calls.json` and `.../Calls/{Sid}.json` |
| `ListCallsResponseSchemaObject` | `GET /2010-04-01/Accounts/{AccountSid}/Calls.json`                     |
| `ErrorSchemaObject`             | Vendor error envelopes on non-2xx responses                            |

`MessageSchemaObject` models the Twilio Message resource precisely,
including fields that look numeric on the wire but are documented (and
validated here) as strings: `num_media`, `num_segments`, and `price`.
`status` and `direction` are validated against the exported
`MESSAGE_STATUSES` / `MESSAGE_DIRECTIONS` enums.

`CallSchemaObject` models the Twilio Call resource — reused by
`createCall()`, `getCall()`, and `updateCall()`, and nested under `calls`
in `ListCallsResponseSchemaObject` — with `duration`/`price`/`queue_time`
modelled as strings the same way `Message` does. `status`/`direction` are
validated against the exported `CALL_STATUSES` (8 documented values,
including `canceled`/`no-answer`) / `CALL_DIRECTIONS` enums. `answered_by`
is a nullable string rather than a strict `'human' | 'machine'` enum,
since Twilio's own example responses document finer-grained values (e.g.
`machine_start`) that a stricter enum would reject.
`ListCallsResponseSchemaObject` wraps a page of `CallSchemaObject` entries
under `calls` with Twilio's standard `page`/`page_size`/`next_page_uri`
cursor-pagination metadata, plus a convenience `nextPageToken` field —
Twilio's `PageToken` cursor, extracted from `next_page_uri` so a caller
doesn't have to parse it out manually. Pass it back as
`ListCallsRequestSchema.pageToken` to fetch the next page; it's
`undefined` on the last page.

## Common Validators

`e164Guard`, `accountSidGuard`, `messagingServiceSidGuard`,
`contentSidGuard`, `applicationSidGuard`, `callSidGuard`,
`byocTrunkSidGuard`, `iso8601Guard`, `dateOnlyGuard`, and `jsonStringGuard`
are reusable component validators for Twilio's SID, phone-number, date,
and JSON-string formats. Keeping these shared exports flat avoids
artificial request/response folders while preserving a single source of
truth.

---

[← Back to Twilio](../README.md)
