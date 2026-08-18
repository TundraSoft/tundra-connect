# Slack Schemas

The `@tundraconnect/slack/schemas` subpath exports Guardian validators and
inferred types. Every endpoint method validates its own request against its
schema before sending anything, and its response against its schema before
returning.

```ts
import {
  type PostMessageRequestSchema,
  PostMessageRequestSchemaObject,
} from '@tundraconnect/slack/schemas';

const payload: unknown = { channel: 'C123ABC456', text: 'Deploy succeeded' };

const [error, request] = PostMessageRequestSchemaObject.safeParse(payload);
if (error || !request) throw error;

const typedRequest: PostMessageRequestSchema = request;
console.log(typedRequest.channel);
```

## Request Schemas

| Schema                                   | Purpose                                       |
| ---------------------------------------- | --------------------------------------------- |
| `PostMessageRequestSchemaObject`         | Body for `POST /chat.postMessage`             |
| `UpdateMessageRequestSchemaObject`       | Body for `POST /chat.update`                  |
| `DeleteMessageRequestSchemaObject`       | Body for `POST /chat.delete`                  |
| `ListConversationsRequestSchemaObject`   | Query params for `GET /conversations.list`    |
| `ConversationHistoryRequestSchemaObject` | Query params for `GET /conversations.history` |
| `GetUserInfoRequestSchemaObject`         | Query params for `GET /users.info`            |

## Response Schemas

| Schema                                    | Endpoint                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `PostMessageResponseSchemaObject`         | `POST /chat.postMessage`                                                                                      |
| `UpdateMessageResponseSchemaObject`       | `POST /chat.update`                                                                                           |
| `DeleteMessageResponseSchemaObject`       | `POST /chat.delete`                                                                                           |
| `ListConversationsResponseSchemaObject`   | `GET /conversations.list`                                                                                     |
| `ConversationHistoryResponseSchemaObject` | `GET /conversations.history`                                                                                  |
| `GetUserInfoResponseSchemaObject`         | `GET /users.info`                                                                                             |
| `ErrorEnvelopeSchemaObject`               | Slack's universal `{ ok, error, warning }` envelope, parsed on every response (see [Errors](Slack-Errors.md)) |

## Shared / common schemas

| Schema                         | Purpose                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `MessageSchemaObject`          | The message object embedded in `chat.postMessage`'s response and `conversations.history`'s `messages` array |
| `ChannelSchemaObject`          | One entry of `conversations.list`'s `channels` array                                                        |
| `ChannelTopicSchemaObject`     | A channel's `topic`/`purpose` object                                                                        |
| `SlackUserSchemaObject`        | A user resource, as returned by `users.info`                                                                |
| `SlackUserProfileSchemaObject` | The `profile` subset of a `SlackUserSchema`                                                                 |
| `ResponseMetadataSchemaObject` | The `response_metadata` cursor-pagination envelope                                                          |
| `slackTimestampGuard`          | Validates a Slack `<unix seconds>.<microseconds>` message timestamp                                         |

Rich Block Kit content (`blocks`, `attachments`) is intentionally not
modeled — `PostMessageRequestSchema`/`UpdateMessageRequestSchema` only
cover plain-text messages via `text`. `UpdateMessageResponseSchema.message`
is deliberately loose (`Record<string, unknown>`) rather than reusing
`MessageSchema`: Slack's own documented example response for `chat.update`
shows a reduced echo (`{ text, user }`, missing `type`/`ts`), and reusing
the stricter schema would risk rejecting a genuinely successful response.

---

[← Back to Slack](../README.md)
