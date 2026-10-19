/**
 * @fileoverview Polymarket CLOB market channel — public order books,
 * level changes, trades and tick-size changes for outcome tokens.
 *
 * Wire protocol (docs.polymarket.com → Market Channel, plus quirks
 * confirmed against the live feed):
 *
 * - Every new connection must send `{ assets_ids, type: 'market' }`
 *   promptly — the server drops a connection that stays silent for a few
 *   seconds, so an empty list is sent when nothing is subscribed yet.
 * - Changes while connected use `{ operation: 'subscribe' | 'unsubscribe',
 *   assets_ids }`. `custom_feature_enabled: true` is sent on both (not just
 *   the first frame), or newly added tokens never get `best_bid_ask`.
 * - Large lists go in batches of 100 ids, 100ms apart.
 * - Heartbeat: text `PING` every 10s, answered with `PONG`.
 * - A frame is one event object or a JSON array of them.
 *
 * Every message is delivered — full-depth `book` snapshots and every
 * `price_change`, untouched. The channel has no sequence numbers, so a
 * reconnect (`connected` with `reconnected: true`) is the staleness
 * signal; the venue answers each (re)subscription with fresh `book`
 * snapshots.
 *
 * @module
 */

import { PolymarketError } from '../errors/mod.ts';
import type { PolymarketErrorCode } from '../errors/mod.ts';
import {
  type PolymarketBestBidAsk,
  PolymarketBestBidAskSchemaObject,
  type PolymarketBook,
  PolymarketBookSchemaObject,
  type PolymarketLastTradePrice,
  PolymarketLastTradePriceSchemaObject,
  type PolymarketMarketResolved,
  PolymarketMarketResolvedSchemaObject,
  type PolymarketNewMarket,
  PolymarketNewMarketSchemaObject,
  type PolymarketPriceChange,
  PolymarketPriceChangeSchemaObject,
  type PolymarketTickSizeChange,
  PolymarketTickSizeChangeSchemaObject,
} from '../schema/mod.ts';
import {
  type FeedDataEvent,
  type FeedLifecycleEvent,
  FeedSocket,
  type FeedSocketErrorCode,
  type FeedSocketOptions,
} from './FeedSocket.ts';

/** Production market-channel URL. */
export const POLYMARKET_MARKET_WS_URL =
  'wss://ws-subscriptions-clob.polymarket.com/ws/market';

const BATCH_SIZE = 100;

/** Options for {@link PolymarketMarketSocket}. */
export type PolymarketMarketSocketOptions = FeedSocketOptions & {
  /** Outcome token ids to subscribe to from the start. */
  assetIds?: string[];
  /**
   * Ask for `best_bid_ask`, `new_market` and `market_resolved` too.
   * `new_market` is broadcast for every new market, not only subscribed
   * ones. @default true
   */
  customFeatures?: boolean;
};

/** Every event a {@link PolymarketMarketSocket} yields besides the lifecycle ones. */
export type PolymarketMarketEvent =
  | FeedDataEvent<'book', PolymarketBook>
  | FeedDataEvent<'price_change', PolymarketPriceChange>
  | FeedDataEvent<'tick_size_change', PolymarketTickSizeChange>
  | FeedDataEvent<'last_trade_price', PolymarketLastTradePrice>
  | FeedDataEvent<'best_bid_ask', PolymarketBestBidAsk>
  | FeedDataEvent<'new_market', PolymarketNewMarket>
  | FeedDataEvent<'market_resolved', PolymarketMarketResolved>;

/** Everything iterating a {@link PolymarketMarketSocket} can yield. */
export type PolymarketMarketSocketEvent =
  | PolymarketMarketEvent
  | FeedLifecycleEvent<PolymarketError>;

const SCHEMAS = {
  book: PolymarketBookSchemaObject,
  price_change: PolymarketPriceChangeSchemaObject,
  tick_size_change: PolymarketTickSizeChangeSchemaObject,
  last_trade_price: PolymarketLastTradePriceSchemaObject,
  best_bid_ask: PolymarketBestBidAskSchemaObject,
  new_market: PolymarketNewMarketSchemaObject,
  market_resolved: PolymarketMarketResolvedSchemaObject,
} as const;

type MarketType = keyof typeof SCHEMAS;

/**
 * Public Polymarket market-data feed. No credentials.
 *
 * @example
 * ```ts
 * import { PolymarketMarketSocket } from '@tundraconnect/polymarket/sockets';
 *
 * const socket = new PolymarketMarketSocket({ assetIds: ['<token id>'] });
 * for await (const event of socket) {
 *   if (event.type === 'book') console.log(event.data.bids.length);
 *   if (event.type === 'connected' && event.reconnected) {
 *     // Frames may have been missed: treat books as stale until the next `book`.
 *   }
 * }
 * ```
 */
export class PolymarketMarketSocket
  extends FeedSocket<PolymarketMarketEvent, PolymarketError> {
  public readonly feed = 'polymarket-market';
  readonly #assets = new Set<string>();
  readonly #custom: boolean;

  constructor(options: PolymarketMarketSocketOptions = {}) {
    super({
      heartbeatIntervalMs: 10_000,
      idleTimeoutMs: 30_000,
      ...options,
    });
    this.#custom = options.customFeatures ?? true;
    this._sendIntervalMs = 100;
    for (const id of options.assetIds ?? []) this.#assets.add(id);
  }

  /** Token ids currently subscribed. */
  public get assetIds(): string[] {
    return [...this.#assets];
  }

  /**
   * Add outcome tokens. Sent immediately when connected; replayed on every
   * reconnect. Already-subscribed ids are ignored.
   */
  public subscribe(assetIds: string[]): void {
    const added = assetIds.filter((id) => {
      if (this.#assets.has(id)) return false;
      this.#assets.add(id);
      return true;
    });
    if (added.length === 0) return;
    this._touchData();
    this.#batched(added, (ids) => ({
      operation: 'subscribe',
      assets_ids: ids,
      ...(this.#custom && { custom_feature_enabled: true }),
    }));
  }

  /** Remove outcome tokens. */
  public unsubscribe(assetIds: string[]): void {
    const removed = assetIds.filter((id) => this.#assets.delete(id));
    if (removed.length === 0) return;
    this.#batched(removed, (ids) => ({
      operation: 'unsubscribe',
      assets_ids: ids,
    }));
  }

  protected _error(
    code: FeedSocketErrorCode | PolymarketErrorCode,
    meta?: Record<string, unknown>,
    cause?: Error,
  ): PolymarketError {
    return new PolymarketError(code, meta, cause);
  }

  protected _url(): string {
    return this._options.url ?? POLYMARKET_MARKET_WS_URL;
  }

  protected _onOpen(): void {
    const ids = [...this.#assets];
    const first = ids.slice(0, BATCH_SIZE);
    this._send(JSON.stringify({
      assets_ids: first,
      type: 'market',
      ...(this.#custom && { custom_feature_enabled: true }),
    }));
    this.#batched(ids.slice(BATCH_SIZE), (batch) => ({
      operation: 'subscribe',
      assets_ids: batch,
      ...(this.#custom && { custom_feature_enabled: true }),
    }));
  }

  protected override _heartbeat(): void {
    this._send('PING');
  }

  protected override _hasSubscriptions(): boolean {
    return this.#assets.size > 0;
  }

  protected _onText(text: string, receivedAt: number): boolean {
    const trimmed = text.trim();
    if (trimmed === 'PONG' || trimmed === 'pong' || trimmed === '') {
      return false;
    }
    if (trimmed === 'PING') {
      this._send('PONG');
      return false;
    }
    const base = this._base(receivedAt, text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // `INVALID OPERATION`, `ERROR: ...` and other plain-text replies.
      this._emitError(
        this._error('SOCKET_VENUE_ERROR', { feed: this.feed, detail: trimmed }),
        receivedAt,
      );
      return false;
    }
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      const eventType = (item as { event_type?: unknown } | null)?.event_type;
      if (typeof eventType !== 'string' || !(eventType in SCHEMAS)) {
        this._emit({ ...base, type: 'unknown', data: item });
        continue;
      }
      const type = eventType as MarketType;
      const data = this._parse(
        SCHEMAS[type] as (typeof SCHEMAS)['book'],
        item,
        type,
        base,
      );
      if (!data) continue;
      this._emit({
        ...base,
        type,
        venueTimestamp: data.timestamp,
        data,
      } as PolymarketMarketEvent);
    }
    return true;
  }

  #batched(ids: string[], frame: (batch: string[]) => unknown): void {
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      this._send(JSON.stringify(frame(ids.slice(i, i + BATCH_SIZE))));
    }
  }
}
