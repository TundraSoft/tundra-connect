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
  /**
   * Available balance in whole units — USDC for a `COLLATERAL` query,
   * shares for a `CONDITIONAL` (token) query. Converted from the vendor's
   * 6-decimal fixed-point wire form (`'125500000'` -> `125.5`).
   */
  balance: number;
  /** The untouched 6-decimal base-unit string the vendor sent. */
  balanceRaw: string;
  /** Spender contract address -> allowance, in the same base units. */
  allowances?: Record<string, string>;
};

/** USDC and Polymarket conditional tokens both carry 6 decimals. */
const BASE_UNITS_PER_WHOLE = 1_000_000;

/**
 * Schema for the CLOB's `GET /balance-allowance` response. The vendor
 * reports `balance` as a fixed-point integer string with 6 decimals (the
 * OpenAPI spec: "Balance amount in fixed-math with 6 decimals"), so
 * `'125500000'` is $125.50 — `balance` is the divided whole-unit number
 * and `balanceRaw` the original string.
 *
 * @example
 * ```typescript
 * import { ClobBalanceSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, balance] = ClobBalanceSchemaObject.safeParse({ balance: '125500000' });
 * // balance.balance === 125.5, balance.balanceRaw === '125500000'
 * ```
 */
export const ClobBalanceSchemaObject: BaseGuardian<ClobBalance> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      const balanceRaw = String(obj.balance ?? '');
      const units = Number(balanceRaw);
      return {
        ...obj,
        balanceRaw,
        balance: Number.isFinite(units) ? units / BASE_UNITS_PER_WHOLE : NaN,
      };
    },
    Guardian.object({
      balance: Guardian.number(),
      balanceRaw: Guardian.string(),
      allowances: Guardian.record(Guardian.string(), Guardian.string())
        .optional(),
    }).describe({
      title: 'Balance and allowance',
      description:
        'Available collateral (or token shares) and per-contract allowances, as the CLOB sees them.',
    }),
  );

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
