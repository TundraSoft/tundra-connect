import * as asserts from '@asserts';
import { describe, it } from '@test';
import { Twilio } from './Twilio.ts';
import { TwilioError } from './errors/mod.ts';

const ACCOUNT_SID = 'AC' + '1'.repeat(32);

const validMessageResponse = {
  sid: 'SM' + '0'.repeat(32),
  account_sid: ACCOUNT_SID,
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
  uri: `/2010-04-01/Accounts/${ACCOUNT_SID}/Messages/SMxx.json`,
  subresource_uris: {},
};

const validCallResponse = {
  sid: 'CA' + '0'.repeat(32),
  account_sid: ACCOUNT_SID,
  to: '+14155552671',
  from: '+15017122661',
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
  uri: `/2010-04-01/Accounts/${ACCOUNT_SID}/Calls/CAxx.json`,
  subresource_uris: {},
};

const validListCallsResponse = {
  calls: [validCallResponse],
  end: 0,
  first_page_uri: `/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json?Page=0`,
  next_page_uri: null,
  page: 0,
  page_size: 50,
  previous_page_uri: null,
  start: 0,
  uri: `/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json`,
};

class MockTwilio extends Twilio {
  public request?: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: FormData;
  };
  private responseBody: unknown = validMessageResponse;
  private responseStatus = 201;

  setResponse(body: unknown, status = 201): void {
    this.responseBody = body;
    this.responseStatus = status;
    this._fetch = async (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body as FormData,
      };
      return new Response(JSON.stringify(this.responseBody), {
        status: this.responseStatus,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }

  /** Sets an empty-body response (e.g. a `204 No Content` delete). */
  setEmptyResponse(status: number): void {
    this._fetch = async (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body as FormData,
      };
      return new Response(null, { status });
    };
  }
}

describe('Twilio', () => {
  it('exposes validated configuration through named getters', () => {
    const client = new MockTwilio({
      accountSid: ACCOUNT_SID,
      authToken: 'token',
    });
    asserts.assertEquals(client.vendor, 'Twilio');
    asserts.assertEquals(client.accountSid, ACCOUNT_SID);
  });

  it('accepts API Key credentials in place of the Auth Token', () => {
    const client = new MockTwilio({
      accountSid: ACCOUNT_SID,
      apiKeySid: 'SK' + '2'.repeat(32),
      apiKeySecret: 'secret',
    });
    asserts.assertEquals(client.accountSid, ACCOUNT_SID);
  });

  it('rejects a malformed accountSid', () => {
    asserts.assertThrows(
      () => new MockTwilio({ accountSid: 'not-a-sid', authToken: 'token' }),
      TwilioError,
      'accountSid must match',
    );
  });

  it('rejects a missing accountSid', () => {
    asserts.assertThrows(
      () =>
        // deno-lint-ignore no-explicit-any
        new MockTwilio({ authToken: 'token' } as any),
      TwilioError,
      'accountSid must match',
    );
  });

  it('rejects an incomplete API Key pair', () => {
    asserts.assertThrows(
      () =>
        new MockTwilio({
          accountSid: ACCOUNT_SID,
          apiKeySid: 'SK' + '2'.repeat(32),
        }),
      TwilioError,
      'must be supplied together',
    );
  });

  it('rejects a client with no usable credentials', () => {
    asserts.assertThrows(
      () => new MockTwilio({ accountSid: ACCOUNT_SID }),
      TwilioError,
      'must be supplied',
    );
  });

  it('sends a form-encoded request and validates the response', async () => {
    const client = new MockTwilio({
      accountSid: ACCOUNT_SID,
      authToken: 'token',
    });
    client.setResponse(validMessageResponse, 201);

    const message = await client.sendMessage({
      to: '+14155552671',
      from: '+15017122661',
      body: 'Hello from Twilio!',
    });

    asserts.assertEquals(message.sid, validMessageResponse.sid);
    asserts.assertEquals(message.status, 'queued');
    asserts.assertEquals(client.request?.method, 'POST');
    asserts.assertStringIncludes(
      client.request?.url ?? '',
      `/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
    );
    const form = client.request?.body as FormData;
    asserts.assertEquals(form.get('To'), '+14155552671');
    asserts.assertEquals(form.get('From'), '+15017122661');
    asserts.assertEquals(form.get('Body'), 'Hello from Twilio!');
  });

  it('sends multiple MediaUrl fields for MMS', async () => {
    const client = new MockTwilio({
      accountSid: ACCOUNT_SID,
      authToken: 'token',
    });
    client.setResponse(validMessageResponse, 201);

    await client.sendMessage({
      to: '+14155552671',
      messagingServiceSid: 'MG' + '0'.repeat(32),
      mediaUrl: ['https://example.com/a.png', 'https://example.com/b.png'],
    });

    const form = client.request?.body as FormData;
    asserts.assertEquals(form.getAll('MediaUrl'), [
      'https://example.com/a.png',
      'https://example.com/b.png',
    ]);
    asserts.assertEquals(
      form.get('MessagingServiceSid'),
      'MG' + '0'.repeat(32),
    );
  });

  it('uses the API Key SID as the Basic-Auth username when configured', async () => {
    const apiKeySid = 'SK' + '3'.repeat(32);
    const client = new MockTwilio({
      accountSid: ACCOUNT_SID,
      apiKeySid,
      apiKeySecret: 'shh',
    });
    client.setResponse(validMessageResponse, 201);

    await client.sendMessage({
      to: '+14155552671',
      from: '+15017122661',
      body: 'hi',
    });

    const authHeader = client.request?.headers?.['Authorization'];
    asserts.assertExists(authHeader);
    const decoded = atob((authHeader as string).replace('Basic ', ''));
    asserts.assertEquals(decoded, `${apiKeySid}:shh`);
  });

  it('rejects an invalid sendMessage request before calling the API', async () => {
    const client = new MockTwilio({
      accountSid: ACCOUNT_SID,
      authToken: 'token',
    });
    client.setResponse(validMessageResponse, 201);

    await asserts.assertRejects(
      () =>
        // deno-lint-ignore no-explicit-any
        client.sendMessage({ to: '+14155552671' } as any),
      TwilioError,
      'invalid',
    );
    asserts.assertEquals(client.request, undefined);
  });

  it('maps a documented vendor error code to a specific TwilioError', async () => {
    const client = new MockTwilio({
      accountSid: ACCOUNT_SID,
      authToken: 'token',
    });
    client.setResponse({
      code: 21211,
      message: "The 'To' number is not a valid phone number.",
      more_info: 'https://www.twilio.com/docs/errors/21211',
      status: 400,
    }, 400);

    await asserts.assertRejects(
      () =>
        client.sendMessage({
          to: '+14155552671',
          from: '+15017122661',
          body: 'hi',
        }),
      TwilioError,
      'not a valid phone number',
    );
  });

  it('maps every reachable documented vendor error code', async () => {
    const cases: Array<{ code: number; expected: string }> = [
      { code: 20003, expected: 'Authentication failed' },
      { code: 20429, expected: 'Too many requests' },
      { code: 21211, expected: 'not a valid phone number' },
      { code: 21606, expected: 'not SMS-capable' },
      { code: 21608, expected: 'unverified' },
      { code: 21610, expected: 'unsubscribed' },
      { code: 21612, expected: 'unroutable' },
      { code: 21614, expected: 'not SMS-capable' },
      { code: 21408, expected: 'International permissions' },
    ];

    for (const { code, expected } of cases) {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse({ code, message: 'vendor message', status: 400 }, 400);
      await asserts.assertRejects(
        () =>
          client.sendMessage({
            to: '+14155552671',
            from: '+15017122661',
            body: 'hi',
          }),
        TwilioError,
        expected,
      );
    }
  });

  it('falls back to RESPONSE_ERROR for an undocumented vendor error code', async () => {
    const client = new MockTwilio({
      accountSid: ACCOUNT_SID,
      authToken: 'token',
    });
    client.setResponse(
      { code: 99999, message: 'mystery error', status: 400 },
      400,
    );

    await asserts.assertRejects(
      () =>
        client.sendMessage({
          to: '+14155552671',
          from: '+15017122661',
          body: 'hi',
        }),
      TwilioError,
      'unexpected or malformed response',
    );
  });

  it('treats an unparseable 4xx body as SERVICE_UNAVAILABLE', async () => {
    const client = new MockTwilio({
      accountSid: ACCOUNT_SID,
      authToken: 'token',
    });
    client.setResponse({ oops: true }, 400);

    await asserts.assertRejects(
      () =>
        client.sendMessage({
          to: '+14155552671',
          from: '+15017122661',
          body: 'hi',
        }),
      TwilioError,
      'currently unavailable',
    );
  });

  it('treats a 5xx response as SERVICE_UNAVAILABLE', async () => {
    const client = new MockTwilio({
      accountSid: ACCOUNT_SID,
      authToken: 'token',
    });
    client.setResponse({ message: 'internal error' }, 500);

    await asserts.assertRejects(
      () =>
        client.sendMessage({
          to: '+14155552671',
          from: '+15017122661',
          body: 'hi',
        }),
      TwilioError,
      'currently unavailable',
    );
  });

  it("treats a 3xx status as success, matching this repo's <400 convention (not the narrower 200-299 range)", async () => {
    const client = new MockTwilio({
      accountSid: ACCOUNT_SID,
      authToken: 'token',
    });
    client.setResponse(validMessageResponse, 302);

    const message = await client.sendMessage({
      to: '+14155552671',
      from: '+15017122661',
      body: 'hi',
    });

    asserts.assertEquals(message.sid, validMessageResponse.sid);
  });

  it('rejects a malformed 2xx success response', async () => {
    const client = new MockTwilio({
      accountSid: ACCOUNT_SID,
      authToken: 'token',
    });
    client.setResponse({ sid: 'not-enough-fields' }, 201);

    await asserts.assertRejects(
      () =>
        client.sendMessage({
          to: '+14155552671',
          from: '+15017122661',
          body: 'hi',
        }),
      TwilioError,
      'unexpected or malformed response',
    );
  });

  describe('createCall', () => {
    it('sends a form-encoded request and validates the response', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse(validCallResponse, 201);

      const call = await client.createCall({
        to: '+14155552671',
        from: '+15017122661',
        url: 'http://demo.twilio.com/docs/voice.xml',
      });

      asserts.assertEquals(call.sid, validCallResponse.sid);
      asserts.assertEquals(call.status, 'queued');
      asserts.assertEquals(client.request?.method, 'POST');
      asserts.assertStringIncludes(
        client.request?.url ?? '',
        `/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json`,
      );
      const form = client.request?.body as FormData;
      asserts.assertEquals(form.get('To'), '+14155552671');
      asserts.assertEquals(form.get('From'), '+15017122661');
      asserts.assertEquals(
        form.get('Url'),
        'http://demo.twilio.com/docs/voice.xml',
      );
    });

    it('form-encodes optional fields, including repeated StatusCallbackEvent', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse(validCallResponse, 201);

      await client.createCall({
        to: '+14155552671',
        from: '+15017122661',
        twiml: '<Response><Say>Ahoy!</Say></Response>',
        record: true,
        timeout: 20,
        statusCallbackEvent: ['initiated', 'completed'],
      });

      const form = client.request?.body as FormData;
      asserts.assertEquals(
        form.get('Twiml'),
        '<Response><Say>Ahoy!</Say></Response>',
      );
      asserts.assertEquals(form.get('Record'), 'true');
      asserts.assertEquals(form.get('Timeout'), '20');
      asserts.assertEquals(form.getAll('StatusCallbackEvent'), [
        'initiated',
        'completed',
      ]);
    });

    it('rejects an invalid createCall request before calling the API', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse(validCallResponse, 201);

      await asserts.assertRejects(
        () =>
          // deno-lint-ignore no-explicit-any
          client.createCall(
            { to: '+14155552671', from: '+15017122661' } as any,
          ),
        TwilioError,
        'invalid',
      );
      asserts.assertEquals(client.request, undefined);
    });

    it('maps a documented voice-specific vendor error code', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse({
        code: 21214,
        message: "The 'To' phone number cannot be reached.",
        status: 400,
      }, 400);

      await asserts.assertRejects(
        () =>
          client.createCall({
            to: '+14155552671',
            from: '+15017122661',
            url: 'http://demo.twilio.com/docs/voice.xml',
          }),
        TwilioError,
        'cannot be reached',
      );
    });
  });

  describe('getCall', () => {
    it('fetches a call by SID', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse(validCallResponse, 200);

      const call = await client.getCall(validCallResponse.sid);

      asserts.assertEquals(call.sid, validCallResponse.sid);
      asserts.assertEquals(client.request?.method, 'GET');
      asserts.assertStringIncludes(
        client.request?.url ?? '',
        `/2010-04-01/Accounts/${ACCOUNT_SID}/Calls/${validCallResponse.sid}.json`,
      );
    });

    it('rejects a malformed callSid before calling the API', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse(validCallResponse, 200);

      await asserts.assertRejects(
        () => client.getCall('not-a-sid'),
        TwilioError,
        'invalid',
      );
      asserts.assertEquals(client.request, undefined);
    });
  });

  describe('listCalls', () => {
    it('sends filters as query parameters and validates the response', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse(validListCallsResponse, 200);

      const page = await client.listCalls({
        status: 'completed',
        pageSize: 20,
      });

      asserts.assertEquals(page.calls.length, 1);
      asserts.assertEquals(client.request?.method, 'GET');
      const url = new URL(client.request?.url ?? '');
      asserts.assertEquals(url.searchParams.get('Status'), 'completed');
      asserts.assertEquals(url.searchParams.get('PageSize'), '20');
    });

    it('defaults to no filters when called with no arguments', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse(validListCallsResponse, 200);

      const page = await client.listCalls();

      asserts.assertEquals(page.calls.length, 1);
    });

    it("sends the date-range filters using Twilio's comparison-operator query keys, not English words", async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse(validListCallsResponse, 200);

      await client.listCalls({
        startTimeBefore: '2024-01-31',
        startTimeAfter: '2024-01-01',
        endTimeBefore: '2024-02-29',
        endTimeAfter: '2024-02-01',
      });

      // Assert the raw wire query string — not just the parsed object
      // shape — so the `<`/`>` in the key genuinely round-trips through
      // this connect's request building and RESTler's percent-encoding.
      const rawUrl = client.request?.url ?? '';
      asserts.assertStringIncludes(rawUrl, 'StartTime%3C=2024-01-31');
      asserts.assertStringIncludes(rawUrl, 'StartTime%3E=2024-01-01');
      asserts.assertStringIncludes(rawUrl, 'EndTime%3C=2024-02-29');
      asserts.assertStringIncludes(rawUrl, 'EndTime%3E=2024-02-01');

      // Confirm it also decodes back to the values sent.
      const url = new URL(rawUrl);
      asserts.assertEquals(url.searchParams.get('StartTime<'), '2024-01-31');
      asserts.assertEquals(url.searchParams.get('StartTime>'), '2024-01-01');
      asserts.assertEquals(url.searchParams.get('EndTime<'), '2024-02-29');
      asserts.assertEquals(url.searchParams.get('EndTime>'), '2024-02-01');

      // The old (wrong) English-word keys must not be sent.
      asserts.assertEquals(url.searchParams.get('StartTimeBefore'), null);
      asserts.assertEquals(url.searchParams.get('StartTimeAfter'), null);
      asserts.assertEquals(url.searchParams.get('EndTimeBefore'), null);
      asserts.assertEquals(url.searchParams.get('EndTimeAfter'), null);
    });

    it('still sends the confirmed-correct ParentCallSid and PageToken keys unchanged', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse(validListCallsResponse, 200);

      await client.listCalls({
        parentCallSid: 'CA' + '2'.repeat(32),
        pageToken: 'PACAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      });

      const url = new URL(client.request?.url ?? '');
      asserts.assertEquals(
        url.searchParams.get('ParentCallSid'),
        'CA' + '2'.repeat(32),
      );
      asserts.assertEquals(
        url.searchParams.get('PageToken'),
        'PACAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      );
    });

    it('extracts nextPageToken from next_page_uri for convenience pagination', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse({
        ...validListCallsResponse,
        next_page_uri:
          `/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json?Page=1&PageSize=50&PageToken=PACAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
      }, 200);

      const page = await client.listCalls();

      asserts.assertEquals(
        page.nextPageToken,
        'PACAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      );
      // The raw vendor field stays untouched alongside the convenience one.
      asserts.assertStringIncludes(page.next_page_uri ?? '', 'PageToken=');
    });

    it('leaves nextPageToken undefined on the last page (next_page_uri is null)', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse(validListCallsResponse, 200);

      const page = await client.listCalls();

      asserts.assertEquals(page.next_page_uri, null);
      asserts.assertEquals(page.nextPageToken, undefined);
    });

    it('rejects an invalid filter before calling the API', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse(validListCallsResponse, 200);

      await asserts.assertRejects(
        // deno-lint-ignore no-explicit-any
        () => client.listCalls({ status: 'bogus' } as any),
        TwilioError,
        'invalid',
      );
      asserts.assertEquals(client.request, undefined);
    });
  });

  describe('updateCall', () => {
    it('sends a form-encoded request to end a call', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse({ ...validCallResponse, status: 'completed' }, 200);

      const call = await client.updateCall(validCallResponse.sid, {
        status: 'completed',
      });

      asserts.assertEquals(call.status, 'completed');
      asserts.assertEquals(client.request?.method, 'POST');
      asserts.assertStringIncludes(
        client.request?.url ?? '',
        `/2010-04-01/Accounts/${ACCOUNT_SID}/Calls/${validCallResponse.sid}.json`,
      );
      const form = client.request?.body as FormData;
      asserts.assertEquals(form.get('Status'), 'completed');
    });

    it('rejects a malformed callSid before validating options', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse(validCallResponse, 200);

      await asserts.assertRejects(
        () => client.updateCall('not-a-sid', { status: 'completed' }),
        TwilioError,
        'invalid',
      );
      asserts.assertEquals(client.request, undefined);
    });

    it('rejects an invalid update body before calling the API', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse(validCallResponse, 200);

      await asserts.assertRejects(
        () => client.updateCall(validCallResponse.sid, {}),
        TwilioError,
        'invalid',
      );
      asserts.assertEquals(client.request, undefined);
    });
  });

  describe('deleteCall', () => {
    it('sends a DELETE request and resolves on a 204 No Content response', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setEmptyResponse(204);

      const result = await client.deleteCall(validCallResponse.sid);

      asserts.assertEquals(result, undefined);
      asserts.assertEquals(client.request?.method, 'DELETE');
      asserts.assertStringIncludes(
        client.request?.url ?? '',
        `/2010-04-01/Accounts/${ACCOUNT_SID}/Calls/${validCallResponse.sid}.json`,
      );
    });

    it('rejects a malformed callSid before calling the API', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setEmptyResponse(204);

      await asserts.assertRejects(
        () => client.deleteCall('not-a-sid'),
        TwilioError,
        'invalid',
      );
      asserts.assertEquals(client.request, undefined);
    });

    it('maps a documented vendor error code on the delete request too', async () => {
      const client = new MockTwilio({
        accountSid: ACCOUNT_SID,
        authToken: 'token',
      });
      client.setResponse({
        code: 20003,
        message: 'Authentication Error',
        status: 401,
      }, 401);

      await asserts.assertRejects(
        () => client.deleteCall(validCallResponse.sid),
        TwilioError,
        'Authentication failed',
      );
    });
  });

  describe('voice error code mapping', () => {
    const cases: Array<{ code: number; expected: string }> = [
      { code: 21212, expected: 'not a valid phone number' },
      { code: 21214, expected: 'cannot be reached' },
      { code: 21219, expected: 'unverified' },
      { code: 11200, expected: 'TwiML/webhook URL' },
      { code: 10001, expected: 'not active' },
    ];

    for (const { code, expected } of cases) {
      it(`maps vendor error ${code} to a specific TwilioError`, async () => {
        const client = new MockTwilio({
          accountSid: ACCOUNT_SID,
          authToken: 'token',
        });
        client.setResponse(
          { code, message: 'vendor message', status: 400 },
          400,
        );

        await asserts.assertRejects(
          () =>
            client.createCall({
              to: '+14155552671',
              from: '+15017122661',
              url: 'http://demo.twilio.com/docs/voice.xml',
            }),
          TwilioError,
          expected,
        );
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Live tests — exercise the real Twilio REST API against a live account.
// Skipped entirely unless CONNECTOR_TWILIO_ACCOUNT_SID/
// CONNECTOR_TWILIO_AUTH_TOKEN/CONNECTOR_TWILIO_FROM_NUMBER/
// CONNECTOR_TWILIO_TO_NUMBER are all set (via env or a `.env` file — see
// `envArgs`), which is never the case in CI/sandboxed environments, so
// these never run unattended.
// ---------------------------------------------------------------------------
import { envArgs } from '@utils';

/** Everything an error could surface to a log: its message plus its serialized context. */
function dumpError(err: unknown): string {
  const e = err as { message?: string; toJSON?: () => unknown };
  return `${e.message ?? ''} ${JSON.stringify(e.toJSON?.() ?? String(err))}`;
}

describe('Twilio — credential custody', () => {
  it('never leaks the auth token from a runtime failure', async () => {
    const client = new MockTwilio({
      accountSid: ACCOUNT_SID,
      authToken: 'tok-SECRETMARKER-xyz',
    });
    client.setResponse({ message: 'internal error' }, 500);
    const err = await asserts.assertRejects(
      () =>
        client.sendMessage({
          to: '+14155552671',
          from: '+15017122661',
          body: 'hi',
        }),
      TwilioError,
    );
    asserts.assert(!dumpError(err).includes('SECRETMARKER'));
  });
});

async function hmacHex(
  secret: string,
  message: string,
  hash = 'SHA-256',
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret) as unknown as BufferSource,
    { name: 'HMAC', hash },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(message) as unknown as BufferSource,
    ),
  );
  let out = '';
  for (const b of mac) out += b.toString(16).padStart(2, '0');
  return out;
}
function hexToB64(hex: string): string {
  let bin = '';
  for (let i = 0; i < hex.length; i += 2) {
    bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return btoa(bin);
}

async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(s) as unknown as BufferSource,
    ),
  );
  let out = '';
  for (const b of d) out += b.toString(16).padStart(2, '0');
  return out;
}
describe('Twilio — verifyWebhook', () => {
  const TOKEN = 'account-auth-token';
  const URL_ = 'https://example.com/hooks/sms?x=1';
  const PARAMS = { To: '+14155552671', From: '+15017122661', Body: 'hi' };
  const client = () =>
    new MockTwilio({ accountSid: ACCOUNT_SID, authToken: TOKEN });
  const formSig = async (params = PARAMS, url = URL_, token = TOKEN) =>
    hexToB64(
      await hmacHex(
        token,
        url +
          Object.keys(params).sort().map((k) =>
            k + params[k as keyof typeof params]
          ).join(''),
        'SHA-1',
      ),
    );

  it('accepts a genuine form-webhook signature (URL + sorted key+value, HMAC-SHA1 base64)', async () => {
    await client().verifyWebhook({
      url: URL_,
      headers: { 'x-twilio-signature': await formSig() },
      params: PARAMS,
    });
  });
  it('defaults the signing key to the configured auth token in account-SID mode', async () => {
    await client().verifyWebhook({
      url: URL_,
      headers: { 'x-twilio-signature': await formSig() },
      params: PARAMS,
    });
  });
  it('refuses to default to an API-key secret — Twilio signs with the account token', async () => {
    const c = new MockTwilio(
      {
        accountSid: ACCOUNT_SID,
        apiKeySid: 'SK' + '2'.repeat(32),
        apiKeySecret: 'api-secret',
      } as ConstructorParameters<typeof MockTwilio>[0],
    );
    const err = await asserts.assertRejects(
      async () =>
        await c.verifyWebhook({
          url: URL_,
          headers: { 'x-twilio-signature': await formSig() },
          params: PARAMS,
        }),
      TwilioError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_INVALID_AUTH_TOKEN');
    await c.verifyWebhook({
      url: URL_,
      headers: { 'x-twilio-signature': await formSig() },
      params: PARAMS,
      authToken: TOKEN,
    });
  });
  it('rejects a tampered parameter', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          url: URL_,
          headers: { 'x-twilio-signature': await formSig() },
          params: { ...PARAMS, Body: 'bye' },
        }),
      TwilioError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });
  it('verifies a JSON webhook via bodySHA256 and signs the URL alone', async () => {
    const body = '{"a":1}';
    const url = `${URL_}&bodySHA256=${await sha256Hex(body)}`;
    await client().verifyWebhook({
      url,
      headers: {
        'x-twilio-signature': hexToB64(await hmacHex(TOKEN, url, 'SHA-1')),
      },
      payload: body,
    });
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          url,
          headers: {
            'x-twilio-signature': hexToB64(await hmacHex(TOKEN, url, 'SHA-1')),
          },
          payload: '{"a":2}',
        }),
      TwilioError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });
  it('rejects a JSON webhook whose URL lacks bodySHA256, and a missing signature header', async () => {
    const e1 = await asserts.assertRejects(
      () =>
        client().verifyWebhook({
          url: URL_,
          headers: { 'x-twilio-signature': 'x' },
          payload: '{}',
        }),
      TwilioError,
    );
    asserts.assertEquals(e1.code, 'WEBHOOK_INVALID_HEADERS');
    const e2 = await asserts.assertRejects(
      () => client().verifyWebhook({ url: URL_, headers: {}, params: PARAMS }),
      TwilioError,
    );
    asserts.assertEquals(e2.code, 'WEBHOOK_INVALID_HEADERS');
  });
});

describe('Twilio — every optional field reaches the wire', () => {
  const form = (c: MockTwilio) => c.request!.body as FormData;
  const client = () =>
    new MockTwilio({ accountSid: ACCOUNT_SID, authToken: 'token' });

  it('sendMessage maps every optional field to its form parameter', async () => {
    const c = client();
    c.setResponse(validMessageResponse, 201); // wire the mock — without this the call goes to the real API
    await c.sendMessage({
      to: '+14155552671',
      from: '+15017122661',
      body: 'hi',
      mediaUrl: ['https://example.com/a.png', 'https://example.com/b.png'],
      contentSid: 'HX' + 'a'.repeat(32),
      statusCallback: 'https://example.com/cb',
      applicationSid: 'AP' + 'b'.repeat(32),
      validityPeriod: 3600,
      smartEncoded: true,
      shortenUrls: false,
      scheduleType: 'fixed',
      sendAt: '2026-01-01T00:00:00Z',
      contentVariables: '{"1":"a"}',
    });
    const f = form(c);
    asserts.assertEquals(f.getAll('MediaUrl'), [
      'https://example.com/a.png',
      'https://example.com/b.png',
    ]);
    asserts.assertEquals(f.get('ContentSid'), 'HX' + 'a'.repeat(32));
    asserts.assertEquals(f.get('StatusCallback'), 'https://example.com/cb');
    asserts.assertEquals(f.get('ApplicationSid'), 'AP' + 'b'.repeat(32));
    asserts.assertEquals(f.get('ValidityPeriod'), '3600');
    asserts.assertEquals(f.get('SmartEncoded'), 'true');
    asserts.assertEquals(f.get('ShortenUrls'), 'false');
    asserts.assertEquals(f.get('ScheduleType'), 'fixed');
    asserts.assertEquals(f.get('SendAt'), '2026-01-01T00:00:00Z');
    asserts.assertEquals(f.get('ContentVariables'), '{"1":"a"}');
  });

  it('createCall maps every optional field to its form parameter', async () => {
    const c = client();
    c.setResponse(validCallResponse, 201);
    await c.createCall({
      to: '+14155552671',
      from: '+15017122661',
      url: 'https://example.com/twiml',
      method: 'POST',
      fallbackUrl: 'https://example.com/fb',
      fallbackMethod: 'POST',
      statusCallback: 'https://example.com/cb',
      statusCallbackEvent: ['completed'],
      statusCallbackMethod: 'POST',
      sendDigits: '1234',
      timeout: 30,
      record: true,
      recordingChannels: 'dual',
      recordingStatusCallback: 'https://example.com/rcb',
      recordingStatusCallbackMethod: 'POST',
      recordingStatusCallbackEvent: ['completed'],
      recordingConfigurationId: 'rc-1',
      sipAuthUsername: 'user',
      sipAuthPassword: 'pass',
      machineDetection: 'Enable',
      machineDetectionTimeout: 30,
      machineDetectionSpeechThreshold: 2400,
      machineDetectionSpeechEndThreshold: 1200,
      machineDetectionSilenceTimeout: 5000,
      trim: 'trim-silence',
      callerId: 'Acme',
      asyncAmd: true,
      asyncAmdStatusCallback: 'https://example.com/amd',
      asyncAmdStatusCallbackMethod: 'POST',
      passports: 'pp',
      byoc: 'BY' + 'c'.repeat(32),
      callReason: 'support',
      callToken: 'tok',
      recordingTrack: 'both',
      timeLimit: 3600,
      clientNotificationUrl: 'https://example.com/n',
    });
    const f = form(c);
    for (
      const [k, v] of Object.entries({
        Url: 'https://example.com/twiml',
        Method: 'POST',
        FallbackUrl: 'https://example.com/fb',
        FallbackMethod: 'POST',
        StatusCallback: 'https://example.com/cb',
        StatusCallbackMethod: 'POST',
        SendDigits: '1234',
        Timeout: '30',
        Record: 'true',
        RecordingChannels: 'dual',
        RecordingStatusCallback: 'https://example.com/rcb',
        RecordingConfigurationId: 'rc-1',
        SipAuthUsername: 'user',
        SipAuthPassword: 'pass',
        MachineDetection: 'Enable',
        MachineDetectionTimeout: '30',
        MachineDetectionSpeechThreshold: '2400',
        MachineDetectionSpeechEndThreshold: '1200',
        MachineDetectionSilenceTimeout: '5000',
        Trim: 'trim-silence',
        CallerId: 'Acme',
        AsyncAmd: 'true',
        AsyncAmdStatusCallback: 'https://example.com/amd',
        Passports: 'pp',
        Byoc: 'BY' + 'c'.repeat(32),
        CallReason: 'support',
        CallToken: 'tok',
        RecordingTrack: 'both',
        TimeLimit: '3600',
        ClientNotificationUrl: 'https://example.com/n',
      })
    ) asserts.assertEquals(f.get(k), v, k);
    asserts.assertEquals(f.getAll('StatusCallbackEvent'), ['completed']);
    asserts.assertEquals(f.getAll('RecordingStatusCallbackEvent'), [
      'completed',
    ]);
  });

  it('updateCall maps every optional field to its form parameter', async () => {
    const c = client();
    c.setResponse(validCallResponse, 200);
    await c.updateCall('CA' + '1'.repeat(32), {
      url: 'https://example.com/twiml',
      method: 'POST',
      status: 'completed',
      fallbackUrl: 'https://example.com/fb',
      fallbackMethod: 'POST',
      statusCallback: 'https://example.com/cb',
      statusCallbackMethod: 'POST',
      timeLimit: 60,
    });
    const f = form(c);
    for (
      const [k, v] of Object.entries({
        Url: 'https://example.com/twiml',
        Method: 'POST',
        Status: 'completed',
        FallbackUrl: 'https://example.com/fb',
        FallbackMethod: 'POST',
        StatusCallback: 'https://example.com/cb',
        StatusCallbackMethod: 'POST',
        TimeLimit: '60',
      })
    ) asserts.assertEquals(f.get(k), v, k);
  });

  it('listCalls maps every filter to its query parameter, including the < and > date forms', async () => {
    const c = client();
    c.setResponse(validListCallsResponse, 200);
    await c.listCalls({
      to: '+14155552671',
      from: '+15017122661',
      parentCallSid: 'CA' + 'd'.repeat(32),
      status: 'completed',
      startTime: '2026-01-01',
      startTimeBefore: '2026-01-02',
      startTimeAfter: '2025-12-31',
      endTime: '2026-01-03',
      endTimeBefore: '2026-01-04',
      endTimeAfter: '2026-01-02',
      pageSize: 50,
      page: 1,
      pageToken: 'tok',
    });
    const url = decodeURIComponent(c.request!.url);
    for (
      const part of [
        'To=+14155552671',
        'From=+15017122661',
        'ParentCallSid=CA' + 'd'.repeat(32),
        'Status=completed',
        'StartTime=2026-01-01',
        'StartTime<=2026-01-02',
        'StartTime>=2025-12-31',
        'EndTime=2026-01-03',
        'EndTime<=2026-01-04',
        'EndTime>=2026-01-02',
        'PageSize=50',
        'Page=1',
        'PageToken=tok',
      ]
    ) {
      asserts.assert(url.includes(part), `${part} in ${url}`);
    }
  });
});

const env = envArgs();
const credentials = {
  accountSid: env.get('CONNECTOR_TWILIO_ACCOUNT_SID'),
  authToken: env.get('CONNECTOR_TWILIO_AUTH_TOKEN'),
  fromNumber: env.get('CONNECTOR_TWILIO_FROM_NUMBER'),
  toNumber: env.get('CONNECTOR_TWILIO_TO_NUMBER'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);
const visibleEffectsAllowed = !!env.get('LIVE_TEST_ALLOW_VISIBLE_EFFECTS');

describe({
  name: 'Twilio — live (read-only)',
  // Deno only: Bun/Node each get their own connect-wide live-test job (see
  // the repo's CI matrix), so this suite only registers on Deno — it must
  // not double-run the same live assertions three times.
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('lists real calls from the configured Twilio account (an empty page is still a valid result)', async () => {
      const client = new Twilio({
        accountSid: credentials.accountSid!,
        authToken: credentials.authToken!,
      });
      const page = await client.listCalls({ pageSize: 5 });
      asserts.assertExists(page.calls);
    });

    it('fetches a real call by SID when one exists (skips otherwise)', async () => {
      const client = new Twilio({
        accountSid: credentials.accountSid!,
        authToken: credentials.authToken!,
      });
      const page = await client.listCalls({ pageSize: 1 });
      const existing = page.calls[0];
      if (!existing) {
        // No calls exist yet on this account — nothing to fetch, which is
        // itself a valid, safe outcome.
        return;
      }
      const call = await client.getCall(existing.sid);
      asserts.assertEquals(call.sid, existing.sid);
    });
  },
});

// Twilio has no separate sandbox host — test credentials hit the same API
// and are distinguished only by using Twilio's documented "magic" test
// phone numbers, which simulate delivery with zero real cost/delivery.
// Verified live against Twilio's own docs
// (https://www.twilio.com/docs/iam/test-credentials) as of 2026-08:
//   - `+15005550006` is the only "From" number that passes validation with
//     no error, for both SMS and Voice, when authenticated with a Twilio
//     *Test* Account SID/Auth Token pair (a separate credential pair Twilio
//     issues alongside live credentials — real credentials do not get this
//     treatment). Any other "From" fails with error 21606 (SMS) under test
//     credentials.
//   - Under test credentials, any syntactically-valid E.164 "To" number is
//     accepted without an actual SMS/call ever being placed; specific "To"
//     values (e.g. `+15005550001`) instead simulate specific documented
//     failures for negative testing.
// To run this block without incurring a real SMS/call: set
// CONNECTOR_TWILIO_ACCOUNT_SID/CONNECTOR_TWILIO_AUTH_TOKEN to your Twilio
// *Test* credentials (not your live ones) and CONNECTOR_TWILIO_FROM_NUMBER
// to `+15005550006`.
//
// Even with Twilio's documented test credentials/magic numbers, this is
// gated behind LIVE_TEST_ALLOW_VISIBLE_EFFECTS since the connect can't
// verify which number type — magic/test or real/live — is actually
// configured.
describe({
  name: 'Twilio — live (visible effect: sendMessage / createCall)',
  ignore: !liveTestsEnabled || !visibleEffectsAllowed,
  bun: false,
  node: false,
  fn: () => {
    it('sends a real (or, with test credentials + magic numbers, simulated) SMS', async () => {
      const client = new Twilio({
        accountSid: credentials.accountSid!,
        authToken: credentials.authToken!,
      });
      const message = await client.sendMessage({
        to: credentials.toNumber!,
        from: credentials.fromNumber!,
        body: `[tundra-connect live test — ${new Date().toISOString()}]`,
      });
      asserts.assertExists(message.sid);
    });

    it('creates a real (or, with test credentials + magic numbers, simulated) call', async () => {
      const client = new Twilio({
        accountSid: credentials.accountSid!,
        authToken: credentials.authToken!,
      });
      const call = await client.createCall({
        to: credentials.toNumber!,
        from: credentials.fromNumber!,
        url: 'http://demo.twilio.com/docs/voice.xml',
      });
      asserts.assertExists(call.sid);
    });
  },
});
