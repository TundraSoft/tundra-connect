/**
 * Guardian schemas behind `@tundraconnect/slack`: every request and response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { PostMessageRequestSchemaObject } from '@tundraconnect/slack/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = PostMessageRequestSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export * from './Common.ts';
export * from './Message.ts';
export * from './PostMessage.ts';
export * from './UpdateMessage.ts';
export * from './DeleteMessage.ts';
export * from './Channel.ts';
export * from './ConversationsList.ts';
export * from './ConversationsHistory.ts';
export * from './User.ts';
export * from './UserInfo.ts';
export * from './Error.ts';
