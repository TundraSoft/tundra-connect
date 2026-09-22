import * as asserts from '@asserts';
import { describe, it } from '@test';
import { envArgs } from '@utils';
import { DodoPayments, LIVE_API, TEST_API } from './DodoPayments.ts';
import { DodoPaymentsError } from './errors/mod.ts';

const AUTH = { type: 'BEARER' as const, token: 'dodo-key', prefix: 'Bearer' };

const CUSTOMER = {
  customer_id: 'cus_1',
  email: 'buyer@example.com',
  name: 'Ada',
};

const PAYMENT = {
  payment_id: 'pay_1',
  business_id: 'biz_1',
  brand_id: 'brd_1',
  total_amount: 1999,
  currency: 'USD',
  customer: CUSTOMER,
  billing: { country: 'US' },
  created_at: '2026-01-01T00:00:00Z',
  digital_products_delivered: true,
  metadata: {},
  status: 'succeeded',
};

const SUBSCRIPTION = {
  subscription_id: 'sub_1',
  product_id: 'prd_1',
  status: 'active',
  customer: CUSTOMER,
  billing: { country: 'US' },
  quantity: 1,
  recurring_pre_tax_amount: 1000,
  currency: 'USD',
  created_at: '2026-01-01T00:00:00Z',
  next_billing_date: '2026-02-01T00:00:00Z',
  previous_billing_date: '2026-01-01T00:00:00Z',
  payment_frequency_count: 1,
  payment_frequency_interval: 'Month',
  subscription_period_count: 1,
  subscription_period_interval: 'Month',
  trial_period_days: 0,
  tax_inclusive: false,
  on_demand: false,
  cancel_at_next_billing_date: false,
  metadata: {},
};

const validPayment = {
  product_cart: [{ product_id: 'prd_1', quantity: 1 }],
  customer: { email: 'buyer@example.com', name: 'Ada' },
  billing: { country: 'US' },
};

const validSubscription = {
  product_id: 'prd_1',
  quantity: 1,
  customer: { email: 'buyer@example.com', name: 'Ada' },
  billing: { country: 'US' },
};

class MockDodo extends DodoPayments {
  public request?: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };

  setResponse(body: unknown, status = 200): void {
    this._fetch = (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body as string | undefined,
      };
      return Promise.resolve(
        new Response(typeof body === 'string' ? body : JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
  }
}

/** Serves a queued sequence of bodies, recording every request URL. */
class PagingMockDodo extends DodoPayments {
  public urls: string[] = [];
  private pages: unknown[] = [];

  /** Serves `first` once, then fails every later page with `status`. */
  setThenFail(first: unknown, status: number, body: unknown): void {
    let call = 0;
    this._fetch = (input) => {
      this.urls.push(String(input));
      const failing = ++call > 1;
      return Promise.resolve(
        new Response(JSON.stringify(failing ? body : first), {
          status: failing ? status : 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
  }

  setPages(pages: unknown[]): void {
    this.pages = [...pages];
    this._fetch = (input) => {
      this.urls.push(String(input));
      const body = this.pages.shift() ?? { items: [] };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
  }
}

function client(body: unknown = PAYMENT, status = 200): MockDodo {
  const c = new MockDodo({ auth: AUTH });
  c.setResponse(body, status);
  return c;
}

describe('DodoPayments — configuration', () => {
  it('defaults to TEST mode — the safe environment for a money API', () => {
    const c = client();
    asserts.assertEquals(c.vendor, 'DodoPayments');
    asserts.assertEquals(c.mode, 'test');
  });

  it('points at the test host by default', async () => {
    const c = client();
    await c.getPayment('pay_1');
    asserts.assert(
      c.request!.url.startsWith(TEST_API),
      `expected ${TEST_API}, got ${c.request!.url}`,
    );
  });

  it('points at the live host only when explicitly asked', async () => {
    const c = new MockDodo({ auth: AUTH, mode: 'live' });
    c.setResponse(PAYMENT);
    await c.getPayment('pay_1');
    asserts.assertEquals(c.mode, 'live');
    asserts.assert(c.request!.url.startsWith(LIVE_API));
  });

  it('rejects a mode that is neither test nor live', () => {
    const err = asserts.assertThrows(
      () =>
        new MockDodo({
          auth: AUTH,
          mode: 'sandbox' as unknown as 'test',
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_MODE');
  });

  it('rejects a missing API key', () => {
    const err = asserts.assertThrows(
      () => new MockDodo({} as unknown as { auth: typeof AUTH }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_API_KEY');
  });

  it('rejects a blank API key', () => {
    const err = asserts.assertThrows(
      () => new MockDodo({ auth: { type: 'BEARER', token: '  ' } }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'CONFIG_INVALID_API_KEY');
  });

  it('sends the API key as a Bearer token', async () => {
    const c = client();
    await c.getPayment('pay_1');
    const h = c.request!.headers ?? {};
    asserts.assertEquals(
      h['Authorization'] ?? h['authorization'],
      'Bearer dodo-key',
    );
  });
});

describe('DodoPayments — createPayment', () => {
  const created = {
    payment_id: 'pay_1',
    total_amount: 1999,
    client_secret: 'cs_test_x',
    customer: CUSTOMER,
    metadata: {},
    payment_link: 'https://checkout.dodopayments.com/pay_1',
  };

  it('POSTs to /payments and returns the checkout link', async () => {
    const c = client(created);
    const result = await c.createPayment({
      ...validPayment,
      payment_link: true,
    });
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assert(c.request!.url.endsWith('/payments'));
    asserts.assertEquals(result.payment_id, 'pay_1');
    asserts.assertEquals(
      result.payment_link,
      'https://checkout.dodopayments.com/pay_1',
    );
  });

  it('accepts an existing customer by id', async () => {
    const c = client(created);
    await c.createPayment({
      ...validPayment,
      customer: { customer_id: 'cus_1' },
    });
    const body = JSON.parse(c.request!.body!);
    asserts.assertEquals(body.customer.customer_id, 'cus_1');
  });

  it('rejects an empty product cart before sending', async () => {
    const c = client(created);
    const err = await asserts.assertRejects(
      () => c.createPayment({ ...validPayment, product_cart: [] }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });

  it('rejects a customer that is neither an id nor an email', async () => {
    const c = client(created);
    const err = await asserts.assertRejects(
      () =>
        c.createPayment({
          ...validPayment,
          customer: { name: 'Ada' } as unknown as { customer_id: string },
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });

  it('rejects a missing billing country — required by a merchant of record', async () => {
    const c = client(created);
    const err = await asserts.assertRejects(
      () =>
        c.createPayment({
          ...validPayment,
          billing: {} as unknown as { country: string },
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
  });
});

describe('DodoPayments — payment status and verification', () => {
  it('GETs a single payment by id', async () => {
    const c = client();
    const payment = await c.getPayment('pay_1');
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assert(c.request!.url.endsWith('/payments/pay_1'));
    asserts.assertEquals(payment.status, 'succeeded');
    asserts.assertEquals(payment.total_amount, 1999);
  });

  it('url-encodes the payment id', async () => {
    const c = client();
    await c.getPayment('pay/../admin');
    asserts.assert(c.request!.url.includes('pay%2F..%2Fadmin'));
  });

  it('rejects a blank payment id without sending a request', async () => {
    const c = client();
    const err = await asserts.assertRejects(
      () => c.getPayment('   '),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });

  it('isPaid is true only for succeeded', async () => {
    const c = client();
    asserts.assertEquals(await c.isPaid('pay_1'), true);
  });

  it('isPaid is false for processing — money has NOT settled', async () => {
    const c = client({ ...PAYMENT, status: 'processing' });
    asserts.assertEquals(await c.isPaid('pay_1'), false);
  });

  it('isPaid is false for every requires_* state', async () => {
    for (
      const status of [
        'requires_customer_action',
        'requires_payment_method',
        'requires_confirmation',
        'requires_capture',
      ]
    ) {
      const c = client({ ...PAYMENT, status });
      asserts.assertEquals(await c.isPaid('pay_1'), false, status);
    }
  });

  it('isPaid is false for a null or absent status', async () => {
    const withNull = client({ ...PAYMENT, status: null });
    asserts.assertEquals(await withNull.isPaid('pay_1'), false);
    const { status: _s, ...noStatus } = PAYMENT;
    const withNone = client(noStatus);
    asserts.assertEquals(await withNone.isPaid('pay_1'), false);
  });

  it('keeps additive vendor fields on a payment rather than failing', async () => {
    const c = client({ ...PAYMENT, some_future_field: 'x' });
    const payment = await c.getPayment('pay_1');
    asserts.assertEquals(
      (payment as Record<string, unknown>).some_future_field,
      'x',
    );
  });
});

describe('DodoPayments — payment history', () => {
  it('filters by customer and returns the items array', async () => {
    const c = client({
      items: [{
        payment_id: 'pay_1',
        brand_id: 'brd_1',
        total_amount: 1999,
        currency: 'USD',
        customer: CUSTOMER,
        created_at: '2026-01-01T00:00:00Z',
        digital_products_delivered: true,
        metadata: {},
        status: 'succeeded',
      }],
    });
    const history = await c.listPayments({
      customerId: 'cus_1',
      pageSize: 20,
      pageNumber: 2,
      status: 'succeeded',
    });
    asserts.assertEquals(history.length, 1);
    asserts.assertEquals(history[0]!.payment_id, 'pay_1');
    const url = c.request!.url;
    asserts.assert(url.includes('customer_id=cus_1'), url);
    asserts.assert(url.includes('page_size=20'), url);
    asserts.assert(url.includes('page_number=2'), url);
    asserts.assert(url.includes('status=succeeded'), url);
  });

  it('treats an absent items array as an empty history, not a failure', async () => {
    const c = client({});
    asserts.assertEquals(await c.listPayments({ customerId: 'cus_none' }), []);
  });

  it('sends no filters when none are given', async () => {
    const c = client({ items: [] });
    await c.listPayments();
    asserts.assert(
      !c.request!.url.includes('?') || c.request!.url.endsWith('?'),
    );
  });
});

describe('DodoPayments — subscriptions', () => {
  const created = {
    subscription_id: 'sub_1',
    payment_id: 'pay_1',
    customer: CUSTOMER,
    recurring_pre_tax_amount: 1000,
    payment_method_required: true,
    metadata: {},
    payment_link: 'https://checkout.dodopayments.com/sub_1',
  };

  it('POSTs to /subscriptions and surfaces payment_method_required', async () => {
    const c = client(created);
    const sub = await c.createSubscription({
      ...validSubscription,
      payment_link: true,
    });
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assert(c.request!.url.endsWith('/subscriptions'));
    asserts.assertEquals(sub.subscription_id, 'sub_1');
    asserts.assertEquals(sub.payment_method_required, true);
  });

  it('rejects a zero quantity before sending', async () => {
    const c = client(created);
    const err = await asserts.assertRejects(
      () => c.createSubscription({ ...validSubscription, quantity: 0 }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });

  it('GETs a subscription by id', async () => {
    const c = client(SUBSCRIPTION);
    const sub = await c.getSubscription('sub_1');
    asserts.assert(c.request!.url.endsWith('/subscriptions/sub_1'));
    asserts.assertEquals(sub.status, 'active');
    asserts.assertEquals(sub.next_billing_date, '2026-02-01T00:00:00Z');
  });

  it('lists a customer subscriptions', async () => {
    const c = client({ items: [SUBSCRIPTION] });
    const subs = await c.listSubscriptions({
      customerId: 'cus_1',
      status: 'active',
    });
    asserts.assertEquals(subs.length, 1);
    asserts.assert(c.request!.url.includes('customer_id=cus_1'));
    asserts.assert(c.request!.url.includes('status=active'));
  });

  it('cancels immediately by default — PATCH with status cancelled', async () => {
    const c = client({ ...SUBSCRIPTION, status: 'cancelled' });
    const sub = await c.cancelSubscription('sub_1');
    asserts.assertEquals(c.request!.method, 'PATCH');
    asserts.assert(c.request!.url.endsWith('/subscriptions/sub_1'));
    const body = JSON.parse(c.request!.body!);
    asserts.assertEquals(body.status, 'cancelled');
    asserts.assertEquals(body.cancel_at_next_billing_date, undefined);
    asserts.assertEquals(sub.status, 'cancelled');
  });

  it('cancels at period end when asked, leaving status active', async () => {
    const c = client({ ...SUBSCRIPTION, cancel_at_next_billing_date: true });
    const sub = await c.cancelSubscription('sub_1', {
      atPeriodEnd: true,
      comment: 'Downgrading',
    });
    const body = JSON.parse(c.request!.body!);
    asserts.assertEquals(body.cancel_at_next_billing_date, true);
    asserts.assertEquals(body.status, undefined);
    asserts.assertEquals(body.cancellation_comment, 'Downgrading');
    // The documented trap: a period-end cancellation stays `active`.
    asserts.assertEquals(sub.status, 'active');
    asserts.assertEquals(sub.cancel_at_next_billing_date, true);
  });

  it('rejects a blank subscription id without sending a request', async () => {
    const c = client(SUBSCRIPTION);
    const err = await asserts.assertRejects(
      () => c.cancelSubscription(''),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });
});

describe('DodoPayments — error mapping', () => {
  const cases: [number, string][] = [
    [400, 'INVALID_REQUEST'],
    [401, 'AUTH_FAILED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [422, 'INVALID_REQUEST'],
    [429, 'RATE_LIMITED'],
    [500, 'SERVICE_UNAVAILABLE'],
    [503, 'SERVICE_UNAVAILABLE'],
  ];

  for (const [status, expected] of cases) {
    it(`maps HTTP ${status} to ${expected}`, async () => {
      const c = client(
        { code: 'SOME_VENDOR_CODE', message: 'nope' },
        status,
      );
      const err = await asserts.assertRejects(
        () => c.getPayment('pay_1'),
        DodoPaymentsError,
      );
      asserts.assertEquals(err.code, expected);
      asserts.assertEquals(
        err.getContextValue('vendorCode'),
        'SOME_VENDOR_CODE',
      );
    });
  }

  it('falls back to UNKNOWN_ERROR for an unmapped 4xx', async () => {
    const c = client({ code: 'X', message: 'y' }, 418);
    const err = await asserts.assertRejects(
      () => c.getPayment('pay_1'),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'UNKNOWN_ERROR');
  });

  it('survives a failure body that is not the documented envelope', async () => {
    const c = client('<html>502 Bad Gateway</html>', 502);
    const err = await asserts.assertRejects(
      () => c.getPayment('pay_1'),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(err.getContextValue('vendorCode'), undefined);
  });

  it('raises RESPONSE_ERROR when a success body fails validation', async () => {
    const c = client({ payment_id: 'pay_1' }); // missing required fields
    const err = await asserts.assertRejects(
      () => c.getPayment('pay_1'),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'RESPONSE_ERROR');
  });

  it('never leaks the API key into a mapped vendor error', async () => {
    const c = client({ code: 'X', message: 'y' }, 401);
    const err = await asserts.assertRejects(
      () => c.getPayment('pay_1'),
      DodoPaymentsError,
    );
    asserts.assert(!JSON.stringify(err.toJSON()).includes('dodo-key'));
  });
});

describe('DodoPayments — getCustomer', () => {
  const CUSTOMER_RECORD = {
    customer_id: 'cus_1',
    business_id: 'biz_1',
    email: 'buyer@example.com',
    name: 'Ada',
    created_at: '2026-01-01T00:00:00Z',
  };

  it('GETs the customer record by id', async () => {
    const c = client(CUSTOMER_RECORD);
    const customer = await c.getCustomer('cus_1');
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assert(c.request!.url.endsWith('/customers/cus_1'));
    asserts.assertEquals(customer.email, 'buyer@example.com');
    asserts.assertEquals(customer.created_at, '2026-01-01T00:00:00Z');
  });

  it('surfaces the blocklist fields the single-customer route resolves', async () => {
    const c = client({
      ...CUSTOMER_RECORD,
      blocked_at: '2026-02-01T00:00:00Z',
      blocklist_entry_id: 'blk_1',
    });
    const customer = await c.getCustomer('cus_1');
    asserts.assertEquals(customer.blocked_at, '2026-02-01T00:00:00Z');
  });

  it('url-encodes the customer id', async () => {
    const c = client(CUSTOMER_RECORD);
    await c.getCustomer('cus/../admin');
    asserts.assert(c.request!.url.includes('cus%2F..%2Fadmin'));
  });

  it('rejects a blank customer id without sending a request', async () => {
    const c = client(CUSTOMER_RECORD);
    const err = await asserts.assertRejects(
      () => c.getCustomer('  '),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });

  it('maps a 404 to NOT_FOUND', async () => {
    const c = client({ code: 'NOT_FOUND', message: 'no such customer' }, 404);
    const err = await asserts.assertRejects(
      () => c.getCustomer('cus_missing'),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'NOT_FOUND');
  });
});

describe('DodoPayments — auto-paging', () => {
  const item = (id: string) => ({
    payment_id: id,
    brand_id: 'brd_1',
    total_amount: 100,
    currency: 'USD',
    customer: CUSTOMER,
    created_at: '2026-01-01T00:00:00Z',
    digital_products_delivered: true,
    metadata: {},
    status: 'succeeded',
  });

  function pager(): PagingMockDodo {
    return new PagingMockDodo({ auth: AUTH });
  }

  it('walks every page and yields items in order', async () => {
    const c = pager();
    c.setPages([
      { items: [item('pay_1'), item('pay_2')] },
      { items: [item('pay_3')] },
      { items: [] },
    ]);
    const seen: string[] = [];
    for await (
      const p of c.listAllPayments({ customerId: 'cus_1', pageSize: 2 })
    ) {
      seen.push(p.payment_id);
    }
    asserts.assertEquals(seen, ['pay_1', 'pay_2', 'pay_3']);
  });

  it('omits page_number on the first request, then sends 2, 3 — matching the vendor SDK', async () => {
    const c = pager();
    c.setPages([
      { items: [item('pay_1')] },
      { items: [item('pay_2')] },
      { items: [] },
    ]);
    await Array.fromAsync(c.listAllPayments({ pageSize: 1 }));
    asserts.assertEquals(c.urls.length, 3);
    asserts.assert(!c.urls[0]!.includes('page_number'), c.urls[0]);
    asserts.assert(c.urls[1]!.includes('page_number=2'), c.urls[1]);
    asserts.assert(c.urls[2]!.includes('page_number=3'), c.urls[2]);
  });

  it('carries the filters through to every page', async () => {
    const c = pager();
    c.setPages([{ items: [item('pay_1')] }, { items: [] }]);
    await Array.fromAsync(
      c.listAllPayments({
        customerId: 'cus_1',
        status: 'succeeded',
        pageSize: 1,
      }),
    );
    for (const url of c.urls) {
      asserts.assert(url.includes('customer_id=cus_1'), url);
      asserts.assert(url.includes('status=succeeded'), url);
    }
  });

  it('stops on an EMPTY page, not a short one — surviving a clamped page_size', async () => {
    const c = pager();
    // Asked for 100; the vendor clamps to 2. A short-page check would stop
    // after page one and silently truncate the history.
    c.setPages([
      { items: [item('pay_1'), item('pay_2')] },
      { items: [item('pay_3'), item('pay_4')] },
      { items: [] },
    ]);
    const seen = await Array.fromAsync(c.listAllPayments({ pageSize: 100 }));
    asserts.assertEquals(seen.length, 4);
  });

  it('yields nothing for a customer with no payments', async () => {
    const c = pager();
    c.setPages([{ items: [] }]);
    asserts.assertEquals(
      await Array.fromAsync(c.listAllPayments({ customerId: 'cus_none' })),
      [],
    );
  });

  it('honours maxPages so a page_number-ignoring endpoint cannot spin forever', async () => {
    const c = pager();
    // Every request returns the same full page — this never terminates on
    // its own, which is exactly what the safety valve exists for.
    c.setPages(Array.from({ length: 50 }, () => ({ items: [item('pay_x')] })));
    const seen = await Array.fromAsync(
      c.listAllPayments({ pageSize: 1, maxPages: 3 }),
    );
    asserts.assertEquals(seen.length, 3);
    asserts.assertEquals(c.urls.length, 3);
  });

  it('walks subscriptions the same way', async () => {
    const c = pager();
    c.setPages([
      { items: [SUBSCRIPTION] },
      { items: [{ ...SUBSCRIPTION, subscription_id: 'sub_2' }] },
      { items: [] },
    ]);
    const seen = await Array.fromAsync(
      c.listAllSubscriptions({ customerId: 'cus_1', pageSize: 1 }),
    );
    asserts.assertEquals(seen.map((s) => s.subscription_id), [
      'sub_1',
      'sub_2',
    ]);
  });

  it('propagates a vendor failure from a later page', async () => {
    const c = pager();
    c.setThenFail({ items: [item('pay_1')] }, 429, {
      code: 'RATE_LIMITED',
      message: 'slow down',
    });
    const iterator = c.listAllPayments({ pageSize: 1 });
    asserts.assertEquals((await iterator.next()).value?.payment_id, 'pay_1');
    const err = await asserts.assertRejects(
      () => iterator.next(),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
  });
});

const env = envArgs();
const credentials = { apiKey: env.get('CONNECTOR_DODO_PAYMENTS_API_KEY') };
const liveTestsEnabled = Object.values(credentials).every((v) => !!v);

describe({
  name: 'DodoPayments — live',
  ignore: !liveTestsEnabled,
  bun: false,
  node: false,
  fn: () => {
    it('lists payments against the real test-mode API', async () => {
      // Read-only, and pinned to TEST mode (the client default) — this
      // never touches live money. Creating a payment is deliberately NOT
      // live-tested: it would leave a dangling intent on the account with
      // no inverse call to clean it up.
      const c = new DodoPayments({
        auth: { type: 'BEARER', token: credentials.apiKey!, prefix: 'Bearer' },
      });
      asserts.assertEquals(c.mode, 'test');
      const payments = await c.listPayments({ pageSize: 1 });
      asserts.assert(Array.isArray(payments));
    });
  },
});
