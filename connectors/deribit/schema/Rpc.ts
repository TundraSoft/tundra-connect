import { type BaseGuardian, Guardian } from '@guardian';

/** A JSON-RPC error object. */
export type DeribitRpcErrorSchema = {
  /** Deribit error code, e.g. `13778`, `-32602`, `10028`. */
  code: number;
  /** e.g. `raw_subscriptions_not_available_for_unauthorized`. */
  message: string;
  /** Extra detail, e.g. `{ reason, param }`. */
  data?: unknown;
};

/**
 * Validates a JSON-RPC error object.
 *
 * @example
 * ```ts
 * import { DeribitRpcErrorSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * const [, e] = DeribitRpcErrorSchemaObject.safeParse({ code: -32602, message: 'Invalid params' });
 * console.log(e?.code);
 * ```
 */
export const DeribitRpcErrorSchemaObject: BaseGuardian<DeribitRpcErrorSchema> =
  Guardian.object({
    code: Guardian.number().strict(),
    message: Guardian.string(),
    data: Guardian.unknown().optional(),
  }) as BaseGuardian<DeribitRpcErrorSchema>;

/**
 * The JSON-RPC envelope of every Deribit answer, with the server's own
 * microsecond timing.
 */
export type DeribitRpcEnvelopeSchema = {
  jsonrpc: string;
  id?: number | string;
  result?: unknown;
  error?: DeribitRpcErrorSchema;
  /** Server receive time, Unix µs. */
  usIn?: number;
  /** Server send time, Unix µs. */
  usOut?: number;
  /** Server processing time, µs. */
  usDiff?: number;
  testnet?: boolean;
} & Record<string, unknown>;

/**
 * Validates the JSON-RPC envelope (not its `result`).
 *
 * @example
 * ```ts
 * import { DeribitRpcEnvelopeSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * const [, env] = DeribitRpcEnvelopeSchemaObject.safeParse({ jsonrpc: '2.0', result: 'ok', usIn: 1, usOut: 2, usDiff: 1, testnet: false });
 * console.log(env?.usDiff);
 * ```
 */
export const DeribitRpcEnvelopeSchemaObject: BaseGuardian<
  DeribitRpcEnvelopeSchema
> = Guardian.object({
  jsonrpc: Guardian.string(),
  id: Guardian.unknown<number | string>().optional(),
  result: Guardian.unknown().optional(),
  error: DeribitRpcErrorSchemaObject.optional(),
  usIn: Guardian.number().strict().optional(),
  usOut: Guardian.number().strict().optional(),
  usDiff: Guardian.number().strict().optional(),
  testnet: Guardian.boolean().strict().optional(),
}).passthrough() as BaseGuardian<DeribitRpcEnvelopeSchema>;

/** `public/auth` result. */
export type DeribitAuthResultSchema = {
  accessToken: string;
  refreshToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  /** Granted scope, e.g. `connection mainaccount read`. */
  scope: string;
  tokenType?: string;
} & Record<string, unknown>;

/**
 * Validates a `public/auth` result (raw wire keys in).
 *
 * @example
 * ```ts
 * import { DeribitAuthResultSchemaObject } from '@tundraconnect/deribit/schemas';
 *
 * const [, a] = DeribitAuthResultSchemaObject.safeParse({
 *   access_token: 'a', refresh_token: 'r', expires_in: 900, scope: 'connection read',
 * });
 * console.log(a?.expiresIn);
 * ```
 */
export const DeribitAuthResultSchemaObject: BaseGuardian<
  DeribitAuthResultSchema
> = Guardian.preprocess(
  (raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const r = raw as Record<string, unknown>;
    const { access_token, refresh_token, expires_in, token_type, ...rest } = r;
    return {
      ...rest,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in,
      ...(token_type !== undefined && { tokenType: token_type }),
    };
  },
  Guardian.object({
    accessToken: Guardian.string().minLength(1),
    refreshToken: Guardian.string().minLength(1),
    expiresIn: Guardian.number().strict(),
    scope: Guardian.string(),
    tokenType: Guardian.string().optional(),
  }).passthrough(),
) as BaseGuardian<DeribitAuthResultSchema>;
