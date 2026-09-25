import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { Stripe } from './Stripe.ts';
import { StripeError } from './errors/mod.ts';

const validPaymentIntent = {
  id: 'pi_3Nx0aB2c3D4e5F6g',
  object: 'payment_intent',
  amount: 1999,
  amount_capturable: 0,
  amount_received: 0,
  currency: 'usd',
  status: 'requires_payment_method',
  client_secret: 'pi_3Nx0aB2c3D4e5F6g_secret_abc',
  created: 1700000000,
  customer: null,
  description: null,
  livemode: false,
  metadata: {},
  payment_method: null,
  payment_method_types: ['card'],
  capture_method: 'automatic',
  confirmation_method: 'automatic',
  last_payment_error: null,
  latest_charge: null,
  next_action: null,
};

const validCustomer = {
  id: 'cus_abc123',
  object: 'customer',
  address: null,
  balance: 0,
  created: 1700000000,
  currency: null,
  default_source: null,
  delinquent: false,
  description: null,
  email: 'jenny@example.com',
  invoice_prefix: 'ABC123',
  invoice_settings: {},
  livemode: false,
  metadata: {},
  name: 'Jenny Rosen',
  next_invoice_sequence: 1,
  phone: null,
  preferred_locales: [],
  shipping: null,
  tax_exempt: 'none',
};

class MockStripe extends Stripe {
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
    this._fetch = async (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body as string | undefined,
      };
      return new Response(JSON.stringify(this.responseBody), {
        status: this.responseStatus,
        headers: { 'Content-Type': 'application/json' },
      });
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

describe('Stripe', () => {
  it('exposes validated configuration through named getters', () => {
    const client = new MockStripe({
      auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
    });
    asserts.assertEquals(client.vendor, 'Stripe');
    // The secret key is deliberately NOT readable back off the client —
    // see Stripe.ts's credential-custody note.
    asserts.assertEquals(
      (client as unknown as Record<string, unknown>).secretKey,
      undefined,
    );
  });

  it('accepts a restricted key', () => {
    const client = new MockStripe({
      auth: { type: 'BASIC', username: 'rk_live_abc123', password: '' },
    });
    asserts.assertEquals(
      (client as unknown as Record<string, unknown>).secretKey,
      undefined,
    );
  });

  it('rejects a missing auth option', () => {
    asserts.assertThrows(
      // deno-lint-ignore no-explicit-any
      () => new MockStripe({} as any),
      StripeError,
      'must be a non-empty string',
    );
  });

  it('rejects an empty username in auth', () => {
    asserts.assertThrows(
      () =>
        new MockStripe({
          auth: { type: 'BASIC', username: '', password: '' },
        }),
      StripeError,
      'must be a non-empty string',
    );
  });

  it('rejects a username with the wrong prefix (e.g. a publishable key)', () => {
    asserts.assertThrows(
      () =>
        new MockStripe({
          auth: { type: 'BASIC', username: 'pk_test_abc123', password: '' },
        }),
      StripeError,
      'must be a non-empty string',
    );
  });

  it('rejects a non-BASIC auth type', () => {
    asserts.assertThrows(
      () =>
        new MockStripe({
          auth: { type: 'BEARER', token: 'sk_test_abc123' },
        }),
      StripeError,
      'must be a non-empty string',
    );
  });

  it('never leaks the offending secretKey value into the thrown error', () => {
    const secret = 'sk_live_REALSECRETVALUE1234';
    let caught: StripeError | undefined;
    try {
      // A trailing newline (e.g. pasted from a `.env` file) fails
      // secretKeyGuard's format check just like a malformed prefix would.
      new MockStripe({
        auth: { type: 'BASIC', username: `${secret}\n`, password: '' },
      });
    } catch (err) {
      caught = err as StripeError;
    }
    asserts.assertExists(caught);
    asserts.assertEquals(caught?.message.includes(secret), false);
    asserts.assertEquals(
      JSON.stringify(caught?.toJSON()).includes(secret),
      false,
    );
  });

  it('sends the secret key as a Basic credential with an empty password', async () => {
    const client = new MockStripe({
      auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
    });
    client.setResponse(validPaymentIntent, 200);

    await client.retrievePaymentIntent('pi_3Nx0aB2c3D4e5F6g');

    // Computed independently of RESTler's own `_base64Utf8` (rather than
    // reusing it) so this assertion actually checks the encoding rather
    // than just restating it.
    const expected = `Basic ${btoa('sk_test_abc123:')}`;
    asserts.assertEquals(
      getHeader(client.request?.headers, 'Authorization'),
      expected,
    );
  });

  describe('createPaymentIntent', () => {
    it('form-encodes the request as application/x-www-form-urlencoded with bracket notation', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validPaymentIntent, 200);

      await client.createPaymentIntent({
        amount: 1999,
        currency: 'usd',
        metadata: { orderId: '42', note: 'a b' },
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        confirm: true,
      });

      // Content-Type must be the urlencoded form, never RESTler's default
      // multipart/form-data (which 'FORM' contentType would produce) nor
      // TEXT's own default of text/plain.
      asserts.assertEquals(
        getHeader(client.request?.headers, 'Content-Type'),
        'application/x-www-form-urlencoded',
      );
      asserts.assertEquals(client.request?.method, 'POST');

      const body = client.request?.body ?? '';
      asserts.assertEquals(typeof body, 'string');
      // Raw wire-format assertions — brackets are percent-encoded ([ → %5B, ] → %5D).
      asserts.assertStringIncludes(body, 'amount=1999');
      asserts.assertStringIncludes(body, 'currency=usd');
      asserts.assertStringIncludes(body, 'metadata%5BorderId%5D=42');
      asserts.assertStringIncludes(body, 'metadata%5Bnote%5D=a%20b');
      asserts.assertStringIncludes(
        body,
        'automatic_payment_methods%5Benabled%5D=true',
      );
      asserts.assertStringIncludes(
        body,
        'automatic_payment_methods%5Ballow_redirects%5D=never',
      );
      asserts.assertStringIncludes(body, 'confirm=true');

      // Round-trip through URLSearchParams (which percent-decodes) to
      // confirm the bracket-notation keys resolve to the right values.
      const params = new URLSearchParams(body);
      asserts.assertEquals(params.get('amount'), '1999');
      asserts.assertEquals(params.get('currency'), 'usd');
      asserts.assertEquals(params.get('metadata[orderId]'), '42');
      asserts.assertEquals(params.get('metadata[note]'), 'a b');
      asserts.assertEquals(
        params.get('automatic_payment_methods[enabled]'),
        'true',
      );
      asserts.assertEquals(
        params.get('automatic_payment_methods[allow_redirects]'),
        'never',
      );
      asserts.assertEquals(params.get('confirm'), 'true');
    });

    it('encodes array parameters with explicit numeric indices', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validPaymentIntent, 200);

      await client.createPaymentIntent({
        amount: 500,
        currency: 'usd',
        payment_method_types: ['card', 'ideal'],
      });

      const body = client.request?.body ?? '';
      const params = new URLSearchParams(body);
      asserts.assertEquals(params.get('payment_method_types[0]'), 'card');
      asserts.assertEquals(params.get('payment_method_types[1]'), 'ideal');
    });

    it('omits a genuinely-empty array from the encoded body entirely', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validPaymentIntent, 200);

      await client.createPaymentIntent({
        amount: 500,
        currency: 'usd',
        payment_method_types: [],
      });

      const body = client.request?.body ?? '';
      // An empty array produces zero output pairs — same treatment as an
      // omitted/undefined field. A bare unbracketed `payment_method_types=`
      // would be indistinguishable from setting a plain scalar field to an
      // empty string on Stripe's Rack-style nested-parameter parser, and
      // this connect has no update-style endpoint where "clear this list"
      // is ever a meaningful request to send.
      asserts.assertEquals(body.includes('payment_method_types'), false);
      const params = new URLSearchParams(body);
      asserts.assertEquals(params.has('payment_method_types'), false);
      asserts.assertEquals(params.has('payment_method_types[0]'), false);
    });

    it('omits undefined/null fields from the encoded body entirely', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validPaymentIntent, 200);

      await client.createPaymentIntent({
        amount: 500,
        currency: 'usd',
        description: undefined,
        customer: undefined,
      });

      const body = client.request?.body ?? '';
      asserts.assertEquals(body.includes('description'), false);
      asserts.assertEquals(body.includes('customer'), false);
    });

    it('validates and returns the response', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validPaymentIntent, 200);

      const intent = await client.createPaymentIntent({
        amount: 1999,
        currency: 'usd',
      });

      asserts.assertEquals(intent.id, validPaymentIntent.id);
      asserts.assertEquals(intent.status, 'requires_payment_method');
    });

    it('rejects an invalid request before calling the API', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validPaymentIntent, 200);

      await asserts.assertRejects(
        // deno-lint-ignore no-explicit-any
        () => client.createPaymentIntent({ currency: 'usd' } as any),
        StripeError,
        'local validation',
      );
      asserts.assertEquals(client.request, undefined);
    });
  });

  describe('retrievePaymentIntent', () => {
    it('sends a bare GET with no body', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validPaymentIntent, 200);

      const intent = await client.retrievePaymentIntent(
        'pi_3Nx0aB2c3D4e5F6g',
      );

      asserts.assertEquals(client.request?.method, 'GET');
      asserts.assertEquals(client.request?.body, undefined);
      asserts.assertStringIncludes(
        client.request?.url ?? '',
        '/v1/payment_intents/pi_3Nx0aB2c3D4e5F6g',
      );
      asserts.assertEquals(intent.id, validPaymentIntent.id);
    });

    it('rejects a malformed PaymentIntent id before calling the API', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validPaymentIntent, 200);

      await asserts.assertRejects(
        () => client.retrievePaymentIntent('cus_abc123'),
        StripeError,
        'failed local validation',
      );
      asserts.assertEquals(client.request, undefined);
    });
  });

  describe('createCustomer', () => {
    it('defaults to an empty request body when called with no params', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validCustomer, 200);

      const customer = await client.createCustomer();

      asserts.assertEquals(client.request?.body, '');
      asserts.assertEquals(customer.id, validCustomer.id);
    });

    it('form-encodes nested address fields with bracket notation', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validCustomer, 200);

      await client.createCustomer({
        email: 'jenny@example.com',
        address: { line1: '123 Main St', city: 'SF' },
      });

      asserts.assertEquals(
        getHeader(client.request?.headers, 'Content-Type'),
        'application/x-www-form-urlencoded',
      );
      const params = new URLSearchParams(client.request?.body ?? '');
      asserts.assertEquals(params.get('email'), 'jenny@example.com');
      asserts.assertEquals(params.get('address[line1]'), '123 Main St');
      asserts.assertEquals(params.get('address[city]'), 'SF');
    });

    it('validates and returns the response', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validCustomer, 200);

      const customer = await client.createCustomer({
        email: 'jenny@example.com',
      });

      asserts.assertEquals(customer.id, validCustomer.id);
      asserts.assertEquals(customer.email, validCustomer.email);
    });

    it('rejects an invalid request before calling the API', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validCustomer, 200);

      await asserts.assertRejects(
        () => client.createCustomer({ tax_exempt: 'bogus' as never }),
        StripeError,
        'local validation',
      );
      asserts.assertEquals(client.request, undefined);
    });
  });

  describe('error mapping', () => {
    it('maps a card_declined vendor code (status 402)', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse({
        error: {
          type: 'card_error',
          code: 'card_declined',
          message: 'Your card was declined.',
          decline_code: 'generic_decline',
        },
      }, 402);

      await asserts.assertRejects(
        () => client.createPaymentIntent({ amount: 100, currency: 'usd' }),
        StripeError,
        'card was declined',
      );
    });

    it('falls back to a meaningful vendorMessage when the envelope has no message', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse({
        error: {
          type: 'card_error',
          code: 'card_declined',
        },
      }, 402);

      const error = await asserts.assertRejects(
        () => client.createPaymentIntent({ amount: 100, currency: 'usd' }),
        StripeError,
        'declined: no further details provided by Stripe',
      );
      asserts.assertEquals(error.message.includes('${'), false);
    });

    it('maps every reachable documented vendor error code', async () => {
      const cases: Array<{ code: string; status: number; expected: string }> = [
        { code: 'resource_missing', status: 404, expected: 'not found' },
        { code: 'parameter_missing', status: 400, expected: 'missing' },
        {
          code: 'parameter_invalid_empty',
          status: 400,
          expected: 'was empty',
        },
        { code: 'expired_card', status: 402, expected: 'expired' },
        { code: 'incorrect_cvc', status: 402, expected: 'security code' },
        { code: 'incorrect_number', status: 402, expected: 'card number' },
        { code: 'processing_error', status: 402, expected: 'processing' },
        { code: 'rate_limit', status: 429, expected: 'Too many requests' },
        { code: 'api_key_expired', status: 401, expected: 'expired' },
        {
          code: 'authentication_required',
          status: 402,
          expected: 'authentication',
        },
      ];

      for (const { code, status, expected } of cases) {
        const client = new MockStripe({
          auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
        });
        client.setResponse({
          error: {
            type: 'invalid_request_error',
            code,
            message: 'vendor message',
          },
        }, status);

        await asserts.assertRejects(
          () => client.createPaymentIntent({ amount: 100, currency: 'usd' }),
          StripeError,
          expected,
        );
      }
    });

    it('falls back to a status-derived code when no error.code is present', async () => {
      const cases: Array<{ status: number; expected: string }> = [
        { status: 401, expected: 'Authentication failed' },
        { status: 403, expected: 'permission' },
        { status: 404, expected: 'not found' },
        { status: 409, expected: 'idempotency key' },
        { status: 429, expected: 'Too many requests' },
        { status: 400, expected: 'invalid' },
        { status: 402, expected: 'declined' },
      ];

      for (const { status, expected } of cases) {
        const client = new MockStripe({
          auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
        });
        client.setResponse({
          error: {
            type: 'invalid_request_error',
            message: 'vendor message',
          },
        }, status);

        await asserts.assertRejects(
          () => client.createPaymentIntent({ amount: 100, currency: 'usd' }),
          StripeError,
          expected,
        );
      }
    });

    it('treats a 5xx response as SERVICE_UNAVAILABLE', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse({ error: { type: 'api_error' } }, 500);

      await asserts.assertRejects(
        () => client.createPaymentIntent({ amount: 100, currency: 'usd' }),
        StripeError,
        'currently unavailable',
      );
    });

    it('treats an unparseable error body as RESPONSE_ERROR (non-5xx)', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse({ oops: true }, 400);

      await asserts.assertRejects(
        () => client.createPaymentIntent({ amount: 100, currency: 'usd' }),
        StripeError,
        'did not match the expected schema',
      );
    });

    it('treats an unparseable error body as SERVICE_UNAVAILABLE (5xx)', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse('<html>Internal Server Error</html>', 502);

      await asserts.assertRejects(
        () => client.createPaymentIntent({ amount: 100, currency: 'usd' }),
        StripeError,
        'currently unavailable',
      );
    });

    it('rejects a malformed 2xx success response', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse({ id: 'not-enough-fields' }, 200);

      await asserts.assertRejects(
        () => client.createPaymentIntent({ amount: 100, currency: 'usd' }),
        StripeError,
        'did not match the expected schema',
      );
    });

    it('treats a 3xx status as success (repo-wide < 400 convention)', async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validPaymentIntent, 302);

      const intent = await client.createPaymentIntent({
        amount: 1999,
        currency: 'usd',
      });

      asserts.assertEquals(intent.id, validPaymentIntent.id);
    });
  });
});

// ---------------------------------------------------------------------------
// Live test — exercises the real Stripe API in test mode. Skipped entirely
// unless CONNECTOR_STRIPE_SECRET_KEY is set (via env or a `.env` file — see
// `envArgs`) to a real `sk_test_...` key, which is never the case in
// CI/sandboxed environments, so this never runs unattended.
//
// This connect exposes no cleanup method for a PaymentIntent (there is no
// "delete" endpoint here) — the created PaymentIntent is intentionally left
// behind. It's harmless: the amount is never captured/charged, and it's
// only ever visible in the account's own Stripe *test-mode* Dashboard
// (`livemode: false`, asserted below), never live data and never seen by a
// third party.
// ---------------------------------------------------------------------------

describe('Stripe — path safety', () => {
  // Regression: `^pi_\S+$` admitted `/` and `.`, so a caller-supplied id
  // like `pi_../../v1/customers` escaped `/payment_intents/` into a
  // different authenticated endpoint.
  for (
    const id of ['pi_../../v1/customers', 'pi_x/y', 'pi_x?limit=100', 'pi_..']
  ) {
    it(`rejects ${JSON.stringify(id)} before any request is sent`, async () => {
      const client = new MockStripe({
        auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      });
      client.setResponse(validPaymentIntent, 200);
      await asserts.assertRejects(
        () => client.retrievePaymentIntent(id),
        StripeError,
      );
      asserts.assertEquals(client.request, undefined);
    });
  }

  it('still accepts a documented alphanumeric id verbatim on the wire', async () => {
    const client = new MockStripe({
      auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
    });
    client.setResponse(validPaymentIntent, 200);
    await client.retrievePaymentIntent('pi_3Nx0aB2c3D4e5F6g');
    asserts.assert(
      client.request!.url.endsWith('/v1/payment_intents/pi_3Nx0aB2c3D4e5F6g'),
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

describe('Stripe — verifyWebhook', () => {
  const SECRET = 'whsec_test_secret_0123456789';
  const PAYLOAD = JSON.stringify({
    id: 'evt_1',
    type: 'payment_intent.succeeded',
  });
  const NOW_MS = 1_700_000_000_000;
  const T = String(Math.floor(NOW_MS / 1000));
  const client = () =>
    new MockStripe({
      auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
    });
  const sig = (p = PAYLOAD, t = T, s = SECRET) => hmacHex(s, `${t}.${p}`);
  const hdr = (v: string) => ({ 'stripe-signature': v });

  it('accepts a genuine signature (whsec_ used as-is) and returns the parsed event', async () => {
    const event = await client().verifyWebhook({
      payload: PAYLOAD,
      headers: hdr(`t=${T},v1=${await sig()}`),
      secret: SECRET,
      nowMs: NOW_MS,
    }) as { id: string };
    asserts.assertEquals(event.id, 'evt_1');
  });
  it('accepts when one of several v1 entries matches (secret rolling)', async () => {
    await client().verifyWebhook({
      payload: PAYLOAD,
      headers: hdr(`t=${T},v1=${'0'.repeat(64)},v1=${await sig()}`),
      secret: SECRET,
      nowMs: NOW_MS,
    });
  });
  it('ignores non-v1 schemes — a lone v0 is not a signature', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: hdr(`t=${T},v0=${await sig()}`),
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      StripeError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_INVALID_HEADERS');
  });
  it('rejects a tampered payload', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD + ' ',
          headers: hdr(`t=${T},v1=${await sig()}`),
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      StripeError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });
  it('rejects a replay outside the window, in both directions', async () => {
    for (const now of [NOW_MS + 301_000, NOW_MS - 301_000]) {
      const err = await asserts.assertRejects(
        async () =>
          await client().verifyWebhook({
            payload: PAYLOAD,
            headers: hdr(`t=${T},v1=${await sig()}`),
            secret: SECRET,
            nowMs: now,
          }),
        StripeError,
      );
      asserts.assertEquals(err.code, 'WEBHOOK_TIMESTAMP_INVALID');
    }
  });
  it('rejects a missing header', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: {},
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      StripeError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_INVALID_HEADERS');
  });
  it('raises RESPONSE_ERROR for a verified non-JSON payload', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: 'nope',
          headers: hdr(`t=${T},v1=${await sig('nope')}`),
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      StripeError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });
  it('rejects a non-numeric t= as WEBHOOK_TIMESTAMP_INVALID', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: PAYLOAD,
          headers: hdr(`t=not-a-number,v1=${'0'.repeat(64)}`),
          secret: SECRET,
          nowMs: NOW_MS,
        }),
      StripeError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_TIMESTAMP_INVALID');
  });
});

describe('Stripe — idempotency', () => {
  it('sends Idempotency-Key only when a key is given', async () => {
    const c = new MockStripe({
      auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
    });
    c.setResponse(validPaymentIntent, 200);
    await c.createPaymentIntent({
      amount: 1999,
      currency: 'usd',
      metadata: { orderId: '42', note: 'a b' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      confirm: true,
    }, { idempotencyKey: 'order-42' });
    asserts.assertEquals(
      getHeader(c.request?.headers, 'Idempotency-Key'),
      'order-42',
    );
    await c.createPaymentIntent({
      amount: 1999,
      currency: 'usd',
      metadata: { orderId: '42', note: 'a b' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      confirm: true,
    });
    asserts.assertEquals(
      getHeader(c.request?.headers, 'Idempotency-Key'),
      undefined,
    );
  });
  it('newIdempotencyKey() is a ULID from @tundralibs/id', () => {
    const k = Stripe.newIdempotencyKey();
    asserts.assertMatch(k, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    asserts.assertNotEquals(k, Stripe.newIdempotencyKey());
  });
});

const env = envArgs();
const credentials = {
  secretKey: env.get('CONNECTOR_STRIPE_SECRET_KEY'),
};
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe('Stripe — maxRetryWait (RESTler rate-limit retry)', () => {
  /**
   * A client whose every request is answered 429 with a `retry-after` hint,
   * and whose waits are recorded instead of slept. `maxRetryWait` is what
   * routes a 429 to RESTler's retry logic (and so to this connect's
   * `RESTlerRateLimitError` rewrap) — without it the vendor handler maps the
   * 429 directly, which the error-mapping tests already cover.
   */
  const throttled = (maxRetryWait: number, retryAfter: string) => {
    const c = new MockStripe({
      auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
      maxRetryWait,
    });
    const slept: number[] = [];
    let calls = 0;
    c['_sleep'] = (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    };
    c['_fetch'] = (input) => {
      calls++;
      return Promise.resolve(
        new Response('{}', {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': retryAfter,
          },
        }),
      );
    };
    return { c, slept, calls: () => calls };
  };

  it('waits the hinted time, retries once, then surfaces RATE_LIMITED with retried: true', async () => {
    const { c, slept, calls } = throttled(60, '1');
    const err = await asserts.assertRejects(
      () => c.retrievePaymentIntent('pi_3Nx0aB2c3D4e5F6g'),
      StripeError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 1);
    asserts.assertEquals(slept, [1000]);
    asserts.assertEquals(calls(), 2);
  });

  it('throws RATE_LIMITED immediately with retried: false when the hint exceeds maxRetryWait', async () => {
    const { c, slept, calls } = throttled(5, '120');
    const err = await asserts.assertRejects(
      () => c.retrievePaymentIntent('pi_3Nx0aB2c3D4e5F6g'),
      StripeError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(slept, []);
    asserts.assertEquals(calls(), 1);
  });
});

describe('Stripe — unrecognised error responses', () => {
  it('fails RESPONSE_ERROR for an unmapped 4xx with no Stripe error envelope', async () => {
    const c = new MockStripe({
      auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
    });
    c.setResponse({ unexpected: true }, 418);
    const err = await asserts.assertRejects(
      () => c.retrievePaymentIntent('pi_3Nx0aB2c3D4e5F6g'),
      StripeError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });

  it('falls back to RESPONSE_ERROR for a valid envelope with a code and status it does not know', async () => {
    // The case Stripe adding a new error code produces: the envelope parses,
    // but neither its code nor its (non-5xx) status is mapped.
    const c = new MockStripe({
      auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
    });
    c.setResponse({
      error: {
        type: 'invalid_request_error',
        code: 'a_code_stripe_adds_later',
        message: 'Something new.',
      },
    }, 418);
    const err = await asserts.assertRejects(
      () => c.retrievePaymentIntent('pi_3Nx0aB2c3D4e5F6g'),
      StripeError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });
});

describe('Stripe — a 429 without the vendor envelope', () => {
  it('is still RATE_LIMITED (mapped by status), with the retry hint', async () => {
    // What a proxy or CDN in front of the API returns: the status and a
    // Retry-After header, but not the vendor's own error body.
    const c = new MockStripe({
      auth: { type: 'BASIC', username: 'sk_test_abc123', password: '' },
    });
    c['_fetch'] = () =>
      Promise.resolve(
        new Response('{}', {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '7' },
        }),
      );
    const err = await asserts.assertRejects(
      () => c.retrievePaymentIntent('pi_3Nx0aB2c3D4e5F6g'),
      StripeError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 7);
  });
});

describe({
  name: 'Stripe — live',
  // Deno only: Bun/Node each get their own connect-wide live-test job
  // (see the repo's CI matrix), so this suite only registers on Deno — it
  // must not double-run the same live assertions three times.
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('creates a real test-mode PaymentIntent against the Stripe API', async () => {
      const client = new Stripe({
        auth: {
          type: 'BASIC',
          username: credentials.secretKey!,
          password: '',
        },
      });

      const intent = await client.createPaymentIntent({
        amount: 100,
        currency: 'usd',
      });

      asserts.assertEquals(intent.object, 'payment_intent');
      asserts.assertEquals(intent.amount, 100);
      asserts.assertEquals(intent.currency, 'usd');
      // Surfaces a clear failure (rather than silently passing) if the
      // configured key was accidentally a live key instead of test-mode —
      // note this only flags it after the PaymentIntent already exists,
      // it can't prevent the create call itself.
      asserts.assertEquals(intent.livemode, false);
    });
  },
});
