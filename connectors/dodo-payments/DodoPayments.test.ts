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

  /** Like setResponse, but with explicit response headers — for rate-limit hints. */
  setResponseWithHeaders(
    body: unknown,
    status: number,
    headers: Record<string, string>,
  ): void {
    this._fetch = (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body as string | undefined,
      };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json', ...headers },
        }),
      );
    };
  }

  /** A success with no body at all — Dodo's 204, or its empty 200. */
  setEmptyResponse(status = 200): void {
    this._fetch = (input, init) => {
      this.request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string> | undefined,
        body: init?.body as string | undefined,
      };
      return Promise.resolve(new Response(null, { status }));
    };
  }

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

  /** Serves each body by its `page_number`; an omitted one is page `0`. */
  setPagesByNumber(byPage: Record<string, unknown>): void {
    this._fetch = (input) => {
      this.urls.push(String(input));
      const page = new URL(String(input)).searchParams.get('page_number');
      return Promise.resolve(
        new Response(JSON.stringify(byPage[page ?? '0'] ?? { items: [] }), {
          status: 200,
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
    [409, 'CONFLICT'],
    [410, 'NOT_FOUND'],
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

  it('omits page_number on the first request, then sends 1, 2 — Dodo pages from 0', async () => {
    const c = pager();
    c.setPages([
      { items: [item('pay_1')] },
      { items: [item('pay_2')] },
      { items: [] },
    ]);
    await Array.fromAsync(c.listAllPayments({ pageSize: 1 }));
    asserts.assertEquals(c.urls.length, 3);
    asserts.assert(!c.urls[0]!.includes('page_number'), c.urls[0]);
    asserts.assert(c.urls[1]!.includes('page_number=1'), c.urls[1]);
    asserts.assert(c.urls[2]!.includes('page_number=2'), c.urls[2]);
  });

  it('reads page 1 — Dodo serves an omitted page_number as page 0', async () => {
    // Served by page number, as the test-mode API does: stepping from the
    // first page straight to page_number=2 would drop pay_2.
    const byPage: Record<string, unknown> = {
      '0': { items: [item('pay_1')] },
      '1': { items: [item('pay_2')] },
      '2': { items: [item('pay_3')] },
    };
    const c = pager();
    c.setPagesByNumber(byPage);
    const seen = await Array.fromAsync(c.listAllPayments({ pageSize: 1 }));
    asserts.assertEquals(seen.map((p) => p.payment_id), [
      'pay_1',
      'pay_2',
      'pay_3',
    ]);
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

const WH_SECRET = `whsec_${btoa('super-secret-key-material-0123')}`;
const WH_ID = 'msg_2abc';
const WH_NOW = 1_700_000_000_000;
const WH_TS = String(Math.floor(WH_NOW / 1000));
const WH_PAYLOAD = JSON.stringify({
  type: 'payment.succeeded',
  data: { payment_id: 'pay_1' },
});
async function whSign(
  payload: string,
  id = WH_ID,
  ts = WH_TS,
  secret = WH_SECRET,
): Promise<string> {
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const bin = atob(raw);
  const kb = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) kb[i] = bin.charCodeAt(i);
  const key = await crypto.subtle.importKey(
    'raw',
    kb as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(
        DodoPayments.webhookSignedContent(id, ts, payload),
      ) as unknown as BufferSource,
    ),
  );
  let s = '';
  for (const b of mac) s += String.fromCharCode(b);
  return btoa(s);
}
const whHdrs = (sig: string, o: Record<string, string> = {}) => ({
  'webhook-id': WH_ID,
  'webhook-timestamp': WH_TS,
  'webhook-signature': `v1,${sig}`,
  ...o,
});

describe('DodoPayments — verifyWebhook (Standard Webhooks)', () => {
  it('webhookSignedContent joins id, timestamp and raw payload with periods', () => {
    asserts.assertEquals(
      DodoPayments.webhookSignedContent('msg_1', '1700000000', '{"a":1}'),
      'msg_1.1700000000.{"a":1}',
    );
  });
  it('accepts a genuine signature and returns the parsed payload', async () => {
    const e = await client().verifyWebhook({
      payload: WH_PAYLOAD,
      headers: whHdrs(await whSign(WH_PAYLOAD)),
      secret: WH_SECRET,
      nowMs: WH_NOW,
    }) as { data: { payment_id: string } };
    asserts.assertEquals(e.data.payment_id, 'pay_1');
  });
  it('accepts a secret without the whsec_ prefix, a Headers instance, and case-insensitive names', async () => {
    const bare = WH_SECRET.slice(6);
    await client().verifyWebhook({
      payload: WH_PAYLOAD,
      headers: whHdrs(await whSign(WH_PAYLOAD, WH_ID, WH_TS, bare)),
      secret: bare,
      nowMs: WH_NOW,
    });
    await client().verifyWebhook({
      payload: WH_PAYLOAD,
      headers: new Headers(whHdrs(await whSign(WH_PAYLOAD))),
      secret: WH_SECRET,
      nowMs: WH_NOW,
    });
    await client().verifyWebhook({
      payload: WH_PAYLOAD,
      headers: {
        'Webhook-Id': WH_ID,
        'WEBHOOK-TIMESTAMP': WH_TS,
        'Webhook-Signature': `v1,${await whSign(WH_PAYLOAD)}`,
      },
      secret: WH_SECRET,
      nowMs: WH_NOW,
    });
  });
  it('accepts when one of several rotated signatures matches; rejects unknown versions', async () => {
    const good = await whSign(WH_PAYLOAD);
    await client().verifyWebhook({
      payload: WH_PAYLOAD,
      headers: whHdrs('', {
        'webhook-signature': `v1,${btoa('wrong')} v1,${good}`,
      }),
      secret: WH_SECRET,
      nowMs: WH_NOW,
    });
    const err = await asserts.assertRejects(
      () =>
        client().verifyWebhook({
          payload: WH_PAYLOAD,
          headers: whHdrs('', { 'webhook-signature': `v2,${good}` }),
          secret: WH_SECRET,
          nowMs: WH_NOW,
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });
  it('rejects a tampered payload, the wrong secret, and a re-serialized (whitespace-changed) body', async () => {
    const sig = await whSign(WH_PAYLOAD);
    for (
      const [payload, secret] of [[
        WH_PAYLOAD.replace('pay_1', 'pay_X'),
        WH_SECRET,
      ], [
        WH_PAYLOAD,
        `whsec_${btoa('a-completely-different-key-xxxx')}`,
      ]] as const
    ) {
      const err = await asserts.assertRejects(
        () =>
          client().verifyWebhook({
            payload,
            headers: whHdrs(sig),
            secret,
            nowMs: WH_NOW,
          }),
        DodoPaymentsError,
      );
      asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
    }
    const raw = '{"type": "payment.succeeded"}';
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: JSON.stringify(JSON.parse(raw)),
          headers: whHdrs(await whSign(raw)),
          secret: WH_SECRET,
          nowMs: WH_NOW,
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'WEBHOOK_SIGNATURE_INVALID');
  });
  it('bounds replays in both directions, honours the edge and a custom tolerance', async () => {
    const sig = await whSign(WH_PAYLOAD);
    for (const now of [WH_NOW + 301_000, WH_NOW - 301_000]) {
      const err = await asserts.assertRejects(
        () =>
          client().verifyWebhook({
            payload: WH_PAYLOAD,
            headers: whHdrs(sig),
            secret: WH_SECRET,
            nowMs: now,
          }),
        DodoPaymentsError,
      );
      asserts.assertEquals(err.code, 'WEBHOOK_TIMESTAMP_INVALID');
    }
    await client().verifyWebhook({
      payload: WH_PAYLOAD,
      headers: whHdrs(sig),
      secret: WH_SECRET,
      nowMs: WH_NOW + 300_000,
    });
    await client().verifyWebhook({
      payload: WH_PAYLOAD,
      headers: whHdrs(sig),
      secret: WH_SECRET,
      toleranceSeconds: 10_000,
      nowMs: WH_NOW + 9_000_000,
    });
  });
  it('rejects a bad timestamp, each missing header, an invalid secret, and a non-JSON payload', async () => {
    const sig = await whSign(WH_PAYLOAD);
    asserts.assertEquals(
      (await asserts.assertRejects(() =>
        client().verifyWebhook({
          payload: WH_PAYLOAD,
          headers: whHdrs(sig, { 'webhook-timestamp': 'nope' }),
          secret: WH_SECRET,
          nowMs: WH_NOW,
        }), DodoPaymentsError)).code,
      'WEBHOOK_TIMESTAMP_INVALID',
    );
    for (
      const name of ['webhook-id', 'webhook-timestamp', 'webhook-signature']
    ) {
      const h = whHdrs(sig) as Record<string, string>;
      delete h[name];
      const err = await asserts.assertRejects(() =>
        client().verifyWebhook({
          payload: WH_PAYLOAD,
          headers: h,
          secret: WH_SECRET,
          nowMs: WH_NOW,
        }), DodoPaymentsError);
      asserts.assertEquals(err.code, 'WEBHOOK_INVALID_HEADERS');
      asserts.assertStringIncludes(String(err.getContextValue('reason')), name);
    }
    asserts.assertEquals(
      (await asserts.assertRejects(() =>
        client().verifyWebhook({
          payload: WH_PAYLOAD,
          headers: whHdrs(sig),
          secret: 'whsec_!!!not-base64!!!',
          nowMs: WH_NOW,
        }), DodoPaymentsError)).code,
      'WEBHOOK_INVALID_SECRET',
    );
    asserts.assertEquals(
      (await asserts.assertRejects(async () =>
        await client().verifyWebhook({
          payload: 'nope',
          headers: whHdrs(await whSign('nope')),
          secret: WH_SECRET,
          nowMs: WH_NOW,
        }), DodoPaymentsError)).code,
      'RESPONSE_ERROR',
    );
  });
  it('never leaks the signing secret into a thrown error', async () => {
    const err = await asserts.assertRejects(
      async () =>
        await client().verifyWebhook({
          payload: 'tampered',
          headers: whHdrs(await whSign(WH_PAYLOAD)),
          secret: WH_SECRET,
          nowMs: WH_NOW,
        }),
      DodoPaymentsError,
    );
    const dumped = JSON.stringify(err.toJSON());
    asserts.assert(
      !dumped.includes(WH_SECRET) && !dumped.includes(WH_SECRET.slice(6)),
    );
  });
});

describe('DodoPayments — retryAfterSeconds on a 429', () => {
  // Parsing is RESTler's (`_parseRetryAfter`, restler >= 1.3.0); these pin
  // that the connect surfaces its verdict, not a copy of the logic.
  const rateLimited = async (headers: Record<string, string>) => {
    const c = new MockDodo({ auth: AUTH });
    c.setResponseWithHeaders(
      { code: 'RATE_LIMITED', message: 'slow down' },
      429,
      headers,
    );
    const err = await asserts.assertRejects(
      () => c.getPayment('pay_1'),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    return err.getContextValue('retryAfterSeconds') as number | undefined;
  };
  it('reads Retry-After as delta seconds, verbatim', async () => {
    asserts.assertEquals(await rateLimited({ 'retry-after': '12' }), 12);
    asserts.assertEquals(await rateLimited({ 'retry-after': '7.2' }), 7.2);
  });
  it('reads Retry-After as an HTTP-date relative to now', async () => {
    const s = await rateLimited({
      'retry-after': new Date(Date.now() + 30_000).toUTCString(),
    });
    asserts.assert(s !== undefined && s >= 25 && s <= 31, String(s));
  });
  it('falls back to X-RateLimit-Reset-After, then an epoch-seconds X-RateLimit-Reset', async () => {
    asserts.assertEquals(
      await rateLimited({ 'x-ratelimit-reset-after': '4' }),
      4,
    );
    const s = await rateLimited({
      'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 45),
    });
    asserts.assert(s !== undefined && s >= 40 && s <= 46, String(s));
  });
  it('is undefined — never a guess — when the vendor sent no usable hint', async () => {
    asserts.assertEquals(await rateLimited({}), undefined);
    asserts.assertEquals(
      await rateLimited({ 'retry-after': 'soon' }),
      undefined,
    );
  });
});

describe('DodoPayments — transport failures', () => {
  it('throws a transient TIMEOUT when no answer arrives within the timeout', async () => {
    const c = new MockDodo({ auth: AUTH, timeout: 1 });
    c['_fetch'] = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason));
      });
    const err = await asserts.assertRejects(
      () => c.getPayment('pay_1'),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'TIMEOUT');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('timeoutSeconds'), 1);
  });

  it('throws a transient NETWORK_ERROR when fetch itself fails', async () => {
    const c = client();
    c['_fetch'] = () => Promise.reject(new TypeError('error sending request'));
    const err = await asserts.assertRejects(
      () => c.getPayment('pay_1'),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'NETWORK_ERROR');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(
      JSON.stringify(err.toJSON()).includes(AUTH.token),
      false,
    );
  });

  it('flags a 5xx as transient and a refusal as not', async () => {
    const c = client();
    c.setResponse('<html>502 Bad Gateway</html>', 502);
    const outage = await asserts.assertRejects(
      () => c.getPayment('pay_1'),
      DodoPaymentsError,
    );
    asserts.assertEquals(outage.code, 'SERVICE_UNAVAILABLE');
    asserts.assertEquals(outage.transient, true);

    c.setResponse({ code: 'UNAUTHORIZED', message: 'bad key' }, 401);
    const refusal = await asserts.assertRejects(
      () => c.getPayment('pay_1'),
      DodoPaymentsError,
    );
    asserts.assertEquals(refusal.code, 'AUTH_FAILED');
    asserts.assertEquals(refusal.transient, false);
  });
});

describe('DodoPayments — maxRetryWait (RESTler retries once)', () => {
  class RetryingMock extends MockDodo {
    public slept: number[] = [];
    protected override _sleep(ms: number): Promise<void> {
      this.slept.push(ms);
      return Promise.resolve();
    }
  }
  it('waits the hinted time and succeeds on the second attempt', async () => {
    const c = new RetryingMock({ auth: AUTH, maxRetryWait: 60 });
    let calls = 0;
    c.setResponseWithHeaders(
      { code: 'RATE_LIMITED', message: 'slow down' },
      429,
      { 'retry-after': '2' },
    );
    const first = c['_fetch'];
    c['_fetch'] = (input, init) => {
      calls++;
      return calls === 1 ? first(input, init) : Promise.resolve(
        new Response(JSON.stringify(PAYMENT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
    const payment = await c.getPayment('pay_1');
    asserts.assertEquals(payment.payment_id, 'pay_1');
    asserts.assertEquals(calls, 2);
    asserts.assertEquals(c.slept, [2000]);
  });
  it("surfaces an exhausted retry as this connect's RATE_LIMITED, with retried: true", async () => {
    const c = new RetryingMock({ auth: AUTH, maxRetryWait: 60 });
    c.setResponseWithHeaders({ code: 'RATE_LIMITED', message: 'still' }, 429, {
      'retry-after': '1',
    });
    const err = await asserts.assertRejects(
      () => c.getPayment('pay_1'),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('retried'), true);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 1);
    asserts.assertEquals(c.slept, [1000]);
  });
  it('refuses to wait longer than the cap and throws immediately, retried: false', async () => {
    const c = new RetryingMock({ auth: AUTH, maxRetryWait: 5 });
    c.setResponseWithHeaders({ code: 'RATE_LIMITED', message: 'long' }, 429, {
      'retry-after': '120',
    });
    const err = await asserts.assertRejects(
      () => c.getPayment('pay_1'),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'RATE_LIMITED');
    asserts.assertEquals(err.transient, true);
    asserts.assertEquals(err.getContextValue('retried'), false);
    asserts.assertEquals(err.getContextValue('retryAfterSeconds'), 120);
    asserts.assertEquals(c.slept, []);
  });
});

const MONTHLY_PRICE = {
  type: 'recurring_price' as const,
  price: 1500,
  currency: 'USD',
  payment_frequency_count: 1,
  payment_frequency_interval: 'Month' as const,
  subscription_period_count: 20,
  subscription_period_interval: 'Year' as const,
};

const PRODUCT = {
  product_id: 'pdt_1',
  business_id: 'biz_1',
  brand_id: 'brd_1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  is_recurring: true,
  tax_category: 'saas',
  price: MONTHLY_PRICE,
  metadata: { plan_code: 'pro_monthly' },
  name: 'Pro (monthly)',
};

const productItem = (id: string, metadata: Record<string, unknown> = {}) => ({
  product_id: id,
  business_id: 'biz_1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  is_recurring: false,
  tax_category: 'saas',
  metadata,
});

describe('DodoPayments — products', () => {
  it('POSTs a new product to /products and returns the record', async () => {
    const c = client(PRODUCT);
    const product = await c.createProduct({
      name: 'Pro (monthly)',
      tax_category: 'saas',
      price: MONTHLY_PRICE,
      metadata: { plan_code: 'pro_monthly' },
    });
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assert(c.request!.url.endsWith('/products'));
    const body = JSON.parse(c.request!.body!);
    asserts.assertEquals(body.price.payment_frequency_interval, 'Month');
    asserts.assertEquals(body.metadata, { plan_code: 'pro_monthly' });
    asserts.assertEquals(product.product_id, 'pdt_1');
  });

  it('rejects an invalid product before sending', async () => {
    const c = client(PRODUCT);
    const err = await asserts.assertRejects(
      () =>
        c.createProduct({
          name: 'Pack',
          tax_category: 'saas',
          price: { type: 'one_time_price', price: 49.5, currency: 'USD' },
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });

  it('GETs a product by id, url-encoded', async () => {
    const c = client(PRODUCT);
    const product = await c.getProduct('pdt/1');
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assert(c.request!.url.endsWith('/products/pdt%2F1'));
    asserts.assertEquals(product.price.type, 'recurring_price');
  });

  it('lists products with its filters', async () => {
    const c = client({ items: [productItem('pdt_1')] });
    const items = await c.listProducts({
      archived: true,
      recurring: false,
      brandId: 'brd_1',
      pageSize: 50,
    });
    const url = new URL(c.request!.url);
    asserts.assertEquals(url.pathname, '/products');
    asserts.assertEquals(url.searchParams.get('archived'), 'true');
    asserts.assertEquals(url.searchParams.get('recurring'), 'false');
    asserts.assertEquals(url.searchParams.get('brand_id'), 'brd_1');
    asserts.assertEquals(url.searchParams.get('page_size'), '50');
    asserts.assertEquals(items.length, 1);
  });

  it('sends no archived flag unless asked — live products by default', async () => {
    const c = client({ items: [] });
    await c.listProducts();
    asserts.assertEquals(new URL(c.request!.url).search, '');
  });

  it('PATCHes an update and resolves on an empty 200', async () => {
    const c = new MockDodo({ auth: AUTH });
    c.setEmptyResponse(200);
    const result = await c.updateProduct('pdt_1', { name: 'Renamed' });
    asserts.assertEquals(result, undefined);
    asserts.assertEquals(c.request!.method, 'PATCH');
    asserts.assert(c.request!.url.endsWith('/products/pdt_1'));
    asserts.assertEquals(JSON.parse(c.request!.body!), { name: 'Renamed' });
  });

  it('rejects an update that changes nothing, without sending', async () => {
    const c = new MockDodo({ auth: AUTH });
    c.setEmptyResponse(200);
    const err = await asserts.assertRejects(
      () => c.updateProduct('pdt_1', {}),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });

  it('archives with DELETE /products/{id}', async () => {
    const c = new MockDodo({ auth: AUTH });
    c.setEmptyResponse(200);
    await c.archiveProduct('pdt_1');
    asserts.assertEquals(c.request!.method, 'DELETE');
    asserts.assert(c.request!.url.endsWith('/products/pdt_1'));
  });

  it('unarchives with POST /products/{id}/unarchive', async () => {
    const c = new MockDodo({ auth: AUTH });
    c.setEmptyResponse(200);
    await c.unarchiveProduct('pdt_1');
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assert(c.request!.url.endsWith('/products/pdt_1/unarchive'));
  });

  it('maps unarchiving a live product (409) to CONFLICT', async () => {
    const c = client({ code: 'ProductNotArchived', message: 'no' }, 409);
    const err = await asserts.assertRejects(
      () => c.unarchiveProduct('pdt_1'),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'CONFLICT');
  });

  it('maps archiving a deleted product (410) to NOT_FOUND', async () => {
    const c = client({ code: 'Gone', message: 'deleted' }, 410);
    const err = await asserts.assertRejects(
      () => c.archiveProduct('pdt_1'),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'NOT_FOUND');
  });

  it('rejects a blank product id on every product route, without sending', async () => {
    const c = new MockDodo({ auth: AUTH });
    c.setEmptyResponse(200);
    const calls = [
      () => c.getProduct(' '),
      () => c.updateProduct('', { name: 'x' }),
      () => c.archiveProduct(''),
      () => c.unarchiveProduct(''),
    ];
    for (const call of calls) {
      const err = await asserts.assertRejects(call, DodoPaymentsError);
      asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    }
    asserts.assertEquals(c.request, undefined);
  });
});

describe('DodoPayments — findProductsByMetadata', () => {
  function pager(): PagingMockDodo {
    return new PagingMockDodo({ auth: AUTH });
  }

  it('walks every page and returns the matches', async () => {
    const c = pager();
    c.setPages([
      { items: [productItem('pdt_1', { plan_code: 'starter' })] },
      { items: [productItem('pdt_2', { plan_code: 'pro_monthly' })] },
      { items: [] },
    ]);
    const found = await c.findProductsByMetadata({ plan_code: 'pro_monthly' });
    asserts.assertEquals(found.map((p) => p.product_id), ['pdt_2']);
    asserts.assertEquals(c.urls.length, 3);
    asserts.assert(!c.urls[0]!.includes('archived'), c.urls[0]);
  });

  it('requires every entry to match, and compares strictly', async () => {
    const c = pager();
    c.setPages([
      {
        items: [
          productItem('pdt_1', { plan_code: 'pro', seats: '5' }),
          productItem('pdt_2', { plan_code: 'pro', seats: 5 }),
          productItem('pdt_3', { plan_code: 'pro' }),
        ],
      },
      { items: [] },
    ]);
    const found = await c.findProductsByMetadata({
      plan_code: 'pro',
      seats: 5,
    });
    asserts.assertEquals(found.map((p) => p.product_id), ['pdt_2']);
  });

  it('searches archived products in a second pass when asked', async () => {
    const c = pager();
    c.setPages([
      { items: [] },
      { items: [productItem('pdt_old', { plan_code: 'pro_monthly' })] },
      { items: [] },
    ]);
    const found = await c.findProductsByMetadata(
      { plan_code: 'pro_monthly' },
      { includeArchived: true },
    );
    asserts.assertEquals(found.map((p) => p.product_id), ['pdt_old']);
    asserts.assert(!c.urls[0]!.includes('archived'), c.urls[0]);
    asserts.assert(c.urls[1]!.includes('archived=true'), c.urls[1]);
  });

  it('returns an empty array when nothing matches', async () => {
    const c = pager();
    c.setPages([{ items: [productItem('pdt_1', { plan_code: 'x' })] }]);
    asserts.assertEquals(
      await c.findProductsByMetadata({ plan_code: 'y' }),
      [],
    );
  });

  it('rejects an empty match — it would match every product', async () => {
    const c = pager();
    c.setPages([]);
    const err = await asserts.assertRejects(
      () => c.findProductsByMetadata({}),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.urls, []);
  });
});

const DISCOUNT = {
  discount_id: 'dsc_1',
  business_id: 'biz_1',
  type: 'percentage',
  code: 'WELCOME20',
  amount: 2000,
  times_used: 0,
  restricted_to: [],
  created_at: '2026-01-01T00:00:00Z',
  customer_eligibility: 'first_time',
  preserve_on_plan_change: false,
  metadata: { partner_id: 'acme' },
  subscription_cycles: 1,
};

describe('DodoPayments — discounts', () => {
  it('POSTs a new discount to /discounts and returns the record', async () => {
    const c = client(DISCOUNT);
    const discount = await c.createDiscount({
      type: 'percentage',
      amount: 2000,
      code: 'WELCOME20',
      subscription_cycles: 1,
      per_customer_usage_limit: 1,
      customer_eligibility: 'first_time',
      metadata: { partner_id: 'acme' },
    });
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assertEquals(new URL(c.request!.url).pathname, '/discounts');
    asserts.assertEquals(JSON.parse(c.request!.body!), {
      type: 'percentage',
      amount: 2000,
      code: 'WELCOME20',
      subscription_cycles: 1,
      per_customer_usage_limit: 1,
      customer_eligibility: 'first_time',
      metadata: { partner_id: 'acme' },
    });
    asserts.assertEquals(discount.discount_id, 'dsc_1');
    asserts.assertEquals(discount.metadata.partner_id, 'acme');
  });

  it('sends a flat discount with its currency options', async () => {
    const c = client({ ...DISCOUNT, type: 'flat', amount: 500 });
    await c.createDiscount({
      type: 'flat',
      amount: 500,
      currency_options: [{
        currency: 'USD',
        is_default: true,
        max_amount_possible: 500,
        minimum_subtotal: 2000,
      }],
    });
    asserts.assertEquals(
      JSON.parse(c.request!.body!).currency_options[0].max_amount_possible,
      500,
    );
  });

  it('rejects an invalid discount before sending', async () => {
    const c = client(DISCOUNT);
    const bad = [
      { type: 'percentage', amount: 15_000 },
      { type: 'flat', amount: 500 },
      {
        type: 'percentage',
        amount: 10,
        usage_limit: 1,
        per_customer_usage_limit: 2,
      },
      { type: 'percentage', amount: 10, usageLimit: 5 },
    ];
    for (const request of bad) {
      const err = await asserts.assertRejects(
        () => c.createDiscount(request as never),
        DodoPaymentsError,
      );
      asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    }
    asserts.assertEquals(c.request, undefined);
  });

  it('maps a taken code to INVALID_REQUEST, keeping the vendor code', async () => {
    const c = client(
      { code: 'DISCOUNT_CODE_ALREADY_EXISTS', message: 'exists' },
      422,
    );
    const err = await asserts.assertRejects(
      () => c.createDiscount({ type: 'percentage', amount: 10, code: 'TAKEN' }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'INVALID_REQUEST');
    asserts.assertEquals(
      err.getContextValue('vendorCode'),
      'DISCOUNT_CODE_ALREADY_EXISTS',
    );
  });

  it('GETs a discount by id, url-encoded', async () => {
    const c = client(DISCOUNT);
    const discount = await c.getDiscount('dsc/1');
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assert(c.request!.url.endsWith('/discounts/dsc%2F1'));
    asserts.assertEquals(discount.code, 'WELCOME20');
  });

  it('GETs a discount by code on its own path, url-encoded', async () => {
    const c = client(DISCOUNT);
    await c.getDiscountByCode('SAVE 20%');
    asserts.assertEquals(c.request!.method, 'GET');
    asserts.assert(c.request!.url.endsWith('/discounts/code/SAVE%2020%25'));
  });

  it('maps an unknown code to NOT_FOUND and an expired one to INVALID_REQUEST', async () => {
    const missing = client({ code: 'NOT_FOUND', message: 'no' }, 404);
    asserts.assertEquals(
      (await asserts.assertRejects(
        () => missing.getDiscountByCode('NOPE'),
        DodoPaymentsError,
      )).code,
      'NOT_FOUND',
    );
    const expired = client(
      { code: 'DISCOUNT_CODE_EXPIRED', message: 'x' },
      422,
    );
    asserts.assertEquals(
      (await asserts.assertRejects(
        () => expired.getDiscountByCode('OLD'),
        DodoPaymentsError,
      )).code,
      'INVALID_REQUEST',
    );
  });

  it('lists discounts with its filters', async () => {
    const c = client({ items: [DISCOUNT] });
    const items = await c.listDiscounts({
      code: 'SAVE',
      discountType: 'percentage',
      active: false,
      productId: 'pdt_1',
      pageNumber: 2,
      pageSize: 50,
    });
    const url = new URL(c.request!.url);
    asserts.assertEquals(url.pathname, '/discounts');
    asserts.assertEquals(url.searchParams.get('code'), 'SAVE');
    asserts.assertEquals(url.searchParams.get('discount_type'), 'percentage');
    asserts.assertEquals(url.searchParams.get('active'), 'false');
    asserts.assertEquals(url.searchParams.get('product_id'), 'pdt_1');
    asserts.assertEquals(url.searchParams.get('page_number'), '2');
    asserts.assertEquals(url.searchParams.get('page_size'), '50');
    asserts.assertEquals(items[0]?.discount_id, 'dsc_1');
  });

  it('sends no filters when none are given', async () => {
    const c = client({ items: [] });
    asserts.assertEquals(await c.listDiscounts(), []);
    asserts.assertEquals(new URL(c.request!.url).search, '');
  });

  it('walks every discount page', async () => {
    const c = new PagingMockDodo({ auth: AUTH });
    c.setPages([
      { items: [DISCOUNT, { ...DISCOUNT, discount_id: 'dsc_2' }] },
      { items: [{ ...DISCOUNT, discount_id: 'dsc_3' }] },
      { items: [] },
    ]);
    const all = await Array.fromAsync(c.listAllDiscounts({ active: true }));
    asserts.assertEquals(all.map((d) => d.discount_id), [
      'dsc_1',
      'dsc_2',
      'dsc_3',
    ]);
    const pages = c.urls.map((u) => new URL(u).searchParams);
    asserts.assertEquals(pages.map((q) => q.get('page_number')), [
      null,
      '1',
      '2',
    ]);
    asserts.assert(pages.every((q) => q.get('active') === 'true'));
  });

  it('PATCHes a partial update and returns the record', async () => {
    const c = client({ ...DISCOUNT, per_customer_usage_limit: null });
    const discount = await c.updateDiscount('dsc_1', {
      expires_at: '2026-12-31T23:59:59Z',
      per_customer_usage_limit: null,
    });
    asserts.assertEquals(c.request!.method, 'PATCH');
    asserts.assert(c.request!.url.endsWith('/discounts/dsc_1'));
    asserts.assertEquals(JSON.parse(c.request!.body!), {
      expires_at: '2026-12-31T23:59:59Z',
      per_customer_usage_limit: null,
    });
    asserts.assertEquals(discount.discount_id, 'dsc_1');
  });

  it('rejects an update that changes nothing, without sending', async () => {
    const c = client(DISCOUNT);
    const err = await asserts.assertRejects(
      () => c.updateDiscount('dsc_1', {}),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });

  it('deletes with DELETE /discounts/{id}, resolving on a 204', async () => {
    const c = new MockDodo({ auth: AUTH });
    c.setEmptyResponse(204);
    asserts.assertEquals(await c.deleteDiscount('dsc_1'), undefined);
    asserts.assertEquals(c.request!.method, 'DELETE');
    asserts.assert(c.request!.url.endsWith('/discounts/dsc_1'));
  });

  it('maps deleting an already deleted discount to NOT_FOUND', async () => {
    const c = client({ code: 'NOT_FOUND', message: 'gone' }, 404);
    const err = await asserts.assertRejects(
      () => c.deleteDiscount('dsc_1'),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'NOT_FOUND');
  });

  it('rejects a blank discount id or code on every route, without sending', async () => {
    const c = new MockDodo({ auth: AUTH });
    c.setEmptyResponse(200);
    const calls = [
      () => c.getDiscount(' '),
      () => c.getDiscountByCode(''),
      () => c.updateDiscount('', { name: 'x' }),
      () => c.deleteDiscount(''),
      () => c.addDiscountCustomers('', ['cus_1']),
      () => c.listDiscountCustomers(''),
      () => c.removeDiscountCustomer('', 'cus_1'),
      () => c.removeDiscountCustomer('dsc_1', ' '),
    ];
    for (const call of calls) {
      const err = await asserts.assertRejects(call, DodoPaymentsError);
      asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    }
    asserts.assertEquals(c.request, undefined);
  });
});

describe('DodoPayments — discount allow list', () => {
  it('POSTs customer_ids and returns the customers added', async () => {
    const c = client({
      items: [{ customer_id: 'cus_1' }, { customer_id: 'cus_2' }],
    });
    const added = await c.addDiscountCustomers('dsc_1', ['cus_1', 'cus_2']);
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assert(c.request!.url.endsWith('/discounts/dsc_1/customers'));
    asserts.assertEquals(JSON.parse(c.request!.body!), {
      customer_ids: ['cus_1', 'cus_2'],
    });
    asserts.assertEquals(added.map((a) => a.customer_id), ['cus_1', 'cus_2']);
  });

  it('rejects an empty, oversized or blank-holding id list, without sending', async () => {
    const c = client({ items: [] });
    for (
      const ids of [
        [],
        Array.from({ length: 1001 }, (_, i) => `cus_${i}`),
        ['cus_1', ''],
      ]
    ) {
      const err = await asserts.assertRejects(
        () => c.addDiscountCustomers('dsc_1', ids),
        DodoPaymentsError,
      );
      asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    }
    asserts.assertEquals(c.request, undefined);
  });

  it('maps an unknown customer (422) to INVALID_REQUEST', async () => {
    const c = client({ code: 'CUSTOMER_NOT_FOUND', message: 'no' }, 422);
    const err = await asserts.assertRejects(
      () => c.addDiscountCustomers('dsc_1', ['cus_x']),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'INVALID_REQUEST');
  });

  it('lists the allow list with paging', async () => {
    const c = client({ items: [{ customer_id: 'cus_1' }] });
    const page = await c.listDiscountCustomers('dsc_1', {
      pageNumber: 2,
      pageSize: 10,
    });
    const url = new URL(c.request!.url);
    asserts.assertEquals(url.pathname, '/discounts/dsc_1/customers');
    asserts.assertEquals(url.searchParams.get('page_number'), '2');
    asserts.assertEquals(url.searchParams.get('page_size'), '10');
    asserts.assertEquals(page, [{ customer_id: 'cus_1' }]);
  });

  it('walks every allow-list page', async () => {
    const c = new PagingMockDodo({ auth: AUTH });
    c.setPages([
      { items: [{ customer_id: 'cus_1' }] },
      { items: [{ customer_id: 'cus_2' }] },
    ]);
    const all = await Array.fromAsync(c.listAllDiscountCustomers('dsc_1'));
    asserts.assertEquals(all.map((a) => a.customer_id), ['cus_1', 'cus_2']);
    asserts.assertEquals(c.urls.length, 3);
    asserts.assert(
      c.urls.every((u) => new URL(u).pathname === '/discounts/dsc_1/customers'),
    );
  });

  it('removes a customer with DELETE, resolving on a 204', async () => {
    const c = new MockDodo({ auth: AUTH });
    c.setEmptyResponse(204);
    await c.removeDiscountCustomer('dsc_1', 'cus/1');
    asserts.assertEquals(c.request!.method, 'DELETE');
    asserts.assert(
      c.request!.url.endsWith('/discounts/dsc_1/customers/cus%2F1'),
    );
  });
});

describe('DodoPayments — plan changes', () => {
  const change = {
    product_id: 'pdt_pro',
    quantity: 1,
    proration_billing_mode: 'prorated_immediately' as const,
  };

  it('POSTs to /subscriptions/{id}/change-plan', async () => {
    const c = client({
      payment_id: null,
      payment_link: null,
      client_secret: null,
      expires_on: null,
    });
    const result = await c.changePlan('sub_1', change);
    asserts.assertEquals(c.request!.method, 'POST');
    asserts.assert(c.request!.url.endsWith('/subscriptions/sub_1/change-plan'));
    asserts.assertEquals(JSON.parse(c.request!.body!), change);
    asserts.assertEquals(result.payment_link, null);
  });

  it('accepts an empty body for an off-session change', async () => {
    const c = new MockDodo({ auth: AUTH });
    c.setEmptyResponse(200);
    asserts.assertEquals(await c.changePlan('sub_1', change), {});
  });

  it('rejects an impossible payment-link change before sending', async () => {
    const c = client({});
    const err = await asserts.assertRejects(
      () =>
        c.changePlan('sub_1', {
          ...change,
          collect_via_payment_link: true,
          effective_at: 'next_billing_date',
          on_payment_failure: 'prevent_change',
        }),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
  });

  it('maps a pending plan change (409) to CONFLICT, keeping the vendor code', async () => {
    const c = client(
      { code: 'PendingPlanChangeExists', message: 'pending' },
      409,
    );
    const err = await asserts.assertRejects(
      () => c.changePlan('sub_1', change),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'CONFLICT');
    asserts.assertEquals(
      err.getContextValue('vendorCode'),
      'PendingPlanChangeExists',
    );
  });

  it('cancels a scheduled change with DELETE, resolving on a 204', async () => {
    const c = new MockDodo({ auth: AUTH });
    c.setEmptyResponse(204);
    await c.cancelScheduledPlanChange('sub_1');
    asserts.assertEquals(c.request!.method, 'DELETE');
    asserts.assert(
      c.request!.url.endsWith('/subscriptions/sub_1/change-plan/scheduled'),
    );
  });
});

describe('DodoPayments — pause, resume and undo cancellation', () => {
  it('pauses with status paused alone — Dodo rejects it combined', async () => {
    const c = client({ ...SUBSCRIPTION, status: 'paused' });
    const sub = await c.pauseSubscription('sub_1');
    asserts.assertEquals(c.request!.method, 'PATCH');
    asserts.assertEquals(JSON.parse(c.request!.body!), { status: 'paused' });
    asserts.assertEquals(sub.status, 'paused');
  });

  it('resumes with status active alone', async () => {
    const c = client(SUBSCRIPTION);
    const sub = await c.resumeSubscription('sub_1');
    asserts.assertEquals(JSON.parse(c.request!.body!), { status: 'active' });
    asserts.assertEquals(sub.status, 'active');
  });

  it('undoes a period-end cancellation with cancel_at_next_billing_date false', async () => {
    const c = client(SUBSCRIPTION);
    const sub = await c.undoScheduledCancellation('sub_1');
    asserts.assertEquals(JSON.parse(c.request!.body!), {
      cancel_at_next_billing_date: false,
    });
    asserts.assertEquals(sub.cancel_at_next_billing_date, false);
  });

  it('rejects a blank subscription id on every route, without sending', async () => {
    const c = client(SUBSCRIPTION);
    const calls = [
      () => c.pauseSubscription(''),
      () => c.resumeSubscription(' '),
      () => c.undoScheduledCancellation(''),
      () =>
        c.changePlan('', {
          product_id: 'p',
          quantity: 1,
          proration_billing_mode: 'do_not_bill',
        }),
      () => c.cancelScheduledPlanChange(''),
    ];
    for (const call of calls) {
      const err = await asserts.assertRejects(call, DodoPaymentsError);
      asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    }
    asserts.assertEquals(c.request, undefined);
  });
});

describe('DodoPayments — customer portal', () => {
  const SESSION = { link: 'https://customer.dodopayments.com/session/abc' };

  it('POSTs a session and returns the link', async () => {
    const c = client(SESSION);
    const session = await c.createCustomerPortalSession('cus_1');
    asserts.assertEquals(c.request!.method, 'POST');
    const url = new URL(c.request!.url);
    asserts.assertEquals(
      url.pathname,
      '/customers/cus_1/customer-portal/session',
    );
    asserts.assertEquals(url.search, '');
    asserts.assertEquals(session.link, SESSION.link);
  });

  it('passes send_email and return_url as query parameters', async () => {
    const c = client(SESSION);
    await c.createCustomerPortalSession('cus_1', {
      sendEmail: true,
      returnUrl: 'https://example.com/account',
    });
    const url = new URL(c.request!.url);
    asserts.assertEquals(url.searchParams.get('send_email'), 'true');
    asserts.assertEquals(
      url.searchParams.get('return_url'),
      'https://example.com/account',
    );
  });

  it('rejects a blank customer id without sending', async () => {
    const c = client(SESSION);
    const err = await asserts.assertRejects(
      () => c.createCustomerPortalSession(''),
      DodoPaymentsError,
    );
    asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    asserts.assertEquals(c.request, undefined);
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
