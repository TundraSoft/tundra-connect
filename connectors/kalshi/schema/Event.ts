import { type BaseGuardian, Guardian } from '@guardian';
import { type Market, MarketSchemaObject } from './Market.ts';

/** A Kalshi event — a group of one or more related markets (e.g. every strike of one Bitcoin-price question). */
export type Event = {
  eventTicker: string;
  seriesTicker?: string;
  title: string;
  subTitle?: string;
  mutuallyExclusive?: boolean;
  strikeDate?: string;
  strikePeriod?: string;
  /** Present only when the request set `withNestedMarkets: true`. */
  markets?: Market[];
};

const RENAME_MAP: Record<string, string> = {
  event_ticker: 'eventTicker',
  series_ticker: 'seriesTicker',
  title: 'title',
  sub_title: 'subTitle',
  mutually_exclusive: 'mutuallyExclusive',
  strike_date: 'strikeDate',
  strike_period: 'strikePeriod',
  markets: 'markets',
};

function normalizeEvent(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const out: Record<string, unknown> = {};
  for (
    const [wireKey, value] of Object.entries(raw as Record<string, unknown>)
  ) {
    out[RENAME_MAP[wireKey] ?? wireKey] = value;
  }
  return out;
}

const _event = Guardian.object({
  eventTicker: Guardian.string().minLength(1),
  seriesTicker: Guardian.string().optional(),
  title: Guardian.string(),
  subTitle: Guardian.string().optional(),
  mutuallyExclusive: Guardian.boolean().optional(),
  strikeDate: Guardian.string().optional(),
  strikePeriod: Guardian.string().optional(),
  markets: Guardian.array(MarketSchemaObject).optional(),
}).passthrough().describe({
  title: 'Kalshi event',
  description: 'A group of related markets sharing one settlement event.',
});

/**
 * Schema for one event, as nested in `GET /events` or the `event` field of
 * `GET /events/{event_ticker}`.
 *
 * @example
 * ```typescript
 * import { EventSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, event] = EventSchemaObject.safeParse({
 *   event_ticker: 'KXBTCD-26JUL1515', title: 'Bitcoin price on Jul 15, 2026?',
 * });
 * ```
 */
export const EventSchemaObject: BaseGuardian<Event> = Guardian.preprocess(
  normalizeEvent,
  _event,
);

/** One page of `GET /events`. */
export type EventsPage = {
  events: Event[];
  cursor?: string;
};

const _eventsPage = Guardian.object({
  events: Guardian.array(EventSchemaObject),
  cursor: Guardian.string().optional(),
}).describe({
  title: 'Kalshi events page',
  description: 'A cursor-paginated page of events.',
});

/**
 * Schema for the `GET /events` response.
 *
 * @example
 * ```typescript
 * import { EventsPageSchemaObject } from '@tundraconnect/kalshi/schemas';
 *
 * const [error, page] = EventsPageSchemaObject.safeParse({ events: [] });
 * ```
 */
export const EventsPageSchemaObject: BaseGuardian<EventsPage> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return { events: obj.events ?? [], cursor: obj.cursor };
    },
    _eventsPage,
  );

/** Schema for the `GET /events/{event_ticker}` response, which wraps the event as `{ "event": ... }`. */
export const SingleEventSchemaObject: BaseGuardian<Event> = Guardian
  .preprocess(
    (raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return raw;
      const obj = raw as Record<string, unknown>;
      return obj.event ?? obj;
    },
    EventSchemaObject,
  );
