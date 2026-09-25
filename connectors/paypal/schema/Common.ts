import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Regex for PayPal's documented `money.value` field — confirmed against
 * PayPal's published OpenAPI spec
 * (https://github.com/paypal/paypal-rest-api-specifications/blob/main/openapi/checkout_orders_v2.json,
 * `#/components/schemas/money`): an integer string for a zero-decimal
 * currency (e.g. `"100"` for JPY), or a decimal-fraction string for others
 * (e.g. `"10.00"` for USD, `"10.000"` for a three-decimal currency like
 * BHD). This connect validates PayPal's own pattern only — it does not
 * further restrict decimal-place count per currency, since that varies by
 * currency and PayPal's API itself rejects a mismatch.
 */
const MONEY_VALUE_PATTERN = /^((-?[0-9]+)|(-?([0-9]+)?[.][0-9]+))$/;

/**
 * Guardian for a single ISO-4217 currency-code field. PayPal's own schema
 * only constrains this to exactly 3 characters (`minLength: 3, maxLength:
 * 3`, pattern `^[\S\s]*$`) — it does not itself enforce upper-case
 * letters at the schema level, relying on its supported-currency list to
 * reject anything invalid. This connect mirrors that exact constraint
 * rather than a stricter `[A-Z]{3}` guess.
 */
export const currencyCodeGuard: BaseGuardian<string> = Guardian.string()
  .minLength(3)
  .maxLength(3)
  .describe({
    title: 'ISO-4217 currency code',
    description:
      'Three-character currency code (e.g. "USD", "JPY") — see PayPal\'s Currency Codes reference for the supported list.',
  });

/**
 * Guardian for PayPal's `money.value` field — a decimal STRING, not a
 * number. See {@link MONEY_VALUE_PATTERN}.
 */
export const moneyValueGuard: BaseGuardian<string> = Guardian.string()
  .minLength(0)
  .maxLength(32)
  .pattern(
    MONEY_VALUE_PATTERN,
    'value must be a decimal string such as "10.00" (or "100" for a zero-decimal currency like JPY)',
  )
  .describe({
    title: 'Money value',
    description:
      'Decimal-string amount — an integer string for zero-decimal currencies (e.g. JPY), a decimal fraction for others. Always a JSON string, never a number.',
  });

/**
 * Type definition for PayPal's `money` object — the currency and amount
 * for a financial transaction (an order total, a breakdown line, a
 * capture, or a refund amount).
 *
 * @example
 * ```typescript
 * import { MoneySchemaObject } from '@tundraconnect/paypal/schemas';
 *
 * const [error, money] = MoneySchemaObject.safeParse({
 *   currency_code: 'USD',
 *   value: '10.00',
 * });
 * if (!error) {
 *   console.log(money.value); // '10.00' — a string, not a number
 * }
 * ```
 */
export type MoneySchema = {
  /** Three-character ISO-4217 currency code. */
  currency_code: string;
  /** Decimal-string amount — see {@link moneyValueGuard}. */
  value: string;
};

const _moneySchema: BaseGuardian<MoneySchema> = Guardian.object({
  currency_code: currencyCodeGuard,
  value: moneyValueGuard,
}).describe({
  title: 'Money',
  description:
    "PayPal's currency + amount pair. `value` is a decimal STRING, not a number — verified against PayPal's published OpenAPI spec.",
});

/** Schema for PayPal's `money` object. */
export const MoneySchemaObject: BaseGuardian<MoneySchema> = _moneySchema;

/** HTTP methods PayPal documents on a HATEOAS link's `method` field. */
export type LinkMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'HEAD'
  | 'CONNECT'
  | 'OPTIONS'
  | 'PATCH';

/**
 * Type definition for PayPal's `link_description` object — a
 * request-related HATEOAS link, as returned on an order/capture/refund's
 * `links` array.
 */
export type LinkSchema = {
  /** The complete target URL for the related call. */
  href: string;
  /** The link relation type (e.g. `"self"`, `"approve"`, `"capture"`). */
  rel: string;
  /** The HTTP method required to make the related call. */
  method?: LinkMethod;
};

const _linkSchema: BaseGuardian<LinkSchema> = Guardian.object({
  href: Guardian.string(),
  rel: Guardian.string(),
  method: Guardian.enum(
    [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'HEAD',
      'CONNECT',
      'OPTIONS',
      'PATCH',
    ] as const,
  ).optional(),
}).passthrough().describe({
  title: 'HATEOAS link',
  description:
    "A PayPal request-related HATEOAS link, as returned on an order/capture/refund's `links` array.",
});

/** Schema for PayPal's `link_description` object. */
export const LinkSchemaObject: BaseGuardian<LinkSchema> = _linkSchema;
