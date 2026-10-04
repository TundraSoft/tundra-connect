# GoogleAnalytics API

Client configuration and methods for `@tundraconnect/google-analytics`.

## Configuration

```ts
import { GoogleAnalytics } from '@tundraconnect/google-analytics';

const ga = new GoogleAnalytics({
  auth: { type: 'CUSTOM', apiSecret: 'YOUR_API_SECRET' },
  measurementId: 'G-XXXXXXXXXX',
});
```

| Option          | Type                  | Required         | Default                            | Description                                                            |
| --------------- | --------------------- | ---------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `auth`          | `GoogleAnalyticsAuth` | yes              | —                                  | `{ type: 'CUSTOM', apiSecret }`, sent as the `api_secret` query param. |
| `measurementId` | `string`              | one of these two | —                                  | A web stream's `G-…` id. Events then need `client_id`.                 |
| `firebaseAppId` | `string`              | one of these two | —                                  | An app stream's Firebase app id. Events then need `app_instance_id`.   |
| `region`        | `'global' \| 'eu'`    | no               | `'global'`                         | `'eu'` sends to `region1.google-analytics.com`.                        |
| `ga360`         | `boolean`             | no               | `false`                            | Allows 500-character string parameter values instead of 100.           |
| `timeout`       | `number`              | no               | `10`                               | Per-request timeout in seconds, 1–120, fractions allowed.              |
| `baseURL`       | `string`              | no               | `https://www.google-analytics.com` | Override for a proxy or a test double; wins over `region`.             |

Construction throws `CONFIG_INVALID_AUTH`, `CONFIG_INVALID_STREAM` (none
or both stream ids, or a blank one) or `CONFIG_INVALID_REGION`.

### Getters

| Getter          | Type                  | Description                 |
| --------------- | --------------------- | --------------------------- |
| `vendor`        | `string`              | Always `'GoogleAnalytics'`. |
| `measurementId` | `string \| undefined` | The web stream id, if set.  |
| `firebaseAppId` | `string \| undefined` | The app stream id, if set.  |

## `send(payload)`

`POST /mp/collect` &rarr; `void`. Google answers `2xx` with no body for
anything it received and does not say whether the events were kept.

## `validate(payload)`

`POST /debug/mp/collect` &rarr; `{ valid, validationMessages }`. Nothing is
recorded. Google's findings come back as data:

| Field            | Meaning                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `fieldPath`      | Where the problem is, e.g. `events`.                                                                                                     |
| `description`    | What is wrong, in Google's words.                                                                                                        |
| `validationCode` | `VALUE_INVALID`, `VALUE_REQUIRED`, `NAME_INVALID`, `NAME_RESERVED`, `VALUE_OUT_OF_BOUNDS`, `EXCEEDED_MAX_ENTITIES` or `NAME_DUPLICATED`. |

Set `validation_behavior: 'ENFORCE_RECOMMENDATIONS'` on the payload for
Google's stricter checks. The debug endpoint does not verify the API
secret.

## The payload

Field names are Google's own. Both methods take a `PayloadSchema`:

| Field                  | Notes                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| `client_id`            | Required for a web stream.                                            |
| `app_instance_id`      | Required for an app stream.                                           |
| `user_id`              | Your id for a signed-in user.                                         |
| `timestamp_micros`     | Integer microseconds; Google accepts up to 72 hours in the past.      |
| `user_properties`      | `{ name: { value } }`, up to 25.                                      |
| `consent`              | `ad_user_data` / `ad_personalization`: `GRANTED` or `DENIED`.         |
| `user_location`        | `city`, `region_id`, `country_id`, `subcontinent_id`, `continent_id`. |
| `device`               | `category`, `language`, `screen_resolution`, `operating_system`, …    |
| `user_data`            | Hashed user-provided data for enhanced matching.                      |
| `non_personalized_ads` | `boolean`.                                                            |
| `validation_behavior`  | `RELAXED` (default) or `ENFORCE_RECOMMENDATIONS`.                     |
| `events`               | 1–25 `{ name, params? }`.                                             |

Add `session_id` and `engagement_time_msec` to an event's `params` for it
to count towards sessions and engagement in GA4's reports.

### Checked before sending

| Rule                                                | Limit                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| Events per request                                  | 1–25                                                               |
| Event and parameter names                           | letter first, then letters, digits, `_`; ≤ 40                      |
| Reserved event names                                | `RESERVED_EVENT_NAMES`                                             |
| Reserved prefixes (events, params, user properties) | `_`, `firebase_`, `ga_`, `google_`                                 |
| Parameters per event                                | 25                                                                 |
| String parameter values                             | 100 characters (500 with `ga360`)                                  |
| User properties                                     | 25; names ≤ 24; string values ≤ 36; `RESERVED_USER_PROPERTY_NAMES` |
| Stream id                                           | `client_id` (web) or `app_instance_id` (app)                       |
| Body size                                           | under 130 kB                                                       |

Every violation is collected into one `REQUEST_VALIDATION_ERROR`, so a
`reason` reads like `events[0].name: \`session_start\` is reserved by GA4;
events[0].params.v: string values are limited to 100 characters`.

## Not wrapped

The GA4 Data API (reporting), the Admin API, and Universal Analytics'
retired `/collect` protocol.

---

[← Back to GoogleAnalytics](../README.md)
