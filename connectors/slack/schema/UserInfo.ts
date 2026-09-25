import { type BaseGuardian, Guardian } from '@guardian';
import { type SlackUserSchema, SlackUserSchemaObject } from './User.ts';

/**
 * Request schema for `GET /users.info`.
 *
 * @example
 * ```typescript
 * import { GetUserInfoRequestSchemaObject } from '@tundraconnect/slack/schemas';
 *
 * const [error, request] = GetUserInfoRequestSchemaObject.safeParse({
 *   user: 'U123ABC456',
 * });
 * if (!error) {
 *   console.log(request.user);
 * }
 * ```
 */
export type GetUserInfoRequestSchema = {
  /** The user id to look up. */
  user: string;
};

/** Request query parameters validated before `GET /users.info`. */
export const GetUserInfoRequestSchemaObject: BaseGuardian<
  GetUserInfoRequestSchema
> = Guardian.object({
  user: Guardian.string().minLength(1),
}).describe({
  title: 'users.info request',
  description: 'Request query parameters validated before GET /users.info.',
});

/** Response schema for a successful `GET /users.info`. */
export type GetUserInfoResponseSchema = {
  /** Always `true` — {@link Slack}'s response handler has already thrown for `ok: false`. */
  ok: boolean;
  /** The requested user. */
  user: SlackUserSchema;
};

/** Response body returned by a successful `GET /users.info`. */
export const GetUserInfoResponseSchemaObject: BaseGuardian<
  GetUserInfoResponseSchema
> = Guardian.object({
  ok: Guardian.boolean(),
  user: SlackUserSchemaObject,
}).passthrough().describe({
  title: 'users.info response',
  description: 'Response body returned by a successful GET /users.info.',
});
