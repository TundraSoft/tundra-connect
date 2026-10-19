# Pyth Schemas

The `@tundraconnect/pyth/schemas` subpath exports Guardian validators and
inferred types for Pyth Pro payloads.

```ts
import { PythStreamUpdateSchemaObject } from '@tundraconnect/pyth/schemas';

declare const frame: unknown;
const [error, update] = PythStreamUpdateSchemaObject.safeParse(frame);
```

| Schema                            | Message                                              | Notes                                                                                       |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `PythStreamUpdateSchemaObject`    | `streamUpdated`                                      | `parsed.timestampUs` (an integer string on the wire) becomes a number of µs.                |
| `PythPriceFeedUpdateSchemaObject` | one entry of `parsed.priceFeeds`                     | `price`, `bestBidPrice`, `bestAskPrice`, `emaPrice` stay exact i64 strings.                 |
| `PythSubscribedSchemaObject`      | `subscribed` / `subscribedWithInvalidFeedIdsIgnored` | `ignoredInvalidFeedIds` lists unknown ids/symbols, unsupported channels and unstable feeds. |

Every schema passes through fields the venue adds.

---

[← Back to Pyth](../README.md)
