import * as asserts from '@asserts';
import { beforeAll, describe, it } from '@test';
import { envArgs } from '@utils';
import { API_PREFIX } from './KalshiAuth.ts';
import { DEMO_API, Kalshi, PROD_API } from './Kalshi.ts';
import { KalshiError } from './errors/mod.ts';

const ACCESS_KEY = 'test-access-key-id';
let TEST_PEM = '';

beforeAll(async () => {
  const { privateKey } = await crypto.subtle.generateKey(
    {
      name: 'RSA-PSS',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const der = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', privateKey),
  );
  let binary = '';
  for (const byte of der) binary += String.fromCharCode(byte);
  TEST_PEM = `-----BEGIN PRIVATE KEY-----\n${
    btoa(binary)
  }\n-----END PRIVATE KEY-----\n`;
});

type MockResponse = { body: unknown; status?: number };

class MockKalshi extends Kalshi {
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

function authedClient(): MockKalshi {
  return new MockKalshi({
    auth: { type: 'CUSTOM', accessKey: ACCESS_KEY, privateKeyPem: TEST_PEM },
  });
}

describe('Kalshi — construction', () => {
  it('constructs market-data-only with no auth', () => {
    const client = new MockKalshi();
    asserts.assertEquals(client.vendor, 'Kalshi');
    asserts.assertEquals(client.hasCredentials, false);
  });

  it('constructs with credentials', () => {
    const client = authedClient();
    asserts.assertEquals(client.hasCredentials, true);
  });

  it('rejects a structurally invalid PEM', () => {
    asserts.assertThrows(
      () =>
        new MockKalshi({
          auth: {
            type: 'CUSTOM',
            accessKey: ACCESS_KEY,
            privateKeyPem: 'not a pem',
          },
        }),
      KalshiError,
    );
  });

  it('defaults to the recommended production host', () => {
    asserts.assertEquals(PROD_API, 'https://external-api.kalshi.com');
    asserts.assertEquals(DEMO_API, 'https://external-api.demo.kalshi.co');
  });
});

describe('Kalshi — market data (public)', () => {
  it('fetches a page of markets', async () => {
    const client = new MockKalshi();
    client.setResponse({
      cursor: 'c1',
      markets: [{ ticker: 'T', event_ticker: 'E', status: 'active' }],
    });
    const page = await client.getMarkets({ status: 'open', limit: 10 });
    asserts.assertEquals(page.markets.length, 1);
    asserts.assertEquals(page.cursor, 'c1');
    asserts.assert(client.lastRequest!.url.includes(`${API_PREFIX}/markets?`));
    asserts.assert(client.lastRequest!.url.includes('status=open'));
  });

  it('omits the tickers filter for an empty array instead of sending ?tickers=', async () => {
    // Regression: `tickers: []` is truthy in JS — a naive `if (tickers)`
    // check would send `?tickers=` (filters to the literal empty ticker,
    // matching nothing) instead of omitting the parameter.
    const client = new MockKalshi();
    client.setResponse({ markets: [] });
    await client.getMarkets({ tickers: [] });
    asserts.assertEquals(client.lastRequest!.url.includes('tickers='), false);
  });

  it('fetches a market by ticker', async () => {
    const client = new MockKalshi();
    client.setResponse({
      market: { ticker: 'T', event_ticker: 'E', status: 'active' },
    });
    const market = await client.getMarket('T');
    asserts.assertEquals(market?.ticker, 'T');
  });

  it('returns null for a market ticker that does not exist', async () => {
    const client = new MockKalshi();
    client.setResponse({ error: 'not found' }, 404);
    const market = await client.getMarket('missing');
    asserts.assertEquals(market, null);
  });

  it('fetches an order book', async () => {
    const client = new MockKalshi();
    client.setResponse({
      orderbook_fp: { yes_dollars: [['0.15', '100.00']], no_dollars: [] },
    });
    const book = await client.getOrderbook('T', 10);
    asserts.assertEquals(book.yes[0], { price: 0.15, count: 100 });
    asserts.assert(client.lastRequest!.url.includes('depth=10'));
  });

  it('fetches trades', async () => {
    const client = new MockKalshi();
    client.setResponse({
      trades: [{
        trade_id: 't1',
        ticker: 'T',
        count_fp: '1.00',
        yes_price_dollars: '0.5',
        no_price_dollars: '0.5',
      }],
    });
    const page = await client.getTrades({ ticker: 'T' });
    asserts.assertEquals(page.trades.length, 1);
  });

  it('fetches events and a single event, null on 404', async () => {
    const client = new MockKalshi();
    client.setResponse({ events: [{ event_ticker: 'E', title: 'T' }] });
    const page = await client.getEvents({ seriesTicker: 'KXBTCD' });
    asserts.assertEquals(page.events.length, 1);

    client.setResponse({ event: { event_ticker: 'E', title: 'T' } });
    const event = await client.getEvent('E');
    asserts.assertEquals(event?.eventTicker, 'E');

    client.setResponse({ error: 'not found' }, 404);
    asserts.assertEquals(await client.getEvent('missing'), null);
  });

  it('fetches series list and a single series, null on 404', async () => {
    const client = new MockKalshi();
    client.setResponse({
      series: [{ ticker: 'KXBTCD', title: 'Bitcoin price' }],
    });
    const list = await client.getSeriesList({ category: 'Financials' });
    asserts.assertEquals(list.series.length, 1);

    client.setResponse({
      series: { ticker: 'KXBTCD', title: 'Bitcoin price' },
    });
    const series = await client.getSeries('KXBTCD');
    asserts.assertEquals(series?.ticker, 'KXBTCD');

    client.setResponse({ error: 'not found' }, 404);
    asserts.assertEquals(await client.getSeries('missing'), null);
  });

  it('fetches exchange status', async () => {
    const client = new MockKalshi();
    client.setResponse({ exchange_active: true, trading_active: true });
    const status = await client.getExchangeStatus();
    asserts.assertEquals(status.tradingActive, true);
  });

  it('never sends KALSHI-ACCESS-* headers on a market-data call, even with auth configured', async () => {
    const client = authedClient();
    client.setResponse({ markets: [] });
    await client.getMarkets();
    const headerNames = Object.keys(client.lastRequest!.headers).map((h) =>
      h.toUpperCase()
    );
    asserts.assert(!headerNames.some((h) => h.startsWith('KALSHI-ACCESS-')));
  });
});

describe('Kalshi — portfolio (authenticated)', () => {
  it('throws CONFIG_MISSING_PRIVATE_KEY when auth is not configured', async () => {
    const client = new MockKalshi();
    await asserts.assertRejects(() => client.getBalance(), KalshiError);
  });

  it('signs a balance request with the three KALSHI-ACCESS-* headers', async () => {
    const client = authedClient();
    client.setResponse({
      balance: 10000,
      portfolio_value: 10000,
      updated_ts: 1700000000,
    });
    const balance = await client.getBalance();
    asserts.assertEquals(balance.balance, 10000);
    const headers = client.lastRequest!.headers;
    asserts.assertEquals(headers['KALSHI-ACCESS-KEY'], ACCESS_KEY);
    asserts.assert((headers['KALSHI-ACCESS-SIGNATURE']?.length ?? 0) > 0);
    asserts.assert((headers['KALSHI-ACCESS-TIMESTAMP']?.length ?? 0) > 0);
  });

  it('fetches positions, fills, and orders', async () => {
    const client = authedClient();
    client.setResponse({
      market_positions: [{ ticker: 'T', position_fp: '5.00' }],
    });
    const positions = await client.getPositions({ ticker: 'T' });
    asserts.assertEquals(positions.marketPositions[0]!.position, 5);

    client.setResponse({ fills: [{ fill_id: 'f1', is_taker: true }] });
    const fills = await client.getFills({ orderId: 'o1' });
    asserts.assert(fills.fills[0]!.isTaker);

    client.setResponse({
      orders: [{ order_id: 'o1', ticker: 'T', status: 'resting' }],
    });
    const orders = await client.getOrders({ status: 'resting' });
    asserts.assertEquals(orders.orders[0]!.status, 'resting');

    client.setResponse({
      order: { order_id: 'o1', ticker: 'T', status: 'executed' },
    });
    const order = await client.getOrder('o1');
    asserts.assertEquals(order.status, 'executed');
  });
});

describe('Kalshi — submitOrder', () => {
  const options = {
    ticker: 'T',
    side: 'BUY' as const,
    price: 0.42,
    count: 3,
    orderType: 'GTC' as const,
  };

  it('builds the exact V2 body and reports a fill', async () => {
    const client = authedClient();
    client.setResponse({
      order_id: 'o1',
      client_order_id: 'c1',
      fill_count: '3.00',
      remaining_count: '0.00',
      average_fill_price: '0.42',
      ts_ms: 1,
    }, 201);
    const result = await client.submitOrder(options);
    asserts.assertEquals(result.filled, true);
    asserts.assertEquals(result.id, 'o1');
    asserts.assertEquals(result.slippage, 0);

    const body = JSON.parse(client.lastRequest!.body!);
    asserts.assertEquals(body.side, 'bid');
    asserts.assertEquals(body.price, '0.42');
    asserts.assertEquals(body.count, '3.00');
    asserts.assertEquals(body.time_in_force, 'good_till_canceled');
    asserts.assertEquals(body.self_trade_prevention_type, 'taker_at_cross');
    asserts.assert(
      typeof body.client_order_id === 'string' &&
        body.client_order_id.length > 0,
    );
    asserts.assert(
      client.lastRequest!.url.endsWith(`${API_PREFIX}/portfolio/events/orders`),
    );
  });

  it('maps SELL to ask and FAK to immediate_or_cancel', async () => {
    const client = authedClient();
    client.setResponse({
      order_id: 'o2',
      fill_count: '1.00',
      remaining_count: '0.00',
      ts_ms: 1,
    }, 201);
    await client.submitOrder({ ...options, side: 'SELL', orderType: 'FAK' });
    const body = JSON.parse(client.lastRequest!.body!);
    asserts.assertEquals(body.side, 'ask');
    asserts.assertEquals(body.time_in_force, 'immediate_or_cancel');
  });

  it('reports non-zero slippage when the fill price beats the requested price', async () => {
    const client = authedClient();
    client.setResponse({
      order_id: 'o1',
      fill_count: '3.00',
      remaining_count: '0.00',
      average_fill_price: '0.40',
      ts_ms: 1,
    }, 201);
    const result = await client.submitOrder(options);
    asserts.assertEquals(result.actualPrice, 0.4);
    asserts.assertEquals(result.slippage, 0.02); // 0.42 requested - 0.40 actual
  });

  it('refuses locally (no request sent) for an out-of-range price', async () => {
    const client = authedClient();
    await asserts.assertRejects(
      () => client.submitOrder({ ...options, price: 1.5 }),
      KalshiError,
    );
    asserts.assertEquals(client.requests.length, 0);
  });

  it('refuses locally for a non-positive count', async () => {
    const client = authedClient();
    await asserts.assertRejects(
      () => client.submitOrder({ ...options, count: 0 }),
      KalshiError,
    );
    asserts.assertEquals(client.requests.length, 0);
  });

  it('maps a venue rejection to ORDER_REJECTED', async () => {
    const client = authedClient();
    client.setResponse({
      error: { code: 'market_closed', message: 'market is closed' },
    }, 400);
    try {
      await client.submitOrder(options);
      asserts.fail('expected a throw');
    } catch (err) {
      asserts.assert(err instanceof KalshiError);
      asserts.assertEquals(err.code, 'ORDER_REJECTED');
      asserts.assertStringIncludes(err.message, 'market is closed');
    }
  });
});

describe('Kalshi — submitOrders (batch)', () => {
  const orderA = {
    ticker: 'T',
    side: 'BUY' as const,
    price: 0.4,
    count: 1,
    orderType: 'GTC' as const,
  };
  const orderB = {
    ticker: 'T',
    side: 'SELL' as const,
    price: 0.6,
    count: 1,
    orderType: 'GTC' as const,
  };

  it('reports one result per order, in the same order, on a mixed outcome', async () => {
    const client = authedClient();
    client.setResponse({
      orders: [
        {
          order_id: 'a',
          fill_count: '1.00',
          remaining_count: '0.00',
          ts_ms: 1,
        },
        { order_id: 'b', error: { code: 'bad', message: 'owner mismatch' } },
      ],
    });
    const results = await client.submitOrders([orderA, orderB]);
    asserts.assertEquals(results.length, 2);
    asserts.assertEquals(results[0]!.id, 'a');
    asserts.assertEquals(results[0]!.rejected, false);
    asserts.assertEquals(results[1]!.rejected, true);
    asserts.assertEquals(results[1]!.detail, 'owner mismatch');

    const body = JSON.parse(client.lastRequest!.body!);
    asserts.assertEquals(body.orders.length, 2);
    asserts.assert(
      client.lastRequest!.url.endsWith(
        `${API_PREFIX}/portfolio/events/orders/batched`,
      ),
    );
  });

  it('wraps a malformed 2xx batch response as KalshiError RESPONSE_ERROR, not a raw RESTler error', async () => {
    const client = authedClient();
    // `orders` present but not an array — fails BatchOrdersResponseSchemaObject.
    client.setResponse({ orders: 'not-an-array' });
    try {
      await client.submitOrders([orderA]);
      asserts.fail('expected a throw');
    } catch (err) {
      asserts.assert(err instanceof KalshiError);
      asserts.assertEquals(err.code, 'RESPONSE_ERROR');
    }
  });

  it('returns an empty array for an empty input without any request', async () => {
    const client = authedClient();
    const results = await client.submitOrders([]);
    asserts.assertEquals(results, []);
    asserts.assertEquals(client.requests.length, 0);
  });

  it('refuses the whole batch locally if any order is invalid', async () => {
    const client = authedClient();
    await asserts.assertRejects(
      () => client.submitOrders([orderA, { ...orderB, price: 5 }]),
      KalshiError,
    );
    asserts.assertEquals(client.requests.length, 0);
  });

  it('attributes rows by client_order_id, not position, when the venue reorders them', async () => {
    const client = authedClient();
    // Echo the ids back in REVERSE order — a positional mapping would hand
    // orderA's BUY/0.4 to orderB's row.
    client.setResponse({
      orders: [
        { order_id: 'b', client_order_id: 'cli-b', fill_count: '1.00' },
        { order_id: 'a', client_order_id: 'cli-a', fill_count: '1.00' },
      ],
    });
    const results = await client.submitOrders([
      { ...orderA, clientOrderId: 'cli-a' },
      { ...orderB, clientOrderId: 'cli-b' },
    ]);

    asserts.assertEquals(results.length, 2);
    // Row 0 is orderB's (the SELL at 0.6) even though it arrived first.
    asserts.assertEquals(results[0]!.id, 'b');
    asserts.assertEquals(results[0]!.action, 'SELL');
    asserts.assertEquals(results[0]!.requestedPrice, 0.6);
    asserts.assertEquals(results[1]!.id, 'a');
    asserts.assertEquals(results[1]!.action, 'BUY');
    asserts.assertEquals(results[1]!.requestedPrice, 0.4);
  });

  it('falls back to positional attribution when rows carry no client_order_id', async () => {
    const client = authedClient();
    client.setResponse({
      orders: [
        { order_id: 'a', fill_count: '1.00' },
        { order_id: 'b', fill_count: '1.00' },
      ],
    });
    const results = await client.submitOrders([orderA, orderB]);
    asserts.assertEquals(results[0]!.action, 'BUY');
    asserts.assertEquals(results[0]!.requestedPrice, 0.4);
    asserts.assertEquals(results[1]!.action, 'SELL');
    asserts.assertEquals(results[1]!.requestedPrice, 0.6);
  });

  it('raises RESPONSE_ERROR — not a raw TypeError — when more rows come back than were sent', async () => {
    const client = authedClient();
    client.setResponse({
      orders: [
        { order_id: 'a', fill_count: '1.00' },
        { order_id: 'ghost', fill_count: '1.00' },
      ],
    });
    try {
      await client.submitOrders([orderA]);
      asserts.fail('expected a throw');
    } catch (err) {
      asserts.assert(err instanceof KalshiError);
      asserts.assertEquals(err.code, 'RESPONSE_ERROR');
    }
  });
});

describe('Kalshi — amendOrder / cancelOrder / cancelOrders', () => {
  it('amends an order and returns an OrderResult', async () => {
    const client = authedClient();
    client.setResponse({ order_id: 'o1', remaining_count: '2.00', ts_ms: 2 });
    const result = await client.amendOrder('o1', {
      ticker: 'T',
      side: 'BUY',
      price: 0.4,
      count: 2,
    });
    asserts.assertEquals(result.remainingCount, 2);
    asserts.assert(
      client.lastRequest!.url.endsWith(
        `${API_PREFIX}/portfolio/events/orders/o1/amend`,
      ),
    );
  });

  it('cancels a single order', async () => {
    const client = authedClient();
    client.setResponse({ order_id: 'o1', reduced_by: '3.00', ts_ms: 3 });
    const ack = await client.cancelOrder('o1');
    asserts.assertEquals(ack.reducedBy, 3);
    asserts.assertEquals(client.lastRequest!.method, 'DELETE');
    asserts.assert(
      client.lastRequest!.url.endsWith(
        `${API_PREFIX}/portfolio/events/orders/o1`,
      ),
    );
  });

  it('batch-cancels, sending order_id objects not flat ids', async () => {
    const client = authedClient();
    client.setResponse({ orders: [{ order_id: 'a', reduced_by: '1.00' }] });
    const rows = await client.cancelOrders(['a', 'b']);
    asserts.assertEquals(rows.length, 1);
    const body = JSON.parse(client.lastRequest!.body!);
    asserts.assertEquals(body.orders[0].order_id, 'a');
    asserts.assertEquals(body.orders[1].order_id, 'b');
    asserts.assertEquals(client.lastRequest!.method, 'DELETE');
  });
});

describe('Kalshi — error mapping', () => {
  it('maps 404 to NOT_FOUND', async () => {
    const client = new MockKalshi();
    client.setResponse({ error: 'not found' }, 404);
    await asserts.assertRejects(
      () => client.getSeriesList(),
      KalshiError,
      undefined,
    );
  });

  it('maps 429 to RATE_LIMITED', async () => {
    const client = new MockKalshi();
    client.setResponse({}, 429);
    try {
      await client.getMarkets();
      asserts.fail('expected a throw');
    } catch (err) {
      asserts.assert(err instanceof KalshiError);
      asserts.assertEquals(err.code, 'RATE_LIMITED');
    }
  });

  it('maps 400 to INVALID_REQUEST with the vendor detail', async () => {
    const client = new MockKalshi();
    client.setResponse({ error: { code: 'bad', message: 'bad request' } }, 400);
    try {
      await client.getMarkets();
      asserts.fail('expected a throw');
    } catch (err) {
      asserts.assert(err instanceof KalshiError);
      asserts.assertEquals(err.code, 'INVALID_REQUEST');
      asserts.assertStringIncludes(err.message, 'bad request');
    }
  });

  it('maps 401 to AUTH_FAILED', async () => {
    const client = authedClient();
    client.setResponse({
      error: { code: 'unauthorized', message: 'invalid signature' },
    }, 401);
    try {
      await client.getBalance();
      asserts.fail('expected a throw');
    } catch (err) {
      asserts.assert(err instanceof KalshiError);
      asserts.assertEquals(err.code, 'AUTH_FAILED');
      asserts.assertStringIncludes(err.message, 'invalid signature');
    }
  });

  it('maps 409 (duplicate client_order_id) to ORDER_REJECTED, not UNKNOWN_ERROR', async () => {
    const client = authedClient();
    client.setResponse({
      error: {
        code: 'duplicate_client_order_id',
        message: 'order already exists',
      },
    }, 409);
    try {
      await client.getBalance();
      asserts.fail('expected a throw');
    } catch (err) {
      asserts.assert(err instanceof KalshiError);
      asserts.assertEquals(err.code, 'ORDER_REJECTED');
      asserts.assertStringIncludes(err.message, 'order already exists');
    }
  });

  it('maps 500 to SERVICE_UNAVAILABLE', async () => {
    const client = new MockKalshi();
    client.setResponse({}, 500);
    try {
      await client.getMarkets();
      asserts.fail('expected a throw');
    } catch (err) {
      asserts.assert(err instanceof KalshiError);
      asserts.assertEquals(err.code, 'SERVICE_UNAVAILABLE');
    }
  });

  it('never leaks the signing key or the signature header in a thrown error', async () => {
    const client = authedClient();
    client.setResponse({ error: { code: 'bad', message: 'nope' } }, 400);
    try {
      await client.getBalance();
      asserts.fail('expected a throw');
    } catch (err) {
      asserts.assert(err instanceof KalshiError);
      const json = JSON.stringify(err.toJSON ? err.toJSON() : {});
      asserts.assertEquals(json.includes(TEST_PEM), false);
    }
  });
});

// Live tests are a `describe` block appended to this file, gated on real
// Kalshi credentials being present — see CONVENTIONS.md's "Tests" section.
// Add the matching CONNECTOR_KALSHI_* vars to .env.sample once verified.

describe('Kalshi — query filters and rethrow paths', () => {
  // Every optional filter branch in one call per list method, so the
  // wire mapping (camelCase option -> snake_case param) is pinned.
  const has = (client: MockKalshi, ...parts: string[]) => {
    const url = client.lastRequest!.url;
    for (const part of parts) {
      asserts.assert(url.includes(part), `${part} in ${url}`);
    }
  };

  it('getMarkets maps every filter to its query param', async () => {
    const client = authedClient();
    client.setResponse({ markets: [] });
    await client.getMarkets({
      seriesTicker: 'S',
      eventTicker: 'E',
      status: 'open',
      tickers: ['A', 'B'],
      cursor: 'c1',
      limit: 5,
      minCloseTs: 1,
      maxCloseTs: 2,
    });
    has(
      client,
      'series_ticker=S',
      'event_ticker=E',
      'status=open',
      'tickers=A',
      'cursor=c1',
      'limit=5',
      'min_close_ts=1',
      'max_close_ts=2',
    );
  });

  it('getMarkets accepts a single ticker string as the tickers filter', async () => {
    const client = authedClient();
    client.setResponse({ markets: [] });
    await client.getMarkets({ tickers: 'ONLY' });
    has(client, 'tickers=ONLY');
  });

  it('getOrderbook omits depth when none is given', async () => {
    const client = authedClient();
    client.setResponse({ orderbook_fp: { yes_dollars: [], no_dollars: [] } });
    await client.getOrderbook('T');
    asserts.assertEquals(client.lastRequest!.url.includes('depth='), false);
  });

  it('getTrades maps every filter', async () => {
    const client = authedClient();
    client.setResponse({ trades: [] });
    await client.getTrades({
      ticker: 'T',
      cursor: 'c',
      limit: 3,
      minTs: 10,
      maxTs: 20,
    });
    has(client, 'ticker=T', 'cursor=c', 'limit=3', 'min_ts=10', 'max_ts=20');
  });

  it('getEvents maps every filter', async () => {
    const client = authedClient();
    client.setResponse({ events: [] });
    await client.getEvents({
      seriesTicker: 'S',
      status: 'open',
      tickers: ['E1', 'E2'],
      cursor: 'c',
      limit: 4,
      withNestedMarkets: true,
    });
    has(
      client,
      'series_ticker=S',
      'status=open',
      'tickers=E1',
      'cursor=c',
      'limit=4',
      'with_nested_markets=true',
    );
  });

  it('getEvent forwards withNestedMarkets', async () => {
    const client = authedClient();
    client.setResponse({ event: { event_ticker: 'E', title: 'T' } });
    await client.getEvent('E', true);
    has(client, 'with_nested_markets=true');
  });

  it('getSeriesList maps every filter', async () => {
    const client = authedClient();
    client.setResponse({ series: [] });
    await client.getSeriesList({
      category: 'Fin',
      tags: 'btc',
      includeVolume: true,
    });
    has(client, 'category=Fin', 'tags=btc', 'include_volume=true');
  });

  it('getSeries forwards includeVolume', async () => {
    const client = authedClient();
    client.setResponse({ series: { ticker: 'K', title: 'T' } });
    await client.getSeries('K', false);
    has(client, 'include_volume=false');
  });

  it('getPositions maps every filter', async () => {
    const client = authedClient();
    client.setResponse({ market_positions: [] });
    await client.getPositions({
      ticker: 'T',
      eventTicker: 'E',
      cursor: 'c',
      limit: 2,
      countFilter: 'position',
    });
    has(
      client,
      'ticker=T',
      'event_ticker=E',
      'cursor=c',
      'limit=2',
      'count_filter=position',
    );
  });

  it('getFills maps every filter', async () => {
    const client = authedClient();
    client.setResponse({ fills: [] });
    await client.getFills({
      ticker: 'T',
      orderId: 'o1',
      cursor: 'c',
      limit: 2,
      minTs: 1,
      maxTs: 9,
    });
    has(
      client,
      'ticker=T',
      'order_id=o1',
      'cursor=c',
      'limit=2',
      'min_ts=1',
      'max_ts=9',
    );
  });

  it('getOrders maps every filter', async () => {
    const client = authedClient();
    client.setResponse({ orders: [] });
    await client.getOrders({
      ticker: 'T',
      eventTicker: 'E',
      status: 'resting',
      cursor: 'c',
      limit: 2,
      minTs: 1,
      maxTs: 9,
    });
    has(
      client,
      'ticker=T',
      'event_ticker=E',
      'status=resting',
      'cursor=c',
      'limit=2',
      'min_ts=1',
      'max_ts=9',
    );
  });

  // The null-on-404 lookups must rethrow anything that is NOT a 404 —
  // swallowing a 5xx into `null` would read as "does not exist".
  for (
    const [name, call] of [
      ['getMarket', (c: MockKalshi) => c.getMarket('T')],
      ['getEvent', (c: MockKalshi) => c.getEvent('E')],
      ['getSeries', (c: MockKalshi) => c.getSeries('K')],
    ] as const
  ) {
    it(`${name} rethrows a non-404 failure instead of resolving null`, async () => {
      const client = authedClient();
      client.setResponse({ error: 'boom' }, 500);
      const err = await asserts.assertRejects(() => call(client), KalshiError);
      asserts.assertEquals(err.code, 'SERVICE_UNAVAILABLE');
    });
  }

  it('amendOrder forwards clientOrderId and updatedClientOrderId', async () => {
    const client = authedClient();
    client.setResponse({ order_id: 'o1', remaining_count: '2.00', ts_ms: 2 });
    await client.amendOrder('o1', {
      ticker: 'T',
      side: 'BUY',
      price: 0.4,
      count: 1,
      clientOrderId: 'c1',
      updatedClientOrderId: 'c2',
    });
    const body = JSON.parse(client.lastRequest!.body!);
    asserts.assertEquals(body.client_order_id, 'c1');
    asserts.assertEquals(body.updated_client_order_id, 'c2');
  });

  it('amendOrder remaps a vendor 400 to ORDER_REJECTED', async () => {
    const client = authedClient();
    client.setResponse(
      { error: { code: 'bad', message: 'price off tick' } },
      400,
    );
    const err = await asserts.assertRejects(
      () =>
        client.amendOrder('o1', {
          ticker: 'T',
          side: 'BUY',
          price: 0.4,
          count: 1,
        }),
      KalshiError,
    );
    asserts.assertEquals(err.code, 'ORDER_REJECTED');
    asserts.assertEquals(err.getContextValue('detail'), 'price off tick');
  });

  it('submitOrders remaps a whole-batch vendor 400 to ORDER_REJECTED', async () => {
    const client = authedClient();
    client.setResponse(
      { error: { code: 'bad', message: 'batch refused' } },
      400,
    );
    const err = await asserts.assertRejects(
      () =>
        client.submitOrders([{
          ticker: 'T',
          side: 'BUY',
          price: 0.4,
          count: 1,
          orderType: 'GTC',
        }]),
      KalshiError,
    );
    asserts.assertEquals(err.code, 'ORDER_REJECTED');
  });

  it('cancelOrders returns [] for an empty input without any request', async () => {
    const client = authedClient();
    asserts.assertEquals(await client.cancelOrders([]), []);
    asserts.assertEquals(client.requests.length, 0);
  });
});

const env = envArgs();
const credentials = {
  accessKey: env.get('CONNECTOR_KALSHI_ACCESS_KEY'),
  privateKeyPem: env.get('CONNECTOR_KALSHI_PRIVATE_KEY_PEM'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'Kalshi — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('proves RSA-PSS auth against the real API (balance) and reads public market data', async () => {
      const client = new Kalshi({
        auth: {
          type: 'CUSTOM',
          accessKey: credentials.accessKey!,
          privateKeyPem: credentials.privateKeyPem!,
        },
        baseURL: env.get('CONNECTOR_KALSHI_BASE_URL') || DEMO_API,
      });
      const balance = await client.getBalance();
      asserts.assertEquals(typeof balance.balance, 'number');

      const page = await client.getMarkets({ status: 'open', limit: 1 });
      asserts.assert(Array.isArray(page.markets));
    });
  },
});
