import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CreateProductRequestSchemaObject,
  PriceSchemaObject,
  ProductListSchemaObject,
  ProductMetadataSchemaObject,
  ProductPriceRequestSchemaObject,
  ProductSchemaObject,
  TaxCategorySchemaObject,
  UpdateProductRequestSchemaObject,
} from './Product.ts';

const ONE_TIME = { type: 'one_time_price', price: 4900, currency: 'USD' };

const MONTHLY = {
  type: 'recurring_price',
  price: 1500,
  currency: 'USD',
  payment_frequency_count: 1,
  payment_frequency_interval: 'Month',
  subscription_period_count: 20,
  subscription_period_interval: 'Year',
  trial_period_days: 14,
};

const PRODUCT = {
  product_id: 'pdt_1',
  business_id: 'biz_1',
  brand_id: 'brd_1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  is_recurring: true,
  tax_category: 'saas',
  price: MONTHLY,
  metadata: { plan_code: 'pro_monthly' },
  name: 'Pro (monthly)',
  license_key_enabled: false,
  entitlements: [],
  credit_entitlements: [],
};

describe('DodoPayments.schema.TaxCategory', () => {
  it('accepts every documented category', () => {
    for (
      const c of [
        'digital_products',
        'saas',
        'e_book',
        'edtech',
        'live_tutoring',
      ]
    ) {
      asserts.assertEquals(TaxCategorySchemaObject.safeParse(c)[0], null, c);
    }
  });

  it('rejects an unknown category', () => {
    asserts.assertExists(TaxCategorySchemaObject.safeParse('physical')[0]);
  });
});

describe('DodoPayments.schema.ProductMetadata', () => {
  it('keeps each value type — a number is never turned into a string', () => {
    const [error, metadata] = ProductMetadataSchemaObject.safeParse({
      code: 'pro',
      seats: 5,
      ratio: 1.5,
      featured: true,
    });
    asserts.assertEquals(error, null);
    asserts.assertStrictEquals(metadata!.seats, 5);
    asserts.assertStrictEquals(metadata!.featured, true);
    asserts.assertStrictEquals(metadata!.code, 'pro');
  });

  it('rejects null, nested and non-finite values', () => {
    for (const value of [null, { a: 1 }, [1], Number.NaN, Infinity]) {
      asserts.assertExists(
        ProductMetadataSchemaObject.safeParse({ k: value })[0],
        String(value),
      );
    }
  });
});

describe('DodoPayments.schema.ProductPriceRequest', () => {
  it('accepts a one-time and a recurring price', () => {
    asserts.assertEquals(
      ProductPriceRequestSchemaObject.safeParse(ONE_TIME)[0],
      null,
    );
    asserts.assertEquals(
      ProductPriceRequestSchemaObject.safeParse(MONTHLY)[0],
      null,
    );
  });

  it('rejects a usage-based price — meters are out of scope for create', () => {
    asserts.assertExists(
      ProductPriceRequestSchemaObject.safeParse({
        ...MONTHLY,
        type: 'usage_based_price',
        fixed_price: 0,
      })[0],
    );
  });

  it('rejects a fractional amount — amounts are integer minor units', () => {
    asserts.assertExists(
      ProductPriceRequestSchemaObject.safeParse({
        ...ONE_TIME,
        price: 19.99,
      })[0],
    );
  });

  it('rejects a negative amount', () => {
    asserts.assertExists(
      ProductPriceRequestSchemaObject.safeParse({ ...ONE_TIME, price: -1 })[0],
    );
  });

  it('rejects a lowercase or malformed currency', () => {
    for (const currency of ['usd', 'US', 'DOLLARS']) {
      asserts.assertExists(
        ProductPriceRequestSchemaObject.safeParse({ ...ONE_TIME, currency })[0],
        currency,
      );
    }
  });

  it('rejects a recurring price without its billing frequency', () => {
    const { payment_frequency_interval: _, ...incomplete } = MONTHLY;
    asserts.assertExists(
      ProductPriceRequestSchemaObject.safeParse(incomplete)[0],
    );
  });

  it('rejects a lowercase interval — the vendor is case-sensitive here', () => {
    asserts.assertExists(
      ProductPriceRequestSchemaObject.safeParse({
        ...MONTHLY,
        payment_frequency_interval: 'month',
      })[0],
    );
  });

  it('rejects a discount above 100%', () => {
    asserts.assertExists(
      ProductPriceRequestSchemaObject.safeParse({
        ...ONE_TIME,
        discount_bps: 10_001,
      })[0],
    );
  });
});

describe('DodoPayments.schema.CreateProductRequest', () => {
  it('rejects unknown fields, at the top level and in the price', () => {
    const base = { name: 'Pack', tax_category: 'saas', price: ONE_TIME };
    asserts.assertStringIncludes(
      CreateProductRequestSchemaObject.safeParse({ ...base, taxCategory: 'x' })[
        0
      ]!.message,
      'taxCategory',
    );
    asserts.assertExists(
      CreateProductRequestSchemaObject.safeParse({
        ...base,
        price: { ...MONTHLY, trialDays: 7 },
      })[0],
    );
  });

  it('rejects a number or boolean sent as a string in the price', () => {
    for (
      const price of [
        { ...ONE_TIME, price: '4900' },
        { ...MONTHLY, payment_frequency_count: '1' },
        { ...MONTHLY, trial_payment_method_optional: 'true' },
      ]
    ) {
      asserts.assertExists(
        CreateProductRequestSchemaObject.safeParse({
          name: 'Pack',
          tax_category: 'saas',
          price,
        })[0],
        JSON.stringify(price),
      );
    }
  });

  const valid = {
    name: 'Credit pack (500)',
    tax_category: 'saas',
    price: ONE_TIME,
    metadata: { pack_code: 'credits_500' },
  };

  it('accepts a minimal product', () => {
    const [error, body] = CreateProductRequestSchemaObject.safeParse(valid);
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.metadata, { pack_code: 'credits_500' });
  });

  it('requires name, tax_category and price', () => {
    for (const key of ['name', 'tax_category', 'price']) {
      const { [key]: _, ...rest } = valid as Record<string, unknown>;
      asserts.assertExists(
        CreateProductRequestSchemaObject.safeParse(rest)[0],
        key,
      );
    }
  });

  it('enforces the vendor length limits on name and description', () => {
    asserts.assertExists(
      CreateProductRequestSchemaObject.safeParse({
        ...valid,
        name: 'x'.repeat(101),
      })[0],
    );
    asserts.assertExists(
      CreateProductRequestSchemaObject.safeParse({
        ...valid,
        description: 'x'.repeat(1001),
      })[0],
    );
  });
});

describe('DodoPayments.schema.UpdateProductRequest', () => {
  it('rejects an unknown field', () => {
    asserts.assertExists(
      UpdateProductRequestSchemaObject.safeParse({ title: 'Renamed' })[0],
    );
  });

  it('accepts a partial update', () => {
    asserts.assertEquals(
      UpdateProductRequestSchemaObject.safeParse({ name: 'Renamed' })[0],
      null,
    );
  });

  it('rejects an update that changes nothing', () => {
    asserts.assertExists(UpdateProductRequestSchemaObject.safeParse({})[0]);
  });

  it('still enforces the name limit on an update', () => {
    asserts.assertExists(
      UpdateProductRequestSchemaObject.safeParse({ name: 'x'.repeat(101) })[0],
    );
  });
});

describe('DodoPayments.schema.Product', () => {
  it('still reads a response leniently — new price fields pass through', () => {
    const [error, product] = ProductSchemaObject.safeParse({
      ...PRODUCT,
      price: { ...MONTHLY, some_new_field: true },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (product?.price as Record<string, unknown>).some_new_field,
      true,
    );
  });

  it('accepts a product and narrows its price by type', () => {
    const [error, product] = ProductSchemaObject.safeParse(PRODUCT);
    asserts.assertEquals(error, null);
    const price = product!.price;
    asserts.assertEquals(price.type, 'recurring_price');
    if (price.type === 'recurring_price') {
      asserts.assertEquals(price.subscription_period_interval, 'Year');
    }
  });

  it('keeps unknown vendor fields rather than failing', () => {
    const [error, product] = ProductSchemaObject.safeParse({
      ...PRODUCT,
      a_future_field: 1,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (product as Record<string, unknown>).a_future_field,
      1,
    );
  });

  it('reads a tax category it does not know yet', () => {
    asserts.assertEquals(
      ProductSchemaObject.safeParse({
        ...PRODUCT,
        tax_category: 'physical',
      })[0],
      null,
    );
  });

  it('reads a usage-based product', () => {
    asserts.assertEquals(
      PriceSchemaObject.safeParse({
        type: 'usage_based_price',
        fixed_price: 0,
        currency: 'USD',
        payment_frequency_count: 1,
        payment_frequency_interval: 'Month',
        subscription_period_count: 20,
        subscription_period_interval: 'Year',
        meters: [{ meter_id: 'm_1' }],
      })[0],
      null,
    );
  });
});

describe('DodoPayments.schema.ProductList', () => {
  const item = {
    product_id: 'pdt_1',
    business_id: 'biz_1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    is_recurring: false,
    tax_category: 'saas',
    metadata: { pack_code: 'credits_500' },
    price: 4900,
    currency: 'USD',
    price_detail: ONE_TIME,
    entitlements: [],
  };

  it('accepts a page and keeps metadata types', () => {
    const [error, page] = ProductListSchemaObject.safeParse({ items: [item] });
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.items[0]?.metadata.pack_code, 'credits_500');
  });

  it('accepts a null price_detail', () => {
    asserts.assertEquals(
      ProductListSchemaObject.safeParse({
        items: [{ ...item, price_detail: null }],
      })[0],
      null,
    );
  });

  it('treats an absent items array as an empty page', () => {
    const [error, page] = ProductListSchemaObject.safeParse({});
    asserts.assertEquals(error, null);
    asserts.assertEquals(page?.items, []);
  });

  it('treats a bare array as the items themselves', () => {
    const [, page] = ProductListSchemaObject.safeParse([item]);
    asserts.assertEquals(page?.items.length, 1);
  });
});
