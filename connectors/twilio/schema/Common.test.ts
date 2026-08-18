import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  accountSidGuard,
  applicationSidGuard,
  byocTrunkSidGuard,
  callSidGuard,
  contentSidGuard,
  dateOnlyGuard,
  e164Guard,
  iso8601Guard,
  jsonStringGuard,
  messagingServiceSidGuard,
} from './Common.ts';

describe('Twilio.schema.Common', () => {
  it('accepts a valid E.164 phone number', () => {
    asserts.assertEquals(e164Guard.safeParse('+14155552671')[0], null);
  });

  it('rejects a phone number without a leading +', () => {
    asserts.assertExists(e164Guard.safeParse('14155552671')[0]);
  });

  it('accepts a valid Account SID', () => {
    asserts.assertEquals(
      accountSidGuard.safeParse('AC' + '0'.repeat(32))[0],
      null,
    );
  });

  it('rejects an Account SID with the wrong prefix', () => {
    asserts.assertExists(
      accountSidGuard.safeParse('SK' + '0'.repeat(32))[0],
    );
  });

  it('accepts a valid Messaging Service SID', () => {
    asserts.assertEquals(
      messagingServiceSidGuard.safeParse('MG' + 'a'.repeat(32))[0],
      null,
    );
  });

  it('rejects a Messaging Service SID with too few hex characters', () => {
    asserts.assertExists(messagingServiceSidGuard.safeParse('MGabc')[0]);
  });

  it('accepts a valid Content SID', () => {
    asserts.assertEquals(
      contentSidGuard.safeParse('HX' + 'f'.repeat(32))[0],
      null,
    );
  });

  it('rejects a malformed Content SID', () => {
    asserts.assertExists(contentSidGuard.safeParse('not-a-sid')[0]);
  });

  it('accepts a valid Application SID', () => {
    asserts.assertEquals(
      applicationSidGuard.safeParse('AP' + '1'.repeat(32))[0],
      null,
    );
  });

  it('rejects a malformed Application SID', () => {
    asserts.assertExists(applicationSidGuard.safeParse('AP123')[0]);
  });

  it('accepts a valid ISO 8601 datetime', () => {
    asserts.assertEquals(
      iso8601Guard.safeParse('2024-01-01T12:00:00Z')[0],
      null,
    );
  });

  it('rejects a non-ISO datetime', () => {
    asserts.assertExists(iso8601Guard.safeParse('2024-01-01 12:00:00')[0]);
  });

  it('accepts a JSON-encoded string', () => {
    asserts.assertEquals(
      jsonStringGuard.safeParse('{"1":"value"}')[0],
      null,
    );
  });

  it('rejects a non-JSON string', () => {
    asserts.assertExists(jsonStringGuard.safeParse('not json')[0]);
  });

  it('accepts a valid Call SID', () => {
    asserts.assertEquals(
      callSidGuard.safeParse('CA' + '0'.repeat(32))[0],
      null,
    );
  });

  it('rejects a Call SID with the wrong prefix', () => {
    asserts.assertExists(callSidGuard.safeParse('SM' + '0'.repeat(32))[0]);
  });

  it('accepts a valid BYOC Trunk SID', () => {
    asserts.assertEquals(
      byocTrunkSidGuard.safeParse('BY' + 'a'.repeat(32))[0],
      null,
    );
  });

  it('rejects a malformed BYOC Trunk SID', () => {
    asserts.assertExists(byocTrunkSidGuard.safeParse('not-a-sid')[0]);
  });

  it('accepts a valid YYYY-MM-DD date', () => {
    asserts.assertEquals(dateOnlyGuard.safeParse('2024-01-01')[0], null);
  });

  it('rejects a date with a time component', () => {
    asserts.assertExists(
      dateOnlyGuard.safeParse('2024-01-01T12:00:00Z')[0],
    );
  });
});
