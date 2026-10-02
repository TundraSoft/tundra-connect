# GoogleWebRisk Schemas

Public Guardian schemas, exported from
`@tundraconnect/google-web-risk/schemas`.

```ts
import {
  SearchUrisResponseSchemaObject,
  ThreatTypeSchemaObject,
} from '@tundraconnect/google-web-risk/schemas';
```

| Export                            | Type                          | Used for                                                  |
| --------------------------------- | ----------------------------- | --------------------------------------------------------- |
| `SearchUrisRequestSchemaObject`   | `SearchUrisRequestSchema`     | `{ uri, threatTypes }` — validated before a call is made. |
| `SearchUrisResponseSchemaObject`  | `SearchUrisResponseSchema`    | The raw `uris:search` body: `{}` or `{ threat }`.         |
| `SearchUrisThreatSchemaObject`    | `SearchUrisThreatSchema`      | The `threat` object: `threatTypes` and `expireTime`.      |
| `ThreatTypeSchemaObject`          | `ThreatTypeSchema`            | One threat-list name.                                     |
| `GoogleErrorEnvelopeSchemaObject` | `GoogleErrorEnvelopeSchema`   | Google's `{ error: { code, message, status, details } }`. |
| `GoogleErrorDetailSchemaObject`   | `GoogleErrorDetailSchema`     | One `details` entry; an `ErrorInfo` carries the `reason`. |
| `WEB_RISK_THREAT_TYPES`           | `readonly [...]`              | All four requestable threat types.                        |
| `DEFAULT_THREAT_TYPES`            | `readonly ThreatTypeSchema[]` | The three `search` checks when none are named.            |

## `SearchUrisResponseSchema`

The **wire** shape, before `search` turns it into a `SearchResult`.
`threat.expireTime` stays an RFC 3339 string here; `search` parses it to
`expiresOn: Date | null`. Unknown keys pass through, so an additive field
from Google never fails a lookup.

`threat.threatTypes` is held to the known enum. Web Risk only reports lists
the request asked about, and `search` only lets a caller ask about the
enum's members.

## `ThreatTypeSchema`

`MALWARE`, `SOCIAL_ENGINEERING`, `UNWANTED_SOFTWARE` or
`SOCIAL_ENGINEERING_EXTENDED_COVERAGE`. Google's enum also has
`THREAT_TYPE_UNSPECIFIED`, documented as unused. It is left out so it can't
be requested by mistake.

---

[← Back to GoogleWebRisk](../README.md)
