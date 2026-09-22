/**
 * @fileoverview Kalshi v2 request auth — the signing string + the three
 * headers every authenticated (`/portfolio/*`) call needs.
 *
 * Contract (docs.kalshi.com): sign `{timestampMs}{METHOD}{path}` where
 * `METHOD` is uppercase and `path` INCLUDES the `/trade-api/v2` prefix but
 * EXCLUDES the query string. Headers:
 *   `KALSHI-ACCESS-KEY`       — the API key id (a UUID, from account settings)
 *   `KALSHI-ACCESS-SIGNATURE` — base64 RSA-PSS-SHA256 of the signing string
 *   `KALSHI-ACCESS-TIMESTAMP` — the same Unix MILLISECONDS used in the string
 *
 * Three quirks cause a silent 401 (mirrors of the Polymarket L2 lessons in
 * `../polymarket/PolymarketAuth.ts`): the timestamp in the header MUST
 * equal the one signed; the path MUST be query-stripped; the timestamp
 * MUST be milliseconds, not seconds.
 *
 * @module
 */

import type { KalshiSigner } from './KalshiSigner.ts';

/**
 * `/trade-api/v2` — the prefix every Kalshi v2 path carries. This
 * connect's `RESTlerOptions.baseURL` stays HOST-ONLY (e.g.
 * `https://external-api.kalshi.com`), and every endpoint's own `path` in
 * `Kalshi.ts` includes this prefix explicitly (e.g.
 * `${API_PREFIX}/portfolio/balance`) — so the exact same `endpoint.path`
 * string RESTler uses to build the outgoing URL is also, byte-for-byte,
 * what gets signed below. Splitting `baseURL`/`path` any other way would
 * mean computing the prefixed path twice (once for routing, once for
 * signing) with a real risk of the two silently drifting apart.
 */
export const API_PREFIX = '/trade-api/v2';

/**
 * The exact string Kalshi signs: `{timestampMs}{METHOD}{path}`. `path`
 * must already be query-free AND already carry the {@link API_PREFIX}
 * prefix — pass `endpoint.path` from a `Kalshi.ts` request as-is. RESTler
 * keeps `path` and `query` as separate fields, so every caller here
 * already has a query-free path in hand, unlike the Rust reference (which
 * had to split on `?` itself).
 *
 * @example
 * ```typescript
 * signingString(1_700_000_000_000, 'get', '/trade-api/v2/portfolio/orders');
 * // '1700000000000GET/trade-api/v2/portfolio/orders'
 * ```
 */
export function signingString(
  timestampMs: number,
  method: string,
  path: string,
): string {
  return `${timestampMs}${method.toUpperCase()}${path}`;
}

/** The three auth headers for one request, in the exact names the venue expects. */
export type KalshiAuthHeaders = {
  'KALSHI-ACCESS-KEY': string;
  'KALSHI-ACCESS-SIGNATURE': string;
  'KALSHI-ACCESS-TIMESTAMP': string;
};

/**
 * Builds the three auth headers for one request. `timestampMs` is used
 * BOTH in the signed string and the `KALSHI-ACCESS-TIMESTAMP` header —
 * they must match exactly or the venue rejects the request with a 401.
 *
 * @param path - The endpoint path, ALREADY carrying the `/trade-api/v2`
 * prefix (i.e. exactly `endpoint.path` from the request being signed) —
 * see {@link API_PREFIX}'s doc comment for why this must be the same
 * string RESTler routes with, not a separately-prefixed copy.
 */
export async function buildAuthHeaders(
  signer: KalshiSigner,
  accessKey: string,
  timestampMs: number,
  method: string,
  path: string,
): Promise<KalshiAuthHeaders> {
  const message = signingString(timestampMs, method, path);
  return {
    'KALSHI-ACCESS-KEY': accessKey,
    'KALSHI-ACCESS-SIGNATURE': await signer.sign(
      new TextEncoder().encode(message),
    ),
    'KALSHI-ACCESS-TIMESTAMP': String(timestampMs),
  };
}
