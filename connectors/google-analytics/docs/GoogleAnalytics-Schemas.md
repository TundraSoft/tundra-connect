# GoogleAnalytics Schemas

Public Guardian schemas and GA4 constants, exported from
`@tundraconnect/google-analytics/schemas`.

```ts
import {
  PayloadSchemaObject,
  RESERVED_EVENT_NAMES,
} from '@tundraconnect/google-analytics/schemas';
```

| Export                                                  | Type                       | Used for                                       |
| ------------------------------------------------------- | -------------------------- | ---------------------------------------------- |
| `PayloadSchemaObject`                                   | `PayloadSchema`            | A Measurement Protocol request body.           |
| `EventSchemaObject`                                     | `EventSchema`              | One event: `{ name, params? }`.                |
| `ValidationResponseSchemaObject`                        | `ValidationResponseSchema` | The debug endpoint's body.                     |
| `ValidationMessageSchemaObject`                         | `ValidationMessageSchema`  | One validation message.                        |
| `VALIDATION_CODES`                                      | `readonly [...]`           | Every documented `validationCode`.             |
| `RESERVED_EVENT_NAMES`                                  | `readonly [...]`           | Event names GA4 reserves.                      |
| `RESERVED_USER_PROPERTY_NAMES`                          | `readonly [...]`           | User property names GA4 reserves.              |
| `RESERVED_PREFIXES`                                     | `readonly [...]`           | `_`, `firebase_`, `ga_`, `google_`.            |
| `NAME_PATTERN`                                          | `RegExp`                   | Letter first, then letters, digits, `_`.       |
| `MAX_EVENTS`, `MAX_EVENT_PARAMS`, `MAX_USER_PROPERTIES` | `25`                       | Count limits.                                  |
| `MAX_NAME_LENGTH`                                       | `40`                       | Event and parameter names.                     |
| `MAX_USER_PROPERTY_NAME_LENGTH`                         | `24`                       | User property names.                           |
| `MAX_USER_PROPERTY_VALUE_LENGTH`                        | `36`                       | User property string values.                   |
| `MAX_PARAM_VALUE_LENGTH`                                | `100`                      | String parameter values (standard properties). |
| `MAX_PARAM_VALUE_LENGTH_GA360`                          | `500`                      | String parameter values (GA360).               |
| `MAX_PAYLOAD_BYTES`                                     | `130000`                   | Body size ceiling.                             |

## What the schema checks, and what the client checks

`PayloadSchemaObject` checks types: strings are strings, `consent` values
are `GRANTED`/`DENIED`, `timestamp_micros` is a real positive integer,
`non_personalized_ads` a real boolean, `events` an array of `{ name }`.
Event `params` and `user_data` are open objects, since GA4 accepts strings,
numbers, booleans and arrays (ecommerce `items`) there.

The rules that depend on the client's configuration or that are clearer
as a list — name formats, reserved names and prefixes, counts, string
lengths, the stream's required id, body size — are checked by the client
and reported together. The constants above are what it checks against, so
your own code can use the same limits.

`ValidationResponseSchemaObject` reads a body without `validationMessages`
as "no problems", and keeps an undocumented `validationCode` as a string.

---

[← Back to GoogleAnalytics](../README.md)
