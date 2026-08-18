import * as asserts from '@asserts';
import { describe, it } from '@test';
import { MessageSchemaObject } from './Message.ts';

const validMessage = {
  sid: 'SM' + '0'.repeat(32),
  account_sid: 'AC' + '0'.repeat(32),
  api_version: '2010-04-01',
  body: 'Hello!',
  from: '+15017122661',
  to: '+14155552671',
  messaging_service_sid: null,
  status: 'queued',
  direction: 'outbound-api',
  date_created: 'Thu, 01 Jan 2024 12:00:00 +0000',
  date_sent: null,
  date_updated: 'Thu, 01 Jan 2024 12:00:00 +0000',
  error_code: null,
  error_message: null,
  num_media: '0',
  num_segments: '1',
  price: null,
  price_unit: null,
  uri: '/2010-04-01/Accounts/ACxx/Messages/SMxx.json',
  subresource_uris: {
    media: '/2010-04-01/Accounts/ACxx/Messages/SMxx/Media.json',
  },
};

describe('Twilio.schema.Message', () => {
  it('accepts a documented queued message response', () => {
    asserts.assertEquals(MessageSchemaObject.safeParse(validMessage)[0], null);
  });

  it('accepts a delivered message with numeric-looking string fields', () => {
    const [err, parsed] = MessageSchemaObject.safeParse({
      ...validMessage,
      status: 'delivered',
      date_sent: 'Thu, 01 Jan 2024 12:00:05 +0000',
      num_media: '2',
      num_segments: '3',
      price: '-0.00750',
      price_unit: 'USD',
    });
    asserts.assertEquals(err, null);
    asserts.assertEquals(typeof parsed?.num_media, 'string');
    asserts.assertEquals(typeof parsed?.price, 'string');
  });

  it('rejects an undocumented status value', () => {
    asserts.assertExists(
      MessageSchemaObject.safeParse({ ...validMessage, status: 'bogus' })[0],
    );
  });

  it('rejects an undocumented direction value', () => {
    asserts.assertExists(
      MessageSchemaObject.safeParse({
        ...validMessage,
        direction: 'sideways',
      })[0],
    );
  });

  it('rejects a null num_media (must be a non-nullable string)', () => {
    asserts.assertExists(
      MessageSchemaObject.safeParse({ ...validMessage, num_media: null })[0],
    );
  });

  it('rejects a missing required field', () => {
    const { sid: _sid, ...withoutSid } = validMessage;
    asserts.assertExists(MessageSchemaObject.safeParse(withoutSid)[0]);
  });
});
