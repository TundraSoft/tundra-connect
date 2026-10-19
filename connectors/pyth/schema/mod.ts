/**
 * Guardian schemas behind `@tundraconnect/pyth`: the Pyth Pro WebSocket
 * payloads, each exported as a schema object with its inferred type.
 *
 * @example
 * ```ts
 * import { PythStreamUpdateSchemaObject } from '@tundraconnect/pyth/schemas';
 *
 * declare const frame: unknown; // a recorded `streamUpdated` frame
 * const [error, update] = PythStreamUpdateSchemaObject.safeParse(frame);
 * if (error) console.error(error.message);
 * else console.log(update.parsed?.priceFeeds.length);
 * ```
 *
 * @module
 */

export {
  type PythBinaryPayload,
  type PythIgnoredFeeds,
  type PythPriceFeedUpdate,
  PythPriceFeedUpdateSchemaObject,
  type PythStreamUpdate,
  PythStreamUpdateSchemaObject,
  type PythSubscribed,
  PythSubscribedSchemaObject,
} from './StreamUpdate.ts';
