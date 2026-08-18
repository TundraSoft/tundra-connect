# Telegram Schemas

The `@tundraconnect/telegram/schemas` subpath exports Guardian validators
and inferred types. `sendMessage()` validates its request against
`SendMessageRequestSchemaObject` before sending it, and both `sendMessage()`
and `getMe()` validate the unwrapped `result` against their own response
schema (`MessageSchemaObject` / `UserSchemaObject`).

```ts
import {
  type SendMessageRequestSchema,
  SendMessageRequestSchemaObject,
} from '@tundraconnect/telegram/schemas';

const payload: unknown = {
  chat_id: '@examplechannel',
  text: 'Hello!',
};

const [error, request] = SendMessageRequestSchemaObject.safeParse(payload);
if (error || !request) throw error;

const typedRequest: SendMessageRequestSchema = request;
console.log(typedRequest.text);
```

## Request Schemas

| Schema                           | Purpose                           |
| -------------------------------- | --------------------------------- |
| `SendMessageRequestSchemaObject` | Full body for `POST /sendMessage` |

## Response Schemas

| Schema                           | Purpose                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `MessageSchemaObject`            | The `Message` object returned by `sendMessage()`                                   |
| `UserSchemaObject`               | The `User` object returned by `getMe()` (and used as a message's `from`)           |
| `ChatSchemaObject`               | The `Chat` a message belongs to                                                    |
| `ResponseEnvelopeSchemaObject`   | Telegram's universal `{ ok, result, error_code, description, parameters }` wrapper |
| `ResponseParametersSchemaObject` | The envelope's `parameters` field (`retry_after`, `migrate_to_chat_id`)            |

## Common Validators

`chatIdGuard` validates a `chat_id` — either an integer chat id or an
`@username` string, as Telegram documents. `MessageSchemaObject` and
`ChatSchemaObject` model the commonly-used subset of their much larger
documented shapes (Telegram's `Message` object alone has 100+ optional
fields covering every message type); both use `.passthrough()` so any
additional field Telegram returns stays reachable at runtime without a
schema update. The same is true of `UserSchemaObject`, which represents
both a message's sender and the bot's own identity from `getMe()`.

---

[← Back to Telegram](../README.md)
