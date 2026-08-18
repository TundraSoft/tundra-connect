import * as asserts from '@asserts';
import { describe, it } from '@test';
import { SendMessageRequestSchemaObject } from './SendMessageRequest.ts';

describe('Twilio.schema.SendMessageRequest', () => {
  it('accepts a request with from + body', () => {
    asserts.assertEquals(
      SendMessageRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        body: 'Hello!',
      })[0],
      null,
    );
  });

  it('accepts a request with messagingServiceSid + mediaUrl', () => {
    asserts.assertEquals(
      SendMessageRequestSchemaObject.safeParse({
        to: '+14155552671',
        messagingServiceSid: 'MG' + '0'.repeat(32),
        mediaUrl: ['https://example.com/cat.png'],
      })[0],
      null,
    );
  });

  it('accepts a request with contentSid only', () => {
    asserts.assertEquals(
      SendMessageRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        contentSid: 'HX' + '0'.repeat(32),
      })[0],
      null,
    );
  });

  it('rejects a request missing both from and messagingServiceSid', () => {
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        to: '+14155552671',
        body: 'Hello!',
      })[0],
    );
  });

  it('rejects a request missing body, mediaUrl, and contentSid', () => {
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
      })[0],
    );
  });

  it('rejects a non-E.164 to number', () => {
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        to: '4155552671',
        from: '+15017122661',
        body: 'Hello!',
      })[0],
    );
  });

  it('rejects a body over 1600 characters', () => {
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        body: 'x'.repeat(1601),
      })[0],
    );
  });

  it('rejects an out-of-range validityPeriod', () => {
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        body: 'Hello!',
        validityPeriod: 36001,
      })[0],
    );
  });

  it('accepts optional scheduling and encoding fields', () => {
    asserts.assertEquals(
      SendMessageRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        body: 'Hello!',
        smartEncoded: true,
        shortenUrls: true,
        scheduleType: 'fixed',
        sendAt: '2024-01-01T12:00:00Z',
        contentVariables: '{"1":"value"}',
      })[0],
      null,
    );
  });

  it('rejects an unsupported scheduleType', () => {
    asserts.assertExists(
      SendMessageRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        body: 'Hello!',
        scheduleType: 'flexible',
      })[0],
    );
  });
});
