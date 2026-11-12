import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import {
  CLOB_API,
  DATA_API,
  GAMMA_API,
  orderAsset,
  Polymarket,
  positionMarket,
} from './Polymarket.ts';
import { estimateFees } from './PolymarketFees.ts';
import { PolymarketError } from './errors/mod.ts';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hmacSign } from './PolymarketAuth.ts';
import { PolymarketSigner } from './PolymarketSigner.ts';
import signingVectors from './fixtures/signing-vectors.json' with {
  type: 'json',
};

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
    // Chunks are submitted concurrently, and the 2-order chunk (less
    // EIP-712 signing) can reach fetch before the 15-order one — so answer
    // each request by what it asks for, never by arrival order (a FIFO queue
    // here made this test pass or fail on timing alone).
    const seen: Array<{ url: string; body?: string }> = [];
    const json = (body: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    c['_fetch'] = (input, init) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? init.body : undefined;
      seen.push({ url, body });
      if (url.includes('/version')) return json({ version: 2 });
      if (url.includes('/neg-risk')) return json({ neg_risk: false });
      // POST /orders: one result per order in this chunk.
      const count = (JSON.parse(body ?? '[]') as unknown[]).length;
      return json(
        Array.from(
          { length: count },
          () => ({ status: 'live', success: true }),
        ),
      );
    };
    const results = await c.submitOrders(orders);
    asserts.assertEquals(results.length, 17);
    const chunkSizes = seen
      .filter((r) => r.url.endsWith('/orders'))
      .map((r) => (JSON.parse(r.body ?? '[]') as unknown[]).length)
      .sort((a, b) => b - a);
    asserts.assertEquals(chunkSizes, [15, 2]);
    asserts.assertEquals(
      seen.filter((r) => r.url.includes('/neg-risk')).length,
      1,
    );
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

describe('Polymarket — Data API v2', () => {
  // Live-shaped rows (data-api.polymarket.com/v2, 2026-11-06).
  const POSITION = {
    proxy_wallet: PROXY.toLowerCase(),
    token_id: TOKEN,
    condition_id: '0xcond',
    current_size: 4.7903,
    avg_price: 0.6199,
    entry_cost_usdc: 2.9699,
    entry_fees_usdc: 0.079,
    total_cost_usdc: 3.0489,
    current_price: 0,
    current_value: 0,
    total_size: 4.7903,
    realized_pnl: -0.079,
    unrealized_pnl: -2.9699,
    total_pnl: -3.0489,
    percent_pnl: -99.9967,
    percent_realized_pnl: -100,
    status: 'REDEEMABLE',
    redeemable: true,
    mergeable: false,
    negative_risk: false,
    archived: false,
    title: 'Bitcoin Up or Down - September 28, 10:15PM-10:30PM ET',
    slug: 'btc-updown-15m-1790648100',
    icon: 'https://example/btc.png',
    event_id: '1095503',
    event_slug: 'btc-updown-15m-1790648100',
    outcome: 'Up',
    outcome_index: 0,
    opposite_outcome: 'Down',
    opposite_token_id: '5359',
    end_date: '2026-09-29',
    last_event_at: 1790649086,
    first_entry_at: 1790648328,
    name: 'abh19',
    profile_image: '',
    verified: false,
    some_new_field: 'kept',
  };
  const PAGE = (data: unknown[], nextCursor: string | null = null) => ({
    data,
    pagination: {
      limit: 100,
      offset: 0,
      has_more: nextCursor !== null,
      next_cursor: nextCursor,
    },
  });
  const ACTIVITY = {
    proxy_wallet: PROXY.toLowerCase(),
    timestamp: 1792182974,
    condition_id: '0xcond',
    type: 'TRADE',
    size: 3.96,
    usdc_size: 3.02197,
    transaction_hash: '0x3e31',
    price: 0.75,
    token_id: TOKEN,
    side: 'BUY',
    outcome_index: 0,
    title: 'Bitcoin Up or Down',
    slug: 'btc-updown-5m-1792182900',
    icon: '',
    event_slug: 'btc-updown-5m-1792182900',
    outcome: 'Up',
    name: 'abh19',
    pseudonym: 'Junior-Paper-Chord',
    bio: '',
    profile_image: '',
    profile_image_optimized: '',
  };
  const { type: _type, usdc_size: _usdc, ...TRADE } = ACTIVITY;

  const funded = () =>
    new MockPolymarket({
      auth: { type: 'CUSTOM', privateKey: TEST_KEY, funder: PROXY },
    });
  const query = (client: MockPolymarket) =>
    Object.fromEntries(new URL(client.lastRequest!.url).searchParams);
  const route = (client: MockPolymarket) => {
    const url = new URL(client.lastRequest!.url);
    return url.origin + url.pathname;
  };

  it('getPositions: /v2/positions for auth.funder, unsigned, every filter mapped, rows camelCased', async () => {
    const client = funded();
    client.setResponse(PAGE([POSITION], 'cursor-2'));
    const page = await client.getPositions({
      condition: ['0xa', '0xb'],
      eventId: '1095503',
      status: 'REDEEMABLE',
      title: 'Bitcoin',
      filterType: 'CASH',
      filterAmount: 0,
      includeArchived: true,
      sortBy: 'TOTAL_PNL',
      sortDirection: 'ASC',
      start: 1,
      end: 2,
      limit: 50,
      cursor: 'cursor-1',
    });
    asserts.assertEquals(route(client), `${DATA_API}/v2/positions`);
    asserts.assertEquals(query(client), {
      user: PROXY,
      condition: '0xa,0xb',
      event_id: '1095503',
      status: 'REDEEMABLE',
      title: 'Bitcoin',
      filter_type: 'CASH',
      filter_amount: '0',
      include_archived: 'true',
      sort_by: 'TOTAL_PNL',
      sort_direction: 'ASC',
      start: '1',
      end: '2',
      limit: '50',
      cursor: 'cursor-1',
    });
    asserts.assertEquals(
      client.lastRequest!.headers['POLY_API_KEY'],
      undefined,
    );
    asserts.assertEquals(
      client.lastRequest!.headers['POLY_SIGNATURE'],
      undefined,
    );
    const position = page.data[0]!;
    asserts.assertEquals(position.currentSize, 4.7903);
    asserts.assertEquals(position.entryFeesUsdc, 0.079);
    asserts.assertEquals(position.redeemable, true);
    asserts.assertEquals(position.oppositeTokenId, '5359');
    asserts.assertEquals(
      (position as unknown as { someNewField: string }).someNewField,
      'kept',
    );
    asserts.assertEquals(page.pagination, {
      limit: 100,
      offset: 0,
      hasMore: true,
      nextCursor: 'cursor-2',
    });
  });

  it("getPositions: user: null lists a market's holders and needs a condition", async () => {
    const client = funded();
    client.setResponse(PAGE([]));
    await client.getPositions({ user: null, condition: '0xcond' });
    asserts.assertEquals(query(client), { condition: '0xcond' });
    const err = await asserts.assertRejects(
      () => client.getPositions({ user: null }),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'INVALID_OPTIONS');
  });

  it('getPositions: rejects a row missing its economics as RESPONSE_ERROR', async () => {
    const client = funded();
    const { current_size: _size, ...broken } = POSITION;
    client.setResponse(PAGE([broken]));
    const err = await asserts.assertRejects(
      () => client.getPositions(),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });

  it('wallet reads throw CONFIG_MISSING_PRIVATE_KEY without user or funder, before any request', async () => {
    const client = new MockPolymarket();
    for (
      const call of [
        () => client.getPositions(),
        () => client.getPortfolioValue(),
        () => client.getActivity(),
      ]
    ) {
      const err = await asserts.assertRejects(call, PolymarketError);
      asserts.assertEquals(err.code, 'CONFIG_MISSING_PRIVATE_KEY');
    }
    asserts.assertEquals(client.requests.length, 0);
  });

  it('getPortfolioValue: unwraps data.value, with condition scoping', async () => {
    const client = funded();
    client.setResponse({
      data: { proxy_wallet: PROXY.toLowerCase(), value: 122392.0752 },
    });
    asserts.assertEquals(await client.getPortfolioValue(), 122392.0752);
    asserts.assertEquals(route(client), `${DATA_API}/v2/value`);
    client.setResponse({ data: { proxy_wallet: '0xother', value: 0 } });
    asserts.assertEquals(
      await client.getPortfolioValue({ user: '0xother', condition: ['0xc'] }),
      0,
    );
    asserts.assertEquals(query(client), { user: '0xother', condition: '0xc' });
  });

  it('getActivity: /v2/activity with type list and the deposit/withdrawal flag inverted to the vendor param', async () => {
    const client = funded();
    client.setResponse(PAGE([ACTIVITY, { ...ACTIVITY, is_combo: true }]));
    const page = await client.getActivity({
      type: ['TRADE', 'REDEEM'],
      condition: '0xcond',
      side: 'BUY',
      start: 1,
      sortDirection: 'ASC',
      includeDepositsWithdrawals: true,
      limit: 10,
    });
    asserts.assertEquals(route(client), `${DATA_API}/v2/activity`);
    asserts.assertEquals(query(client), {
      user: PROXY,
      type: 'TRADE,REDEEM',
      condition: '0xcond',
      side: 'BUY',
      start: '1',
      sort_direction: 'ASC',
      exclude_deposits_withdrawals: 'false',
      limit: '10',
    });
    asserts.assertEquals(page.data[0]!.usdcSize, 3.02197);
    asserts.assertEquals(page.data[0]!.transactionHash, '0x3e31');
    asserts.assertEquals(page.data[1]!.isCombo, true);
  });

  it('getTrades: /v2/trades has no funder default and maps taker_only', async () => {
    const client = funded();
    client.setResponse(PAGE([TRADE]));
    const page = await client.getTrades({
      condition: '0xcond',
      takerOnly: false,
    });
    asserts.assertEquals(route(client), `${DATA_API}/v2/trades`);
    asserts.assertEquals(query(client), {
      condition: '0xcond',
      taker_only: 'false',
    });
    asserts.assertEquals(page.data[0]!.price, 0.75);
    asserts.assertEquals(page.data[0]!.tokenId, TOKEN);
  });

  it('getTokens: one selector, unwrapped rows', async () => {
    const client = new MockPolymarket();
    client.setResponse({
      data: [{
        token_id: TOKEN,
        condition_id: '0xcond',
        structural_condition_id: null,
        module: 'v1_ctf',
        outcome_index: 0,
        clob_index: 0,
        outcome: 'Up',
        opposite_token_id: '1079',
        resolved: true,
        final_price: 0,
        title: 'Bitcoin Up or Down',
        market_slug: 'btc-updown-5m-1792182900',
        closed: true,
        neg_risk: false,
        neg_risk_market_id: null,
        question_index: null,
        event_id: 1196524,
        event_slug: 'btc-updown-5m-1792182900',
      }],
    });
    const tokens = await client.getTokens({ tokenIds: [TOKEN, '1'] });
    asserts.assertEquals(route(client), `${DATA_API}/v2/tokens`);
    asserts.assertEquals(query(client), { token_id: `${TOKEN},1` });
    asserts.assertEquals(tokens[0]!.finalPrice, 0);
    asserts.assertEquals(tokens[0]!.module, 'v1_ctf');
    asserts.assertEquals(tokens[0]!.structuralConditionId, null);

    await client.getTokens({ conditions: ['0xcond'] });
    asserts.assertEquals(query(client), { condition: '0xcond' });

    const before = client.requests.length;
    const err = await asserts.assertRejects(
      () => client.getTokens({ tokenIds: [] }),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'INVALID_OPTIONS');
    asserts.assertEquals(client.requests.length, before);
  });

  it('getResolutions: settlement estimates and payouts, exactly one selector', async () => {
    const client = new MockPolymarket();
    client.setResponse({
      data: [{
        condition_id: '0xcond',
        status: 'proposed',
        extended_review: false,
        was_disputed: false,
        new_version_q: false,
        transaction_hash: '0x7bd2',
        log_index: '566',
        last_update_timestamp: '2026-10-16T20:40:54Z',
        expected_settlement_time: '2026-10-16T22:40:54Z',
        settlement_time_basis: 'proposal_expiration',
      }, {
        condition_id: '0xdone',
        status: 'resolved',
        extended_review: false,
        was_disputed: false,
        new_version_q: false,
        transaction_hash: '0x08',
        log_index: '858',
        last_update_timestamp: '2026-09-29T02:31:26Z',
        payouts: [0, 1000000],
        resolution_source: 'reported',
        resolved_block: 94629297,
        resolved_at: '2026-09-29T02:31:26Z',
      }],
    });
    const rows = await client.getResolutions({
      condition: ['0xcond', '0xdone'],
    });
    asserts.assertEquals(route(client), `${DATA_API}/v2/resolutions`);
    asserts.assertEquals(query(client), { condition: '0xcond,0xdone' });
    asserts.assertEquals(
      rows[0]!.expectedSettlementTime,
      '2026-10-16T22:40:54Z',
    );
    asserts.assertEquals(rows[0]!.settlementTimeBasis, 'proposal_expiration');
    asserts.assertEquals(rows[1]!.payouts, [0, 1000000]);

    await client.getResolutions({ questionId: '0xq' });
    asserts.assertEquals(query(client), { question_id: '0xq' });
    await client.getResolutions({ eventId: '1095503' });
    asserts.assertEquals(query(client), { event_id: '1095503' });

    const err = await asserts.assertRejects(
      // @ts-expect-error — two selectors are a type error too
      () => client.getResolutions({ questionId: '0xq', eventId: '1' }),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'INVALID_OPTIONS');
  });

  it('maps the v2 error envelope to INVALID_REQUEST with its message', async () => {
    const client = funded();
    client.setResponse({
      error:
        "'offset' is not a query param on this API: pages are cursor-only, pass 'cursor' from a prior response's next_cursor",
      code: 'invalid_request',
      retryable: false,
      trace_id: 't',
    }, 400);
    const err = await asserts.assertRejects(
      () => client.getPositions(),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'INVALID_REQUEST');
    asserts.assertMatch(err.message, /cursor-only/);
  });

  it('honours a dataBaseURL override', async () => {
    const client = new MockPolymarket({
      dataBaseURL: 'https://data.example.test',
      auth: { type: 'CUSTOM', privateKey: TEST_KEY, funder: PROXY },
    });
    client.setResponse(PAGE([]));
    await client.getPositions();
    asserts.assert(
      client.lastRequest!.url.startsWith(
        'https://data.example.test/v2/positions',
      ),
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

describe('Polymarket — Protocol V2 split/merge/redeem (Router)', () => {
  const V2_CID =
    '0x0123af4bea70d5496e79463949a694ac2a000000000000000000000000000000';
  const YES_ID =
    '515362348146691341657562482954931281080656089672727589681305261334690004992';
  const NO_ID =
    '515362348146691341657562482954931281080656089672727589681305261334690004993';
  const ROUTER_WORD = '12121212006e4cd160d18e3f00711da5c3372600';
  const RELAY = {
    body: {
      address: '0x4444444444444444444444444444444444444444',
      nonce: '3',
    },
  };

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
  const submitted = (c: MockPolymarket): string =>
    JSON.parse(c.requests.find((r) => r.url.includes('/submit'))!.body!).data;
  const count = (haystack: string, needle: string) =>
    haystack.split(needle).length - 1;

  it('positionMarket routes v1 by negRisk and v2 to the Router, and refuses an unknown version', () => {
    asserts.assertEquals(
      positionMarket({ version: 'v1', conditionId: '0xc', negRisk: true }),
      { conditionId: '0xc', negRisk: true },
    );
    asserts.assertEquals(
      positionMarket({ version: 'v2', conditionId: V2_CID, negRisk: true }),
      { conditionId: V2_CID, version: 'v2' },
    );
    const err = asserts.assertThrows(
      () =>
        positionMarket({ version: null, conditionId: '0xc', negRisk: false }),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'INVALID_OPTIONS');
  });

  it('splits and merges a V2 market through the Router', async () => {
    const c = client();
    c.setResponseQueue([RELAY, { body: { transactionID: 'tx-s' } }]);
    const split = await c.split({
      conditionId: V2_CID,
      version: 'v2',
      amountUsd: 1,
    });
    asserts.assertEquals(split.action, 'SPLIT');
    asserts.assertEquals(split.id, 'tx-s');
    asserts.assertEquals(split.makingAmount, 1);
    const data = submitted(c);
    asserts.assertEquals(count(data, ROUTER_WORD), 1);
    asserts.assertEquals(count(data, '82d3b9f1'), 1);
    asserts.assertEquals(
      count(data, 'ada100db00ca00073811820692005400218fce1f'),
      0,
    );

    const m = client();
    m.setResponseQueue([RELAY, { body: { transactionID: 'tx-m' } }]);
    await m.merge({ conditionId: V2_CID, version: 'v2', amountUsd: 1 });
    asserts.assertEquals(count(submitted(m), '5b63685e'), 1);
  });

  it('redeems the whole CONDITIONAL-V2 balance of each outcome when no shares are given', async () => {
    const c = client();
    c.setResponseQueue([
      { body: { balance: '2000000' } },
      { body: { balance: '2000000' } },
      RELAY,
      { body: { transactionID: 'tx-r' } },
    ]);
    const result = await c.redeem({ conditionId: V2_CID, version: 'v2' });
    asserts.assertEquals(result.action, 'REDEEM');
    asserts.assertEquals(result.id, 'tx-r');
    const reads = c.requests.filter((r) =>
      r.url.includes('/balance-allowance')
    );
    asserts.assertEquals(reads.length, 2);
    for (const r of reads) {
      asserts.assert(r.url.includes('asset_type=CONDITIONAL-V2'));
    }
    asserts.assert(reads.some((r) => r.url.includes(`token_id=${YES_ID}`)));
    asserts.assert(reads.some((r) => r.url.includes(`token_id=${NO_ID}`)));
    const data = submitted(c);
    asserts.assertEquals(count(data, 'd217a3cc'), 2);
    asserts.assertEquals(count(data, ROUTER_WORD), 2);
  });

  it('redeems only the outcomes given shares, with no balance reads', async () => {
    const c = client();
    c.setResponseQueue([RELAY, { body: { transactionID: 'tx-r' } }]);
    await c.redeem({ conditionId: V2_CID, version: 'v2', shares: [0, 1.5] });
    asserts.assertEquals(
      c.requests.filter((r) => r.url.includes('/balance-allowance')).length,
      0,
    );
    asserts.assertEquals(count(submitted(c), 'd217a3cc'), 1);
  });

  it('refuses a V2 redeem with nothing to redeem before relaying anything', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.redeem({ conditionId: V2_CID, version: 'v2', shares: [0, 0] }),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'INVALID_OPTIONS');
    asserts.assertEquals(c.requests.length, 0);
  });

  it('order() dispatches a V2 SPLIT to the Router', async () => {
    const c = client();
    c.setResponseQueue([RELAY, { body: { transactionID: 'tx-o' } }]);
    await c.order({
      action: 'SPLIT',
      conditionId: V2_CID,
      version: 'v2',
      amountUsd: 2,
    });
    asserts.assertEquals(count(submitted(c), '82d3b9f1'), 1);
  });

  it('getRelayerTransaction reads one relayed transaction, NOT_FOUND when absent', async () => {
    const c = client();
    c.setResponse([{
      transactionID: 'tx-1',
      state: 'STATE_CONFIRMED',
      transactionHash: '0xabc',
      type: 'PROXY',
    }]);
    const tx = await c.getRelayerTransaction('tx-1');
    asserts.assertEquals(tx.transactionId, 'tx-1');
    asserts.assertEquals(tx.state, 'STATE_CONFIRMED');
    asserts.assertEquals(tx.transactionHash, '0xabc');
    asserts.assert(c.lastRequest!.url.includes('/transaction?id=tx-1'));
    asserts.assertEquals(
      c.lastRequest!.headers['RELAYER_API_KEY'],
      'relayer-key',
    );

    c.setResponse([]);
    const err = await asserts.assertRejects(
      () => c.getRelayerTransaction('tx-2'),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'NOT_FOUND');
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

describe('Polymarket — transport failures', () => {
  const failing = () => Promise.reject(new TypeError('error sending request'));

  it('throws a transient TIMEOUT when no answer arrives within the timeout', async () => {
    const c = new MockPolymarket({ timeout: 1 });
    c['_fetch'] = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason));
      });
    const err = await asserts.assertRejects(
      () => c.getMarkets(),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1);
  });

  it('throws a transient NETWORK_ERROR from a signed CLOB read', async () => {
    const c = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
    });
    c['_fetch'] = failing;
    const err = await asserts.assertRejects(
      () => c.getBalance(),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
    const json = JSON.stringify(err.toJSON());
    asserts.assertEquals(json.includes(TEST_KEY.slice(2)), false);
    asserts.assertEquals(json.includes(CREDS.secret), false);
  });

  it('throws NETWORK_ERROR from the order-submission path', async () => {
    const c = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
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
      return failing();
    };
    const err = await asserts.assertRejects(
      () =>
        c.submitOrder({
          tokenId: TOKEN,
          side: 'BUY',
          price: 0.55,
          shares: 9.0,
          orderType: 'FAK',
        }),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
  });

  it('throws NETWORK_ERROR from a Relayer call', async () => {
    const c = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        relayerApiKey: 'relayer-key',
        relayerApiKeyAddress: TEST_ADDR,
      },
    });
    c['_fetch'] = failing;
    const err = await asserts.assertRejects(
      () =>
        c.redeem({
          conditionId:
            '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          negRisk: false,
        }),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(
      JSON.stringify(err.toJSON()).includes('relayer-key'),
      false,
    );
  });

  it('flags a 5xx as transient and a refusal as not', async () => {
    const c = new MockPolymarket();
    c.setResponse({ error: 'oops' }, 503);
    const outage = await asserts.assertRejects(
      () => c.getMarkets(),
      PolymarketError,
    );
    asserts.assertEquals(outage.code, 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(outage.transient, true);

    c.setResponse({ error: 'nope' }, 401);
    const refusal = await asserts.assertRejects(
      () => c.getMarkets(),
      PolymarketError,
    );
    asserts.assertEquals(refusal.code, 'AUTH_FAILED');
    asserts.assertEquals(refusal.transient, false);
  });

  it('keepalive still resolves false on a transport failure', async () => {
    const c = new MockPolymarket();
    c['_fetch'] = failing;
    asserts.assertEquals(await c.keepalive(), false);
  });
});

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
    asserts.assertEquals(err.transient, true);
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
    asserts.assertEquals(err.transient, true);
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
    asserts.assertEquals(err.transient, true);
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
  it('fails RESPONSE_ERROR when a 2xx order response is not an object', async () => {
    const c = routed(() =>
      new Response(JSON.stringify('not an object'), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const err = await asserts.assertRejects(
      () => c.submitOrder(order),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });
});

describe('Polymarket — status mapping and the order() dispatcher', () => {
  it('maps 401 to AUTH_FAILED and an undocumented non-5xx status to UNKNOWN_ERROR', async () => {
    for (
      const [status, code] of [[401, 'AUTH_FAILED'], [
        418,
        'UNKNOWN_ERROR',
      ]] as const
    ) {
      const c = new MockPolymarket();
      c.setResponse({ error: 'nope' }, status);
      const err = await asserts.assertRejects(
        () => c.getMarkets(),
        PolymarketError,
      );
      asserts.assertEquals(err.code, code);
    }
  });

  it('names an unknown action instead of failing anonymously (plain-JS callers)', async () => {
    const c = new MockPolymarket();
    const err = await asserts.assertRejects(
      () => c.order({ action: 'HOLD' } as never),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'UNKNOWN_ERROR');
    asserts.assertEquals(err.getContextValue('action'), 'HOLD');
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

    it('types a live crypto up/down market: fee schedule, TWAP config, version', async () => {
      const client = new Polymarket({});
      const { markets } = await client.getMarkets({
        endpoint: 'keyset',
        closed: false,
        limit: 100,
        orderBy: 'startDate',
        ascending: false,
      });
      const updown = markets.find((m) => m.cryptoMarketConfig?.twapEnabled);
      if (!updown) return; // none listed right now — nothing to check
      asserts.assertEquals(updown.cryptoMarketConfig!.twapEnabled, true);
      asserts.assert((updown.cryptoMarketConfig!.twapLookbackSeconds ?? 0) > 0);
      asserts.assert(updown.feeSchedule && updown.feeSchedule.rate > 0);
      asserts.assertEquals(updown.version, 'v1');
      const fee = estimateFees(updown, { price: 0.5, shares: 100 });
      asserts.assertEquals(
        fee.takerFee,
        Math.round(100 * updown.feeSchedule.rate * 0.25 * 1e5) / 1e5,
      );
    });
  },
});

// Data API v2 is public: reads the configured funder's wallet without
// signing anything.
describe({
  name: 'Polymarket — Data API v2 live',
  ignore: !env.get('CONNECTOR_POLYMARKET_FUNDER'),
  bun: false,
  node: false,
  fn: () => {
    const client = new Polymarket({});
    const user = env.get('CONNECTOR_POLYMARKET_FUNDER')!;

    it('reads positions (open and closed), value, activity and trades', async () => {
      const open = await client.getPositions({ user, limit: 5 });
      asserts.assert(Array.isArray(open.data));
      asserts.assertEquals(typeof open.pagination.hasMore, 'boolean');
      const closed = await client.getPositions({
        user,
        status: 'CLOSED',
        limit: 5,
      });
      for (const p of closed.data) asserts.assertEquals(p.status, 'CLOSED');
      if (open.pagination.nextCursor) {
        const next = await client.getPositions({
          user,
          cursor: open.pagination.nextCursor,
        });
        asserts.assert(Array.isArray(next.data));
      }
      asserts.assertEquals(
        typeof await client.getPortfolioValue({ user }),
        'number',
      );
      const activity = await client.getActivity({ user, limit: 5 });
      asserts.assert(Array.isArray(activity.data));
      const trades = await client.getTrades({ user, limit: 5 });
      asserts.assert(Array.isArray(trades.data));
    });

    it('looks up tokens and resolutions for a market the wallet traded', async () => {
      const { data } = await client.getActivity({
        user,
        type: 'TRADE',
        limit: 1,
      });
      const row = data[0];
      if (!row) return; // wallet has no trades — nothing to look up
      const tokens = await client.getTokens({ conditions: [row.conditionId] });
      asserts.assert(tokens.some((t) => t.tokenId === row.tokenId));
      const resolutions = await client.getResolutions({
        condition: row.conditionId,
      });
      asserts.assert(resolutions.length > 0);
      asserts.assertEquals(typeof resolutions[0]!.status, 'string');
    });

    it('v1 is gone: the old route answers 410', async () => {
      const res = await fetch(
        `${DATA_API}/positions?user=${encodeURIComponent(user)}`,
      );
      await res.body?.cancel();
      asserts.assertEquals(res.status, 410);
    });
  },
});

// ── Caller-supplied signer + HMAC ───────────────────────────────────────────

describe('Polymarket — auth.signer / auth.hmac', () => {
  const keyBytes = Uint8Array.from(
    TEST_KEY.slice(2).match(/../g)!.map((h) => parseInt(h, 16)),
  );
  const digests: Uint8Array[] = [];
  const messages: string[] = [];
  const injected = {
    address: TEST_ADDR,
    signDigest: (digest: Uint8Array) => {
      digests.push(digest);
      const sig = secp256k1.sign(digest, keyBytes, {
        prehash: false,
        format: 'recovered',
      });
      return Promise.resolve({
        r: sig.slice(1, 33),
        s: sig.slice(33),
        v: sig[0]!,
      });
    },
  };
  const hmac = (message: string) => {
    messages.push(message);
    return hmacSign(CREDS.secret, message);
  };
  const { apiKey, passphrase } = CREDS;

  it('signs orders and L2 requests without the key or the secret', async () => {
    digests.length = 0;
    messages.length = 0;
    const c = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        signer: injected,
        funder: PROXY,
        apiCredentials: { apiKey, passphrase },
        hmac,
      },
    });
    asserts.assertEquals(c.signerAddress, TEST_ADDR);
    asserts.assertEquals(c.hasApiCredentials, true);
    c.setResponseQueue([
      { body: { version: 2 } },
      { body: { neg_risk: false } },
      { body: { status: 'live', orderID: 'o1', success: true } },
    ]);
    await c.submitOrder({
      tokenId: TOKEN,
      side: 'BUY',
      price: 0.5,
      shares: 10,
      orderType: 'GTC',
    });
    const req = c.lastRequest!;
    const order = (JSON.parse(req.body!) as { order: { signature: string } })
      .order;
    asserts.assertEquals(digests.length, 1);
    // The order carries exactly what the built-in key would have produced.
    asserts.assertEquals(
      order.signature,
      new PolymarketSigner(TEST_KEY).signDigest(digests[0]!),
    );
    asserts.assertEquals(messages.length, 1);
    asserts.assertEquals(
      req.headers.POLY_SIGNATURE,
      await hmacSign(CREDS.secret, messages[0]!),
    );
    asserts.assertEquals(req.headers.POLY_ADDRESS, TEST_ADDR);
  });

  it('derives API credentials through the injected signer (L1)', async () => {
    digests.length = 0;
    const c = new MockPolymarket({
      auth: { type: 'CUSTOM', signer: injected },
    });
    c.setResponse(CREDS);
    const creds = await c.deriveApiCredentials();
    asserts.assertEquals(creds.apiKey, CREDS.apiKey);
    asserts.assertEquals(digests.length, 1);
    asserts.assertEquals(
      c.lastRequest!.headers.POLY_SIGNATURE,
      new PolymarketSigner(TEST_KEY).signDigest(digests[0]!),
    );
  });

  it('wraps a failing signer as SIGNER_FAILED', async () => {
    const c = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        signer: {
          address: TEST_ADDR,
          signDigest: () => Promise.reject(new Error('hsm offline')),
        },
      },
    });
    c.setResponse(CREDS);
    const err = await asserts.assertRejects(
      () => c.deriveApiCredentials(),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'SIGNER_FAILED');
    asserts.assertStringIncludes(err.message, 'hsm offline');
  });

  it('rejects an invalid signer address at construction', () => {
    const err = asserts.assertThrows(
      () =>
        new MockPolymarket({
          auth: {
            type: 'CUSTOM',
            signer: { address: '0x123', signDigest: injected.signDigest },
          },
        }),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_SIGNER');
  });

  it('treats apiCredentials without a secret or hmac as missing', async () => {
    const c = new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        apiCredentials: { apiKey, passphrase },
      },
    });
    asserts.assertEquals(c.hasApiCredentials, false);
    const err = await asserts.assertRejects(
      () => c.getBalance(),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'NO_API_CREDENTIALS');
  });
});

// ── Prepared orders (identity before submission) ────────────────────────────

describe('Polymarket — prepareOrder / submitPrepared', () => {
  const trader = () =>
    new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
    });
  const base = {
    tokenId: TOKEN,
    side: 'BUY' as const,
    price: 0.55,
    shares: 9,
    orderType: 'GTC' as const,
    version: 2 as const,
    negRisk: false,
  };

  it('a fixed salt and clock give the shared vector hash and signature', async () => {
    const c = trader();
    for (const v of signingVectors.orders) {
      const prepared = await c.prepareOrder({
        tokenId: v.input.tokenId,
        side: v.input.side as 'BUY' | 'SELL',
        price: v.input.price,
        shares: v.input.shares,
        orderType: 'GTC',
        version: v.input.version as 1 | 2 | 3,
        negRisk: v.input.negRisk,
        salt: v.input.salt,
        nowMs: v.input.nowMs,
      });
      asserts.assertEquals(prepared.orderHash, v.digest);
      asserts.assertEquals(prepared.signature, v.signature);
      asserts.assertEquals(prepared.order, v.wire);
    }
    asserts.assertEquals(
      c.requests.length,
      0,
      'version/negRisk given: no lookups',
    );
  });

  it('is deterministic for a salt, and the salt changes the identity', async () => {
    const c = trader();
    const a = await c.prepareOrder({ ...base, salt: 1, nowMs: 1_000 });
    const b = await c.prepareOrder({ ...base, salt: 1, nowMs: 1_000 });
    const other = await c.prepareOrder({ ...base, salt: 2, nowMs: 1_000 });
    asserts.assertEquals(a.orderHash, b.orderHash);
    asserts.assertNotEquals(a.orderHash, other.orderHash);
    const random = await c.prepareOrder(base);
    asserts.assert(Number.isSafeInteger(random.salt));
  });

  it('refuses an invalid salt or clock', async () => {
    const c = trader();
    for (
      const bad of [{ salt: -1 }, { salt: 2 ** 53 }, { salt: 1.5 }, {
        nowMs: -5,
      }]
    ) {
      const err = await asserts.assertRejects(
        () => c.prepareOrder({ ...base, ...bad }),
        PolymarketError,
      );
      asserts.assertEquals(err.code, 'ORDER_REJECTED');
    }
  });

  it('submitPrepared sends the order exactly as signed', async () => {
    const c = trader();
    const prepared = await c.prepareOrder({ ...base, salt: 7, postOnly: true });
    c.setResponse({
      success: true,
      orderID: prepared.orderHash,
      status: 'live',
      makingAmount: '',
      takingAmount: '',
    });
    const result = await c.submitPrepared(prepared);
    const body = JSON.parse(c.lastRequest!.body!);
    asserts.assertEquals(body.order, prepared.order);
    asserts.assertEquals(body.owner, CREDS.apiKey);
    asserts.assertEquals(body.postOnly, true);
    asserts.assertEquals(result.orderHash, prepared.orderHash);
    asserts.assertEquals(result.id, prepared.orderHash);
  });

  it('submitPrepared never rebuilds: a version change is ORDER_VERSION_STALE', async () => {
    const c = trader();
    const prepared = await c.prepareOrder({ ...base, version: 1, salt: 3 });
    c.setResponseQueue([
      { body: { error: 'order_version_mismatch' }, status: 400 },
      { body: { version: 2 } },
    ]);
    const err = await asserts.assertRejects(
      () => c.submitPrepared(prepared),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'ORDER_VERSION_STALE');
    asserts.assertEquals(err.getContextValue('orderHash'), prepared.orderHash);
    asserts.assertEquals(err.getContextValue('preparedVersion'), 1);
    asserts.assertEquals(err.getContextValue('currentVersion'), 2);
    asserts.assertEquals(
      c.requests.filter((r) => r.url.endsWith('/order')).length,
      1,
      'exactly one order POST — nothing re-signed or resent',
    );
  });

  it('submitting the same prepared order twice is ORDER_DUPLICATE', async () => {
    const c = trader();
    const prepared = await c.prepareOrder({ ...base, salt: 11 });
    c.setResponse({
      error: `order ${prepared.orderHash} is invalid. Duplicated.`,
    }, 400);
    const err = await asserts.assertRejects(
      () => c.submitPrepared(prepared),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'ORDER_DUPLICATE');
    asserts.assertEquals(err.getContextValue('orderHash'), prepared.orderHash);
  });

  it('a plain rejection now carries the venue message from `error`', async () => {
    const c = trader();
    const prepared = await c.prepareOrder({ ...base, salt: 12 });
    c.setResponse({ error: 'not enough balance / allowance' }, 400);
    const err = await asserts.assertRejects(
      () => c.submitPrepared(prepared),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'ORDER_REJECTED');
    asserts.assertStringIncludes(err.message, 'not enough balance');
  });

  it('prepareOrders + submitPreparedBatch: per-row codes, nothing rebuilt', async () => {
    const c = trader();
    c.setResponseQueue([{ body: { version: 2 } }, {
      body: { neg_risk: false },
    }]);
    const prepared = await c.prepareOrders([
      { ...base, version: undefined, negRisk: undefined, salt: 1 },
      { ...base, version: undefined, negRisk: undefined, salt: 2 },
      { ...base, version: undefined, negRisk: undefined, salt: 3 },
    ]);
    asserts.assertEquals(
      c.requests.length,
      2,
      'one version + one neg-risk lookup',
    );
    c.setResponse([
      { success: true, orderID: prepared[0]!.orderHash, status: 'live' },
      { success: false, errorMsg: 'order_version_mismatch' },
      {
        success: false,
        errorMsg: `order ${prepared[2]!.orderHash} is invalid. Duplicated.`,
      },
    ]);
    const results = await c.submitPreparedBatch(prepared);
    asserts.assertEquals(results.map((r) => r.rejectionCode), [
      undefined,
      'VERSION_STALE',
      'DUPLICATE',
    ]);
    asserts.assertEquals(
      results.map((r) => r.orderHash),
      prepared.map((p) => p.orderHash),
    );
    const body = JSON.parse(c.lastRequest!.body!) as { order: unknown }[];
    asserts.assertEquals(
      body.map((b) => b.order),
      prepared.map((p) => p.order),
    );
    asserts.assertEquals(
      c.requests.filter((r) => r.url.endsWith('/orders')).length,
      1,
    );
  });

  it('getOrder looks up any order by hash', async () => {
    const c = trader();
    c.setResponse({
      id: '0xabc',
      status: 'MATCHED',
      owner: CREDS.apiKey,
      maker_address: PROXY,
      market: '0xc',
      asset_id: TOKEN,
      side: 'BUY',
      original_size: '9',
      size_matched: '9',
      price: '0.55',
      outcome: 'Yes',
      expiration: '0',
      order_type: 'GTC',
      associate_trades: ['t1'],
      created_at: 1748779200,
    });
    const order = await c.getOrder('0xabc');
    asserts.assertEquals(order.status, 'MATCHED');
    asserts.assertEquals(order.sizeMatched, 9);
    asserts.assert(c.lastRequest!.url.includes('/data/order/0xabc'));
  });

  it("getOrder maps the venue's null body for an unknown order to NOT_FOUND", async () => {
    const c = trader();
    c.setResponse(null);
    const err = await asserts.assertRejects(
      () => c.getOrder('0xabc'),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'NOT_FOUND');
  });
});

// ── Polymarket Protocol V2 markets (ExchangeV3) ─────────────────────────────

describe('Polymarket — Protocol V2 markets (ExchangeV3)', () => {
  const trader = () =>
    new MockPolymarket({
      auth: {
        type: 'CUSTOM',
        privateKey: TEST_KEY,
        funder: PROXY,
        apiCredentials: CREDS,
      },
    });
  const v1Market = {
    version: 'v1',
    outcomes: ['Yes', 'No'],
    clobTokenIds: ['111', '222'],
    positionIds: null,
  };
  const v2Market = {
    version: 'v2',
    outcomes: ['Up', 'Down'],
    clobTokenIds: ['333', '444'],
    positionIds: ['333', '444'],
  };
  const order = {
    side: 'BUY' as const,
    price: 0.55,
    shares: 9,
    orderType: 'GTC' as const,
  };

  it('orderAsset picks clobTokenIds for v1 and positionIds + ExchangeV3 for v2', () => {
    asserts.assertEquals(orderAsset(v1Market, 1), { tokenId: '222' });
    asserts.assertEquals(orderAsset(v1Market, 'Yes'), { tokenId: '111' });
    asserts.assertEquals(orderAsset(v2Market, 'Down'), {
      tokenId: '444',
      version: 3,
    });
  });

  it('orderAsset refuses an unknown version or outcome instead of guessing', () => {
    for (
      const [market, outcome] of [
        [{ ...v2Market, version: null }, 0],
        [{ ...v2Market, version: 'v3' }, 0],
        [v2Market, 'Sideways'],
        [v2Market, 2],
        [{ ...v2Market, positionIds: null }, 0],
      ] as const
    ) {
      const err = asserts.assertThrows(
        () => orderAsset(market, outcome),
        PolymarketError,
      );
      asserts.assertEquals(err.code, 'INVALID_OPTIONS');
    }
  });

  it('signs version 3 for ExchangeV3 with no version or neg-risk lookup', async () => {
    const c = trader();
    const prepared = await c.prepareOrder({
      ...orderAsset(v2Market, 'Up'),
      ...order,
      salt: 1,
      nowMs: 1_000,
    });
    asserts.assertEquals(prepared.version, 3);
    asserts.assertEquals(prepared.negRisk, false);
    asserts.assertEquals(prepared.tokenId, '333');
    asserts.assertEquals(c.requests.length, 0, 'no /version, no /neg-risk');
    const v2 = await c.prepareOrder({
      tokenId: '333',
      ...order,
      version: 2,
      negRisk: false,
      salt: 1,
      nowMs: 1_000,
    });
    asserts.assertNotEquals(prepared.orderHash, v2.orderHash);
    asserts.assertEquals(Object.keys(prepared.order), Object.keys(v2.order));
  });

  it('a batch looks up neg-risk only for its v1 orders', async () => {
    const c = trader();
    c.setResponseQueue([
      { body: { version: 2 } },
      { body: { neg_risk: true } },
    ]);
    const [v1, v2] = await c.prepareOrders([
      { ...orderAsset(v1Market, 'Yes'), ...order },
      { ...orderAsset(v2Market, 'Up'), ...order },
    ]);
    asserts.assertEquals([v1!.version, v1!.negRisk], [2, true]);
    asserts.assertEquals([v2!.version, v2!.negRisk], [3, false]);
    const paths = c.requests.map((r) => new URL(r.url).pathname);
    asserts.assertEquals(paths.sort(), ['/neg-risk', '/version']);
    asserts.assertEquals(
      new URL(c.requests.find((r) => r.url.includes('/neg-risk'))!.url)
        .searchParams.get('token_id'),
      '111',
    );
  });

  it('never re-signs a version 3 order for the /version exchange on a mismatch', async () => {
    const c = trader();
    c.setResponseQueue([
      { body: { errorMsg: 'order_version_mismatch' }, status: 400 },
      { body: { version: 2 } },
    ]);
    const err = await asserts.assertRejects(
      () => c.submitOrder({ ...orderAsset(v2Market, 'Up'), ...order }),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'ORDER_VERSION_STALE');
    asserts.assertEquals(
      c.requests.filter((r) => r.method === 'POST').length,
      1,
      'one POST — no retry',
    );
  });

  it('reads a V2 position balance as CONDITIONAL-V2', async () => {
    const c = trader();
    c.setResponse({ balance: '5000000', allowances: {} });
    await c.getBalance(orderAsset(v2Market, 'Up'));
    const url = new URL(c.lastRequest!.url);
    asserts.assertEquals(url.searchParams.get('asset_type'), 'CONDITIONAL-V2');
    asserts.assertEquals(url.searchParams.get('token_id'), '333');
    await c.getBalance(orderAsset(v1Market, 'Yes'));
    asserts.assertEquals(
      new URL(c.lastRequest!.url).searchParams.get('asset_type'),
      'CONDITIONAL',
    );
  });

  it('refreshBalance has the CLOB re-read the asset, then reads it', async () => {
    const c = trader();
    // The live update endpoint answers 200 with an empty body.
    c.setResponseQueue([
      { body: '' },
      { body: { balance: '5000000', allowances: {} } },
    ]);
    const fresh = await c.refreshBalance(orderAsset(v2Market, 'Up'));
    asserts.assertEquals(fresh.balance, 5);
    const [update, read] = c.requests.slice(-2).map((r) => new URL(r.url));
    asserts.assertEquals(update!.pathname, '/balance-allowance/update');
    asserts.assertEquals(read!.pathname, '/balance-allowance');
    for (const url of [update!, read!]) {
      asserts.assertEquals(
        url.searchParams.get('asset_type'),
        'CONDITIONAL-V2',
      );
      asserts.assertEquals(url.searchParams.get('token_id'), '333');
      asserts.assert(url.searchParams.get('signature_type'));
    }
    asserts.assert(
      c.requests.at(-2)!.headers['POLY_SIGNATURE']!.length > 0,
      'the update call is L2-signed',
    );

    await c.refreshBalance();
    const collateral = new URL(c.requests.at(-2)!.url);
    asserts.assertEquals(collateral.pathname, '/balance-allowance/update');
    asserts.assertEquals(
      collateral.searchParams.get('asset_type'),
      'COLLATERAL',
    );
    asserts.assertEquals(collateral.searchParams.has('token_id'), false);
  });

  it('refreshBalance does not read a balance the CLOB refused to refresh', async () => {
    const c = trader();
    c.setResponse({ error: 'Unauthorized' }, 401);
    const err = await asserts.assertRejects(
      () => c.refreshBalance(),
      PolymarketError,
    );
    asserts.assertEquals(err.code, 'AUTH_FAILED');
    asserts.assertEquals(
      c.requests.filter((r) => r.url.includes('/balance-allowance')).length,
      1,
    );
  });

  it('getMarkets passes the version filter', async () => {
    const c = new MockPolymarket({});
    c.setResponse([]);
    await c.getMarkets({ version: 'v2' });
    asserts.assertEquals(
      new URL(c.lastRequest!.url).searchParams.get('version'),
      'v2',
    );
  });
});

// ── Live: duplicate submission (places a real order) ────────────────────────
// Needs a funded proxy wallet: CONNECTOR_POLYMARKET_PRIVATE_KEY,
// CONNECTOR_POLYMARKET_FUNDER and LIVE_TEST_ALLOW_ORDERS. It rests one
// post-only BUY of 5 shares at 0.01 ($0.05 of collateral) far below the
// market, submits the SAME prepared order a second time to record how the
// venue treats a duplicate, then cancels the order in `finally`.
const orderTestsEnabled = !!credentials.privateKey &&
  !!env.get('CONNECTOR_POLYMARKET_FUNDER') &&
  !!env.get('LIVE_TEST_ALLOW_ORDERS');

// Wall-clock timing of each live step, printed as one line per test so a
// run doubles as a latency sample (client-side: includes TLS, signing and
// the network round trip).
const stepTimer = () => {
  const rows: Array<[string, number]> = [];
  return {
    async step<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try {
        return await fn();
      } finally {
        rows.push([label, performance.now() - start]);
      }
    },
    note(label: string, ms: number): void {
      rows.push([label, ms]);
    },
    report(title: string): void {
      console.log(
        `${title} timings (ms): ${
          rows.map(([label, ms]) => `${label} ${Math.round(ms)}`).join(' · ')
        }`,
      );
    },
  };
};

describe({
  name: 'Polymarket — live prepared-order duplicate',
  ignore: !orderTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('a resubmitted prepared order is refused as ORDER_DUPLICATE, never placed twice', async () => {
      const client = new Polymarket({
        auth: {
          type: 'CUSTOM',
          privateKey: credentials.privateKey!,
          funder: env.get('CONNECTOR_POLYMARKET_FUNDER')!,
        },
      });
      const t = stepTimer();
      await t.step('deriveCredentials', () => client.deriveApiCredentials());
      const { markets } = await t.step(
        'findMarket',
        () => client.getMarkets({ limit: 20, closed: false }),
      );
      const market = markets.find((m) =>
        m.clobTokenIds.length > 0 && m.acceptingOrders !== false
      );
      asserts.assert(market, 'no open market to rest an order on');
      const prepared = await t.step('prepare', () =>
        client.prepareOrder({
          tokenId: market.clobTokenIds[0]!,
          side: 'BUY',
          price: 0.01,
          shares: 5,
          orderType: 'GTC',
          postOnly: true,
        }));
      try {
        const first = await t.step(
          'submit',
          () => client.submitPrepared(prepared),
        );
        asserts.assertEquals(
          first.id,
          prepared.orderHash,
          'the venue order id is the EIP-712 hash',
        );
        const err = await t.step('resubmit', () =>
          asserts.assertRejects(
            () => client.submitPrepared(prepared),
            PolymarketError,
          ));
        asserts.assertEquals(err.code, 'ORDER_DUPLICATE');
        const order = await t.step(
          'getOrder',
          () => client.getOrder(prepared.orderHash),
        );
        asserts.assertEquals(order.id, prepared.orderHash);
      } finally {
        await t.step(
          'cancel',
          () => client.cancelOrder(prepared.orderHash).catch(() => {}),
        );
        t.report('duplicate-order');
      }
    });
  },
});

// ── Live: Polymarket Protocol V2 (ExchangeV3) ───────────────────────────────
// Read-only with a key and funder: types a live V2 market, picks its
// position id and reads its CONDITIONAL-V2 balance. With
// LIVE_TEST_ALLOW_ORDERS as well, it also rests one post-only BUY of 5
// shares at 0.01 ($0.05 of collateral) on a V2 crypto up/down market —
// signed for ExchangeV3 — and cancels it in `finally`. Needs pUSD
// approved for ExchangeV3 (the collateral balance's `allowances` shows it).
const v2Trader = () =>
  new Polymarket({
    auth: {
      type: 'CUSTOM',
      privateKey: credentials.privateKey!,
      funder: env.get('CONNECTOR_POLYMARKET_FUNDER')!,
    },
  });
// Pages Gamma's V2 listing (keyset, 500 a page) for a market accepting
// orders that ends more than an hour from now. `crypto` keeps only the
// crypto up/down windows (`cryptoMarketConfig` set).
const liveMarket = async (
  client: Polymarket,
  version: 'v1' | 'v2',
  crypto = false,
) => {
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const { markets, nextCursor } = await client.getMarkets({
      endpoint: 'keyset',
      version,
      closed: false,
      // Soonest-ending first, from an hour out: crypto windows are short,
      // so they lead the list instead of hiding behind thousands of older
      // open markets.
      orderBy: 'endDate',
      ascending: true,
      endDateMin: new Date(Date.now() + 3_600_000).toISOString(),
      limit: 500,
      cursor,
    });
    const market = markets.find((m) =>
      m.version === version && m.acceptingOrders === true &&
      (version === 'v1' || (m.positionIds?.length ?? 0) > 0) &&
      (!crypto || (m.cryptoMarketConfig !== undefined &&
        m.cryptoMarketConfig !== null)) &&
      m.endDate !== undefined && m.endDate !== null &&
      Date.parse(m.endDate) > Date.now() + 3_600_000
    );
    if (market) return market;
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  throw new Error(
    `no open ${version}${crypto ? ' crypto' : ''} market accepting orders`,
  );
};
const liveV2Market = (client: Polymarket, crypto = false) =>
  liveMarket(client, 'v2', crypto);

describe({
  name: 'Polymarket — Protocol V2 live',
  ignore: !liveTestsEnabled || !env.get('CONNECTOR_POLYMARKET_FUNDER'),
  bun: false,
  node: false,
  fn: () => {
    it('lists a V2 market, picks its position id and reads its CONDITIONAL-V2 balance', async () => {
      const client = v2Trader();
      await client.deriveApiCredentials();
      const market = await liveV2Market(client);
      const asset = orderAsset(market, 0);
      asserts.assertEquals(asset, {
        tokenId: market.positionIds![0]!,
        version: 3,
      });
      const position = await client.getBalance(asset);
      asserts.assert(position.balance >= 0);
      const collateral = await client.getBalance();
      asserts.assert(Number.isFinite(collateral.balance));
    });
  },
});

describe({
  name: 'Polymarket — live order',
  ignore: !orderTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    for (const version of ['v1', 'v2'] as const) {
      it(`rests and cancels a post-only order on a ${version} crypto market`, async () => {
        const client = v2Trader();
        const t = stepTimer();
        await t.step('deriveCredentials', () => client.deriveApiCredentials());
        const market = await t.step(
          'findMarket',
          () => liveMarket(client, version, true),
        );
        console.log(
          `${version} order market: ${market.slug} (ends ${market.endDate})`,
        );
        const prepared = await t.step('prepare', () =>
          client.prepareOrder({
            ...orderAsset(market, 0),
            side: 'BUY',
            price: 0.01,
            shares: 5,
            orderType: 'GTC',
            postOnly: true,
          }));
        // v1 signs for whatever /version reports (CTF Exchange V2); v2
        // markets sign for ExchangeV3.
        asserts.assertEquals(prepared.version, version === 'v2' ? 3 : 2);
        try {
          const placed = await t.step(
            'submit',
            () => client.submitPrepared(prepared),
          );
          console.log(`placed: status ${placed.status}, id ${placed.id}`);
          asserts.assertEquals(
            placed.id,
            prepared.orderHash,
            'the venue order id is the EIP-712 hash',
          );
          // The order lookup can trail the accept by a moment (seen on a
          // V2 crypto window): retry NOT_FOUND for up to ~3 s.
          let resting;
          let lookups = 0;
          const lookupStart = performance.now();
          for (let attempt = 0; attempt < 15 && !resting; attempt++) {
            lookups++;
            resting = await client.getOrder(prepared.orderHash).catch((e) => {
              if (e instanceof PolymarketError && e.code === 'NOT_FOUND') {
                return undefined;
              }
              throw e;
            });
            if (!resting) await new Promise((r) => setTimeout(r, 200));
          }
          t.note(
            `visible(${lookups} lookup${lookups === 1 ? '' : 's'})`,
            performance.now() - lookupStart,
          );
          asserts.assert(resting, 'the venue never showed the order');
          console.log(`looked up: status ${resting.status}`);
          asserts.assertEquals(resting.id, prepared.orderHash);
        } finally {
          const cancel = await t.step(
            'cancel',
            () => client.cancelOrder(prepared.orderHash).catch((e) => e),
          );
          console.log('cancel:', JSON.stringify(cancel));
          t.report(`${version} order`);
        }
      });
    }
  },
});

// With LIVE_TEST_ALLOW_ORDERS and a Relayer API key: on one live crypto
// market of each position system, splits $1 of pUSD into both outcomes,
// waits for the relay to confirm, then merges the $1 straight back —
// gasless, net zero. v1 goes through the CTF collateral adapter `negRisk`
// picks, V2 through the Router; each needs the funder's approvals for its
// target (Polymarket's UI sets them).
const relayerTestsEnabled = orderTestsEnabled &&
  !!env.get('CONNECTOR_POLYMARKET_RELAYER_API_KEY') &&
  !!env.get('CONNECTOR_POLYMARKET_RELAYER_API_KEY_ADDRESS');

const waitForRelay = async (client: Polymarket, id: string) => {
  for (let attempt = 0; attempt < 240; attempt++) {
    const tx = await client.getRelayerTransaction(id).catch((e) => {
      if (e instanceof PolymarketError && e.code === 'NOT_FOUND') {
        return undefined;
      }
      throw e;
    });
    if (tx?.state === 'STATE_CONFIRMED') return tx;
    if (tx?.state === 'STATE_FAILED' || tx?.state === 'STATE_INVALID') {
      throw new Error(`relay ${id} ended ${tx.state}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`relay ${id} not confirmed within 2 minutes`);
};

describe({
  name: 'Polymarket — live split and merge',
  ignore: !relayerTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    for (const version of ['v1', 'v2'] as const) {
      it(`splits $1 into both outcomes of a ${version} crypto market and merges it back`, async () => {
        const client = new Polymarket({
          auth: {
            type: 'CUSTOM',
            privateKey: credentials.privateKey!,
            funder: env.get('CONNECTOR_POLYMARKET_FUNDER')!,
            relayerApiKey: env.get('CONNECTOR_POLYMARKET_RELAYER_API_KEY')!,
            relayerApiKeyAddress: env.get(
              'CONNECTOR_POLYMARKET_RELAYER_API_KEY_ADDRESS',
            )!,
          },
        });
        const t = stepTimer();
        const market = await t.step(
          'findMarket',
          () => liveMarket(client, version, true),
        );
        const route = positionMarket(market);
        asserts.assertEquals(route.version === 'v2' ? 'v2' : 'v1', version);
        console.log(
          `${version} split/merge market: ${market.slug} (negRisk ${market.negRisk})`,
        );

        // The relayer's own created → last-updated span, beside the
        // client's wall clock.
        const relaySpan = (
          tx: { createdAt?: string | null; updatedAt?: string | null },
        ) =>
          tx.createdAt && tx.updatedAt
            ? Date.parse(tx.updatedAt) - Date.parse(tx.createdAt)
            : NaN;

        const split = await t.step(
          'splitSubmit',
          () => client.split({ ...route, amountUsd: 1 }),
        );
        console.log(`split: relay ${split.id} ${split.status}`);
        const splitTx = await t.step(
          'splitConfirm',
          () => waitForRelay(client, split.id),
        );
        t.note('splitRelayerSpan', relaySpan(splitTx));
        console.log(`split confirmed: ${splitTx.transactionHash}`);

        const merge = await t.step(
          'mergeSubmit',
          () => client.merge({ ...route, amountUsd: 1 }),
        );
        console.log(`merge: relay ${merge.id} ${merge.status}`);
        const mergeTx = await t.step(
          'mergeConfirm',
          () => waitForRelay(client, merge.id),
        );
        t.note('mergeRelayerSpan', relaySpan(mergeTx));
        console.log(`merge confirmed: ${mergeTx.transactionHash}`);
        t.report(`${version} split/merge`);
      });
    }
  },
});
