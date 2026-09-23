import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { PayPal, type PayPalAuth } from './PayPal.ts';
import { PayPalError } from './errors/mod.ts';

type RequestLog = {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body?: BodyInit | null;
};

type QueueEntry = {
  factory: (init?: RequestInit) => Response | Promise<Response>;
};

class MockPayPal extends PayPal {
  public requests: RequestLog[] = [];
  private queue: QueueEntry[] = [];

  constructor(options: ConstructorParameters<typeof PayPal>[0]) {
    super(options);
    this._fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = String(input);
      const headers: Record<string, string> = {};
      if (init?.headers) {
        for (const [name, value] of new Headers(init.headers as HeadersInit)) {
          headers[name] = value;
        }
      }
      this.requests.push({
        url,
        method: init?.method,
        headers,
        body: init?.body,
      });
      const entry = this.queue.shift();
      if (!entry) {
        throw new Error(
          `MockPayPal: no queued response for ${init?.method ?? 'GET'} ${url}`,
        );
      }
      return entry.factory(init);
    }) as typeof globalThis.fetch;
  }

  queueResponse(
    factory: (init?: RequestInit) => Response | Promise<Response>,
  ): void {
    this.queue.push({ factory });
  }

  queueJSON(body: unknown, status = 200): void {
    this.queueResponse(
      () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
  }

  /** Queues a successful token-exchange response, then N successful JSON responses. */
  queueTokenThen(
    responses: Array<{ body: unknown; status?: number }>,
    accessToken = 'exchanged-token',
    expiresIn = 32400,
  ): void {
    this.queueJSON({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
    });
    for (const r of responses) this.queueJSON(r.body, r.status ?? 200);
  }
}

const TEST_AUTH: PayPalAuth = {
  type: 'CUSTOM',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret-value',
  environment: 'sandbox',
};

const ORDER_RESPONSE = {
  id: '5O190127TN364715T',
  status: 'CREATED',
  intent: 'CAPTURE',
  purchase_units: [
    {
      reference_id: 'default',
      amount: { currency_code: 'USD', value: '10.00' },
    },
  ],
  links: [
    {
      href: 'https://api-m.sandbox.paypal.com/v2/checkout/orders/5O19',
      rel: 'self',
      method: 'GET',
    },
    {
      href: 'https://www.sandbox.paypal.com/checkoutnow?token=5O19',
      rel: 'approve',
      method: 'GET',
    },
  ],
};

const CAPTURED_ORDER_RESPONSE = {
  id: '5O190127TN364715T',
  status: 'COMPLETED',
  purchase_units: [
    {
      reference_id: 'default',
      amount: { currency_code: 'USD', value: '10.00' },
      payments: {
        captures: [
          {
            id: '3C679366HH908993F',
            status: 'COMPLETED',
            amount: { currency_code: 'USD', value: '10.00' },
            final_capture: true,
          },
        ],
      },
    },
  ],
  links: [],
};

const REFUND_RESPONSE = {
  id: '1JU08902RREE',
  status: 'COMPLETED',
  amount: { currency_code: 'USD', value: '10.00' },
};

function errorEnvelope(
  name: string,
  message: string,
  details: Array<{ issue: string; description?: string; field?: string }> = [],
): unknown {
  return { name, message, debug_id: 'abc123', details, links: [] };
}

describe('PayPal', () => {
  describe('configuration', () => {
    it('throws CONFIG_MISSING_AUTH when auth is omitted', () => {
      asserts.assertThrows(
        // deno-lint-ignore no-explicit-any
        () => new MockPayPal({} as any),
        PayPalError,
        'requires auth',
      );
    });

    it('rejects an auth type other than CUSTOM', () => {
      asserts.assertThrows(
        () =>
          // deno-lint-ignore no-explicit-any
          new MockPayPal({
            auth: { type: 'BEARER', token: 'x' } as any,
          }),
        PayPalError,
        'must be { type: "CUSTOM"',
      );
    });

    it('rejects an empty clientId', () => {
      asserts.assertThrows(
        () =>
          new MockPayPal({
            auth: { ...TEST_AUTH, clientId: '   ' },
          }),
        PayPalError,
        'non-empty clientId',
      );
    });

    it('rejects an empty clientSecret', () => {
      asserts.assertThrows(
        () =>
          new MockPayPal({
            auth: { ...TEST_AUTH, clientSecret: '' },
          }),
        PayPalError,
        'non-empty clientSecret',
      );
    });

    it('rejects an invalid environment', () => {
      asserts.assertThrows(
        () =>
          new MockPayPal({
            // deno-lint-ignore no-explicit-any
            auth: { ...TEST_AUTH, environment: 'staging' as any },
          }),
        PayPalError,
        'must be "sandbox" or "live"',
      );
    });

    it('defaults to the sandbox base URL', () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      asserts.assertEquals(client.vendor, 'PayPal');
      asserts.assertEquals(client.environment, 'sandbox');
    });

    it('uses the live base URL when environment is "live"', async () => {
      const client = new MockPayPal({
        auth: { ...TEST_AUTH, environment: 'live' },
      });
      asserts.assertEquals(client.environment, 'live');
      client.queueTokenThen([{ body: ORDER_RESPONSE }]);
      await client.getOrder('5O190127TN364715T');
      asserts.assertStringIncludes(
        client.requests[0]?.url ?? '',
        'https://api-m.paypal.com/v1/oauth2/token',
      );
      asserts.assertStringIncludes(
        client.requests[1]?.url ?? '',
        'https://api-m.paypal.com/v2/checkout/orders/',
      );
    });
  });

  describe('OAuth2 token exchange and cache', () => {
    it('exchanges clientId/clientSecret via HTTP Basic + client_credentials form body', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{ body: ORDER_RESPONSE }]);

      await client.getOrder('5O190127TN364715T');

      asserts.assertEquals(client.requests.length, 2);
      const tokenRequest = client.requests[0]!;
      asserts.assertStringIncludes(
        tokenRequest.url,
        'https://api-m.sandbox.paypal.com/v1/oauth2/token',
      );
      asserts.assertEquals(tokenRequest.method, 'POST');
      asserts.assertEquals(
        tokenRequest.headers['content-type'],
        'application/x-www-form-urlencoded',
      );
      const expectedBasic = btoa(
        `${TEST_AUTH.clientId}:${TEST_AUTH.clientSecret}`,
      );
      asserts.assertEquals(
        tokenRequest.headers['authorization'],
        `Basic ${expectedBasic}`,
      );
      const params = new URLSearchParams(String(tokenRequest.body));
      asserts.assertEquals(params.get('grant_type'), 'client_credentials');

      const apiRequest = client.requests[1]!;
      asserts.assertEquals(
        apiRequest.headers['authorization'],
        'Bearer exchanged-token',
      );
    });

    it('reuses the cached token for a second call within its lifetime — no second exchange', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([
        { body: ORDER_RESPONSE },
        { body: ORDER_RESPONSE },
      ]);

      await client.getOrder('5O190127TN364715T');
      await client.getOrder('5O190127TN364715T');

      // One token exchange + two API calls = 3 requests, not 4.
      asserts.assertEquals(client.requests.length, 3);
      asserts.assertStringIncludes(
        client.requests[0]?.url ?? '',
        '/v1/oauth2/token',
      );
      asserts.assertEquals(
        client.requests[1]?.headers['authorization'],
        'Bearer exchanged-token',
      );
      asserts.assertEquals(
        client.requests[2]?.headers['authorization'],
        'Bearer exchanged-token',
      );
    });

    it('single-flights N concurrent token exchanges for the same identity into one network round-trip', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      const N = 5;
      // deno-lint-ignore no-explicit-any
      const getAccessToken = (auth: PayPalAuth) =>
        (client as any).__getAccessToken(auth) as Promise<string>;

      // Queue N distinct responses — not just one — so a single-flight
      // regression (each concurrent caller redoing its own exchange)
      // surfaces as a clean `requests.length` mismatch rather than an
      // unrelated "no queued response" throw from the mock.
      for (let i = 0; i < N; i++) {
        client.queueJSON({
          access_token: `token-${i}`,
          expires_in: 32400,
        });
      }

      const tokens = await Promise.all(
        Array.from({ length: N }, () => getAccessToken(TEST_AUTH)),
      );

      // Every concurrent caller resolves to the SAME exchanged token...
      asserts.assertEquals(new Set(tokens).size, 1);
      asserts.assertEquals(tokens[0], 'token-0');
      // ...obtained from exactly one token-exchange request, not five.
      asserts.assertEquals(client.requests.length, 1);
    });

    it('does not reuse a cached token across different clientId identities', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      // deno-lint-ignore no-explicit-any
      const getAccessToken = (auth: PayPalAuth) =>
        (client as any).__getAccessToken(auth) as Promise<string>;
      client.queueJSON({ access_token: 'token-a', expires_in: 32400 });
      client.queueJSON({ access_token: 'token-b', expires_in: 32400 });

      const authA: PayPalAuth = { ...TEST_AUTH, clientId: 'client-a' };
      const authB: PayPalAuth = { ...TEST_AUTH, clientId: 'client-b' };

      const tokenA = await getAccessToken(authA);
      const tokenB = await getAccessToken(authB);

      asserts.assertEquals(tokenA, 'token-a');
      asserts.assertEquals(tokenB, 'token-b');
      asserts.assertEquals(client.requests.length, 2);
    });

    it('throws TOKEN_EXCHANGE_FAILED when the token endpoint rejects the credentials', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueJSON(
        {
          error: 'invalid_client',
          error_description: 'Client Authentication failed',
        },
        401,
      );

      const error = await asserts.assertRejects(
        () => client.getOrder('5O190127TN364715T'),
        PayPalError,
        'Failed to exchange PayPal clientId/clientSecret',
      );
      asserts.assertEquals(
        (error as PayPalError).code,
        'TOKEN_EXCHANGE_FAILED',
      );
      // Only the failed token-exchange request was made — never fell
      // through to try the API call without a token.
      asserts.assertEquals(client.requests.length, 1);
    });

    it('throws TOKEN_EXCHANGE_FAILED when the token response fails schema validation', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueJSON({ token_type: 'Bearer' }); // missing access_token/expires_in

      const error = await asserts.assertRejects(
        () => client.getOrder('5O190127TN364715T'),
        PayPalError,
      );
      asserts.assertEquals(
        (error as PayPalError).code,
        'TOKEN_EXCHANGE_FAILED',
      );
    });

    it('re-exchanges after a failed attempt instead of caching the failure', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueJSON({ error: 'invalid_client' }, 401);
      client.queueTokenThen([{ body: ORDER_RESPONSE }]);

      await asserts.assertRejects(() => client.getOrder('5O190127TN364715T'));
      const order = await client.getOrder('5O190127TN364715T');

      asserts.assertEquals(order.id, ORDER_RESPONSE.id);
      // failed exchange + successful exchange + successful API call = 3
      asserts.assertEquals(client.requests.length, 3);
    });
  });

  describe('createOrder', () => {
    it('creates an order', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{ body: ORDER_RESPONSE }]);

      const order = await client.createOrder({
        intent: 'CAPTURE',
        purchase_units: [
          { amount: { currency_code: 'USD', value: '10.00' } },
        ],
      });

      asserts.assertEquals(order.id, ORDER_RESPONSE.id);
      asserts.assertEquals(order.status, 'CREATED');
      const apiRequest = client.requests[1]!;
      asserts.assertEquals(apiRequest.method, 'POST');
      asserts.assertStringIncludes(apiRequest.url, '/v2/checkout/orders');
      const sentBody = JSON.parse(String(apiRequest.body));
      asserts.assertEquals(sentBody.intent, 'CAPTURE');
      asserts.assertEquals(
        sentBody.purchase_units[0].amount.value,
        '10.00',
      );
    });

    it('rejects a locally-invalid request before sending it — value must be a decimal string', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });

      const error = await asserts.assertRejects(
        () =>
          client.createOrder({
            intent: 'CAPTURE',
            purchase_units: [
              { amount: { currency_code: 'USD', value: 'ten dollars' } },
            ],
          }),
        PayPalError,
      );
      asserts.assertEquals(
        (error as PayPalError).code,
        'REQUEST_VALIDATION_ERROR',
      );
      // No network request was made — validation failed before any fetch,
      // including before the token exchange.
      asserts.assertEquals(client.requests.length, 0);
    });

    it('rejects a request missing purchase_units', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      const error = await asserts.assertRejects(
        () =>
          client.createOrder(
            // deno-lint-ignore no-explicit-any
            { intent: 'CAPTURE' } as any,
          ),
        PayPalError,
      );
      asserts.assertEquals(
        (error as PayPalError).code,
        'REQUEST_VALIDATION_ERROR',
      );
    });
  });

  describe('getOrder', () => {
    it('fetches an order by ID', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{ body: ORDER_RESPONSE }]);

      const order = await client.getOrder('5O190127TN364715T');

      asserts.assertEquals(order.id, ORDER_RESPONSE.id);
      const apiRequest = client.requests[1]!;
      asserts.assertEquals(apiRequest.method, 'GET');
      asserts.assertStringIncludes(
        apiRequest.url,
        '/v2/checkout/orders/5O190127TN364715T',
      );
    });

    it('rejects an empty orderId before sending any request', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      const error = await asserts.assertRejects(
        () => client.getOrder(''),
        PayPalError,
      );
      asserts.assertEquals(
        (error as PayPalError).code,
        'INVALID_ORDER_ID',
      );
      asserts.assertEquals(client.requests.length, 0);
    });

    it('rejects a path-traversal orderId before sending any request', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      const error = await asserts.assertRejects(
        () => client.getOrder('..'),
        PayPalError,
      );
      asserts.assertEquals(
        (error as PayPalError).code,
        'INVALID_ORDER_ID',
      );
      asserts.assertEquals(client.requests.length, 0);
    });
  });

  describe('captureOrder', () => {
    it('captures an order with an empty JSON body', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{ body: CAPTURED_ORDER_RESPONSE }]);

      const order = await client.captureOrder('5O190127TN364715T');

      asserts.assertEquals(order.status, 'COMPLETED');
      const capture = order.purchase_units[0]?.payments?.captures?.[0];
      asserts.assertEquals(capture?.id, '3C679366HH908993F');
      asserts.assertEquals(capture?.status, 'COMPLETED');

      const apiRequest = client.requests[1]!;
      asserts.assertEquals(apiRequest.method, 'POST');
      asserts.assertStringIncludes(apiRequest.url, '/capture');
      asserts.assertEquals(JSON.parse(String(apiRequest.body)), {});
    });

    it('rejects an empty orderId before sending any request', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      const error = await asserts.assertRejects(
        () => client.captureOrder('   '),
        PayPalError,
      );
      asserts.assertEquals(
        (error as PayPalError).code,
        'INVALID_ORDER_ID',
      );
      asserts.assertEquals(client.requests.length, 0);
    });
  });

  describe('refundCapture', () => {
    it('issues a full refund when no amount is supplied', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{ body: REFUND_RESPONSE }]);

      const refund = await client.refundCapture('3C679366HH908993F');

      asserts.assertEquals(refund.id, REFUND_RESPONSE.id);
      asserts.assertEquals(refund.status, 'COMPLETED');
      const apiRequest = client.requests[1]!;
      asserts.assertStringIncludes(
        apiRequest.url,
        '/v2/payments/captures/3C679366HH908993F/refund',
      );
      asserts.assertEquals(JSON.parse(String(apiRequest.body)), {});
    });

    it('issues a partial refund with amount + note_to_payer', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{
        body: {
          ...REFUND_RESPONSE,
          amount: { currency_code: 'USD', value: '5.00' },
        },
      }]);

      const refund = await client.refundCapture('3C679366HH908993F', {
        amount: { currency_code: 'USD', value: '5.00' },
        note_to_payer: 'Partial refund',
      });

      asserts.assertEquals(refund.amount?.value, '5.00');
      const apiRequest = client.requests[1]!;
      const sentBody = JSON.parse(String(apiRequest.body));
      asserts.assertEquals(sentBody.amount.value, '5.00');
      asserts.assertEquals(sentBody.note_to_payer, 'Partial refund');
    });

    it('rejects an empty captureId before sending any request', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      const error = await asserts.assertRejects(
        () => client.refundCapture(''),
        PayPalError,
      );
      asserts.assertEquals(
        (error as PayPalError).code,
        'INVALID_CAPTURE_ID',
      );
      asserts.assertEquals(client.requests.length, 0);
    });

    it('rejects a locally-invalid refund amount before sending any request', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      const error = await asserts.assertRejects(
        () =>
          client.refundCapture('3C679366HH908993F', {
            // deno-lint-ignore no-explicit-any
            amount: { currency_code: 'USD', value: 'ten' } as any,
          }),
        PayPalError,
      );
      asserts.assertEquals(
        (error as PayPalError).code,
        'REQUEST_VALIDATION_ERROR',
      );
      asserts.assertEquals(client.requests.length, 0);
    });
  });

  describe('vendor error-envelope mapping', () => {
    it('maps a 422 with details[].issue === PAYER_ACTION_REQUIRED to its own code', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{
        body: errorEnvelope(
          'UNPROCESSABLE_ENTITY',
          'business validation failed',
          [
            {
              issue: 'PAYER_ACTION_REQUIRED',
              description: 'Instruct the buyer to return to PayPal.',
            },
          ],
        ),
        status: 422,
      }]);

      const error = await asserts.assertRejects(
        () => client.captureOrder('5O190127TN364715T'),
        PayPalError,
      );
      asserts.assertEquals(
        (error as PayPalError).code,
        'PAYER_ACTION_REQUIRED',
      );
      asserts.assertEquals(
        (error as PayPalError).getContextValue('issue'),
        'PAYER_ACTION_REQUIRED',
      );
    });

    it('maps a 422 with details[].issue === ACTION_DOES_NOT_MATCH_INTENT to its own code', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{
        body: errorEnvelope(
          'UNPROCESSABLE_ENTITY',
          'business validation failed',
          [
            {
              issue: 'ACTION_DOES_NOT_MATCH_INTENT',
              description:
                'The order was created with intent AUTHORIZE. Use /authorize instead.',
            },
          ],
        ),
        status: 422,
      }]);

      const error = await asserts.assertRejects(
        () => client.captureOrder('5O190127TN364715T'),
        PayPalError,
      );
      asserts.assertEquals(
        (error as PayPalError).code,
        'ACTION_DOES_NOT_MATCH_INTENT',
      );
    });

    it('falls back to VALIDATION_ERROR for an unmapped 422 issue, preserving issue/vendorMessage', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{
        body: errorEnvelope(
          'UNPROCESSABLE_ENTITY',
          'business validation failed',
          [
            {
              issue: 'MISSING_SHIPPING_ADDRESS',
              description: 'Shipping address required.',
            },
          ],
        ),
        status: 422,
      }]);

      const error = await asserts.assertRejects(
        () =>
          client.createOrder({
            intent: 'CAPTURE',
            purchase_units: [{
              amount: { currency_code: 'USD', value: '10.00' },
            }],
          }),
        PayPalError,
      );
      asserts.assertEquals((error as PayPalError).code, 'VALIDATION_ERROR');
      asserts.assertEquals(
        (error as PayPalError).getContextValue('issue'),
        'MISSING_SHIPPING_ADDRESS',
      );
    });

    it('maps a 404 to NOT_FOUND', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{
        body: errorEnvelope(
          'RESOURCE_NOT_FOUND',
          'The specified resource does not exist.',
        ),
        status: 404,
      }]);

      const error = await asserts.assertRejects(
        () => client.getOrder('does-not-exist'),
        PayPalError,
      );
      asserts.assertEquals((error as PayPalError).code, 'NOT_FOUND');
    });

    it('maps a 400 to INVALID_REQUEST', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{
        body: errorEnvelope('INVALID_REQUEST', 'Request is not well-formed.'),
        status: 400,
      }]);

      const error = await asserts.assertRejects(
        () => client.getOrder('bad-request'),
        PayPalError,
      );
      asserts.assertEquals((error as PayPalError).code, 'INVALID_REQUEST');
      asserts.assertStringIncludes(
        error.message,
        'Request is not well-formed.',
      );
    });

    it('maps a 401 (on a regular API call, not the token exchange) to AUTH_FAILED', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{
        body: errorEnvelope('AUTHENTICATION_FAILURE', 'Authentication failed.'),
        status: 401,
      }]);

      const error = await asserts.assertRejects(
        () => client.getOrder('5O190127TN364715T'),
        PayPalError,
      );
      asserts.assertEquals((error as PayPalError).code, 'AUTH_FAILED');
    });

    it('maps a 429 to RATE_LIMITED and a 500 to SERVICE_UNAVAILABLE', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{
        body: errorEnvelope('RATE_LIMIT_REACHED', 'Too many requests.'),
        status: 429,
      }]);
      const rateLimited = await asserts.assertRejects(
        () => client.getOrder('a'),
        PayPalError,
      );
      asserts.assertEquals((rateLimited as PayPalError).code, 'RATE_LIMITED');

      client.queueJSON(
        errorEnvelope('INTERNAL_SERVER_ERROR', 'Something went wrong.'),
        500,
      );
      const unavailable = await asserts.assertRejects(
        () => client.getOrder('b'),
        PayPalError,
      );
      asserts.assertEquals(
        (unavailable as PayPalError).code,
        'SERVICE_UNAVAILABLE',
      );
    });

    it('throws RESPONSE_ERROR for a malformed successful body', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{ body: { id: '123' } }]); // missing required status/purchase_units/links

      const error = await asserts.assertRejects(
        () => client.getOrder('123'),
        PayPalError,
      );
      asserts.assertEquals((error as PayPalError).code, 'RESPONSE_ERROR');
    });
  });

  describe('credential leak protection', () => {
    it('never surfaces clientSecret in a config-validation error', () => {
      let thrown: PayPalError | undefined;
      try {
        new MockPayPal({ auth: { ...TEST_AUTH, clientSecret: '' } });
      } catch (error) {
        thrown = error as PayPalError;
      }
      asserts.assertExists(thrown);
      const serialized = JSON.stringify(thrown!.toJSON());
      asserts.assertEquals(
        serialized.includes(TEST_AUTH.clientSecret),
        false,
      );
      asserts.assertEquals(
        thrown!.message.includes(TEST_AUTH.clientSecret),
        false,
      );
    });

    it('never surfaces clientSecret when the token exchange itself fails', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueJSON(
        {
          error: 'invalid_client',
          error_description: 'Client Authentication failed',
        },
        401,
      );

      const error = await asserts.assertRejects(
        () => client.getOrder('5O190127TN364715T'),
        PayPalError,
      );
      const serialized = JSON.stringify((error as PayPalError).toJSON());
      asserts.assertEquals(
        serialized.includes(TEST_AUTH.clientSecret),
        false,
      );
      asserts.assertEquals(
        (error as PayPalError).message.includes(TEST_AUTH.clientSecret),
        false,
      );
      // The Basic-auth header itself must never leak either, even
      // base64-encoded.
      const encoded = btoa(`${TEST_AUTH.clientId}:${TEST_AUTH.clientSecret}`);
      asserts.assertEquals(serialized.includes(encoded), false);
    });

    it('never surfaces clientSecret on a vendor error response from a normal API call', async () => {
      const client = new MockPayPal({ auth: TEST_AUTH });
      client.queueTokenThen([{
        body: errorEnvelope('INVALID_REQUEST', 'bad request'),
        status: 400,
      }]);

      const error = await asserts.assertRejects(
        () => client.getOrder('5O190127TN364715T'),
        PayPalError,
      );
      const serialized = JSON.stringify((error as PayPalError).toJSON());
      asserts.assertEquals(
        serialized.includes(TEST_AUTH.clientSecret),
        false,
      );
    });
  });
});

// =============================================================================
// Live tests — run only when real PayPal sandbox credentials are present in
// the environment. Skipped (not failed) otherwise, and on Bun/Node
// regardless of credentials — this suite is Deno-only.
// =============================================================================

describe('PayPal — verifyWebhook', () => {
  const PAYLOAD = JSON.stringify({
    id: 'WH-EVT-1',
    event_type: 'CHECKOUT.ORDER.APPROVED',
  });
  const HDRS = {
    'paypal-transmission-id': 'tid',
    'paypal-transmission-time': '2026-01-01T00:00:00Z',
    'paypal-cert-url': 'https://api.paypal.com/cert.pem',
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-transmission-sig': 'c2ln',
  };
  it('posts the transmission back verbatim and returns the event on SUCCESS', async () => {
    const c = new MockPayPal({ auth: TEST_AUTH });
    c.queueTokenThen(
      [{
        body: { verification_status: 'SUCCESS' },
      }],
      'tok',
      32400,
    );
    const event = await c.verifyWebhook({
      payload: PAYLOAD,
      headers: HDRS,
      webhookId: 'WH-1',
    }) as { id: string };
    asserts.assertEquals(event.id, 'WH-EVT-1');
    const verify = c.requests.find((r) =>
      r.url.endsWith('/v1/notifications/verify-webhook-signature')
    )!;
    const body = JSON.parse(String(verify.body));
    asserts.assertEquals(body.webhook_id, 'WH-1');
    asserts.assertEquals(body.transmission_id, 'tid');
    asserts.assertEquals(body.webhook_event, JSON.parse(PAYLOAD));
  });
  it('throws WEBHOOK_SIGNATURE_INVALID on FAILURE', async () => {
    const c = new MockPayPal({ auth: TEST_AUTH });
    c.queueTokenThen(
      [{
        body: { verification_status: 'FAILURE' },
      }],
      'tok',
      32400,
    );
    const err = await asserts.assertRejects(
      () =>
        c.verifyWebhook({ payload: PAYLOAD, headers: HDRS, webhookId: 'WH-1' }),
      PayPalError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });
  it('rejects a missing transmission header without calling PayPal', async () => {
    const c = new MockPayPal({ auth: TEST_AUTH });
    const { 'paypal-transmission-sig': _s, ...partial } = HDRS;
    const err = await asserts.assertRejects(
      () =>
        c.verifyWebhook({
          payload: PAYLOAD,
          headers: partial,
          webhookId: 'WH-1',
        }),
      PayPalError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_INVALID_HEADERS');
    asserts.assertEquals(c.requests.length, 0);
  });
});

describe('PayPal — idempotency', () => {
  it('sends PayPal-Request-Id only when a key is given', async () => {
    const c = new MockPayPal({ auth: TEST_AUTH });
    c.queueTokenThen(
      [{ body: ORDER_RESPONSE }, { body: ORDER_RESPONSE }],
      'tok',
      32400,
    );
    await c.createOrder({
      intent: 'CAPTURE',
      purchase_units: [
        { amount: { currency_code: 'USD', value: '10.00' } },
      ],
    }, { idempotencyKey: 'order-42' });
    await c.createOrder({
      intent: 'CAPTURE',
      purchase_units: [
        { amount: { currency_code: 'USD', value: '10.00' } },
      ],
    });
    const posts = c.requests.filter((r) =>
      r.url.endsWith('/v2/checkout/orders')
    );
    asserts.assertEquals(posts[0]!.headers['paypal-request-id'], 'order-42');
    asserts.assertEquals(posts[1]!.headers['paypal-request-id'], undefined);
  });
  it('newIdempotencyKey() is a ULID from @tundralibs/id', () => {
    asserts.assertMatch(PayPal.newIdempotencyKey(), /^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});

const env = envArgs();
const credentials = {
  clientId: env.get('CONNECTOR_PAYPAL_CLIENT_ID'),
  clientSecret: env.get('CONNECTOR_PAYPAL_CLIENT_SECRET'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'PayPal — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('creates a real sandbox order, then fetches it back', async () => {
      // `environment` is hardcoded to 'sandbox' here, deliberately not
      // env-driven — a live test must never be able to target 'live'.
      const client = new PayPal({
        auth: {
          type: 'CUSTOM',
          clientId: credentials.clientId!,
          clientSecret: credentials.clientSecret!,
          environment: 'sandbox',
        },
      });

      const order = await client.createOrder({
        intent: 'CAPTURE',
        purchase_units: [
          { amount: { currency_code: 'USD', value: '1.00' } },
        ],
      });
      asserts.assertEquals(order.status, 'CREATED');

      const fetched = await client.getOrder(order.id);
      asserts.assertEquals(fetched.id, order.id);

      // captureOrder is deliberately NOT exercised here: PayPal's
      // documented flow requires the buyer to approve the order in an
      // interactive checkout first — not producible through this API
      // alone. No cleanup is needed either way; an uncaptured sandbox
      // order simply expires.
    });
  },
});
