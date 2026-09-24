import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { CLOB_API, DATA_API, GAMMA_API, Polymarket } from './Polymarket.ts';
import { PolymarketError } from './errors/mod.ts';

// Publicly-known Hardhat/Anvil test key — safe to hardcode; the same key
// this connect's crypto modules pin their SDK test vectors against.
const TEST_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PROXY = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';
const TOKEN =
  '71321045679252212594626385532706912750332728571942532289631379312455583992563';
const CREDS = {
  apiKey: '00000000-0000-0000-0000-000000000000',
  secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  passphrase: 'p',
};

const MINIMAL_MARKET = {
  id: '1',
  question: 'Q?',
  conditionId: '0x1',
  slug: 's',
};

type MockResponse = { body: unknown; status?: number };

class MockPolymarket extends Polymarket {
  public requests: Array<
    {
      url: string;
      method?: string;
      headers: Record<string, string>;
      body?: string;
    }
  > = [];
  private responseQueue: Array<{ body: unknown; status: number }> = [
    { body: {}, status: 200 },
  ];

  private __wireFetch(): void {
    this._fetch = (input, init) => {
      const headers: Record<string, string> = {};
      if (init?.headers) {
        for (
          const [key, value] of Object.entries(
            init.headers as Record<string, string>,
          )
        ) {
          headers[key] = value;
        }
      }
      this.requests.push({
        url: String(input),
        method: init?.method,
        headers,
        body: typeof init?.body === 'string' ? init.body : undefined,
      });
      const next = this.responseQueue.length > 1
        ? this.responseQueue.shift()!
        : this.responseQueue[0]!;
      return Promise.resolve(
        new Response(JSON.stringify(next.body), {
          status: next.status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
  }

  setResponse(body: unknown, status = 200): void {
    this.responseQueue = [{ body, status }];
    this.__wireFetch();
  }

  setResponseQueue(responses: MockResponse[]): void {
    this.responseQueue = responses.map((r) => ({
      body: r.body,
      status: r.status ?? 200,
    }));
    this.__wireFetch();
  }

  get lastRequest() {
    return this.requests[this.requests.length - 1];
  }
}

describe('Polymarket — construction', () => {
  it('constructs Gamma-only with no auth', () => {
    const client = new MockPolymarket();
    asserts.assertEquals(client.vendor, 'Polymarket');
    asserts.assertEquals(client.signerAddress, undefined);
    asserts.assertEquals(client.hasApiCredentials, false);
  });

  it('derives the checksummed signer address from a valid private key', () => {
    const client = new MockPolymarket({
      auth: { type: 'CUSTOM', privateKey: TEST_KEY, funder: PROXY },
    });
    asserts.assertEquals(client.signerAddress, TEST_ADDR);
  });

  it('accepts already-derived api credentials at construction', () => {
    const client = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
    });
    asserts.assertEquals(client.hasApiCredentials, true);
  });

  it('rejects an invalid private key', () => {
    asserts.assertThrows(
      () =>
        new MockPolymarket({
          auth: { type: 'CUSTOM', privateKey: 'not-a-key' },
        }),
      PolymarketError,
    );
  });

  it('rejects an invalid funder address', () => {
    asserts.assertThrows(
      () =>
        new MockPolymarket({
          auth: { type: 'CUSTOM', privateKey: TEST_KEY, funder: '0x1234' },
        }),
      PolymarketError,
    );
  });
});

describe('Polymarket — Gamma (public, no auth)', () => {
  it('fetches a page of markets from the legacy endpoint (bare array)', async () => {
    const client = new MockPolymarket();
    client.setResponse([MINIMAL_MARKET]);
    const result = await client.getMarkets();
    asserts.assertEquals(result.markets.length, 1);
    asserts.assertEquals(result.markets[0]!.id, '1');
    asserts.assertEquals(result.nextCursor, undefined);
    asserts.assert(client.lastRequest!.url.startsWith(GAMMA_API));
    asserts.assert(client.lastRequest!.url.includes('/markets?'));
  });

  it('fetches a page from the keyset endpoint (wrapped object) and extracts nextCursor', async () => {
    const client = new MockPolymarket();
    client.setResponse({ markets: [MINIMAL_MARKET], next_cursor: 'abc' });
    const result = await client.getMarkets({ endpoint: 'keyset' });
    asserts.assertEquals(result.markets.length, 1);
    asserts.assertEquals(result.nextCursor, 'abc');
    asserts.assert(client.lastRequest!.url.includes('/markets/keyset?'));
  });

  it('never sends POLY_* auth headers on a Gamma call, even when auth is configured', async () => {
    const client = new MockPolymarket({
      auth: { type: 'CUSTOM', privateKey: TEST_KEY, funder: PROXY },
    });
    client.setResponse([]);
    await client.getMarkets();
    const headerNames = Object.keys(client.lastRequest!.headers).map((h) =>
      h.toUpperCase()
    );
    asserts.assert(!headerNames.some((h) => h.startsWith('POLY_')));
  });

  it('fetches a market by slug', async () => {
    const client = new MockPolymarket();
    client.setResponse(MINIMAL_MARKET);
    const market = await client.getMarketBySlug('s');
    asserts.assertEquals(market?.slug, 's');
    asserts.assert(client.lastRequest!.url.includes('/markets/slug/s'));
  });

  it('returns null for a market slug that does not exist', async () => {
    const client = new MockPolymarket();
    client.setResponse({ error: 'not found' }, 404);
    const market = await client.getMarketBySlug('missing');
    asserts.assertEquals(market, null);
  });
});

describe('Polymarket — CLOB public reads', () => {
  it('fetches and caches the protocol version', async () => {
    const client = new MockPolymarket();
    client.setResponse({ version: 2 });
    asserts.assertEquals(await client.getVersion(), 2);
    asserts.assertEquals(client.requests.length, 1);
    asserts.assertEquals(await client.getVersion(), 2); // cached, no new request
    asserts.assertEquals(client.requests.length, 1);
    asserts.assert(client.lastRequest!.url.startsWith(CLOB_API));
  });

  it('refetches the version when forced', async () => {
    const client = new MockPolymarket();
    client.setResponse({ version: 1 });
    await client.getVersion();
    client.setResponse({ version: 2 });
    asserts.assertEquals(await client.getVersion(true), 2);
  });

  it('fetches and caches the tick size per token', async () => {
    const client = new MockPolymarket();
    client.setResponse({ minimum_tick_size: '0.01' });
    asserts.assertEquals(await client.getTickSize(TOKEN), 0.01);
    asserts.assertEquals(client.requests.length, 1);
    await client.getTickSize(TOKEN);
    asserts.assertEquals(client.requests.length, 1); // cached
  });

  it('fetches and caches neg-risk per token', async () => {
    const client = new MockPolymarket();
    client.setResponse({ neg_risk: true });
    asserts.assertEquals(await client.getNegRisk(TOKEN), true);
    asserts.assertEquals(client.requests.length, 1);
    await client.getNegRisk(TOKEN);
    asserts.assertEquals(client.requests.length, 1); // cached
  });
});

describe('Polymarket — L1 credential derivation', () => {
  it('derives credentials via POST /auth/api-key and signs an L1 request', async () => {
    const client = new MockPolymarket({
      auth: { type: 'CUSTOM', privateKey: TEST_KEY, funder: PROXY },
    });
    client.setResponse(CREDS);
    const creds = await client.deriveApiCredentials(23);
    asserts.assertEquals(creds.apiKey, CREDS.apiKey);
    asserts.assertEquals(client.hasApiCredentials, true);
    asserts.assertEquals(client.lastRequest!.method, 'POST');
    asserts.assertEquals(client.lastRequest!.headers['POLY_NONCE'], '23');
    asserts.assertEquals(
      client.lastRequest!.headers['POLY_ADDRESS'],
      TEST_ADDR.toLowerCase(),
    );
  });

  it('falls back to GET /auth/derive-api-key when create fails', async () => {
    const client = new MockPolymarket({
      auth: { type: 'CUSTOM', privateKey: TEST_KEY, funder: PROXY },
    });
    client.setResponseQueue([
      { body: { error: 'key already exists' }, status: 400 },
      { body: CREDS, status: 200 },
    ]);
    const creds = await client.deriveApiCredentials();
    asserts.assertEquals(creds.apiKey, CREDS.apiKey);
    asserts.assertEquals(client.requests.length, 2);
    asserts.assertEquals(client.requests[0]!.method, 'POST');
    asserts.assertEquals(client.requests[1]!.method, 'GET');
  });

  it('is a no-op once credentials are already present', async () => {
    const client = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
    });
    const creds = await client.deriveApiCredentials();
    asserts.assertEquals(creds.apiKey, CREDS.apiKey);
    asserts.assertEquals(client.requests.length, 0);
  });

  it('throws CONFIG_MISSING_PRIVATE_KEY without auth', async () => {
    const client = new MockPolymarket();
    await asserts.assertRejects(
      () => client.deriveApiCredentials(),
      PolymarketError,
    );
  });
});

describe('Polymarket — L2 authenticated reads', () => {
  it('fetches balance with checksummed L2 headers', async () => {
    const client = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
    });
    client.setResponse({ balance: '125500000' }); // 6-decimal base units
    const balance = await client.getBalance();
    asserts.assertEquals(balance.balance, 125.5);
    asserts.assertEquals(balance.balanceRaw, '125500000');
    asserts.assert(client.lastRequest!.url.includes('asset_type=COLLATERAL'));
    asserts.assertEquals(client.lastRequest!.url.includes('token_id'), false);
    asserts.assertEquals(
      client.lastRequest!.headers['POLY_ADDRESS'],
      TEST_ADDR,
    );
    asserts.assertEquals(
      client.lastRequest!.headers['POLY_API_KEY'],
      CREDS.apiKey,
    );
    asserts.assert(client.lastRequest!.headers['POLY_SIGNATURE']!.length > 0);
  });

  it('throws NO_API_CREDENTIALS when credentials are not yet derived', async () => {
    const client = new MockPolymarket({
      auth: { type: 'CUSTOM', privateKey: TEST_KEY, funder: PROXY },
    });
    await asserts.assertRejects(() => client.getBalance(), PolymarketError);
  });
});

describe('Polymarket — submitOrder', () => {
  const options = {
    tokenId: TOKEN,
    side: 'BUY' as const,
    price: 0.55,
    shares: 9.0,
    orderType: 'FAK' as const,
  };

  function client() {
    return new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
    });
  }

  it('reports a confirmed fill', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 2 } },
      { body: { neg_risk: false } },
      {
        body: {
          status: 'matched',
          makingAmount: '4.95',
          takingAmount: '9',
          orderID: 'o1',
          success: true,
        },
      },
    ]);
    const result = await c.submitOrder(options);
    asserts.assertEquals(result.filled, true);
    asserts.assertEquals(result.id, 'o1');
    asserts.assertEquals(result.makingAmount, 4.95);
    asserts.assertEquals(result.takingAmount, 9);
    asserts.assertEquals(result.requestedPrice, 0.55);
    asserts.assertEquals(result.actualPrice, 0.55);
    asserts.assertEquals(result.slippage, 0);
  });

  it('reports non-zero slippage when the fill price beats the requested price', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 2 } },
      { body: { neg_risk: false } },
      {
        body: {
          status: 'matched',
          makingAmount: '4.5', // spent less than 0.55 × 9 = 4.95
          takingAmount: '9',
          orderID: 'o1b',
          success: true,
        },
      },
    ]);
    const result = await c.submitOrder(options);
    asserts.assertEquals(result.actualPrice, 0.5);
    asserts.assertEquals(result.slippage, 0.05); // 0.55 requested - 0.5 actual
  });

  it('reports a graceful FAK no-match, not an error', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 2 } },
      { body: { neg_risk: false } },
      {
        body: { errorMsg: 'no orders found to match with FAK order.' },
        status: 400,
      },
    ]);
    const result = await c.submitOrder(options);
    asserts.assertEquals(result.noMatch, true);
    asserts.assertEquals(result.filled, false);
  });

  it('retries once on order_version_mismatch and succeeds', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 1 } }, // stale cached version
      { body: { neg_risk: false } },
      { body: { errorMsg: 'order_version_mismatch' }, status: 400 }, // first attempt
      { body: { version: 2 } }, // forced refresh
      {
        body: {
          status: 'matched',
          makingAmount: '4.95',
          takingAmount: '9',
          orderID: 'o2',
        },
      }, // retry succeeds
    ]);
    const result = await c.submitOrder(options);
    asserts.assertEquals(result.filled, true);
    asserts.assertEquals(result.id, 'o2');
  });

  it('throws ORDER_VERSION_MISMATCH_PERSISTED when the mismatch survives the retry', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 1 } },
      { body: { neg_risk: false } },
      { body: { errorMsg: 'order_version_mismatch' }, status: 400 },
      { body: { version: 2 } },
      { body: { errorMsg: 'order_version_mismatch' }, status: 400 },
    ]);
    await asserts.assertRejects(() => c.submitOrder(options), PolymarketError);
  });

  it('throws ORDER_REJECTED for a genuine rejection', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 2 } },
      { body: { neg_risk: false } },
      {
        body: {
          errorMsg: 'maker amount supports a max accuracy of 2 decimals',
        },
        status: 400,
      },
    ]);
    await asserts.assertRejects(() => c.submitOrder(options), PolymarketError);
  });

  it('throws CONFIG_MISSING_PRIVATE_KEY without a funder', async () => {
    const c = new MockPolymarket({
      auth: { type: 'CUSTOM', privateKey: TEST_KEY, apiCredentials: CREDS },
    });
    await asserts.assertRejects(() => c.submitOrder(options), PolymarketError);
  });

  it('refuses a GTD order with no expirationTime — GTD with expiration=0 would silently behave like GTC', async () => {
    const c = client();
    await asserts.assertRejects(
      () => c.submitOrder({ ...options, orderType: 'GTD' }),
      PolymarketError,
    );
    // Refused before any network call — not even the version/neg-risk lookups.
    asserts.assertEquals(c.requests.length, 0);
  });

  it('accepts a GTD order with an expirationTime and carries it on the wire', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 2 } },
      { body: { neg_risk: false } },
      { body: { status: 'live', orderID: 'o1', success: true } },
    ]);
    await c.submitOrder({
      ...options,
      orderType: 'GTD',
      expirationTime: 1_800_000_000,
    });
    const body = JSON.parse(c.lastRequest!.body!);
    asserts.assertEquals(body.order.expiration, '1800000000');
  });
});

describe('Polymarket — submitOrders (bulk)', () => {
  function client() {
    return new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
    });
  }

  const orderA = {
    tokenId: TOKEN,
    side: 'BUY' as const,
    price: 0.55,
    shares: 9.0,
    orderType: 'GTC' as const,
  };
  const orderB = {
    tokenId: TOKEN,
    side: 'SELL' as const,
    price: 0.4,
    shares: 5.0,
    orderType: 'GTC' as const,
  };

  it('reports one result per order, in the same order, on a mixed outcome', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 2 } },
      { body: { neg_risk: false } }, // both orders share tokenId -> one deduped lookup
      {
        body: [
          { status: 'live', orderID: 'a1', success: true },
          { errorMsg: 'owner/signer mismatch', success: false },
        ],
      },
    ]);
    const results = await c.submitOrders([orderA, orderB]);
    asserts.assertEquals(results.length, 2);
    asserts.assertEquals(results[0]!.id, 'a1');
    asserts.assertEquals(results[0]!.action, 'BUY');
    asserts.assertEquals(results[1]!.action, 'SELL');
    asserts.assertEquals(results[0]!.rejected, false);
    asserts.assertEquals(results[1]!.rejected, true);
    asserts.assertEquals(results[1]!.detail, 'owner/signer mismatch');
  });

  it('reports a graceful per-order FAK no-match without throwing', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 2 } },
      { body: { neg_risk: false } },
      {
        body: [
          {
            errorMsg: 'no orders found to match with FAK order.',
            success: false,
          },
        ],
      },
    ]);
    const results = await c.submitOrders([orderA]);
    asserts.assertEquals(results[0]!.noMatch, true);
    asserts.assertEquals(results[0]!.rejected, false);
  });

  it('chunks more than 15 orders into multiple requests, deduping the shared token neg-risk lookup', async () => {
    const c = client();
    const orders = Array.from({ length: 17 }, () => orderA); // all share tokenId
    c.setResponseQueue([
      { body: { version: 2 } },
      { body: { neg_risk: false } }, // one lookup for the one unique token, not 17
      {
        body: Array.from({ length: 15 }, () => ({
          status: 'live',
          success: true,
        })),
      },
      {
        body: Array.from({ length: 2 }, () => ({
          status: 'live',
          success: true,
        })),
      },
    ]);
    const results = await c.submitOrders(orders);
    asserts.assertEquals(results.length, 17);
    const orderRequests = c.requests.filter((r) => r.url.includes('/orders'));
    asserts.assertEquals(orderRequests.length, 2);
    const negRiskRequests = c.requests.filter((r) =>
      r.url.includes('/neg-risk')
    );
    asserts.assertEquals(negRiskRequests.length, 1);
  });

  it('reports rejected:true for every order (never a throw) when the whole chunk is refused at once', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 2 } },
      { body: { neg_risk: false } },
      // Single error object for a 2-order chunk — the length mismatch is
      // what distinguishes this from a genuine per-order failure array.
      { body: { errorMsg: 'invalid payload' }, status: 400 },
    ]);
    const results = await c.submitOrders([orderA, orderB]);
    asserts.assertEquals(results.length, 2);
    asserts.assertEquals(results[0]!.rejected, true);
    asserts.assertEquals(results[0]!.detail, 'invalid payload');
    asserts.assertEquals(results[1]!.rejected, true);
    asserts.assertEquals(results[1]!.detail, 'invalid payload');
  });

  it('reports rejected:true for a single-order chunk whose one error collapses to the request itself', async () => {
    // With exactly one order, "the whole request failed" and "that one
    // order was rejected" are the same event — reported as a normal
    // per-order outcome, never a throw, same as any other chunk size.
    const c = client();
    c.setResponseQueue([
      { body: { version: 2 } },
      { body: { neg_risk: false } },
      { body: { errorMsg: 'invalid payload' }, status: 400 },
    ]);
    const results = await c.submitOrders([orderA]);
    asserts.assertEquals(results.length, 1);
    asserts.assertEquals(results[0]!.rejected, true);
    asserts.assertEquals(results[0]!.detail, 'invalid payload');
  });

  it('retries a lone mismatched order once on order_version_mismatch', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 1 } },
      { body: { neg_risk: false } },
      { body: [{ errorMsg: 'order_version_mismatch', success: false }] },
      { body: { version: 2 } },
      { body: [{ status: 'live', orderID: 'a1', success: true }] },
    ]);
    const results = await c.submitOrders([orderA]);
    asserts.assertEquals(results[0]!.id, 'a1');
    asserts.assertEquals(results[0]!.rejected, false);
  });

  it('only resubmits the specific order(s) that mismatched, never a sibling order that already filled — the double-fill regression', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 1 } },
      { body: { neg_risk: false } },
      // First attempt: orderA fills, orderB reports a version mismatch —
      // an overall 2xx response with a per-order problem on just one entry.
      {
        body: [
          {
            status: 'matched',
            orderID: 'already-filled',
            makingAmount: '4.95',
            takingAmount: '9',
            success: true,
          },
          { errorMsg: 'order_version_mismatch', success: false },
        ],
      },
      { body: { version: 2 } },
      // Retry response: only ONE entry, matching a retry chunk of size 1.
      { body: [{ status: 'live', orderID: 'b1', success: true }] },
    ]);
    const results = await c.submitOrders([orderA, orderB]);
    asserts.assertEquals(results.length, 2);
    asserts.assertEquals(results[0]!.id, 'already-filled');
    asserts.assertEquals(results[0]!.filled, true);
    asserts.assertEquals(results[1]!.id, 'b1');

    const orderRequests = c.requests.filter((r) => r.url.endsWith('/orders'));
    asserts.assertEquals(orderRequests.length, 2); // first attempt + one retry
    const retryBody = JSON.parse(orderRequests[1]!.body!);
    // The retry must carry exactly ONE order (orderB) — never a rebuilt,
    // freshly-signed resubmission of orderA, which already matched.
    asserts.assertEquals(retryBody.length, 1);
  });

  it('reports a persisted mismatch as rejected:true, never a throw, so sibling orders in the same chunk are preserved', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 1 } },
      { body: { neg_risk: false } },
      {
        body: [
          {
            status: 'matched',
            orderID: 'a1',
            makingAmount: '4.95',
            takingAmount: '9',
            success: true,
          },
          { errorMsg: 'order_version_mismatch', success: false },
        ],
      },
      { body: { version: 2 } },
      // Retry still mismatches.
      { body: [{ errorMsg: 'order_version_mismatch', success: false }] },
    ]);
    const results = await c.submitOrders([orderA, orderB]);
    asserts.assertEquals(results.length, 2);
    asserts.assertEquals(results[0]!.filled, true); // orderA's genuine result survives
    asserts.assertEquals(results[1]!.rejected, true);
    asserts.assertStringIncludes(results[1]!.detail!, 'persisted');
  });

  it('returns an empty array for an empty input without any request', async () => {
    const c = client();
    const results = await c.submitOrders([]);
    asserts.assertEquals(results, []);
    asserts.assertEquals(c.requests.length, 0);
  });
});

describe('Polymarket — cancel', () => {
  it('cancels a single order by id', async () => {
    const client = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
    });
    client.setResponse({ canceled: ['o1'], not_canceled: {} });
    const result = await client.cancelOrder('o1');
    asserts.assertEquals(result.canceled, ['o1']);
    asserts.assertEquals(client.lastRequest!.method, 'DELETE');
    asserts.assertEquals(
      client.lastRequest!.body,
      JSON.stringify({ orderID: 'o1' }),
    );
  });

  it('cancels a batch of orders', async () => {
    const client = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
    });
    client.setResponse({
      canceled: ['o1', 'o2'],
      not_canceled: { o3: 'already matched' },
    });
    const result = await client.cancelOrders(['o1', 'o2', 'o3']);
    asserts.assertEquals(result.canceled, ['o1', 'o2']);
    asserts.assertEquals(result.notCanceled, { o3: 'already matched' });
    asserts.assertEquals(
      client.lastRequest!.body,
      JSON.stringify(['o1', 'o2', 'o3']),
    );
  });

  it('cancels every resting order for a market', async () => {
    const client = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
    });
    client.setResponse({ canceled: ['o1', 'o2'], not_canceled: {} });
    const result = await client.cancelMarketOrders({ market: '0xcond' });
    asserts.assertEquals(result.canceled, ['o1', 'o2']);
    asserts.assertEquals(client.lastRequest!.method, 'DELETE');
    asserts.assert(client.lastRequest!.url.includes('/cancel-market-orders'));
    asserts.assertEquals(
      client.lastRequest!.body,
      JSON.stringify({ market: '0xcond' }),
    );
  });

  it('cancels orders for one specific token within a market', async () => {
    const client = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
    });
    client.setResponse({ canceled: ['o1'], not_canceled: {} });
    await client.cancelMarketOrders({ market: '0xcond', assetId: TOKEN });
    asserts.assertEquals(
      client.lastRequest!.body,
      JSON.stringify({ market: '0xcond', asset_id: TOKEN }),
    );
  });
});

describe('Polymarket — portfolio reads (L2) and cancel-all', () => {
  const authed = () =>
    new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
    });
  const OPEN_ORDER = {
    id: '0xo1',
    status: 'LIVE',
    owner: 'uuid',
    maker_address: PROXY,
    market: '0xcond',
    asset_id: TOKEN,
    side: 'BUY',
    price: '0.52',
    original_size: '10',
    size_matched: '2.5',
    outcome: 'Yes',
    order_type: 'GTC',
    associate_trades: ['t1'],
    created_at: 1748779200,
    expiration: '0',
  };
  const TRADE = {
    id: 't1',
    taker_order_id: '0xo1',
    market: '0xcond',
    asset_id: TOKEN,
    side: 'BUY',
    trader_side: 'TAKER',
    price: '0.52',
    size: '10',
    outcome: 'Yes',
    status: 'TRADE_STATUS_MATCHED',
    fee_rate_bps: '0',
    bucket_index: 0,
    owner: 'uuid',
    maker_address: PROXY,
    transaction_hash: '0xabc',
    maker_orders: [{ order_id: '0xm1', matched_amount: '10' }],
    match_time: '1748779205',
    last_update: '1748779205',
  };

  it('reads a per-token share balance as CONDITIONAL + token_id', async () => {
    const client = authed();
    client.setResponse({ balance: '7000000', allowances: {} });
    const balance = await client.getBalance({ tokenId: TOKEN });
    asserts.assertEquals(balance.balance, 7);
    const url = new URL(client.lastRequest!.url);
    asserts.assertEquals(url.searchParams.get('asset_type'), 'CONDITIONAL');
    asserts.assertEquals(url.searchParams.get('token_id'), TOKEN);
    asserts.assertEquals(url.searchParams.get('signature_type'), '1');
  });

  it('lists open orders with L2 headers, mapping every filter and the page cursor', async () => {
    const client = authed();
    client.setResponse({
      limit: 100,
      count: 1,
      next_cursor: 'MTAw',
      data: [OPEN_ORDER],
    });
    const page = await client.getOpenOrders({
      market: '0xcond',
      assetId: TOKEN,
      id: '0xo1',
      cursor: 'MA==',
    });
    asserts.assertEquals(page.nextCursor, 'MTAw');
    asserts.assertEquals(page.count, 1);
    const order = page.data[0]!;
    asserts.assertEquals(order.id, '0xo1');
    asserts.assertEquals(order.side, 'BUY');
    asserts.assertEquals(order.price, 0.52);
    asserts.assertEquals(order.originalSize, 10);
    asserts.assertEquals(order.sizeMatched, 2.5);
    asserts.assertEquals(order.expiration, 0);
    asserts.assertEquals(order.orderType, 'GTC');
    asserts.assertEquals(order.associateTrades, ['t1']);
    asserts.assertEquals(order.makerAddress, PROXY);
    const req = client.lastRequest!;
    asserts.assert(req.url.startsWith(`${CLOB_API}/data/orders`));
    const url = new URL(req.url);
    asserts.assertEquals(url.searchParams.get('market'), '0xcond');
    asserts.assertEquals(url.searchParams.get('asset_id'), TOKEN);
    asserts.assertEquals(url.searchParams.get('id'), '0xo1');
    asserts.assertEquals(url.searchParams.get('next_cursor'), 'MA==');
    asserts.assertEquals(req.headers['POLY_API_KEY'], CREDS.apiKey);
    asserts.assert(req.headers['POLY_SIGNATURE']!.length > 0);
  });

  it('treats a bare-array orders body and an LTE= cursor as a single final page', async () => {
    const client = authed();
    client.setResponse([OPEN_ORDER]);
    const bare = await client.getOpenOrders();
    asserts.assertEquals(bare.data.length, 1);
    asserts.assertEquals(bare.nextCursor, undefined);
    client.setResponse({ data: [], next_cursor: 'LTE=', count: 0 });
    const last = await client.getOpenOrders();
    asserts.assertEquals(last.data, []);
    asserts.assertEquals(last.nextCursor, undefined);
  });

  it('lists fills with every filter mapped to the vendor names', async () => {
    const client = authed();
    client.setResponse({ data: [TRADE], next_cursor: '' });
    const page = await client.getFills({
      market: '0xcond',
      assetId: TOKEN,
      makerAddress: PROXY,
      before: 1800000000,
      after: 1700000000,
      id: 't1',
      cursor: 'MA==',
    });
    asserts.assertEquals(page.nextCursor, undefined);
    const fill = page.data[0]!;
    asserts.assertEquals(fill.traderSide, 'TAKER');
    asserts.assertEquals(fill.size, 10);
    asserts.assertEquals(fill.price, 0.52);
    asserts.assertEquals(fill.matchTime, 1748779205);
    asserts.assertEquals(fill.transactionHash, '0xabc');
    asserts.assertEquals(fill.makerOrders[0]!.order_id, '0xm1');
    const url = new URL(client.lastRequest!.url);
    asserts.assert(url.pathname.endsWith('/data/trades'));
    asserts.assertEquals(url.searchParams.get('maker_address'), PROXY);
    asserts.assertEquals(url.searchParams.get('before'), '1800000000');
    asserts.assertEquals(url.searchParams.get('after'), '1700000000');
    asserts.assertEquals(url.searchParams.get('id'), 't1');
    asserts.assertEquals(url.searchParams.get('next_cursor'), 'MA==');
    asserts.assertEquals(
      client.lastRequest!.headers['POLY_API_KEY'],
      CREDS.apiKey,
    );
  });

  it('cancels every order with one bodiless signed DELETE /cancel-all', async () => {
    const client = authed();
    client.setResponse({
      canceled: ['0xo1', '0xo2'],
      not_canceled: { '0xo3': 'order already matched' },
    });
    const result = await client.cancelAllOrders();
    asserts.assertEquals(result.canceled, ['0xo1', '0xo2']);
    asserts.assertEquals(result.notCanceled, {
      '0xo3': 'order already matched',
    });
    const req = client.lastRequest!;
    asserts.assertEquals(req.method, 'DELETE');
    asserts.assertEquals(req.url, `${CLOB_API}/cancel-all`);
    asserts.assertEquals(req.body, undefined);
    asserts.assertEquals(req.headers['POLY_ADDRESS'], TEST_ADDR);
    asserts.assert(req.headers['POLY_SIGNATURE']!.length > 0);
  });

  it('requires credentials for the L2 reads and cancel-all', async () => {
    const client = new MockPolymarket({
      auth: { type: 'CUSTOM', privateKey: TEST_KEY, funder: PROXY },
    });
    for (
      const call of [
        () => client.getOpenOrders(),
        () => client.getFills(),
        () => client.cancelAllOrders(),
        () => client.getBalance({ tokenId: TOKEN }),
      ]
    ) {
      const err = await asserts.assertRejects(call, PolymarketError);
      asserts.assertEquals(err.code, 'NO_API_CREDENTIALS');
    }
    asserts.assertEquals(client.requests.length, 0);
  });
});

describe('Polymarket — order book (public)', () => {
  it('fetches and normalizes the book for a token', async () => {
    const client = new MockPolymarket();
    client.setResponse({
      market: '0xcond',
      asset_id: TOKEN,
      timestamp: '1782753357257',
      hash: 'h',
      bids: [{ price: '0.01', size: '100' }, { price: '0.50', size: '20' }],
      asks: [{ price: '0.99', size: '50' }, { price: '0.52', size: '5' }],
      min_order_size: '5',
      tick_size: '0.01',
      neg_risk: false,
      last_trade_price: '0.51',
    });
    const book = await client.getOrderbook(TOKEN);
    asserts.assertEquals(book.assetId, TOKEN);
    asserts.assertEquals(book.timestamp, 1782753357257);
    asserts.assertEquals(book.bids.at(-1), { price: 0.5, size: 20 });
    asserts.assertEquals(book.asks.at(-1), { price: 0.52, size: 5 });
    asserts.assertEquals(book.tickSize, 0.01);
    asserts.assertEquals(book.minOrderSize, 5);
    asserts.assertEquals(book.negRisk, false);
    asserts.assertEquals(book.lastTradePrice, 0.51);
    const url = new URL(client.lastRequest!.url);
    asserts.assertEquals(url.origin + url.pathname, `${CLOB_API}/book`);
    asserts.assertEquals(url.searchParams.get('token_id'), TOKEN);
    asserts.assertEquals(
      client.lastRequest!.headers['POLY_API_KEY'],
      undefined,
    );
  });
});

describe('Polymarket — Data API (positions / portfolio value)', () => {
  const POSITION = {
    proxyWallet: PROXY.toLowerCase(),
    asset: TOKEN,
    conditionId: '0xcond',
    size: 131432.468,
    avgPrice: 0.4697,
    initialValue: 61742.0657,
    currentValue: 0,
    cashPnl: -61742.0657,
    percentPnl: -99.9999,
    totalBought: 131432.468,
    realizedPnl: -1297.1517,
    percentRealizedPnl: -100,
    curPrice: 0,
    redeemable: true,
    mergeable: false,
    title: 'Orioles vs. Rockies: O/U 11.5',
    slug: 'mlb-bal-col-2026-09-02-total-11pt5',
    icon: 'https://example/x.jpg',
    eventId: '920959',
    eventSlug: 'mlb-bal-col-2026-09-02',
    outcome: 'Over',
    outcomeIndex: 0,
    oppositeOutcome: 'Under',
    oppositeAsset: '9920',
    endDate: '2026-09-02',
    negativeRisk: false,
  };

  it('defaults the wallet to auth.funder, sends no signing headers, and maps every filter', async () => {
    const client = new MockPolymarket({
      auth: { type: 'CUSTOM', privateKey: TEST_KEY, funder: PROXY },
    });
    client.setResponse([POSITION]);
    const positions = await client.getPositions({
      market: ['0xa', '0xb'],
      sizeThreshold: 0,
      redeemable: true,
      mergeable: false,
      limit: 50,
      offset: 100,
      sortBy: 'CASHPNL',
      sortDirection: 'ASC',
      title: 'Orioles',
    });
    asserts.assertEquals(positions.length, 1);
    asserts.assertEquals(positions[0]!.size, 131432.468);
    asserts.assertEquals(positions[0]!.redeemable, true);
    // passthrough keeps unmodeled vendor fields
    asserts.assertEquals(
      (positions[0] as unknown as { eventId: string }).eventId,
      '920959',
    );
    const req = client.lastRequest!;
    const url = new URL(req.url);
    asserts.assertEquals(url.origin + url.pathname, `${DATA_API}/positions`);
    asserts.assertEquals(
      url.searchParams.get('user')!.toLowerCase(),
      PROXY.toLowerCase(),
    );
    asserts.assertEquals(url.searchParams.get('market'), '0xa,0xb');
    asserts.assertEquals(url.searchParams.get('sizeThreshold'), '0');
    asserts.assertEquals(url.searchParams.get('redeemable'), 'true');
    asserts.assertEquals(url.searchParams.get('mergeable'), 'false');
    asserts.assertEquals(url.searchParams.get('limit'), '50');
    asserts.assertEquals(url.searchParams.get('offset'), '100');
    asserts.assertEquals(url.searchParams.get('sortBy'), 'CASHPNL');
    asserts.assertEquals(url.searchParams.get('sortDirection'), 'ASC');
    asserts.assertEquals(url.searchParams.get('title'), 'Orioles');
    asserts.assertEquals(req.headers['POLY_API_KEY'], undefined);
    asserts.assertEquals(req.headers['POLY_SIGNATURE'], undefined);
  });

  it('reads any wallet without credentials when user is given, and normalizes null to []', async () => {
    const client = new MockPolymarket();
    client.setResponse(null);
    const positions = await client.getPositions({
      user: '0x5268527977f700f9bf9b6d5cd843859e4e70135d',
      eventId: '920959',
    });
    asserts.assertEquals(positions, []);
    const url = new URL(client.lastRequest!.url);
    asserts.assertEquals(
      url.searchParams.get('user'),
      '0x5268527977f700f9bf9b6d5cd843859e4e70135d',
    );
    asserts.assertEquals(url.searchParams.get('eventId'), '920959');
  });

  it('throws CONFIG_MISSING_PRIVATE_KEY when neither user nor funder is available', async () => {
    const client = new MockPolymarket();
    const err = await asserts.assertRejects(
      () => client.getPositions(),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'CONFIG_MISSING_PRIVATE_KEY');
    await asserts.assertRejects(
      () => client.getPortfolioValue(),
      PolymarketError,
    );
    asserts.assertEquals(client.requests.length, 0);
  });

  it('returns the portfolio value as a number, 0 for an empty wallet', async () => {
    const client = new MockPolymarket({
      auth: { type: 'CUSTOM', privateKey: TEST_KEY, funder: PROXY },
    });
    client.setResponse([{ user: PROXY.toLowerCase(), value: 122392.0752 }]);
    asserts.assertEquals(await client.getPortfolioValue(), 122392.0752);
    const url = new URL(client.lastRequest!.url);
    asserts.assertEquals(url.origin + url.pathname, `${DATA_API}/value`);

    client.setResponse([]);
    asserts.assertEquals(
      await client.getPortfolioValue({ market: '0xcond' }),
      0,
    );
    asserts.assertEquals(
      new URL(client.lastRequest!.url).searchParams.get('market'),
      '0xcond',
    );
  });

  it('honours a dataBaseURL override', async () => {
    const client = new MockPolymarket({
      dataBaseURL: 'https://data.example.test',
      auth: { type: 'CUSTOM', privateKey: TEST_KEY, funder: PROXY },
    });
    client.setResponse([]);
    await client.getPositions();
    asserts.assert(
      client.lastRequest!.url.startsWith('https://data.example.test/positions'),
    );
  });
});

describe('Polymarket — split/merge/redeem (Relayer)', () => {
  const CID =
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  function client() {
    return new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        relayerApiKey: 'relayer-key',
        relayerApiKeyAddress: TEST_ADDR,
      },
    });
  }

  it('splits collateral into both outcomes', async () => {
    const c = client();
    c.setResponseQueue([
      {
        body: {
          address: '0x4444444444444444444444444444444444444444',
          nonce: '7',
        },
      },
      { body: { transactionID: 'tx-1', state: 'STATE_NEW' } },
    ]);
    const result = await c.split({
      conditionId: CID,
      amountUsd: 5,
      negRisk: false,
    });
    asserts.assertEquals(result.action, 'SPLIT');
    asserts.assertEquals(result.success, true);
    asserts.assertEquals(result.id, 'tx-1');
    asserts.assertEquals(result.status, 'STATE_NEW');
    asserts.assertEquals(result.slippage, 0);
    asserts.assertEquals(result.makingAmount, 5);
    asserts.assertEquals(result.takingAmount, 5);

    const relayPayloadRequest = c.requests.find((r) =>
      r.url.includes('/relay-payload')
    );
    asserts.assert(relayPayloadRequest);
    asserts.assertEquals(
      relayPayloadRequest!.headers['RELAYER_API_KEY'],
      'relayer-key',
    );
    asserts.assertEquals(
      relayPayloadRequest!.headers['RELAYER_API_KEY_ADDRESS'],
      TEST_ADDR,
    );
    asserts.assert(relayPayloadRequest!.url.includes(`address=${TEST_ADDR}`));

    const submitRequest = c.requests.find((r) => r.url.includes('/submit'));
    asserts.assert(submitRequest);
    const body = JSON.parse(submitRequest!.body!);
    asserts.assertEquals(body.type, 'PROXY');
    asserts.assertEquals(body.nonce, '7');
    asserts.assertEquals(body.from, TEST_ADDR.toLowerCase());
  });

  it('merges both outcomes back into collateral', async () => {
    const c = client();
    c.setResponseQueue([
      {
        body: {
          address: '0x4444444444444444444444444444444444444444',
          nonce: '1',
        },
      },
      { body: { transactionID: 'tx-2' } },
    ]);
    const result = await c.merge({
      conditionId: CID,
      amountUsd: 2,
      negRisk: false,
    });
    asserts.assertEquals(result.action, 'MERGE');
    asserts.assertEquals(result.id, 'tx-2');
    asserts.assertEquals(result.slippage, 0);
  });

  it('redeems a resolved market', async () => {
    const c = client();
    c.setResponseQueue([
      {
        body: {
          address: '0x4444444444444444444444444444444444444444',
          nonce: '1',
        },
      },
      { body: { transactionID: 'tx-3' } },
    ]);
    const result = await c.redeem({ conditionId: CID, negRisk: false });
    asserts.assertEquals(result.action, 'REDEEM');
    asserts.assertEquals(result.id, 'tx-3');
    asserts.assertEquals(result.slippage, 0);
    asserts.assertEquals(result.makingAmount, 0);
    asserts.assertEquals(result.takingAmount, 0);
  });

  it('throws CONFIG_MISSING_RELAYER_CREDENTIALS without relayer credentials', async () => {
    const c = new MockPolymarket({
      auth: { type: 'CUSTOM', privateKey: TEST_KEY, funder: PROXY },
    });
    await asserts.assertRejects(
      () => c.split({ conditionId: CID, amountUsd: 1, negRisk: false }),
      PolymarketError,
    );
  });

  it('throws CONFIG_MISSING_PRIVATE_KEY without a funder', async () => {
    const c = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        relayerApiKey: 'k',
        relayerApiKeyAddress: TEST_ADDR,
      },
    });
    await asserts.assertRejects(
      () => c.split({ conditionId: CID, amountUsd: 1, negRisk: false }),
      PolymarketError,
    );
  });

  it('never sends CLOB POLY_* headers on a relayer call', async () => {
    const c = client();
    c.setResponseQueue([
      {
        body: {
          address: '0x4444444444444444444444444444444444444444',
          nonce: '1',
        },
      },
      { body: { transactionID: 'tx-4' } },
    ]);
    await c.split({ conditionId: CID, amountUsd: 1, negRisk: false });
    for (const req of c.requests) {
      const headerNames = Object.keys(req.headers).map((h) => h.toUpperCase());
      asserts.assert(!headerNames.some((h) => h.startsWith('POLY_')));
    }
  });
});

describe('Polymarket — order() dispatcher', () => {
  const CID =
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  function client() {
    return new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
        relayerApiKey: 'relayer-key',
        relayerApiKeyAddress: TEST_ADDR,
      },
    });
  }

  it('dispatches BUY/SELL to submitOrder', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { version: 2 } },
      { body: { neg_risk: false } },
      {
        body: {
          status: 'matched',
          makingAmount: '4.95',
          takingAmount: '9',
          orderID: 'o1',
          success: true,
        },
      },
    ]);
    const result = await c.order({
      action: 'BUY',
      tokenId: TOKEN,
      price: 0.55,
      shares: 9.0,
      orderType: 'FAK',
    });
    asserts.assertEquals(result.action, 'BUY');
    asserts.assertEquals(result.id, 'o1');
    asserts.assertEquals(result.filled, true);
    asserts.assertEquals(result.slippage, 0);
  });

  it('dispatches SPLIT to split', async () => {
    const c = client();
    c.setResponseQueue([
      {
        body: {
          address: '0x4444444444444444444444444444444444444444',
          nonce: '1',
        },
      },
      { body: { transactionID: 'tx-1' } },
    ]);
    const result = await c.order({
      action: 'SPLIT',
      conditionId: CID,
      amountUsd: 5,
      negRisk: false,
    });
    asserts.assertEquals(result.action, 'SPLIT');
    asserts.assertEquals(result.id, 'tx-1');
    asserts.assertEquals(result.slippage, 0);
  });

  it('dispatches REDEEM to redeem', async () => {
    const c = client();
    c.setResponseQueue([
      {
        body: {
          address: '0x4444444444444444444444444444444444444444',
          nonce: '1',
        },
      },
      { body: { transactionID: 'tx-2' } },
    ]);
    const result = await c.order({
      action: 'REDEEM',
      conditionId: CID,
      negRisk: false,
    });
    asserts.assertEquals(result.action, 'REDEEM');
    asserts.assertEquals(result.id, 'tx-2');
  });
});

describe('Polymarket — error mapping', () => {
  it('maps 404 to NOT_FOUND', async () => {
    const client = new MockPolymarket();
    client.setResponse({ error: 'nope' }, 404);
    await asserts.assertRejects(
      () => client.getMarkets(),
      PolymarketError,
    );
  });

  it('maps 429 to RATE_LIMITED', async () => {
    const client = new MockPolymarket();
    client.setResponse({ error: 'slow down' }, 429);
    try {
      await client.getMarkets();
      throw new Error('expected a throw');
    } catch (err) {
      asserts.assert(err instanceof PolymarketError);
      asserts.assertEquals(err.code, 'RATE_LIMITED');
    }
  });

  it('maps 400 to INVALID_REQUEST with the vendor detail', async () => {
    const client = new MockPolymarket();
    client.setResponse({ error: 'bad filter' }, 400);
    try {
      await client.getMarkets();
      throw new Error('expected a throw');
    } catch (err) {
      asserts.assert(err instanceof PolymarketError);
      asserts.assertEquals(err.code, 'INVALID_REQUEST');
      asserts.assert(err.message.includes('bad filter'));
    }
  });

  it('maps 500 to SERVICE_UNAVAILABLE', async () => {
    const client = new MockPolymarket();
    client.setResponse({ error: 'oops' }, 503);
    try {
      await client.getMarkets();
      throw new Error('expected a throw');
    } catch (err) {
      asserts.assert(err instanceof PolymarketError);
      asserts.assertEquals(err.code, 'SERVICE_UNAVAILABLE');
    }
  });
});

// ── Live tests ──────────────────────────────────────────────────────────────
//
// Only the credential-free / read-only surface is live-tested:
//  - Gamma's getMarkets (fully public).
//  - The CLOB's getVersion/getTickSize/getNegRisk (public, no signing —
//    they need a real token id, sourced from the live Gamma call itself).
// deriveApiCredentials, getBalance, submitOrder, and cancelOrder(s) are
// deliberately excluded: deriving credentials and placing/canceling orders
// mutate real state tied to a real wallet (and an order can result in a
// real fill), which this repo's live-test conventions exclude unless the
// vendor offers a safe, isolated sandbox for it — Polymarket does not.
/** Everything an error could surface to a log: its message plus its serialized context. */
function dumpError(err: unknown): string {
  const e = err as { message?: string; toJSON?: () => unknown };
  return `${e.message ?? ''} ${JSON.stringify(e.toJSON?.() ?? String(err))}`;
}

describe('Polymarket — credential custody', () => {
  it('does not echo a rejected private key into the config error', () => {
    const err = asserts.assertThrows(
      () =>
        new MockPolymarket({
          auth: { type: 'CUSTOM', privateKey: 'deadbeef-SECRETMARKER' },
        }),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_PRIVATE_KEY');
    asserts.assert(!dumpError(err).includes('SECRETMARKER'));
  });

  it('never leaks the wallet private key from a runtime failure', async () => {
    const client = new MockPolymarket({
      auth: { type: 'CUSTOM', privateKey: TEST_KEY },
    });
    client.setResponse({ error: 'boom' }, 500);
    const err = await asserts.assertRejects(
      () => client.getMarkets(),
      PolymarketError,
    );
    const dumped = dumpError(err);
    asserts.assert(!dumped.includes(TEST_KEY));
    asserts.assert(!dumped.includes(TEST_KEY.slice(2))); // without 0x
  });
});

const env = envArgs();
const credentials = {
  privateKey: env.get('CONNECTOR_POLYMARKET_PRIVATE_KEY'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe('Polymarket — maxRetryWait (RESTler rate-limit retry)', () => {
  /**
   * A client whose every request is answered 429 with a `retry-after` hint,
   * and whose waits are recorded instead of slept. `maxRetryWait` is what
   * routes a 429 to RESTler's retry logic (and so to this connect's
   * `RESTlerRateLimitError` rewrap) — without it the vendor handler maps the
   * 429 directly, which the error-mapping tests already cover.
   */
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockPolymarket({ maxRetryWait });
    const slept: number[] = [];
    let calls = 0;
    c['_sleep'] = (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    };
    c['_fetch'] = (input) => {
      calls++;
      return Promise.resolve(
        new Response('{}', {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': retryAfter,
          },
        }),
      );
    };
    return { c, slept, calls: () => calls };
  };

  it('waits the hinted time, retries once, then surfaces RATE_LIMITED with retried: true', async () => {
    const { c, slept, calls } = throttled(60, '1');
    const err = await asserts.assertRejects(
      () => c.getMarkets(),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 1);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws RATE_LIMITED immediately with retried: false when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(
      () => c.getMarkets(),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

describe('Polymarket — order-path validation and rate limiting', () => {
  const order = {
    tokenId: TOKEN,
    side: 'BUY' as const,
    price: 0.55,
    shares: 9.0,
    orderType: 'FAK' as const,
  };
  /** Answers the pre-order lookups normally and the order POST with `orderResponse`. */
  const routed = (orderResponse: () => Response, maxRetryWait?: number) => {
    const c = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
      ...(maxRetryWait !== undefined ? { maxRetryWait } : {}),
    });
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    c['_fetch'] = (input) => {
      const url = String(input);
      if (url.includes('/version')) {
        return Promise.resolve(json({ version: 2 }));
      }
      if (url.includes('/neg-risk')) {
        return Promise.resolve(json({ neg_risk: false }));
      }
      if (url.includes('/tick-size')) {
        return Promise.resolve(json({ minimum_tick_size: '0.01' }));
      }
      return Promise.resolve(orderResponse());
    };
    return c;
  };

  it('rewraps an exhausted rate-limit retry on the order-submission path', async () => {
    const c = routed(
      () =>
        new Response('{}', {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '120' },
        }),
      5,
    );
    const err = await asserts.assertRejects(
      () => c.submitOrder(order),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
  });

  it('fails RESPONSE_ERROR when the protocol version body does not match the schema', async () => {
    const c = new MockPolymarket();
    c.setResponse({ version: 'not-a-number' });
    const err = await asserts.assertRejects(
      () => c.getVersion(),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });

  it('fails RESPONSE_ERROR when a bulk submission returns fewer results than orders sent', async () => {
    const c = routed(() =>
      new Response(
        JSON.stringify([{
          status: 'matched',
          orderID: 'o1',
          success: true,
          makingAmount: '4.95',
          takingAmount: '9',
        }]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    );
    const err = await asserts.assertRejects(
      () => c.submitOrders([order, order]),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });
});

describe({
  name: 'Polymarket — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('fetches real markets from the Gamma API', async () => {
      const client = new Polymarket({});
      const { markets } = await client.getMarkets({ closed: false, limit: 5 });
      asserts.assert(Array.isArray(markets));
    });

    it('fetches the real CLOB protocol version, tick size, and neg-risk for a real token', async () => {
      const client = new Polymarket({});
      const { markets } = await client.getMarkets({ closed: false, limit: 20 });
      const tokenId = markets.find((m) => m.clobTokenIds.length > 0)
        ?.clobTokenIds[0];
      if (!tokenId) return; // no open market with a token id right now — nothing to probe
      const version = await client.getVersion();
      asserts.assert(version === 1 || version === 2);
      const tick = await client.getTickSize(tokenId);
      asserts.assert(tick > 0);
      const negRisk = await client.getNegRisk(tokenId);
      asserts.assertEquals(typeof negRisk, 'boolean');
    });
  },
});
