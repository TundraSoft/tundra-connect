import { type BaseGuardian, Guardian } from '@guardian';

/** Exchange-wide trading availability, from `GET /exchange/status`. */
export type ExchangeStatus = {
  /** `false` if the core exchange is no longer taking any state changes at all — more severe than `tradingActive: false`. */
  exchangeActive: boolean;
  /** `true` if trading is currently permitted. */
  tradingActive: boolean;
  intraExchangeTransfersActive?: boolean;
  /** ISO-8601. Present only during a maintenance window. */
  exchangeEstimatedResumeTime?: string;
};

const RENAME_MAP: Record<string, string> = {
  exchange_active: 'exchangeActive',
  trading_active: 'tradingActive',
  intra_exchange_transfers_active: 'intraExchangeTransfersActive',
  exchange_estimated_resume_time: 'exchangeEstimatedResumeTime',
};

function normalizeExchangeStatus(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const out: Record<string, unknown> = {};
  for (
    const [wireKey, value] of Object.entries(raw as Record<string, unknown>)
  ) {
    out[RENAME_MAP[wireKey] ?? wireKey] = value;
  }
  return out;
}

const _exchangeStatus = Guardian.object({
  exchangeActive: Guardian.boolean(),
  tradingActive: Guardian.boolean(),
  intraExchangeTransfersActive: Guardian.boolean().optional(),
  exchangeEstimatedResumeTime: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Kalshi exchange status',
  description:
    'Whether the exchange is currently open for trading / state changes.',
});

/**
 * Schema for the `GET /exchange/status` response.
 *
 * @example
 * ```typescript
 * import { ExchangeStatusSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, status] = ExchangeStatusSchemaObject.safeParse({
 *   exchange_active: true, trading_active: true,
 * });
 * ```
 */
export const ExchangeStatusSchemaObject: BaseGuardian<ExchangeStatus> = Guardian
  .preprocess(normalizeExchangeStatus, _exchangeStatus);
