import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CallSchemaObject } from './Call.ts';

const validCall = {
  sid: 'CA' + '0'.repeat(32),
  account_sid: 'AC' + '0'.repeat(32),
  to: '+14155552671',
  to_formatted: '(415) 555-2671',
  from: '+15017122661',
  from_formatted: '(501) 712-2661',
  phone_number_sid: 'PN' + '0'.repeat(32),
  status: 'queued',
  start_time: null,
  end_time: null,
  duration: null,
  price: null,
  price_unit: null,
  direction: 'outbound-api',
  answered_by: null,
  api_version: '2010-04-01',
  forwarded_from: null,
  group_sid: null,
  caller_name: null,
  queue_time: '0',
  trunk_sid: null,
  parent_call_sid: null,
  date_created: 'Thu, 01 Jan 2024 12:00:00 +0000',
  date_updated: 'Thu, 01 Jan 2024 12:00:00 +0000',
  uri: '/2010-04-01/Accounts/ACxx/Calls/CAxx.json',
  subresource_uris: {
    recordings: '/2010-04-01/Accounts/ACxx/Calls/CAxx/Recordings.json',
  },
};

describe('Twilio.schema.Call', () => {
  it('accepts a documented queued call response', () => {
    asserts.assertEquals(CallSchemaObject.safeParse(validCall)[0], null);
  });

  it('accepts a completed call with numeric-looking string fields', () => {
    const [err, parsed] = CallSchemaObject.safeParse({
      ...validCall,
      status: 'completed',
      start_time: 'Thu, 01 Jan 2024 12:00:05 +0000',
      end_time: 'Thu, 01 Jan 2024 12:00:20 +0000',
      duration: '15',
      price: '-0.03000',
      price_unit: 'USD',
    });
    asserts.assertEquals(err, null);
    asserts.assertEquals(typeof parsed?.duration, 'string');
    asserts.assertEquals(typeof parsed?.price, 'string');
  });

  it('accepts a finer-grained answered_by value than the documented human/machine pair', () => {
    asserts.assertEquals(
      CallSchemaObject.safeParse({
        ...validCall,
        answered_by: 'machine_start',
      })[0],
      null,
    );
  });

  it('accepts a response missing the optional *_formatted/queue_time fields', () => {
    const {
      to_formatted: _to,
      from_formatted: _from,
      queue_time: _qt,
      ...withoutOptional
    } = validCall;
    asserts.assertEquals(
      CallSchemaObject.safeParse(withoutOptional)[0],
      null,
    );
  });

  it('rejects an undocumented status value', () => {
    asserts.assertExists(
      CallSchemaObject.safeParse({ ...validCall, status: 'bogus' })[0],
    );
  });

  it('rejects an undocumented direction value', () => {
    asserts.assertExists(
      CallSchemaObject.safeParse({ ...validCall, direction: 'sideways' })[0],
    );
  });

  it('rejects a missing required field', () => {
    const { sid: _sid, ...withoutSid } = validCall;
    asserts.assertExists(CallSchemaObject.safeParse(withoutSid)[0]);
  });
});
