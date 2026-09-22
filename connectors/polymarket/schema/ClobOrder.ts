import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Response schema for `POST /order` (single) and each element of `POST
 * /orders` (batch). Amounts are HUMAN units (whole USDC / shares) — the
 * venue does not return the 1e6 fixed-point form it was sent.
 */
export type ClobPostOrderResponse = {
  errorMsg?: string;
  /** Machine-readable vendor error code, present on some rejections. */
  code?: string;
  /** Present on a `503` (trading disabled / rate-limited) rejection. */
  retryAfterSeconds?: number;
  /** Decimal string; may be `""` on a rejection. */
  makingAmount?: string;
  takingAmount?: string;
  orderId?: string;
  /** `live`, `matched`, `delayed`, `unmatched`, `canceled`, or an unrecognized vendor value — compare case-insensitively. */
  status?: string;
  success?: boolean;
  transactionsHashes?: string[] | null;
  tradeIds?: string[];
};

const _postOrderResponse = Guardian.object({
  errorMsg: Guardian.string().optional(),
  code: Guardian.string().optional(),
  retryAfterSeconds: Guardian.number().optional(),
  makingAmount: Guardian.string().optional(),
  takingAmount: Guardian.string().optional(),
  orderId: Guardian.string().optional(),
  status: Guardian.string().optional(),
  success: Guardian.boolean().optional(),
  transactionsHashes: Guardian.array(Guardian.string()).nullable().optional(),
  tradeIds: Guardian.array(Guardian.string()).optional(),
}).describe({
  title: 'CLOB post-order response',
  description: "The venue's response to a single signed order submission.",
});

/**
 * Schema for the CLOB's order-submission response (also used for each
 * element of a bulk `POST /orders` response). The vendor's fields are
 * `orderID`/`tradeIDs` (capital IDs) and `retry_after_seconds`; normalized
 * here to `orderId`/`tradeIds`/`retryAfterSeconds` to match this connect's
 * casing convention for its hand-modeled CLOB types.
 *
 * @example
 * ```typescript
 * import { ClobPostOrderResponseSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, result] = ClobPostOrderResponseSchemaObject.safeParse({
 *   status: 'matched',
 *   makingAmount: '4.95',
 *   takingAmount: '9',
 *   orderID: 'abc123',
 * });
 * ```
 */
export const ClobPostOrderResponseSchemaObject: BaseGuardian<
  ClobPostOrderResponse
> = Guardian.preprocess(
  (raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const obj = { ...(raw as Record<string, unknown>) };
    if (obj.orderId === undefined && obj.orderID !== undefined) {
      obj.orderId = obj.orderID;
    }
    if (obj.tradeIds === undefined && obj.tradeIDs !== undefined) {
      obj.tradeIds = obj.tradeIDs;
    }
    if (
      obj.retryAfterSeconds === undefined &&
      obj.retry_after_seconds !== undefined
    ) {
      obj.retryAfterSeconds = obj.retry_after_seconds;
    }
    return obj;
  },
  _postOrderResponse,
);

/** Response schema for `POST /orders` (bulk) — one {@link ClobPostOrderResponse} per submitted order, same array order. */
export type ClobPostOrdersResponse = ClobPostOrderResponse[];

/**
 * Schema for the CLOB's bulk order-submission response.
 *
 * @example
 * ```typescript
 * import { ClobPostOrdersResponseSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, results] = ClobPostOrdersResponseSchemaObject.safeParse([
 *   { status: 'live', orderID: 'abc123' },
 * ]);
 * ```
 */
export const ClobPostOrdersResponseSchemaObject: BaseGuardian<
  ClobPostOrdersResponse
> = Guardian.array(ClobPostOrderResponseSchemaObject).describe({
  title: 'CLOB bulk post-orders response',
  description: "The venue's per-order response to a bulk order submission.",
});

/** Response schema for `DELETE /order` (single) and `DELETE /orders` (batch). */
export type ClobCancelResponse = {
  canceled: string[];
  /** Order id -> vendor-supplied rejection reason. */
  notCanceled: Record<string, string>;
};

/**
 * Schema for the CLOB's cancel-order response.
 *
 * @example
 * ```typescript
 * import { ClobCancelResponseSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, result] = ClobCancelResponseSchemaObject.safeParse({
 *   canceled: ['abc123'],
 *   not_canceled: { def456: 'order already matched' },
 * });
 * ```
 */
export const ClobCancelResponseSchemaObject: BaseGuardian<ClobCancelResponse> =
  Guardian.preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return {
        canceled: obj.canceled ?? [],
        notCanceled: obj.not_canceled ?? obj.notCanceled ?? {},
      };
    },
    Guardian.object({
      canceled: Guardian.array(Guardian.string()),
      notCanceled: Guardian.record(Guardian.string(), Guardian.string()),
    }).describe({
      title: 'CLOB cancel response',
      description:
        'Which order ids were canceled, and why any others were refused.',
    }),
  );
