import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Schema for Telegram's `parameters` field.
 *
 * Present on some error responses to help the caller recover
 * automatically: `retry_after` on a `429 Too Many Requests` (seconds to
 * wait before retrying), `migrate_to_chat_id` when a group chat was
 * upgraded to a supergroup mid-request (the chat id to use from then on).
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived): JSR's
 * public-API "slow types" check requires the *originating* declaration of
 * any type reachable from the public API to carry an explicit annotation,
 * including a private, unexported `const` reached only via `typeof` — so
 * the shape is pinned directly here instead of threaded through an
 * internal helper (mirrors `stripe/schema/Error.ts`).
 *
 * @example
 * ```typescript
 * import { ResponseParametersSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, parameters] = ResponseParametersSchemaObject.safeParse({
 *   retry_after: 30,
 * });
 * if (!error) {
 *   console.log(parameters.retry_after);
 * }
 * ```
 */
export type ResponseParametersSchema = {
  /** Seconds to wait before retrying; present on `429 Too Many Requests`. */
  retry_after?: number;
  /** The group's new supergroup chat id, present when a group was upgraded. */
  migrate_to_chat_id?: number;
};

/** Extra recovery information Telegram attaches to some error responses. */
export const ResponseParametersSchemaObject: BaseGuardian<
  ResponseParametersSchema
> = Guardian.object({
  retry_after: Guardian.number().integer().optional(),
  migrate_to_chat_id: Guardian.number().integer().optional(),
}).describe({
  title: 'Response parameters',
  description:
    'Extra recovery information Telegram attaches to some error responses.',
});

/**
 * Schema for the universal Telegram Bot API response envelope.
 *
 * Every method call — success or failure — returns this shape:
 * `{ ok, result?, error_code?, description?, parameters? }`. `result`'s
 * inner shape is endpoint-specific (a `Message`, a `User`, …), so it is
 * left as `unknown` here — {@link Telegram}'s `_responseHandler` unwraps
 * `result` into the response body on `ok: true`, and each endpoint method
 * validates it against its own response schema (`MessageSchemaObject`,
 * `UserSchemaObject`, …) from there.
 *
 * @example
 * ```typescript
 * import { ResponseEnvelopeSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, envelope] = ResponseEnvelopeSchemaObject.safeParse({
 *   ok: false,
 *   error_code: 429,
 *   description: 'Too Many Requests: retry after 30',
 *   parameters: { retry_after: 30 },
 * });
 * if (!error) {
 *   console.log(envelope.error_code);
 * }
 * ```
 */
export type ResponseEnvelopeSchema = {
  /** Whether the request succeeded. */
  ok: boolean;
  /** The method's result, present when `ok` is `true`. Shape is endpoint-specific. */
  result?: unknown;
  /** HTTP-status-shaped error code; Telegram documents it as subject to change. */
  error_code?: number;
  /** Human-readable description of the result or error. */
  description?: string;
  /** Extra recovery information, present on some error responses. */
  parameters?: ResponseParametersSchema;
};

/**
 * The `{ ok, result, error_code, description, parameters }` wrapper
 * Telegram returns from every Bot API method.
 */
export const ResponseEnvelopeSchemaObject: BaseGuardian<
  ResponseEnvelopeSchema
> = Guardian.object({
  ok: Guardian.boolean(),
  result: Guardian.unknown().optional(),
  error_code: Guardian.number().integer().optional(),
  description: Guardian.string().optional(),
  parameters: ResponseParametersSchemaObject.optional(),
}).passthrough().describe({
  title: 'Telegram response envelope',
  description:
    'The `{ ok, result, error_code, description, parameters }` wrapper Telegram returns from every Bot API method.',
});
