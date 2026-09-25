# ntfy Schemas

The `@tundraconnect/ntfy/schemas` subpath exports Guardian validators and
inferred types. `publish()` validates its request against
`PublishRequestSchemaObject` before sending it, and the response against
`PublishResponseSchemaObject`.

```ts
import {
  type PublishRequestSchema,
  PublishRequestSchemaObject,
} from '@tundraconnect/ntfy/schemas';

const payload: unknown = {
  topic: 'mytopic',
  message: 'Hello from ntfy!',
  priority: 4,
};

const [error, request] = PublishRequestSchemaObject.safeParse(payload);
if (error || !request) throw error;

const typedRequest: PublishRequestSchema = request;
console.log(typedRequest.topic);
```

## Request Schemas

| Schema                               | Purpose                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `PublishRequestSchemaObject`         | Full body for `POST /` (JSON publish form)                                             |
| `PublishActionSchemaObject`          | One entry of the `actions` array — a discriminated union over the 4 action types below |
| `PublishActionViewSchemaObject`      | `{ action: 'view', label, url, clear? }`                                               |
| `PublishActionBroadcastSchemaObject` | `{ action: 'broadcast', label, intent?, extras?, clear? }` (Android only)              |
| `PublishActionHttpSchemaObject`      | `{ action: 'http', label, url, method?, headers?, body?, clear? }`                     |
| `PublishActionCopySchemaObject`      | `{ action: 'copy', label, value, clear? }`                                             |

Only `topic` is required on `PublishRequestSchemaObject`; it's validated
against ntfy's documented naming rule — letters, numbers, underscores and
dashes, up to 64 characters. `actions` allows at most 3 entries, matching
ntfy's documented limit.

## Response Schemas

| Schema                          | Purpose                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `PublishResponseSchemaObject`   | Response body for a successful `POST /`                         |
| `PublishAttachmentSchemaObject` | A published message's `attachment` metadata                     |
| `ErrorSchemaObject`             | Vendor error envelope (`{ code, http, error, link? }`), 4xx/5xx |

`PublishResponseSchemaObject.event` is pinned to the literal `'message'` —
that's the only event type a publish response can carry (`open`,
`keepalive`, and `poll_request` are subscribe-only event types).

---

[← Back to ntfy](../README.md)
