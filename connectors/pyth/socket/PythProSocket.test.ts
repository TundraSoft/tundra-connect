import { afterEach, beforeEach, describe, it } from '@test';
import { assert, assertEquals, assertThrows } from '@asserts';
import { envArgs } from '@utils';
import { PythError } from '../errors/mod.ts';
import {
  PYTH_PRO_ENDPOINTS,
  PYTH_PRO_PROPERTIES,
  PythProSocket,
  type PythProSocketEvent,
} from './PythProSocket.ts';
import {
  collectUntil,
  type MockConnection,
  MockFeedServer,
} from './fixtures/MockFeedServer.ts';

const TOKEN = 'test-token';

const update = (
  subscriptionId: number,
  ts: number,
  feeds: { id: number; price?: string }[],
) => ({
  type: 'streamUpdated',
  subscriptionId,
  parsed: {
    timestampUs: String(ts),
    priceFeeds: feeds.map((f) => ({
      priceFeedId: f.id,
      price: f.price ?? '100000000',
      exponent: -8,
      publisherCount: 9,
      feedUpdateTimestamp: ts,
    })),
  },
});

const isType = (t: string) => (e: PythProSocketEvent) => e.type === t;

/** Wait until every server has a connection that received a subscribe. */
async function subscribed(servers: MockFeedServer[], n = 1) {
  const conns: MockConnection[] = [];
  for (const server of servers) {
    const conn = await server.connection(n);
    await conn.waitFor((f) => f.includes('"subscribe"'));
    conns.push(conn);
  }
  return conns;
}

describe('PythProSocket', () => {
  let servers: MockFeedServer[];
  let socket: PythProSocket | undefined;

  beforeEach(async () => {
    servers = await Promise.all([1, 2, 3].map(() => MockFeedServer.start()));
  });
  afterEach(async () => {
    await socket?.close();
    socket = undefined;
    await Promise.all(servers.map((s) => s.stop()));
  });

  const make = (
    extra: Partial<ConstructorParameters<typeof PythProSocket>[0]> = {},
  ) =>
    new PythProSocket({
      auth: { type: 'BEARER', token: TOKEN },
      endpoints: servers.map((s) => s.url('/v1/stream')),
      subscriptions: [{ priceFeedIds: [1, 2] }],
      reconnect: { initialDelayMs: 5, maxDelayMs: 20 },
      ...extra,
    });

  it('defaults to the three documented endpoints and every property', () => {
    assertEquals(PYTH_PRO_ENDPOINTS.length, 3);
    assert(PYTH_PRO_ENDPOINTS.every((u) => u.endsWith('/v1/stream')));
    assertEquals(PYTH_PRO_PROPERTIES.length, 13);
    assertEquals(
      assertThrows(
        () => new PythProSocket({ auth: { type: 'BEARER', token: '' } }),
        PythError,
      ).code,
      'SOCKET_MISSING_CREDENTIALS',
    );
    assertEquals(
      assertThrows(
        () =>
          new PythProSocket({
            auth: { type: 'BEARER', token: 't' },
            subscriptions: [{}],
          }),
        PythError,
      ).code,
      'SOCKET_INVALID_SUBSCRIPTION',
    );
  });

  it('connects to every endpoint with the token as a subprotocol, subscribing real_time with all properties', async () => {
    socket = make();
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, (e) => e.type === 'health' && e.state === 'up');
    const conns = await subscribed(servers);
    for (const conn of conns) {
      assertEquals(
        conn.headers['sec-websocket-protocol'],
        `pyth-lazer-auth, ${TOKEN}`,
      );
      assertEquals(conn.json()[0], {
        type: 'subscribe',
        subscriptionId: 1,
        properties: [...PYTH_PRO_PROPERTIES],
        formats: [],
        deliveryFormat: 'json',
        parsed: true,
        channel: 'real_time',
        ignoreInvalidFeedIds: true,
        priceFeedIds: [1, 2],
      });
    }
    assertEquals(socket.health, 'up');
  });

  it('can send the token as a Bearer header instead', async () => {
    socket = make({ authTransport: 'header' });
    await socket.connect();
    const conn = await servers[0]!.connection();
    assertEquals(conn.headers.authorization, `Bearer ${TOKEN}`);
  });

  it('merges the same update from three endpoints into one event per feed', async () => {
    socket = make({ includeRaw: true });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, (e) => e.type === 'health' && e.state === 'up');
    const conns = await subscribed(servers);
    const frame = update(1, 1_730_986_152_400_000, [{ id: 1 }, { id: 2 }]);
    conns[1]!.send(frame); // endpoint 2 is fastest
    await new Promise((r) => setTimeout(r, 30));
    conns[0]!.send(frame);
    conns[2]!.send(frame);
    conns[0]!.send(update(1, 1_730_986_152_401_000, [{ id: 1 }]));
    const events = await collectUntil(
      it,
      (e) => e.type === 'price' && e.timestampUs === 1_730_986_152_401_000,
    );
    const prices = events.filter((e) => e.type === 'price');
    assertEquals(prices.length, 3);
    const [a, b] = prices;
    assert(a?.type === 'price' && b?.type === 'price');
    assertEquals([a.data.priceFeedId, b.data.priceFeedId], [1, 2]);
    assertEquals(a.endpoint, servers[1]!.url('/v1/stream'));
    assertEquals(a.timestampUs, 1_730_986_152_400_000);
    assertEquals(a.data.price, '100000000');
    assertEquals(a.duplicate, false);
    assert(a.raw?.includes('streamUpdated'));
  });

  it('emitDuplicates emits every copy, tagged with the first arrival', async () => {
    socket = make({ emitDuplicates: true });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, (e) => e.type === 'health' && e.state === 'up');
    const conns = await subscribed(servers);
    const frame = update(1, 5_000_000, [{ id: 1 }]);
    for (const conn of conns) {
      conn.send(frame);
      await new Promise((r) => setTimeout(r, 10));
    }
    const events = await collectUntil(
      it,
      (e) => e.type === 'price' && e.endpoint === servers[2]!.url('/v1/stream'),
    );
    const prices = events.filter((e) => e.type === 'price');
    assertEquals(prices.length, 3);
    assertEquals(prices.map((p) => p.type === 'price' && p.duplicate), [
      false,
      true,
      true,
    ]);
    const copy = prices[2];
    assert(copy?.type === 'price');
    assertEquals(copy.firstSeen?.endpoint, servers[0]!.url('/v1/stream'));
    assert(copy.receivedAt >= copy.firstSeen!.receivedAt);
  });

  it('keeps streaming while one endpoint drops and reconnects, reporting health', async () => {
    socket = make();
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, (e) => e.type === 'health' && e.state === 'up');
    const conns = await subscribed(servers);
    conns[0]!.close(1012, 'deploy');
    const down = await collectUntil(
      it,
      (e) => e.type === 'health' && e.state === 'degraded',
    );
    assert(
      down.some((e) =>
        e.type === 'disconnected' &&
        e.endpoint === servers[0]!.url('/v1/stream')
      ),
    );
    conns[1]!.send(update(1, 7_000_000, [{ id: 2 }]));
    const during = await collectUntil(it, isType('price'));
    const price = during.at(-1);
    assert(
      price?.type === 'price' &&
        price.endpoint === servers[1]!.url('/v1/stream'),
    );
    const back = await collectUntil(
      it,
      (e) => e.type === 'health' && e.state === 'up',
    );
    assert(back.some((e) => e.type === 'connected' && e.reconnected));
    const again = await servers[0]!.connection(2);
    await again.waitFor((f) => f.includes('"subscribe"'));
  });

  it('reports down when every endpoint is gone', async () => {
    socket = make();
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, (e) => e.type === 'health' && e.state === 'up');
    for (const server of servers) {
      server.refuseWith = { status: 503, times: 1_000 };
    }
    const conns = await subscribed(servers);
    for (const conn of conns) conn.close(1012, 'all down');
    const events = await collectUntil(
      it,
      (e) => e.type === 'health' && e.state === 'down',
    );
    assertEquals(socket.health, 'down');
    assertEquals(socket.endpointsUp, []);
    assert(events.filter((e) => e.type === 'disconnected').length >= 3);
  });

  it('sends subscribe and unsubscribe changes to every endpoint', async () => {
    socket = make({ subscriptions: [] });
    await socket.connect();
    await Promise.all(servers.map((s) => s.connection()));
    await new Promise((r) => setTimeout(r, 50));
    const id = socket.subscribe({
      symbols: ['Crypto.BTC/USD'],
      channel: 'fixed_rate@200ms',
      properties: ['price'],
    });
    socket.unsubscribe(id);
    for (const server of servers) {
      const conn = await server.connection();
      await conn.waitFor((f) => f.includes('"unsubscribe"'));
      assertEquals(conn.json(), [
        {
          type: 'subscribe',
          subscriptionId: id,
          properties: ['price'],
          formats: [],
          deliveryFormat: 'json',
          parsed: true,
          channel: 'fixed_rate@200ms',
          ignoreInvalidFeedIds: true,
          symbols: ['Crypto.BTC/USD'],
        },
        { type: 'unsubscribe', subscriptionId: id },
      ]);
    }
  });

  it('reports a gap when no endpoint delivered a fixed-rate tick', async () => {
    socket = make({ channel: 'fixed_rate@200ms' });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, (e) => e.type === 'health' && e.state === 'up');
    const conns = await subscribed(servers);
    conns[0]!.send(update(1, 1_000_000, [{ id: 1 }]));
    conns[1]!.send(update(1, 1_200_000, [{ id: 1 }]));
    conns[2]!.send(update(1, 1_800_000, [{ id: 1 }])); // 1.4s and 1.6s missing
    const events = await collectUntil(
      it,
      (e) => e.type === 'price' && e.timestampUs === 1_800_000,
    );
    const gap = events.find((e) => e.type === 'gap');
    assert(gap?.type === 'gap');
    assertEquals(
      [gap.stream, gap.expected, gap.received, gap.missed],
      ['subscription:1', 1_400_000, 1_800_000, 2],
    );
  });

  it('surfaces acks, subscription errors and signed payloads per endpoint', async () => {
    socket = make({ subscriptions: [{ priceFeedIds: [1], formats: ['evm'] }] });
    const it = socket[Symbol.asyncIterator]();
    await collectUntil(it, (e) => e.type === 'health' && e.state === 'up');
    const [conn] = await subscribed(servers);
    conn!.send({
      type: 'subscribedWithInvalidFeedIdsIgnored',
      subscriptionId: 1,
      subscribedFeedIds: [1],
      ignoredInvalidFeedIds: {
        unknownIds: [99],
        unknownSymbols: [],
        unsupportedChannels: [],
        unstable: [],
      },
    });
    conn!.send({
      type: 'subscriptionError',
      subscriptionId: 2,
      error: 'unknown feed',
    });
    conn!.send({
      ...update(1, 9_000_000, [{ id: 1 }]),
      evm: { encoding: 'hex', data: 'abcd' },
    });
    const events = await collectUntil(it, isType('price'));
    const ack = events.find((e) => e.type === 'subscribed');
    assert(ack?.type === 'subscribed');
    assertEquals(ack.data.ignoredInvalidFeedIds?.unknownIds, [99]);
    const err = events.find((e) => e.type === 'error');
    assert(err?.type === 'error' && !err.fatal);
    assertEquals(err.error.code, 'SOCKET_VENUE_ERROR');
    const signed = events.find((e) => e.type === 'signed_update');
    assert(signed?.type === 'signed_update');
    assertEquals(signed.data.evm, { encoding: 'hex', data: 'abcd' });
  });

  it('close() ends the stream and an AbortSignal closes it', async () => {
    const controller = new AbortController();
    socket = make({ signal: controller.signal });
    await socket.connect();
    controller.abort();
    const events = await collectUntil(
      socket[Symbol.asyncIterator](),
      () => false,
    );
    assert(events.some((e) => e.type === 'disconnected'));
  });
});

// ── Live ─────────────────────────────────────────────────────────────────────
// Pyth Pro is a paid subscription: needs CONNECTOR_PYTH_PRO_TOKEN.
const liveToken = envArgs().get('CONNECTOR_PYTH_PRO_TOKEN');

describe({
  name: 'PythProSocket — live',
  ignore: !liveToken,
  bun: false,
  node: false,
  fn: () => {
    it('streams BTC/USD from all three endpoints', async () => {
      const socket = new PythProSocket({
        auth: { type: 'BEARER', token: liveToken! },
        subscriptions: [{ symbols: ['Crypto.BTC/USD'] }],
        emitDuplicates: true,
        signal: AbortSignal.timeout(15_000),
      });
      const endpoints = new Set<string>();
      for await (const event of socket) {
        if (event.type === 'error' && event.fatal) throw event.error;
        if (event.type === 'invalid') throw event.error;
        if (event.type === 'price') endpoints.add(event.endpoint);
        if (endpoints.size === 3) break;
      }
      assertEquals(endpoints.size, 3);
    });
  },
});
