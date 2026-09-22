import { type BaseGuardian, Guardian } from '@guardian';

/** Response schema for `GET /version`. */
export type ClobVersion = {
  version: number;
};

/**
 * Schema for the CLOB's `GET /version` response.
 *
 * @example
 * ```typescript
 * import { ClobVersionSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, version] = ClobVersionSchemaObject.safeParse({ version: 2 });
 * ```
 */
export const ClobVersionSchemaObject: BaseGuardian<ClobVersion> = Guardian
  .object({
    version: Guardian.number().integer(),
  }).describe({
    title: 'CLOB protocol version',
    description:
      'The order-signing protocol version the CLOB currently serves (1 or 2).',
  });

/** Response schema for `GET /tick-size`. */
export type ClobTickSize = {
  minimumTickSize: number;
};

/**
 * Schema for the CLOB's `GET /tick-size` response. Renames the wire's
 * `minimum_tick_size` to `minimumTickSize` to match this connect's
 * camelCase convention for its own derived types (the raw Gamma schemas
 * keep the vendor's own key casing since those are passed straight
 * through; this is a small, hand-computed value this connect's own
 * methods use directly).
 *
 * @example
 * ```typescript
 * import { ClobTickSizeSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, tick] = ClobTickSizeSchemaObject.safeParse({ minimum_tick_size: '0.01' });
 * ```
 */
export const ClobTickSizeSchemaObject: BaseGuardian<ClobTickSize> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const { minimum_tick_size } = raw as { minimum_tick_size?: unknown };
      const parsed = Number(minimum_tick_size);
      return {
        minimumTickSize: Number.isFinite(parsed) && parsed !== 0
          ? parsed
          : 0.01,
      };
    },
    Guardian.object({ minimumTickSize: Guardian.number() }),
  );

/** Response schema for `GET /neg-risk`. */
export type ClobNegRisk = {
  negRisk: boolean;
};

/**
 * Schema for the CLOB's `GET /neg-risk` response.
 *
 * @example
 * ```typescript
 * import { ClobNegRiskSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, negRisk] = ClobNegRiskSchemaObject.safeParse({ neg_risk: false });
 * ```
 */
export const ClobNegRiskSchemaObject: BaseGuardian<ClobNegRisk> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const { neg_risk } = raw as { neg_risk?: unknown };
      return { negRisk: Boolean(neg_risk) };
    },
    Guardian.object({ negRisk: Guardian.boolean() }),
  );

/** Response schema for `GET /balance-allowance`. */
export type ClobBalance = {
  balance: number;
  allowances?: Record<string, string>;
};

/**
 * Schema for the CLOB's `GET /balance-allowance` response. `balance` is
 * available USDC (or the requested collateral) as the venue sees it,
 * coerced from the vendor's decimal-string wire form.
 *
 * @example
 * ```typescript
 * import { ClobBalanceSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, balance] = ClobBalanceSchemaObject.safeParse({ balance: '125.50' });
 * ```
 */
export const ClobBalanceSchemaObject: BaseGuardian<ClobBalance> = Guardian
  .object({
    balance: Guardian.number(),
    allowances: Guardian.record(Guardian.string(), Guardian.string())
      .optional(),
  }).describe({
    title: 'Balance and allowance',
    description:
      'Available collateral and per-contract allowances, as the CLOB sees them.',
  });

/** Response schema for `POST /auth/api-key` and `GET /auth/derive-api-key`. */
export type ClobApiCredentials = {
  /** UUID. */
  apiKey: string;
  /** URL-safe base64 (with or without padding). */
  secret: string;
  passphrase: string;
};

const _apiCredentials = Guardian.object({
  apiKey: Guardian.string().minLength(1),
  secret: Guardian.string().minLength(1),
  passphrase: Guardian.string().minLength(1),
}).describe({
  title: 'CLOB API credentials',
  description:
    'L2 API key/secret/passphrase, derived once via an L1-signed request.',
});

/**
 * Schema for the CLOB's `POST /auth/api-key` / `GET /auth/derive-api-key`
 * response. The vendor's `apiKey` field is sometimes named `key` instead —
 * both are accepted and normalized to `apiKey`.
 *
 * @example
 * ```typescript
 * import { ClobApiCredentialsSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, creds] = ClobApiCredentialsSchemaObject.safeParse({
 *   apiKey: '00000000-0000-0000-0000-000000000000',
 *   secret: 'AAAA...',
 *   passphrase: 'p',
 * });
 * ```
 */
export const ClobApiCredentialsSchemaObject: BaseGuardian<ClobApiCredentials> =
  Guardian.preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as { apiKey?: unknown; key?: unknown };
      if (obj.apiKey === undefined && obj.key !== undefined) {
        return { ...obj, apiKey: obj.key };
      }
      return obj;
    },
    _apiCredentials,
  );
