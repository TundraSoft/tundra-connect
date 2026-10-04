import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  EventSchemaObject,
  NAME_PATTERN,
  PayloadSchemaObject,
  RESERVED_EVENT_NAMES,
} from './Payload.ts';

describe('GoogleAnalytics.schema.Payload', () => {
  it('accepts a minimal web payload', () => {
    const [error, value] = PayloadSchemaObject.safeParse({
      client_id: 'c',
      events: [{ name: 'e' }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.events[0]?.name, 'e');
  });

  it('accepts every documented field', () => {
    asserts.assertEquals(
      PayloadSchemaObject.safeParse({
        client_id: 'c',
        app_instance_id: 'a',
        user_id: 'u',
        timestamp_micros: 1_700_000_000_000_000,
        user_properties: { plan: { value: 'pro' } },
        consent: { ad_user_data: 'GRANTED', ad_personalization: 'DENIED' },
        user_location: { city: 'Pune', country_id: 'IN' },
        device: { category: 'desktop', browser: 'Firefox' },
        user_data: { sha256_email_address: ['abc'] },
        non_personalized_ads: false,
        validation_behavior: 'ENFORCE_RECOMMENDATIONS',
        events: [{ name: 'e', params: { items: [{ item_id: 'x' }] } }],
      })[0],
      null,
    );
  });

  it('rejects missing events, bad consent and coerced values', () => {
    asserts.assertExists(PayloadSchemaObject.safeParse({ client_id: 'c' })[0]);
    asserts.assertExists(
      PayloadSchemaObject.safeParse({
        client_id: 'c',
        events: [],
        consent: { ad_user_data: 'yes' },
      })[0],
    );
    asserts.assertExists(
      PayloadSchemaObject.safeParse({
        client_id: 'c',
        events: [],
        non_personalized_ads: 'true',
      })[0],
    );
    asserts.assertExists(
      PayloadSchemaObject.safeParse({
        client_id: 'c',
        events: [],
        timestamp_micros: '1',
      })[0],
    );
  });

  it('event: requires a non-empty name', () => {
    asserts.assertEquals(EventSchemaObject.safeParse({ name: 'e' })[0], null);
    asserts.assertExists(EventSchemaObject.safeParse({ name: '' })[0]);
    asserts.assertExists(EventSchemaObject.safeParse({})[0]);
  });

  it('exports the name rules', () => {
    asserts.assert(NAME_PATTERN.test('link_click'));
    asserts.assertEquals(NAME_PATTERN.test('link-click'), false);
    asserts.assert(RESERVED_EVENT_NAMES.includes('session_start'));
  });
});
