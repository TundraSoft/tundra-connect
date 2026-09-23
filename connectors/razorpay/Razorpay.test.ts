import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { Razorpay } from './Razorpay.ts';
import { RazorpayError } from './errors/mod.ts';

const validOrder = {
  id: 'order_EKwxwAgItmmXdp',
  entity: 'order',
  amount: 29900,
  amount_paid: 0,
  amount_due: 29900,
  currency: 'INR',
  receipt: 'receipt#1',
  offer_id: null,
  status: 'created',
  attempts: 0,
  notes: {},
  created_at: 1582637108,
};

const validPayment = {
  id: 'pay_29QQoUBi66xm2f',
  entity: 'payment',
  amount: 29900,
  currency: 'INR',
  status: 'authorized',
  order_id: 'order_EKwxwAgItmmXdp',
  invoice_id: null,
  international: false,
  method: 'card',
  amount_refunded: 0,
  refund_status: null,
  captured: false,
  description: 'Order #1',
  email: 'gaurav.kumar@example.com',
  contact: '+919876543210',
  notes: {},
  fee: null,
  tax: null,
  error_code: null,
  error_description: null,
  error_source: null,
  error_step: null,
  error_reason: null,
  created_at: 1582637108,
};

const validCapturedPayment = {
  ...validPayment,
  status: 'captured',
  captured: true,
};

const validPaymentLink = {
  id: 'plink_JXPUQu6ftD5WLu',
  short_url: 'https://rzp.io/i/nxrHnLJ',
  status: 'created',
  amount: 29900,
  amount_paid: 0,
  currency: 'INR',
  created_at: 1600188707,
  expire_by: null,
};

class MockRazorpay extends Razorpay {
  public request?: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
  private responseBody: unknown;
  private responseStatus = 200;

  setResponse(body: unknown, status = 200): void {
    this.responseBody = body;
    this.responseStatus = status;
    this._fetch = (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body as string | undefined,
      };
      return Promise.resolve(
        new Response(JSON.stringify(this.responseBody), {
          status: this.responseStatus,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    };
  }
}

/** Case-insensitive header lookup — RESTler's own headers merge preserves whatever casing was set. */
function getHeader(
  headers: Record<string, string> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1];
}

const validAuth = {
  type: 'BASIC' as const,
  username: 'rzp_test_abc123',
  password: 'secretkeyvalue',
};

describe('Razorpay', () => {
  it('constructs with a valid key_id/key_secret pair and exposes keyId', () => {
    const client = new MockRazorpay({ auth: validAuth });
    asserts.assertEquals(client.vendor, 'Razorpay');
    asserts.assertEquals(client.keyId, 'rzp_test_abc123');
  });

  it('accepts a live-mode key', () => {
    const client = new MockRazorpay({
      auth: { type: 'BASIC', username: 'rzp_live_abc123', password: 'x' },
    });
    asserts.assertEquals(client.keyId, 'rzp_live_abc123');
  });

  it('rejects a missing auth option', () => {
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => new MockRazorpay({} as any),
      RazorpayError,
    );
  });

  it('rejects a non-BASIC auth type', () => {
    asserts.assertThrows(
      () =>
        new MockRazorpay({
          auth: { type: 'BEARER', token: 'rzp_test_abc123' },
        }),
      RazorpayError,
    );
  });

  it('rejects a key_id with the wrong prefix', () => {
    asserts.assertThrows(
      () =>
        new MockRazorpay({
          auth: { type: 'BASIC', username: 'sk_test_abc123', password: 'x' },
        }),
      RazorpayError,
    );
  });

  it('rejects an empty key_secret', () => {
    asserts.assertThrows(
      () =>
        new MockRazorpay({
          auth: { type: 'BASIC', username: 'rzp_test_abc123', password: '' },
        }),
      RazorpayError,
    );
  });

  it('never leaks the key_secret into a thrown config error', () => {
    const secret = 'REALSECRETVALUE1234';
    let caught: RazorpayError | undefined;
    try {
      new MockRazorpay({
        auth: { type: 'BASIC', username: 'bogus_key_id', password: secret },
      });
    } catch (err) {
      caught = err as RazorpayError;
    }
    asserts.assertExists(caught);
    asserts.assertEquals(caught?.message.includes(secret), false);
    asserts.assertEquals(
      JSON.stringify(caught?.toJSON()).includes(secret),
      false,
    );
  });

  it('sends key_id/key_secret as a Basic credential', async () => {
    const client = new MockRazorpay({ auth: validAuth });
    client.setResponse(validOrder, 200);

    await client.createOrder({ amount: 29900, currency: 'INR' });

    const expected = `Basic ${btoa('rzp_test_abc123:secretkeyvalue')}`;
    asserts.assertEquals(
      getHeader(client.request?.headers, 'Authorization'),
      expected,
    );
  });

  it('never leaks the key_secret through a vendor-error response cycle', async () => {
    const secret = 'secretkeyvalue';
    const client = new MockRazorpay({ auth: validAuth });
    client.setResponse({
      error: { code: 'BAD_REQUEST_ERROR', description: 'bad request' },
    }, 400);

    const error = await asserts.assertRejects(
      () => client.createOrder({ amount: 29900, currency: 'INR' }),
      RazorpayError,
    );
    asserts.assertEquals(error.message.includes(secret), false);
    asserts.assertEquals(
      JSON.stringify(error.toJSON()).includes(secret),
      false,
    );
  });

  describe('createOrder', () => {
    it('sends a JSON POST and validates/returns the response', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validOrder, 200);

      const order = await client.createOrder({
        amount: 29900,
        currency: 'INR',
        receipt: 'receipt#1',
      });

      asserts.assertEquals(client.request?.method, 'POST');
      asserts.assertStringIncludes(client.request?.url ?? '', '/v1/orders');
      asserts.assertEquals(
        getHeader(client.request?.headers, 'Content-Type'),
        'application/json',
      );
      const body = JSON.parse(client.request?.body ?? '{}');
      asserts.assertEquals(body.amount, 29900);
      asserts.assertEquals(body.currency, 'INR');
      asserts.assertEquals(body.receipt, 'receipt#1');
      asserts.assertEquals(order.id, validOrder.id);
      asserts.assertEquals(order.status, 'created');
    });

    it('normalizes a `notes: []` response quirk into an empty object', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse({ ...validOrder, notes: [] }, 200);

      const order = await client.createOrder({
        amount: 29900,
        currency: 'INR',
      });
      asserts.assertEquals(order.notes, {});
    });

    it('rejects a non-integer amount before calling the API (async contract)', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validOrder, 200);

      await asserts.assertRejects(
        () => client.createOrder({ amount: 299.5, currency: 'INR' }),
        RazorpayError,
        'local validation',
      );
      asserts.assertEquals(client.request, undefined);
    });

    it('rejects a negative amount', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validOrder, 200);

      await asserts.assertRejects(
        () => client.createOrder({ amount: -100, currency: 'INR' }),
        RazorpayError,
      );
    });

    it('rejects a lowercase currency code', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validOrder, 200);

      await asserts.assertRejects(
        () => client.createOrder({ amount: 29900, currency: 'inr' }),
        RazorpayError,
      );
    });

    it('rejects notes with more than 15 entries', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validOrder, 200);

      const notes: Record<string, string> = {};
      for (let i = 0; i < 16; i++) notes[`key${i}`] = 'value';

      await asserts.assertRejects(
        () => client.createOrder({ amount: 29900, currency: 'INR', notes }),
        RazorpayError,
      );
    });
  });

  describe('getOrder', () => {
    it('sends a bare GET with no body', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validOrder, 200);

      const order = await client.getOrder('order_EKwxwAgItmmXdp');

      asserts.assertEquals(client.request?.method, 'GET');
      asserts.assertEquals(client.request?.body, undefined);
      asserts.assertStringIncludes(
        client.request?.url ?? '',
        '/v1/orders/order_EKwxwAgItmmXdp',
      );
      asserts.assertEquals(order.id, validOrder.id);
    });

    it('rejects a malformed order id before calling the API', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validOrder, 200);

      await asserts.assertRejects(
        () => client.getOrder('pay_notAnOrder'),
        RazorpayError,
      );
      asserts.assertEquals(client.request, undefined);
    });
  });

  describe('capturePayment', () => {
    it('sends a JSON POST to /payments/{id}/capture and returns the captured payment', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validCapturedPayment, 200);

      const payment = await client.capturePayment('pay_29QQoUBi66xm2f', {
        amount: 29900,
        currency: 'INR',
      });

      asserts.assertEquals(client.request?.method, 'POST');
      asserts.assertStringIncludes(
        client.request?.url ?? '',
        '/v1/payments/pay_29QQoUBi66xm2f/capture',
      );
      const body = JSON.parse(client.request?.body ?? '{}');
      asserts.assertEquals(body.amount, 29900);
      asserts.assertEquals(body.currency, 'INR');
      asserts.assertEquals(payment.status, 'captured');
      asserts.assertEquals(payment.captured, true);
    });

    it('rejects a malformed payment id before calling the API', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validCapturedPayment, 200);

      await asserts.assertRejects(
        () =>
          client.capturePayment('order_notAPayment', {
            amount: 29900,
            currency: 'INR',
          }),
        RazorpayError,
      );
      asserts.assertEquals(client.request, undefined);
    });

    it('rejects a missing amount before calling the API', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validCapturedPayment, 200);

      await asserts.assertRejects(
        () =>
          // deno-lint-ignore no-explicit-any
          client.capturePayment(
            'pay_29QQoUBi66xm2f',
            { currency: 'INR' } as any,
          ),
        RazorpayError,
      );
    });
  });

  describe('getPayment', () => {
    it('sends a bare GET with no body', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validPayment, 200);

      const payment = await client.getPayment('pay_29QQoUBi66xm2f');

      asserts.assertEquals(client.request?.method, 'GET');
      asserts.assertStringIncludes(
        client.request?.url ?? '',
        '/v1/payments/pay_29QQoUBi66xm2f',
      );
      asserts.assertEquals(payment.id, validPayment.id);
      asserts.assertEquals(payment.status, 'authorized');
    });

    it('accepts a payment with a populated method-specific field', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse({
        ...validPayment,
        vpa: 'gaurav.kumar@okhdfcbank',
        method: 'upi',
      }, 200);

      const payment = await client.getPayment('pay_29QQoUBi66xm2f');
      asserts.assertEquals(payment.vpa, 'gaurav.kumar@okhdfcbank');
    });
  });

  describe('createPaymentLink', () => {
    it('sends a JSON POST and validates/returns the response', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validPaymentLink, 200);

      const link = await client.createPaymentLink({
        amount: 29900,
        description: 'Payment for order #1',
        customer: { name: 'Gaurav Kumar', email: 'gaurav.kumar@example.com' },
      });

      asserts.assertEquals(client.request?.method, 'POST');
      asserts.assertStringIncludes(
        client.request?.url ?? '',
        '/v1/payment_links',
      );
      const body = JSON.parse(client.request?.body ?? '{}');
      asserts.assertEquals(body.amount, 29900);
      asserts.assertEquals(body.customer.name, 'Gaurav Kumar');
      asserts.assertEquals(link.short_url, validPaymentLink.short_url);
    });

    it("accepts callback_method: 'get' alongside a callback_url", async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validPaymentLink, 200);

      await client.createPaymentLink({
        amount: 29900,
        callback_url: 'https://example.com/callback',
        callback_method: 'get',
      });

      const body = JSON.parse(client.request?.body ?? '{}');
      asserts.assertEquals(body.callback_method, 'get');
    });

    it("rejects callback_method values other than 'get' before calling the API", async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validPaymentLink, 200);

      await asserts.assertRejects(
        () =>
          client.createPaymentLink({
            amount: 29900,
            callback_url: 'https://example.com/callback',
            // deno-lint-ignore no-explicit-any
            callback_method: 'post' as any,
          }),
        RazorpayError,
      );
      asserts.assertEquals(client.request, undefined);
    });
  });

  describe('listPayments', () => {
    it('sends a GET with count/skip as query parameters', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(
        { entity: 'collection', count: 1, items: [validPayment] },
        200,
      );

      const page = await client.listPayments({ count: 20, skip: 10 });

      asserts.assertEquals(client.request?.method, 'GET');
      const url = new URL(client.request?.url ?? '');
      asserts.assertEquals(url.searchParams.get('count'), '20');
      asserts.assertEquals(url.searchParams.get('skip'), '10');
      asserts.assertEquals(page.count, 1);
      asserts.assertEquals(page.items[0]?.id, validPayment.id);
    });

    it('defaults to no query parameters when called with no arguments', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse({ entity: 'collection', count: 0, items: [] }, 200);

      await client.listPayments();

      const url = new URL(client.request?.url ?? '');
      asserts.assertEquals(url.searchParams.has('count'), false);
      asserts.assertEquals(url.searchParams.has('skip'), false);
    });

    it('rejects a count above 100 before calling the API', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse({ entity: 'collection', count: 0, items: [] }, 200);

      await asserts.assertRejects(
        () => client.listPayments({ count: 101 }),
        RazorpayError,
      );
      asserts.assertEquals(client.request, undefined);
    });
  });

  describe('error mapping', () => {
    it('maps BAD_REQUEST_ERROR', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse({
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'The amount must be at least INR 1.00',
          field: 'amount',
          source: 'business',
          step: 'payment_initiation',
          reason: 'input_validation_failed',
        },
      }, 400);

      const error = await asserts.assertRejects(
        () => client.createOrder({ amount: 1, currency: 'INR' }),
        RazorpayError,
        'INR 1.00',
      );
      asserts.assertEquals(error.code, 'BAD_REQUEST_ERROR');
      asserts.assertEquals(error.getContextValue('field'), 'amount');
      asserts.assertEquals(error.getContextValue('source'), 'business');
      asserts.assertEquals(error.getContextValue('step'), 'payment_initiation');
      asserts.assertEquals(
        error.getContextValue('reason'),
        'input_validation_failed',
      );
    });

    it('maps GATEWAY_ERROR', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse({
        error: {
          code: 'GATEWAY_ERROR',
          description: 'The bank declined the request.',
        },
      }, 502);

      const error = await asserts.assertRejects(
        () => client.getPayment('pay_29QQoUBi66xm2f'),
        RazorpayError,
        'gateway or downstream bank',
      );
      asserts.assertEquals(error.code, 'GATEWAY_ERROR');
    });

    it('maps SERVER_ERROR', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse({
        error: {
          code: 'SERVER_ERROR',
          description: 'We are facing some trouble completing your request.',
        },
      }, 500);

      const error = await asserts.assertRejects(
        () => client.getOrder('order_EKwxwAgItmmXdp'),
        RazorpayError,
        'internal error',
      );
      asserts.assertEquals(error.code, 'SERVER_ERROR');
    });

    it("maps the vendor's own SERVICE_UNAVAILABLE code", async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          description: 'The service is temporarily unavailable.',
        },
      }, 503);

      const error = await asserts.assertRejects(
        () => client.getOrder('order_EKwxwAgItmmXdp'),
        RazorpayError,
      );
      asserts.assertEquals(error.code, 'SERVICE_UNAVAILABLE');
    });

    it('falls back to a status-derived code when error.code is unrecognised', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse({
        error: { code: 'SOME_NEW_VENDOR_CODE', description: 'unrecognised' },
      }, 400);

      const error = await asserts.assertRejects(
        () => client.getOrder('order_EKwxwAgItmmXdp'),
        RazorpayError,
      );
      asserts.assertEquals(error.code, 'BAD_REQUEST_ERROR');
    });

    it('treats an unparseable error body as SERVICE_UNAVAILABLE (5xx)', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse('<html>Internal Server Error</html>', 502);

      const error = await asserts.assertRejects(
        () => client.getOrder('order_EKwxwAgItmmXdp'),
        RazorpayError,
      );
      asserts.assertEquals(error.code, 'SERVICE_UNAVAILABLE');
    });

    it('treats an unparseable error body as RESPONSE_ERROR (non-5xx)', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse({ oops: true }, 400);

      const error = await asserts.assertRejects(
        () => client.getOrder('order_EKwxwAgItmmXdp'),
        RazorpayError,
      );
      asserts.assertEquals(error.code, 'RESPONSE_ERROR');
    });

    it('rejects a malformed 2xx success response', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse({ id: 'not-enough-fields' }, 200);

      const error = await asserts.assertRejects(
        () => client.getOrder('order_EKwxwAgItmmXdp'),
        RazorpayError,
      );
      asserts.assertEquals(error.code, 'RESPONSE_ERROR');
    });

    it('treats a 3xx status as success (repo-wide < 400 convention)', async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validOrder, 302);

      const order = await client.getOrder('order_EKwxwAgItmmXdp');
      asserts.assertEquals(order.id, validOrder.id);
    });
  });
});

// =============================================================================
// Live tests — run only when real Razorpay test-mode credentials are present
// in the environment. Skipped (not failed) otherwise, and on Bun/Node
// regardless of credentials — this suite is Deno-only.
// =============================================================================

describe('Razorpay — path safety', () => {
  // Regression for a real traversal: the id guards used `\S+`, which
  // matched `/` and `.`, so `getPayment('pay_../../../orders')` passed
  // validation and the request went to `/v1/orders` — the merchant's whole
  // order book, with their Basic auth attached.
  const traversals = [
    'pay_../../../orders',
    'pay_x/y',
    'pay_x?count=100',
    'pay_x#frag',
    'pay_..',
  ];

  for (const id of traversals) {
    it(`rejects ${JSON.stringify(id)} before any request is sent`, async () => {
      const client = new MockRazorpay({ auth: validAuth });
      client.setResponse(validPayment, 200);
      await asserts.assertRejects(() => client.getPayment(id), RazorpayError);
      asserts.assertEquals(client.request, undefined);
    });
  }

  it('rejects an order id that escapes its segment', async () => {
    const client = new MockRazorpay({ auth: validAuth });
    client.setResponse(validOrder, 200);
    await asserts.assertRejects(
      () => client.getOrder('order_../../../payments'),
      RazorpayError,
    );
    asserts.assertEquals(client.request, undefined);
  });

  it('still accepts the documented alphanumeric id shapes verbatim on the wire', async () => {
    const client = new MockRazorpay({ auth: validAuth });
    client.setResponse(validPayment, 200);
    await client.getPayment('pay_29QQoUBi66xm2f');
    asserts.assert(
      client.request!.url.endsWith('/v1/payments/pay_29QQoUBi66xm2f'),
    );
    client.setResponse(validOrder, 200);
    await client.getOrder('order_EKwxwAgItmmXdp');
    asserts.assert(
      client.request!.url.endsWith('/v1/orders/order_EKwxwAgItmmXdp'),
    );
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

describe('Razorpay — verifyWebhook', () => {
  const SECRET = 'rzp_webhook_secret';
  const PAYLOAD = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_1' } } },
  });
  const client = () => new MockRazorpay({ auth: validAuth });
  it('accepts a genuine HMAC-SHA256 hex signature over the raw body', async () => {
    const event = await client().verifyWebhook({
      payload: PAYLOAD,
      headers: { 'x-razorpay-signature': await hmacHex(SECRET, PAYLOAD) },
      secret: SECRET,
    }) as { event: string };
    asserts.assertEquals(event.event, 'payment.captured');
  });
  it('rejects a tampered payload', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD + ' ',
          headers: { 'x-razorpay-signature': await hmacHex(SECRET, PAYLOAD) },
          secret: SECRET,
        }),
      RazorpayError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });
  it('rejects the wrong secret', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: { 'x-razorpay-signature': await hmacHex('other', PAYLOAD) },
          secret: SECRET,
        }),
      RazorpayError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });
  it('rejects a missing header', async () => {
    const err = await asserts.assertRejects(
      () =>
        client().verifyWebhook({
          payload: PAYLOAD,
          headers: {},
          secret: SECRET,
        }),
      RazorpayError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_INVALID_HEADERS');
  });
});

const env = envArgs();
const credentials = {
  keyId: env.get('CONNECTOR_RAZORPAY_KEY_ID'),
  keySecret: env.get('CONNECTOR_RAZORPAY_KEY_SECRET'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'Razorpay — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('creates a real test-mode order, then fetches it back', async () => {
      const client = new Razorpay({
        auth: {
          type: 'BASIC',
          username: credentials.keyId!,
          password: credentials.keySecret!,
        },
      });

      // 100 paise = ₹1.00, Razorpay's minimum order amount.
      const order = await client.createOrder({
        amount: 100,
        currency: 'INR',
        receipt: `tundra-connect-live-test-${Date.now()}`,
      });
      asserts.assertEquals(order.amount, 100);
      asserts.assertEquals(order.currency, 'INR');

      const fetched = await client.getOrder(order.id);
      asserts.assertEquals(fetched.id, order.id);
      asserts.assertEquals(fetched.amount, order.amount);

      // capturePayment is deliberately NOT exercised here: it requires a
      // real authorized payment id, only obtainable via an interactive
      // checkout — not producible through this API alone. No cleanup is
      // needed either way; an uncaptured test-mode order is harmless and
      // only ever visible on the dashboard.
    });
  },
});
