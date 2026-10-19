import { afterEach, beforeEach, describe, it } from '@test';
import { assert, assertEquals, assertThrows } from '@asserts';
import { KalshiError } from '../errors/mod.ts';
import {
  KALSHI_DEMO_WS_URL,
  KALSHI_WS_URL,
  KalshiSocket,
  type KalshiSocketEvent,
} from './KalshiSocket.ts';
import {
  collectUntil,
  type MockConnection,
  MockFeedServer,
} from './fixtures/MockFeedServer.ts';
import { envArgs } from '@utils';

async function keyPair(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
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
  const b64 = btoa(binary).match(/.{1,64}/g)!.join('\n');
  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`,
    publicKey,
  };
}

const fromB64 = (b64: string) =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const isType = (t: string) => (e: KalshiSocketEvent) => e.type === t;

/** Ack every subscribe command with sid = 10 + n. */
function autoAck(conn: MockConnection): () => void {
  let acked = 0;
  const timer = setInterval(() => {
    const cmds = conn.json() as {
      id: number;
      cmd: string;
      params?: { channels?: string[] };
    }[];
    const subs = cmds.filter((c) => c.cmd === 'subscribe');
    while (acked < subs.length) {
      const cmd = subs[acked]!;
      acked++;
      conn.send({
        id: cmd.id,
        type: 'subscribed',
        msg: { channel: cmd.params?.channels?.[0], sid: 10 + acked },
      });
    }
  }, 5);
  return () => clearInterval(timer);
}

describe('KalshiSocket', () => {
  let server: MockFeedServer;
  let socket: KalshiSocket | undefined;
  let stopAck: (() => void) | undefined;
  let pem: string;
  let publicKey: CryptoKey;

  beforeEach(async () => {
    server = await MockFeedServer.start();
    ({ pem, publicKey } = await keyPair());
  });
  afterEach(async () => {
    stopAck?.();
    stopAck = undefined;
    await socket?.close();
    socket = undefined;
    await server.stop();
  });

  it('requires credentials', () => {
    const err = assertThrows(
      () => new KalshiSocket({ auth: { accessKey: '', privateKeyPem: '' } }),
      KalshiError,
    );
    assertEquals(err.code, 'SOCKET_MISSING_CREDENTIALS');
    const bad = assertThrows(
      () =>
        new KalshiSocket({ auth: { accessKey: 'k', privateKeyPem: 'nope' } }),
      KalshiError,
    );
    assertEquals(bad.code, 'CONFIG_INVALID_PRIVATE_KEY');
  });

  it('signs the handshake over GET + the WS path, fresh on every connection', async () => {
    socket = new KalshiSocket({
      url: server.url('/trade-api/ws/v2'),
      auth: { accessKey: 'key-id', privateKeyPem: pem },
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const first = await server.connection(1);
    assertEquals(first.headers['kalshi-access-key'], 'key-id');
    const ts = first.headers['kalshi-access-timestamp']!;
    assert(/^\d{13}$/.test(ts));
    const ok = await crypto.subtle.verify(
      { name: 'RSA-PSS', saltLength: 32 },
      publicKey,
      fromB64(first.headers['kalshi-access-signature']!),
      new TextEncoder().encode(`${ts}GET/trade-api/ws/v2`),
    );
    assert(ok, 'signature verifies against the public key');

    await new Promise((r) => setTimeout(r, 5));
    first.close();
    await collectUntil(it, (e) => e.type === 'connected' && e.reconnected);
    const second = await server.connection(2);
    assert(
      second.headers['kalshi-access-signature'] !==
        first.headers['kalshi-access-signature'],
    );
  });

  it('accepts an injected signer so the key never enters JS', async () => {
    const messages: string[] = [];
    socket = new KalshiSocket({
      url: server.url('/trade-api/ws/v2'),
      auth: {
        accessKey: 'k',
        signer: {
          sign: (message) => {
            messages.push(message);
            return Promise.resolve('c2lnbmVk');
          },
        },
      },
    });
    await socket.connect();
    const conn = await server.connection();
    assertEquals(conn.headers['kalshi-access-signature'], 'c2lnbmVk');
    assert(/^\d{13}GET\/trade-api\/ws\/v2$/.test(messages[0]!));
  });

  it('subscribes one channel per command and resubscribes after reconnect', async () => {
    socket = new KalshiSocket({
      url: server.url(),
      auth: { accessKey: 'k', privateKeyPem: pem },
      subscriptions: [
        { channel: 'orderbook_delta', marketTickers: ['A'] },
        { channel: 'fill' },
      ],
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const first = await server.connection(1);
    await first.waitFor((f) => f.includes('"fill"'));
    assertEquals(first.json(), [
      {
        id: 1,
        cmd: 'subscribe',
        params: { channels: ['orderbook_delta'], market_tickers: ['A'] },
      },
      { id: 2, cmd: 'subscribe', params: { channels: ['fill'] } },
    ]);
    first.close();
    await collectUntil(it, (e) => e.type === 'connected' && e.reconnected);
    const second = await server.connection(2);
    await second.waitFor((f) => f.includes('"fill"'));
    assertEquals(second.json().length, 2);
  });

  it('adds and removes markets on the acked sid, and unsubscribes by sid', async () => {
    socket = new KalshiSocket({
      url: server.url(),
      auth: { accessKey: 'k', privateKeyPem: pem },
    });
    await socket.connect();
    const conn = await server.connection();
    stopAck = autoAck(conn);
    socket.subscribe('orderbook_delta', ['A']);
    socket.subscribe('orderbook_delta', ['B']); // before the ack: reconciled after it
    await conn.waitFor((f) => f.includes('add_markets'));
    socket.unsubscribe('orderbook_delta', ['A']);
    await conn.waitFor((f) => f.includes('delete_markets'));
    socket.unsubscribe('orderbook_delta');
    await conn.waitFor((f) => f.includes('"unsubscribe"'));
    const cmds = conn.json() as {
      cmd: string;
      params: Record<string, unknown>;
    }[];
    assertEquals(cmds.map((c) => c.cmd), [
      'subscribe',
      'update_subscription',
      'update_subscription',
      'unsubscribe',
    ]);
    assertEquals(cmds[1]!.params, {
      sids: [11],
      market_tickers: ['B'],
      action: 'add_markets',
    });
    assertEquals(cmds[2]!.params, {
      sids: [11],
      market_tickers: ['A'],
      action: 'delete_markets',
    });
    assertEquals(cmds[3]!.params, { sids: [11] });
  });

  it('parses snapshots and deltas, tracks seq per sid, and reports gaps', async () => {
    socket = new KalshiSocket({
      url: server.url(),
      auth: { accessKey: 'k', privateKeyPem: pem },
      includeRaw: true,
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    const market = { market_ticker: 'FED-23DEC-T3.00', market_id: '9b0f6b43' };
    conn.send({
      type: 'orderbook_snapshot',
      sid: 2,
      seq: 1,
      sending_ts_ms: 1669149841234,
      msg: {
        ...market,
        yes_dollars_fp: [['0.0800', '300.00'], ['0.2200', '333.00']],
      },
    });
    conn.send({
      type: 'orderbook_delta',
      sid: 2,
      seq: 2,
      msg: {
        ...market,
        price_dollars: '0.9600',
        delta_fp: '-54.00',
        side: 'yes',
        ts_ms: 1669149841000,
      },
    });
    conn.send({
      type: 'orderbook_delta',
      sid: 2,
      seq: 5,
      msg: {
        ...market,
        price_dollars: '0.9500',
        delta_fp: '10.00',
        side: 'no',
      },
    });
    const events = await collectUntil(
      it,
      (e) => e.type === 'orderbook_delta' && e.seq === 5,
    );
    assertEquals(events.map((e) => e.type), [
      'orderbook_snapshot',
      'orderbook_delta',
      'gap',
      'orderbook_delta',
    ]);
    const snap = events[0];
    assert(snap?.type === 'orderbook_snapshot');
    assertEquals(snap.data.yes, [{ price: 0.08, count: 300 }, {
      price: 0.22,
      count: 333,
    }]);
    assertEquals(snap.data.no, []);
    assertEquals(snap.venueTimestamp, 1669149841234);
    assertEquals([snap.sid, snap.seq], [2, 1]);
    const delta = events[1];
    assert(delta?.type === 'orderbook_delta');
    assertEquals([delta.data.price, delta.data.delta], [0.96, -54]);
    assertEquals(delta.venueTimestamp, 1669149841000);
    assert(delta.raw?.includes('"delta_fp":"-54.00"'));
    const gap = events[2];
    assert(gap?.type === 'gap');
    assertEquals([gap.stream, gap.expected, gap.received], ['sid:2', 3, 5]);
  });

  it('requests a snapshot on the orderbook sid', async () => {
    socket = new KalshiSocket({
      url: server.url(),
      auth: { accessKey: 'k', privateKeyPem: pem },
      subscriptions: [{ channel: 'orderbook_delta', marketTickers: ['A'] }],
    });
    assertEquals(socket.requestSnapshot(['A']), false);
    await socket.connect();
    const conn = await server.connection();
    stopAck = autoAck(conn);
    const deadline = Date.now() + 2_000;
    while (!socket.requestSnapshot(['A']) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    await conn.waitFor((f) => f.includes('get_snapshot'));
  });

  it('parses trades, fills, user orders, tickers and positions; reports error frames', async () => {
    socket = new KalshiSocket({
      url: server.url(),
      auth: { accessKey: 'k', privateKeyPem: pem },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    conn.send({
      type: 'trade',
      sid: 11,
      seq: 1,
      msg: {
        trade_id: 'd91b',
        market_ticker: 'HIGHNY-22DEC23-B53.5',
        yes_price_dollars: '0.3600',
        no_price_dollars: '0.6400',
        count_fp: '136.00',
        taker_side: 'no',
        is_block_trade: false,
        ts: 1669149841,
        ts_ms: 1669149841000,
      },
    });
    conn.send({
      type: 'fill',
      sid: 12,
      msg: {
        trade_id: 't',
        order_id: 'o',
        market_ticker: 'M',
        is_taker: true,
        side: 'yes',
        yes_price_dollars: '0.3500',
        count_fp: '3.00',
        fee_cost: '0.02',
        action: 'buy',
        post_position_fp: '3.00',
        ts_ms: 1669149841001,
      },
    });
    conn.send({
      type: 'user_order',
      sid: 13,
      msg: {
        order_id: 'o',
        ticker: 'M',
        status: 'resting',
        side: 'yes',
        yes_price_dollars: '0.3500',
        remaining_count_fp: '10.00',
        created_ts_ms: null,
      },
    });
    conn.send({
      type: 'ticker',
      sid: 14,
      msg: {
        market_ticker: 'M',
        price_dollars: '0.4800',
        yes_bid_dollars: '0.4700',
        yes_ask_dollars: '0.4900',
        dollar_volume: 100,
        ts_ms: 5,
      },
    });
    conn.send({
      type: 'market_position',
      sid: 15,
      msg: {
        market_ticker: 'M',
        position_fp: '-2.00',
        realized_pnl_dollars: '1.5000',
      },
    });
    conn.send({
      type: 'market_lifecycle_v2',
      sid: 16,
      msg: { event_type: 'created' },
    });
    conn.send({
      id: 9,
      type: 'error',
      msg: { code: 8, msg: 'Unknown channel name' },
    });
    const events = await collectUntil(it, isType('error'));
    assertEquals(events.map((e) => e.type), [
      'trade',
      'fill',
      'user_order',
      'ticker',
      'market_position',
      'unknown',
      'error',
    ]);
    const [trade, fill, order, ticker, position, , error] = events;
    assert(
      trade?.type === 'trade' && trade.data.count === 136 &&
        trade.data.yesPrice === 0.36,
    );
    assert(
      fill?.type === 'fill' && fill.data.isTaker &&
        fill.data.postPosition === 3,
    );
    assert(order?.type === 'user_order' && order.data.remainingCount === 10);
    assertEquals(
      (order as { data: { createdTsMs?: number } }).data.createdTsMs,
      undefined,
    );
    assert(
      ticker?.type === 'ticker' && ticker.data.yesAsk === 0.49 &&
        ticker.data.dollarVolume === 100,
    );
    assert(
      position?.type === 'market_position' && position.data.position === -2,
    );
    assert(error?.type === 'error' && !error.fatal);
    assertEquals(error.error.getContextValue('venueCode'), 8);
  });

  it('probes liveness with list_subscriptions and reconnects without a reply', async () => {
    socket = new KalshiSocket({
      url: server.url(),
      auth: { accessKey: 'k', privateKeyPem: pem },
      heartbeatIntervalMs: 20,
      idleTimeoutMs: 150,
      reconnect: { initialDelayMs: 5, maxDelayMs: 10 },
    });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, isType('connected'));
    const conn = await server.connection();
    await conn.waitFor((f) => f.includes('list_subscriptions'));
    await collectUntil(it, (e) => e.type === 'connected' && e.reconnected);
  });
});

// ── Live ─────────────────────────────────────────────────────────────────────
// Same credentials as the REST live test (demo by default — set
// CONNECTOR_KALSHI_BASE_URL to a production host to test production).
// Read-only: subscribes to public channels and the account's fills.

const liveEnv = envArgs();
const liveAuth = {
  accessKey: liveEnv.get('CONNECTOR_KALSHI_ACCESS_KEY') ?? '',
  privateKeyPem: (liveEnv.get('CONNECTOR_KALSHI_PRIVATE_KEY_PEM') ?? '')
    .replace(/\\n/g, '\n'),
};
const liveTestsEnabled = Object.values(liveAuth).every((v) => !!v);
const liveUrl =
  (liveEnv.get('CONNECTOR_KALSHI_BASE_URL') ?? '').includes('demo') ||
    !liveEnv.get('CONNECTOR_KALSHI_BASE_URL')
    ? KALSHI_DEMO_WS_URL
    : KALSHI_WS_URL;

describe({
  name: 'KalshiSocket — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('signs the handshake and streams market tickers', async () => {
      const socket = new KalshiSocket({
        url: liveUrl,
        auth: liveAuth,
        subscriptions: [{ channel: 'ticker' }, { channel: 'fill' }],
        signal: AbortSignal.timeout(30_000),
      });
      let ticker = false;
      for await (const event of socket) {
        if (event.type === 'error' || event.type === 'invalid') {
          throw event.error;
        }
        if (event.type === 'ticker') {
          ticker = true;
          break;
        }
      }
      assert(ticker, 'no ticker within 30s');
    });
  },
});
