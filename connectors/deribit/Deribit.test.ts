import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import {
  Deribit,
  DERIBIT_HISTORY_URL,
  DERIBIT_REST_URLS,
  deribitExpiryCode,
} from './Deribit.ts';
import { DeribitError } from './errors/mod.ts';

const envelope = (result: unknown) => ({
  jsonrpc: '2.0',
  result,
  usIn: 1794003598052372,
  usOut: 1794003598052540,
  usDiff: 168,
  testnet: false,
});

const instrument = (name: string, expiry: number, strike?: number) => ({
  instrument_name: name,
  kind: strike ? 'option' : 'future',
  base_currency: 'BTC',
  quote_currency: 'BTC',
  expiration_timestamp: expiry,
  creation_timestamp: 1793692810000,
  is_active: true,
  tick_size: 0.0001,
  contract_size: 1,
  min_trade_amount: 0.1,
  ...(strike && { strike, option_type: 'call' }),
});

class MockDeribit extends Deribit {
  public requests: URL[] = [];

  respond(text: string | ((url: URL) => string), status = 200): this {
    this._fetch = (input) => {
      const url = new URL(String(input));
      this.requests.push(url);
      return Promise.resolve(
        new Response(typeof text === 'function' ? text(url) : text, {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
    return this;
  }

  json(body: unknown, status = 200): this {
    return this.respond(JSON.stringify(body), status);
  }

  get last(): URL {
    return this.requests.at(-1)!;
  }
}

describe('Deribit', () => {
  it('targets production by default, testnet on request', () => {
    asserts.assertEquals(new MockDeribit().environment, 'production');
    const testnet = new MockDeribit({ environment: 'testnet' }).json(
      envelope([]),
    );
    asserts.assertEquals(testnet.environment, 'testnet');
    const err = asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => new MockDeribit({ environment: 'mainnet' as any }),
      DeribitError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_OPTION');
  });

  it('calls public methods with snake_case params on the right host', async () => {
    const client = new MockDeribit({ environment: 'testnet' }).json(
      envelope([instrument('BTC-PERPETUAL', 32503708800000)]),
    );
    const [perp] = await client.getInstruments({
      currency: 'BTC',
      kind: 'future',
      expired: false,
    });
    asserts.assertEquals(
      client.last.href.split('?')[0],
      `${DERIBIT_REST_URLS.testnet}/public/get_instruments`,
    );
    asserts.assertEquals(Object.fromEntries(client.last.searchParams), {
      currency: 'BTC',
      kind: 'future',
      expired: 'false',
    });
    asserts.assertEquals(perp?.instrumentName, 'BTC-PERPETUAL');
  });

  it('filters the option chain by expiry code or timestamp', async () => {
    const client = new MockDeribit().json(envelope([
      instrument('BTC-7NOV26-68000-C', 1794038400000, 68000),
      instrument('BTC-8NOV26-70000-C', 1794124800000, 70000),
    ]));
    const byCode = await client.getOptionChain({
      currency: 'BTC',
      expiry: '7nov26',
    });
    asserts.assertEquals(byCode.map((o) => o.instrumentName), [
      'BTC-7NOV26-68000-C',
    ]);
    asserts.assertEquals(client.last.searchParams.get('kind'), 'option');
    const byTime = await client.getOptionChain({
      currency: 'BTC',
      expiry: 1794124800000,
    });
    asserts.assertEquals(byTime.map((o) => o.strike), [70000]);
    asserts.assertEquals(
      (await client.getOptionChain({ currency: 'BTC' })).length,
      2,
    );
    asserts.assertEquals(deribitExpiryCode(1794038400000), '7NOV26');
  });

  it('keeps trade ids wider than 2^53 exact over REST', async () => {
    const client = new MockDeribit().respond(
      '{"jsonrpc":"2.0","result":{"trades":[{"timestamp":1794004702749,"price":75925.5,"direction":"sell","index_price":75904.97,"instrument_name":"BTC-PERPETUAL","trade_seq":315283464,"amount":1.0e4,"mark_price":75927.83,"tick_direction":3,"starbase_match_id":244592457113677835,"trade_id":"462304647","contracts":1.0e3,"starbase_timestamp":1794004702749505936}],"has_more":true},"usIn":1,"usOut":2,"usDiff":1,"testnet":false}',
    );
    const page = await client.getLastTradesByInstrument({
      instrumentName: 'BTC-PERPETUAL',
      startSeq: 315283464,
      count: 1,
      sorting: 'asc',
    });
    asserts.assertEquals(Object.fromEntries(client.last.searchParams), {
      instrument_name: 'BTC-PERPETUAL',
      start_seq: '315283464',
      count: '1',
      sorting: 'asc',
    });
    const [t] = page.trades;
    asserts.assertEquals(t?.starbaseMatchId, '244592457113677835');
    asserts.assertEquals(t?.starbaseTimestamp, '1794004702749505936');
    asserts.assertEquals(t?.amount, 10000);
    asserts.assertEquals(page.hasMore, true);
  });

  it('reads the trade archive from history.deribit.com, production only', async () => {
    const client = new MockDeribit().json(
      envelope({ trades: [], has_more: false }),
    );
    await client.getLastTradesByCurrencyAndTime({
      currency: 'BTC',
      kind: 'option',
      startTimestamp: 1735689600000,
      endTimestamp: 1735693200000,
      source: 'history',
    });
    asserts.assertEquals(
      client.last.href.split('?')[0],
      `${DERIBIT_HISTORY_URL}/public/get_last_trades_by_currency_and_time`,
    );
    asserts.assertEquals(
      client.last.searchParams.get('start_timestamp'),
      '1735689600000',
    );
    asserts.assertEquals(client.last.searchParams.has('source'), false);
    const testnet = new MockDeribit({ environment: 'testnet' });
    const err = await asserts.assertRejects(
      () =>
        testnet.getLastTradesByInstrumentAndTime({
          instrumentName: 'BTC-PERPETUAL',
          startTimestamp: 1,
          endTimestamp: 2,
          source: 'history',
        }),
      DeribitError,
    );
    asserts.assertEquals(err.code, 'INVALID_REQUEST');
  });

  it('wraps the other public endpoints', async () => {
    const client = new MockDeribit();
    const cases: [() => Promise<unknown>, string, unknown][] = [
      [
        () =>
          client.getBookSummaryByCurrency({ currency: 'BTC', kind: 'option' }),
        '/public/get_book_summary_by_currency',
        [],
      ],
      [
        () => client.getBookSummaryByInstrument('BTC-PERPETUAL'),
        '/public/get_book_summary_by_instrument',
        [],
      ],
      [
        () => client.getExpirations({ currency: 'BTC', kind: 'option' }),
        '/public/get_expirations',
        { btc: { option: ['7NOV26'] } },
      ],
      [
        () => client.getIndexPrice('btc_usd'),
        '/public/get_index_price',
        { index_price: 1, estimated_delivery_price: 1 },
      ],
      [
        () =>
          client.getOrderBook({ instrumentName: 'BTC-PERPETUAL', depth: 5 }),
        '/public/get_order_book',
        {
          timestamp: 1,
          state: 'open',
          change_id: 1,
          instrument_name: 'BTC-PERPETUAL',
          bids: [],
          asks: [],
        },
      ],
      [
        () =>
          client.getVolatilityIndexData({
            currency: 'BTC',
            startTimestamp: 1,
            endTimestamp: 2,
            resolution: 60,
          }),
        '/public/get_volatility_index_data',
        { data: [], continuation: null },
      ],
    ];
    for (const [call, path, result] of cases) {
      client.json(envelope(result));
      await call();
      asserts.assertEquals(client.last.pathname, `/api/v2${path}`);
    }
    asserts.assertEquals(client.last.searchParams.get('resolution'), '60');
  });

  it('returns the whole envelope from call(), public methods only', async () => {
    const client = new MockDeribit().json(envelope({ version: '1.2.26' }));
    const env = await client.call('public/test');
    asserts.assertEquals(env.usDiff, 168);
    asserts.assertEquals(env.result, { version: '1.2.26' });
    const err = await asserts.assertRejects(
      () => client.call('private/get_positions'),
      DeribitError,
    );
    asserts.assertEquals(err.code, 'INVALID_REQUEST');
  });

  it("maps JSON-RPC error codes, keeping Deribit's code and message", async () => {
    const cases: [number, string, string][] = [
      [-32602, 'Invalid params', 'BAD_REQUEST'],
      [-32601, 'Method not found', 'NOT_FOUND'],
      [10028, 'too_many_requests', 'RATE_LIMITED'],
      [13009, 'unauthorized', 'UNAUTHORIZED'],
      [13028, 'temporarily_unavailable', 'SERVICE_UNAVAILABLE'],
    ];
    for (const [vendorCode, message, code] of cases) {
      const client = new MockDeribit().json({
        jsonrpc: '2.0',
        error: { code: vendorCode, message, data: { reason: 'r', param: 'p' } },
        testnet: false,
      }, 400);
      const err = await asserts.assertRejects(
        () => client.getInstruments({ currency: 'XYZ' }),
        DeribitError,
      );
      asserts.assertEquals(err.code, code);
      asserts.assertEquals(err.getContextValue('vendorCode'), vendorCode);
      asserts.assertEquals(err.getContextValue('vendorMessage'), message);
    }
    const down = new MockDeribit().respond('<html>bad gateway</html>', 502);
    const err = await asserts.assertRejects(
      () => down.getIndexPrice('btc_usd'),
      DeribitError,
    );
    asserts.assertEquals(err.code, 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(err.transient, true);
  });

  it('rejects a malformed result as RESPONSE_ERROR', async () => {
    const client = new MockDeribit().json(envelope([{ kind: 'option' }]));
    const err = await asserts.assertRejects(
      () => client.getInstruments({ currency: 'BTC' }),
      DeribitError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });
});

describe('Deribit — transport failures', () => {
  it('throws a transient TIMEOUT when no answer arrives within the timeout', async () => {
    const c = new MockDeribit({ timeout: 1 });
    c['_fetch'] = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason));
      });
    const err = await asserts.assertRejects(
      () => c.getIndexPrice('btc_usd'),
      DeribitError,
    );
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
  });

  it('throws a transient NETWORK_ERROR when fetch itself fails', async () => {
    const c = new MockDeribit();
    c['_fetch'] = () => Promise.reject(new TypeError('error sending request'));
    const err = await asserts.assertRejects(
      () => c.getIndexPrice('btc_usd'),
      DeribitError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
  });
});

describe('Deribit — maxRetryWait (RESTler rate-limit retry)', () => {
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockDeribit({ maxRetryWait });
    const slept: number[] = [];
    let calls = 0;
    c['_sleep'] = (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    };
    c['_fetch'] = () => {
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
      () => c.getIndexPrice('btc_usd'),
      DeribitError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws RATE_LIMITED immediately with retried: false when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(
      () => c.getIndexPrice('btc_usd'),
      DeribitError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

const env = envArgs();
// Deribit's public REST API needs no key.
const publicLive = !!env.get('LIVE_TEST_PUBLIC');

describe({
  name: 'Deribit — live',
  ignore: !publicLive,
  bun: false,
  node: false,
  fn: () => {
    const deribit = new Deribit();

    it('discovers the nearest BTC option expiry and its chain', async () => {
      const exp = await deribit.getExpirations({
        currency: 'BTC',
        kind: 'option',
      });
      const first = exp.btc?.option?.[0];
      asserts.assertExists(first);
      const chain = await deribit.getOptionChain({
        currency: 'BTC',
        expiry: first,
      });
      asserts.assert(chain.length > 0);
      asserts.assert(chain.every((o) => o.instrumentName.includes(first)));
    });

    it('reads option book summaries with mark IV', async () => {
      const rows = await deribit.getBookSummaryByCurrency({
        currency: 'BTC',
        kind: 'option',
      });
      asserts.assert(rows.some((r) => typeof r.markIv === 'number'));
    });

    it('reads trades with exact starbase ids, live and from history', async () => {
      const live = await deribit.getLastTradesByInstrument({
        instrumentName: 'BTC-PERPETUAL',
        count: 5,
      });
      asserts.assert(
        live.trades.every((t) => /^\d+$/.test(t.starbaseTimestamp ?? '0')),
      );
      const old = await deribit.getLastTradesByCurrencyAndTime({
        currency: 'BTC',
        kind: 'option',
        startTimestamp: 1735689600000,
        endTimestamp: 1735693200000,
        count: 1,
        source: 'history',
      });
      asserts.assertEquals(old.trades.length, 1);
    });

    it('surfaces an unknown currency as BAD_REQUEST', async () => {
      const err = await asserts.assertRejects(
        () => deribit.getInstruments({ currency: 'XYZ' }),
        DeribitError,
      );
      asserts.assertEquals(err.code, 'BAD_REQUEST');
      asserts.assertEquals(err.getContextValue('vendorCode'), -32602);
    });
  },
});
