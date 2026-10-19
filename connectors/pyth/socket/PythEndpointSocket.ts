/**
 * @fileoverview One connection to one Pyth Pro stream endpoint. Internal:
 * {@link PythProSocket} runs one of these per endpoint (each with its own
 * reconnect, backoff and liveness) and merges what they deliver.
 *
 * @module
 */

import { PythError } from '../errors/mod.ts';
import type { PythErrorCode } from '../errors/mod.ts';
import {
  type PythStreamUpdate,
  PythStreamUpdateSchemaObject,
  type PythSubscribed,
  PythSubscribedSchemaObject,
} from '../schema/mod.ts';
import {
  type FeedEventBase,
  FeedSocket,
  type FeedSocketErrorCode,
  type FeedSocketOptions,
} from './FeedSocket.ts';

/** The subprotocol that carries the token in the handshake (all runtimes). */
export const PYTH_AUTH_SUBPROTOCOL = 'pyth-lazer-auth';

/** What one endpoint hands up to the merging socket. @internal */
export type PythEndpointMessage =
  | (FeedEventBase & { type: 'stream'; data: PythStreamUpdate })
  | (FeedEventBase & { type: 'subscribed'; data: PythSubscribed })
  | (FeedEventBase & { type: 'unsubscribed'; subscriptionId: number });

/** @internal */
export type PythEndpointConfig = {
  url: string;
  token: string;
  authTransport: 'subprotocol' | 'header';
  /** The current subscribe requests, replayed on every (re)connect. */
  requests: () => Record<string, unknown>[];
};

/** @internal */
export class PythEndpointSocket
  extends FeedSocket<PythEndpointMessage, PythError> {
  public readonly feed: string;
  readonly #config: PythEndpointConfig;

  constructor(config: PythEndpointConfig, options: FeedSocketOptions) {
    const custom = options.webSocket;
    super({
      ...options,
      webSocket: config.authTransport === 'subprotocol'
        ? (url, init) =>
          custom
            // A custom factory gets the token as a header to apply its own way.
            ? custom(url, {
              ...init,
              headers: { Authorization: `Bearer ${config.token}` },
            })
            : new WebSocket(url, [PYTH_AUTH_SUBPROTOCOL, config.token])
        : custom,
    });
    this.#config = config;
    this.feed = `pyth-pro ${new URL(config.url).host}`;
  }

  /** Send one request now if connected (otherwise it is replayed on open). */
  public request(body: Record<string, unknown>): void {
    this._send(JSON.stringify(body));
  }

  protected _error(
    code: FeedSocketErrorCode | PythErrorCode,
    meta?: Record<string, unknown>,
    cause?: Error,
  ): PythError {
    return new PythError(code, meta, cause);
  }

  protected _url(): string {
    return this.#config.url;
  }

  protected override _headers(): Promise<Record<string, string> | undefined> {
    return Promise.resolve(
      this.#config.authTransport === 'header'
        ? { Authorization: `Bearer ${this.#config.token}` }
        : undefined,
    );
  }

  protected _onOpen(): void {
    for (const body of this.#config.requests()) this.request(body);
  }

  protected override _hasSubscriptions(): boolean {
    return this.#config.requests().length > 0;
  }

  protected _onText(text: string, receivedAt: number): boolean {
    const base = this._base(receivedAt, text);
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(text) as Record<string, unknown>;
    } catch {
      this._emitError(
        this._error('SOCKET_VENUE_ERROR', { feed: this.feed, detail: text }),
        receivedAt,
      );
      return false;
    }
    switch (frame.type) {
      case 'streamUpdated': {
        const data = this._parse(
          PythStreamUpdateSchemaObject,
          frame,
          'streamUpdated',
          base,
        );
        if (data) this._emit({ ...base, type: 'stream', data });
        return true;
      }
      case 'subscribed':
      case 'subscribedWithInvalidFeedIdsIgnored': {
        const data = this._parse(
          PythSubscribedSchemaObject,
          frame,
          String(frame.type),
          base,
        );
        if (data) this._emit({ ...base, type: 'subscribed', data });
        return false;
      }
      case 'unsubscribed':
        this._emit({
          ...base,
          type: 'unsubscribed',
          subscriptionId: Number(frame.subscriptionId),
        });
        return false;
      case 'subscriptionError':
      case 'error':
        this._emitError(
          this._error('SOCKET_VENUE_ERROR', {
            feed: this.feed,
            detail: String(frame.error ?? frame.type),
            ...(frame.subscriptionId !== undefined &&
              { subscriptionId: frame.subscriptionId }),
          }),
          receivedAt,
        );
        return false;
      default:
        this._emit({ ...base, type: 'unknown', data: frame });
        return true;
    }
  }
}
