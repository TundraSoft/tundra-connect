import { type BaseGuardian, Guardian } from '@guardian';

/** A Kalshi series — the top-level grouping above events (e.g. all "Bitcoin hourly price" events). */
export type Series = {
  ticker: string;
  frequency?: string;
  title: string;
  category?: string;
  tags?: string[];
  contractUrl?: string;
  contractTermsUrl?: string;
  feeType?: string;
  feeMultiplier?: number;
  /** Present only when the request set `includeVolume: true`. */
  volume?: number;
  lastUpdatedTs?: string;
};

const RENAME_MAP: Record<string, string> = {
  ticker: 'ticker',
  frequency: 'frequency',
  title: 'title',
  category: 'category',
  tags: 'tags',
  contract_url: 'contractUrl',
  contract_terms_url: 'contractTermsUrl',
  fee_type: 'feeType',
  fee_multiplier: 'feeMultiplier',
  volume_fp: 'volume',
  last_updated_ts: 'lastUpdatedTs',
};

function normalizeSeries(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const out: Record<string, unknown> = {};
  for (
    const [wireKey, value] of Object.entries(raw as Record<string, unknown>)
  ) {
    out[RENAME_MAP[wireKey] ?? wireKey] = value;
  }
  return out;
}

const _series = Guardian.object({
  ticker: Guardian.string().minLength(1),
  frequency: Guardian.string().optional(),
  title: Guardian.string(),
  category: Guardian.string().optional(),
  tags: Guardian.array(Guardian.string()).optional(),
  contractUrl: Guardian.string().optional(),
  contractTermsUrl: Guardian.string().optional(),
  feeType: Guardian.string().optional(),
  feeMultiplier: Guardian.number().optional(),
  volume: Guardian.number().optional(),
  lastUpdatedTs: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Kalshi series',
  description:
    'The top-level grouping above events, e.g. a recurring question template.',
});

/**
 * Schema for one series, as returned by `GET /series` or the `series`
 * field of `GET /series/{series_ticker}`.
 *
 * @example
 * ```typescript
 * import { SeriesSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, series] = SeriesSchemaObject.safeParse({
 *   ticker: 'KXBTCD', title: 'Bitcoin price', fee_type: 'quadratic', fee_multiplier: 1,
 * });
 * ```
 */
export const SeriesSchemaObject: BaseGuardian<Series> = Guardian.preprocess(
  normalizeSeries,
  _series,
);

/** Response shape for `GET /series`. */
export type SeriesListResponse = {
  series: Series[];
};

const _seriesList = Guardian.object({
  series: Guardian.array(SeriesSchemaObject),
}).describe({
  title: 'Kalshi series list',
  description: 'A list of series matching the request filters.',
});

/**
 * Schema for the `GET /series` response.
 *
 * @example
 * ```typescript
 * import { SeriesListResponseSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, result] = SeriesListResponseSchemaObject.safeParse({ series: [] });
 * ```
 */
export const SeriesListResponseSchemaObject: BaseGuardian<SeriesListResponse> =
  Guardian.preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return { series: obj.series ?? [] };
    },
    _seriesList,
  );

/** Schema for the `GET /series/{series_ticker}` response, which wraps the series as `{ "series": ... }`. */
export const SingleSeriesSchemaObject: BaseGuardian<Series> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return obj.series ?? obj;
    },
    SeriesSchemaObject,
  );
