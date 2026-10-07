import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CreateDiscountRequestSchemaObject,
  DiscountCustomerEligibilitySchemaObject,
  DiscountCustomerListSchemaObject,
  DiscountListSchemaObject,
  DiscountSchemaObject,
  DiscountTypeSchemaObject,
  UpdateDiscountRequestSchemaObject,
} from './Discount.ts';

const PERCENTAGE = { type: 'percentage', amount: 1500 };

const FLAT = {
  type: 'flat',
  amount: 500,
  currency_options: [
    {
      currency: 'USD',
      is_default: true,
      max_amount_possible: 500,
      minimum_subtotal: 2000,
    },
  ],
};

const DISCOUNT = {
  discount_id: 'dsc_1',
  business_id: 'biz_1',
  type: 'percentage',
  code: 'WELCOME20',
  amount: 2000,
  times_used: 3,
  restricted_to: ['pdt_1'],
  created_at: '2026-01-01T00:00:00Z',
  customer_eligibility: 'first_time',
  preserve_on_plan_change: false,
  metadata: { partner_id: 'acme', tier: 2, internal: true },
};

describe('DodoPayments.schema.DiscountEnums', () => {
  it('accepts percentage and flat, and blocks flat_per_unit', () => {
    asserts.assertEquals(
      DiscountTypeSchemaObject.safeParse('percentage')[0],
      null,
    );
    asserts.assertEquals(DiscountTypeSchemaObject.safeParse('flat')[0], null);
    asserts.assertExists(
      DiscountTypeSchemaObject.safeParse('flat_per_unit')[0],
    );
  });

  it('accepts every documented customer eligibility', () => {
    for (const e of ['any', 'first_time', 'existing', 'specific']) {
      asserts.assertEquals(
        DiscountCustomerEligibilitySchemaObject.safeParse(e)[0],
        null,
        e,
      );
    }
    asserts.assertExists(
      DiscountCustomerEligibilitySchemaObject.safeParse('new')[0],
    );
  });
});

describe('DodoPayments.schema.CreateDiscountRequest', () => {
  it('accepts a percentage code with every option brevily needs', () => {
    const [error, body] = CreateDiscountRequestSchemaObject.safeParse({
      ...PERCENTAGE,
      code: 'WELCOME20',
      name: 'Welcome offer',
      usage_limit: 100,
      per_customer_usage_limit: 1,
      subscription_cycles: 3,
      restricted_to: ['pdt_1', 'pdt_2'],
      starts_at: '2026-01-01T00:00:00Z',
      expires_at: '2026-12-31T23:59:59.999+05:30',
      customer_eligibility: 'first_time',
      preserve_on_plan_change: true,
      metadata: { partner_id: 'acme', tier: 2, internal: true },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.metadata, {
      partner_id: 'acme',
      tier: 2,
      internal: true,
    });
  });

  it('accepts a flat code with a per-currency deduction', () => {
    asserts.assertEquals(
      CreateDiscountRequestSchemaObject.safeParse(FLAT)[0],
      null,
    );
  });

  it('accepts null for the nullable fields', () => {
    asserts.assertEquals(
      CreateDiscountRequestSchemaObject.safeParse({
        ...PERCENTAGE,
        code: null,
        subscription_cycles: null,
        usage_limit: null,
        starts_at: null,
        expires_at: null,
        restricted_to: null,
        customer_eligibility: null,
      })[0],
      null,
    );
  });

  it('rejects an unknown field instead of silently dropping it', () => {
    const [error] = CreateDiscountRequestSchemaObject.safeParse({
      ...PERCENTAGE,
      usageLimit: 5,
    });
    asserts.assertExists(error);
    asserts.assertStringIncludes(error.message, 'usageLimit');
  });

  it('rejects a numeric string or a boolean string — no coercion', () => {
    asserts.assertExists(
      CreateDiscountRequestSchemaObject.safeParse({
        type: 'percentage',
        amount: '1500',
      })[0],
    );
    asserts.assertExists(
      CreateDiscountRequestSchemaObject.safeParse({
        ...PERCENTAGE,
        preserve_on_plan_change: 'true',
      })[0],
    );
  });

  it('rejects a percentage above 10000 basis points', () => {
    asserts.assertEquals(
      CreateDiscountRequestSchemaObject.safeParse({
        type: 'percentage',
        amount: 10_000,
      })[0],
      null,
    );
    const [error] = CreateDiscountRequestSchemaObject.safeParse({
      type: 'percentage',
      amount: 10_001,
    });
    asserts.assertStringIncludes(error!.message, 'basis points');
  });

  it('allows a flat amount above 10000 — it is money, not basis points', () => {
    asserts.assertEquals(
      CreateDiscountRequestSchemaObject.safeParse({
        ...FLAT,
        amount: 25_000,
      })[0],
      null,
    );
  });

  it('rejects a zero or fractional amount', () => {
    for (const amount of [0, 12.5]) {
      asserts.assertExists(
        CreateDiscountRequestSchemaObject.safeParse({ ...PERCENTAGE, amount })[
          0
        ],
        String(amount),
      );
    }
  });

  it('rejects a flat code with no currency options', () => {
    for (const currency_options of [undefined, null, []]) {
      const [error] = CreateDiscountRequestSchemaObject.safeParse({
        type: 'flat',
        amount: 500,
        currency_options,
      });
      asserts.assertStringIncludes(error!.message, 'currency_options');
    }
  });

  it('rejects a flat currency option without its deduction', () => {
    const [error] = CreateDiscountRequestSchemaObject.safeParse({
      type: 'flat',
      amount: 500,
      currency_options: [{ currency: 'USD', is_default: true }],
    });
    asserts.assertStringIncludes(error!.message, 'max_amount_possible');
  });

  it('rejects a repeated currency and a second default', () => {
    asserts.assertExists(
      CreateDiscountRequestSchemaObject.safeParse({
        ...FLAT,
        currency_options: [
          { currency: 'USD', max_amount_possible: 500 },
          { currency: 'USD', max_amount_possible: 500 },
        ],
      })[0],
    );
    asserts.assertExists(
      CreateDiscountRequestSchemaObject.safeParse({
        ...FLAT,
        currency_options: [
          { currency: 'USD', is_default: true, max_amount_possible: 500 },
          { currency: 'EUR', is_default: true, max_amount_possible: 450 },
        ],
      })[0],
    );
  });

  it('rejects a lowercase currency, a zero deduction and an unknown option field', () => {
    for (
      const option of [
        { currency: 'usd', max_amount_possible: 500 },
        { currency: 'USD', max_amount_possible: 0 },
        { currency: 'USD', max_amount_possible: 500, minimum_subtotal: -1 },
        { currency: 'USD', max_amount_possible: 500, cap: 500 },
      ]
    ) {
      asserts.assertExists(
        CreateDiscountRequestSchemaObject.safeParse({
          ...FLAT,
          currency_options: [option],
        })[0],
        JSON.stringify(option),
      );
    }
  });

  it('holds a code to 3–16 characters', () => {
    for (const code of ['ABC', 'A'.repeat(16)]) {
      asserts.assertEquals(
        CreateDiscountRequestSchemaObject.safeParse({ ...PERCENTAGE, code })[0],
        null,
        code,
      );
    }
    for (const code of ['AB', 'A'.repeat(17)]) {
      asserts.assertExists(
        CreateDiscountRequestSchemaObject.safeParse({ ...PERCENTAGE, code })[0],
        code,
      );
    }
  });

  it('rejects a limit, cycle count or per-customer limit below 1', () => {
    for (
      const field of [
        'usage_limit',
        'per_customer_usage_limit',
        'subscription_cycles',
      ]
    ) {
      asserts.assertExists(
        CreateDiscountRequestSchemaObject.safeParse({
          ...PERCENTAGE,
          [field]: 0,
        })[0],
        field,
      );
    }
  });

  it('rejects a per-customer limit above the total limit', () => {
    asserts.assertEquals(
      CreateDiscountRequestSchemaObject.safeParse({
        ...PERCENTAGE,
        usage_limit: 5,
        per_customer_usage_limit: 5,
      })[0],
      null,
    );
    const [error] = CreateDiscountRequestSchemaObject.safeParse({
      ...PERCENTAGE,
      usage_limit: 5,
      per_customer_usage_limit: 6,
    });
    asserts.assertStringIncludes(error!.message, 'per_customer_usage_limit');
  });

  it('rejects a window that ends at or before it starts', () => {
    for (const expires_at of ['2026-01-01T00:00:00Z', '2025-12-31T00:00:00Z']) {
      const [error] = CreateDiscountRequestSchemaObject.safeParse({
        ...PERCENTAGE,
        starts_at: '2026-01-01T00:00:00Z',
        expires_at,
      });
      asserts.assertStringIncludes(error!.message, 'expires_at');
    }
  });

  it('compares the window across offsets', () => {
    // 01:00+02:00 is 23:00Z the day before — earlier than the start.
    asserts.assertExists(
      CreateDiscountRequestSchemaObject.safeParse({
        ...PERCENTAGE,
        starts_at: '2026-01-01T00:00:00Z',
        expires_at: '2026-01-01T01:00:00+02:00',
      })[0],
    );
  });

  it('rejects a date-time without an offset, a bare date, and a non-date', () => {
    for (
      const expires_at of [
        '2026-01-01T00:00:00',
        '2026-01-01',
        '2026-13-45T00:00:00Z',
      ]
    ) {
      asserts.assertExists(
        CreateDiscountRequestSchemaObject.safeParse({
          ...PERCENTAGE,
          expires_at,
        })[0],
        expires_at,
      );
    }
  });

  it('rejects a blank restricted product id and non-scalar metadata', () => {
    asserts.assertExists(
      CreateDiscountRequestSchemaObject.safeParse({
        ...PERCENTAGE,
        restricted_to: [''],
      })[0],
    );
    asserts.assertExists(
      CreateDiscountRequestSchemaObject.safeParse({
        ...PERCENTAGE,
        metadata: { nested: { a: 1 } },
      })[0],
    );
  });
});

describe('DodoPayments.schema.UpdateDiscountRequest', () => {
  it('accepts a partial update', () => {
    const [error, body] = UpdateDiscountRequestSchemaObject.safeParse({
      expires_at: '2026-12-31T23:59:59Z',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body, { expires_at: '2026-12-31T23:59:59Z' });
  });

  it('accepts null to clear the per-customer limit and the start', () => {
    asserts.assertEquals(
      UpdateDiscountRequestSchemaObject.safeParse({
        per_customer_usage_limit: null,
        starts_at: null,
      })[0],
      null,
    );
  });

  it('accepts [] to clear the product restriction and currency options', () => {
    asserts.assertEquals(
      UpdateDiscountRequestSchemaObject.safeParse({
        restricted_to: [],
        currency_options: [],
      })[0],
      null,
    );
  });

  it('rejects null where Dodo would ignore it', () => {
    for (
      const field of [
        'type',
        'amount',
        'code',
        'customer_eligibility',
        'restricted_to',
        'currency_options',
        'metadata',
      ]
    ) {
      asserts.assertExists(
        UpdateDiscountRequestSchemaObject.safeParse({ [field]: null })[0],
        field,
      );
    }
  });

  it('rejects an empty update and an unknown field', () => {
    asserts.assertExists(UpdateDiscountRequestSchemaObject.safeParse({})[0]);
    asserts.assertExists(
      UpdateDiscountRequestSchemaObject.safeParse({ usageLimit: 5 })[0],
    );
  });

  it('checks the cross-field rules between the fields it carries', () => {
    for (
      const update of [
        { type: 'percentage', amount: 10_001 },
        { usage_limit: 2, per_customer_usage_limit: 3 },
        {
          starts_at: '2026-02-01T00:00:00Z',
          expires_at: '2026-01-01T00:00:00Z',
        },
        { code: 'AB' },
      ]
    ) {
      asserts.assertExists(
        UpdateDiscountRequestSchemaObject.safeParse(update)[0],
        JSON.stringify(update),
      );
    }
  });

  it('accepts a large amount when the update does not say the type', () => {
    // The stored type may be flat; Dodo checks it against the record.
    asserts.assertEquals(
      UpdateDiscountRequestSchemaObject.safeParse({ amount: 25_000 })[0],
      null,
    );
  });
});

describe('DodoPayments.schema.Discount', () => {
  it('accepts the documented record and keeps metadata types', () => {
    const [error, discount] = DiscountSchemaObject.safeParse({
      ...DISCOUNT,
      currency_options: [
        { currency: 'USD', is_default: true, minimum_subtotal: 0 },
      ],
      name: null,
      usage_limit: 100,
      per_customer_usage_limit: 1,
      subscription_cycles: 1,
      starts_at: null,
      expires_at: '2026-12-31T23:59:59Z',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(discount?.metadata.tier, 2);
    asserts.assertEquals(discount?.currency_options?.[0]?.is_default, true);
  });

  it('reads a legacy flat_per_unit discount and an unknown eligibility', () => {
    asserts.assertEquals(
      DiscountSchemaObject.safeParse({
        ...DISCOUNT,
        type: 'flat_per_unit',
        customer_eligibility: 'vip',
      })[0],
      null,
    );
  });

  it('keeps additive vendor fields', () => {
    const [, discount] = DiscountSchemaObject.safeParse({
      ...DISCOUNT,
      brand_id: 'brd_1',
    });
    asserts.assertEquals(
      (discount as Record<string, unknown>).brand_id,
      'brd_1',
    );
  });

  it('rejects a record missing a required field', () => {
    const { times_used: _, ...partial } = DISCOUNT;
    asserts.assertExists(DiscountSchemaObject.safeParse(partial)[0]);
  });
});

describe('DodoPayments.schema.DiscountList', () => {
  it('reads a page, a bare array, and an absent items as empty', () => {
    asserts.assertEquals(
      DiscountListSchemaObject.safeParse({ items: [DISCOUNT] })[1]?.items
        .length,
      1,
    );
    asserts.assertEquals(
      DiscountListSchemaObject.safeParse([DISCOUNT])[1]?.items.length,
      1,
    );
    asserts.assertEquals(
      DiscountListSchemaObject.safeParse({})[1]?.items,
      [],
    );
  });

  it('reads an allow-list page', () => {
    const [error, page] = DiscountCustomerListSchemaObject.safeParse({
      items: [{ customer_id: 'cus_1' }, { customer_id: 'cus_2' }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.items.map((c) => c.customer_id), [
      'cus_1',
      'cus_2',
    ]);
    asserts.assertExists(
      DiscountCustomerListSchemaObject.safeParse({ items: [{}] })[0],
    );
  });
});
