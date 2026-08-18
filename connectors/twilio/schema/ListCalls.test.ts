import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ListCallsRequestSchemaObject,
  ListCallsResponseSchemaObject,
} from './ListCalls.ts';

describe('Twilio.schema.ListCallsRequest', () => {
  it('accepts an empty filter (all fields optional)', () => {
    asserts.assertEquals(ListCallsRequestSchemaObject.safeParse({})[0], null);
  });

  it('accepts documented filter fields', () => {
    asserts.assertEquals(
      ListCallsRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        parentCallSid: 'CA' + '0'.repeat(32),
        status: 'completed',
        startTime: '2024-01-01',
        startTimeBefore: '2024-01-31',
        startTimeAfter: '2024-01-01',
        endTime: '2024-01-02',
        endTimeBefore: '2024-01-31',
        endTimeAfter: '2024-01-01',
        pageSize: 20,
        page: 0,
        pageToken: 'PACAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      })[0],
      null,
    );
  });

  it('rejects a startTime with a time component (must be YYYY-MM-DD)', () => {
    asserts.assertExists(
      ListCallsRequestSchemaObject.safeParse({
        startTime: '2024-01-01T00:00:00Z',
      })[0],
    );
  });

  it('rejects an undocumented status filter value', () => {
    asserts.assertExists(
      ListCallsRequestSchemaObject.safeParse({ status: 'bogus' })[0],
    );
  });

  it('rejects a malformed parentCallSid', () => {
    asserts.assertExists(
      ListCallsRequestSchemaObject.safeParse({ parentCallSid: 'not-a-sid' })[
        0
      ],
    );
  });

  it('rejects a pageSize over 1000', () => {
    asserts.assertExists(
      ListCallsRequestSchemaObject.safeParse({ pageSize: 1001 })[0],
    );
  });

  it('rejects a negative page', () => {
    asserts.assertExists(
      ListCallsRequestSchemaObject.safeParse({ page: -1 })[0],
    );
  });
});

describe('Twilio.schema.ListCallsResponse', () => {
  const validPage = {
    calls: [],
    end: 0,
    first_page_uri: '/2010-04-01/Accounts/ACxx/Calls.json?Page=0',
    next_page_uri: null,
    page: 0,
    page_size: 50,
    previous_page_uri: null,
    start: 0,
    uri: '/2010-04-01/Accounts/ACxx/Calls.json',
  };

  it('accepts an empty page', () => {
    asserts.assertEquals(
      ListCallsResponseSchemaObject.safeParse(validPage)[0],
      null,
    );
  });

  it('accepts a page with a next_page_uri and call entries', () => {
    const [err] = ListCallsResponseSchemaObject.safeParse({
      ...validPage,
      next_page_uri:
        '/2010-04-01/Accounts/ACxx/Calls.json?Page=1&PageToken=PACAxx',
      calls: [
        {
          sid: 'CA' + '0'.repeat(32),
          account_sid: 'AC' + '0'.repeat(32),
          to: '+14155552671',
          from: '+15017122661',
          status: 'completed',
          start_time: 'Fri, 18 Oct 2019 17:02:00 +0000',
          end_time: 'Fri, 18 Oct 2019 17:03:00 +0000',
          duration: '4',
          price: '-0.200',
          price_unit: 'USD',
          direction: 'outbound-api',
          answered_by: 'machine_start',
          api_version: '2010-04-01',
          date_created: 'Fri, 18 Oct 2019 17:00:00 +0000',
          date_updated: 'Fri, 18 Oct 2019 17:01:00 +0000',
          uri: '/2010-04-01/Accounts/ACxx/Calls/CAxx.json',
          subresource_uris: {},
        },
      ],
    });
    asserts.assertEquals(err, null);
  });

  it('rejects a page missing a required field', () => {
    const { uri: _uri, ...withoutUri } = validPage;
    asserts.assertExists(
      ListCallsResponseSchemaObject.safeParse(withoutUri)[0],
    );
  });

  it('rejects a malformed call entry within the page', () => {
    asserts.assertExists(
      ListCallsResponseSchemaObject.safeParse({
        ...validPage,
        calls: [{ sid: 'not-enough-fields' }],
      })[0],
    );
  });

  it('extracts nextPageToken from next_page_uri, keeping the raw field too', () => {
    const [err, parsed] = ListCallsResponseSchemaObject.safeParse({
      ...validPage,
      next_page_uri:
        '/2010-04-01/Accounts/ACxx/Calls.json?Page=1&PageToken=PACAxx',
    });
    asserts.assertEquals(err, null);
    asserts.assertEquals(parsed?.nextPageToken, 'PACAxx');
    asserts.assertEquals(
      parsed?.next_page_uri,
      '/2010-04-01/Accounts/ACxx/Calls.json?Page=1&PageToken=PACAxx',
    );
  });

  it('leaves nextPageToken undefined when next_page_uri is null', () => {
    const [err, parsed] = ListCallsResponseSchemaObject.safeParse(validPage);
    asserts.assertEquals(err, null);
    asserts.assertEquals(parsed?.nextPageToken, undefined);
  });

  it('leaves nextPageToken undefined when next_page_uri has no PageToken', () => {
    const [err, parsed] = ListCallsResponseSchemaObject.safeParse({
      ...validPage,
      next_page_uri: '/2010-04-01/Accounts/ACxx/Calls.json?Page=1',
    });
    asserts.assertEquals(err, null);
    asserts.assertEquals(parsed?.nextPageToken, undefined);
  });
});
