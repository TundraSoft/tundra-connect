import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CreateRefundRequestSchemaObject,
  REFUND_NETWORK_REFERENCE_TYPES,
  RefundItemRequestSchemaObject,
  RefundListItemSchemaObject,
  RefundListSchemaObject,
  RefundSchemaObject,
  RefundStatusSchemaObject,
} from './Refund.ts';

const LIST_ITEM = {
  refund_id: 'ref_1',
  payment_id: 'pay_1',
  business_id: 'biz_1',
  status: 'succeeded',
  created_at: '2026-01-01T00:00:00Z',
  is_partial: false,
  amount: 1999,
  currency: 'USD',
  reason: null,
  network_reference: null,
  network_reference_type: null,
};

const REFUND = {
  ...LIST_ITEM,
  brand_id: 'brd_1',
  customer: { customer_id: 'cus_1', email: 'a@example.com', name: 'Ada' },
  metadata: { ticket: 'T-42', attempt: 2, staff: true },
};

describe('DodoPayments.schema.RefundEnums', () => {
  it('accepts every documented status and nothing else', () => {
    for (const s of ['succeeded', 'failed', 'pending', 'review']) {
      asserts.assertEquals(RefundStatusSchemaObject.safeParse(s)[0], null, s);
    }
    asserts.assertExists(RefundStatusSchemaObject.safeParse('refunded')[0]);
  });

  it('lists the documented network reference kinds', () => {
    asserts.assertEquals([...REFUND_NETWORK_REFERENCE_TYPES], [
      'acquirer_reference_number',
      'system_trace_audit_number',
      'retrieval_reference_number',
      'other',
    ]);
  });
});

describe('DodoPayments.schema.CreateRefundRequest', () => {
  it('accepts a full refund: a payment id alone, or with a reason', () => {
    asserts.assertEquals(
      CreateRefundRequestSchemaObject.safeParse({ payment_id: 'pay_1' })[0],
      null,
    );
    const [error, body] = CreateRefundRequestSchemaObject.safeParse({
      payment_id: 'pay_1',
      reason: 'Charged twice',
      metadata: { ticket: 'T-42', attempt: 2 },
      items: null,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.metadata?.attempt, 2);
  });

  it('accepts a partial refund by line, with and without an amount', () => {
    const [error, body] = CreateRefundRequestSchemaObject.safeParse({
      payment_id: 'pay_1',
      items: [
        { item_id: 'pdt_1', amount: 500 },
        { item_id: 'adn_1', amount: null, tax_inclusive: false },
        { item_id: 'pdt_2' },
      ],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.items?.length, 3);
  });

  it('rejects an unknown field instead of silently dropping it', () => {
    for (
      const bad of [
        { payment_id: 'pay_1', amount: 500 },
        { paymentId: 'pay_1' },
        { payment_id: 'pay_1', items: [{ item_id: 'pdt_1', qty: 1 }] },
      ]
    ) {
      asserts.assertExists(CreateRefundRequestSchemaObject.safeParse(bad)[0]);
    }
  });

  it('rejects a missing or blank payment id', () => {
    asserts.assertExists(CreateRefundRequestSchemaObject.safeParse({})[0]);
    asserts.assertExists(
      CreateRefundRequestSchemaObject.safeParse({ payment_id: '' })[0],
    );
  });

  it('rejects an empty item list and a line listed twice', () => {
    asserts.assertExists(
      CreateRefundRequestSchemaObject.safeParse({
        payment_id: 'pay_1',
        items: [],
      })[0],
    );
    asserts.assertExists(
      CreateRefundRequestSchemaObject.safeParse({
        payment_id: 'pay_1',
        items: [
          { item_id: 'pdt_1', amount: 100 },
          { item_id: 'pdt_1', amount: 200 },
        ],
      })[0],
    );
  });

  it('holds the reason to 3000 characters', () => {
    asserts.assertEquals(
      CreateRefundRequestSchemaObject.safeParse({
        payment_id: 'pay_1',
        reason: 'x'.repeat(3000),
      })[0],
      null,
    );
    asserts.assertExists(
      CreateRefundRequestSchemaObject.safeParse({
        payment_id: 'pay_1',
        reason: 'x'.repeat(3001),
      })[0],
    );
  });

  it('rejects non-scalar metadata', () => {
    asserts.assertExists(
      CreateRefundRequestSchemaObject.safeParse({
        payment_id: 'pay_1',
        metadata: { nested: { a: 1 } },
      })[0],
    );
  });
});

describe('DodoPayments.schema.RefundItemRequest', () => {
  it('rejects a zero, negative, fractional or string amount', () => {
    for (const amount of [0, -100, 1.5, '500', 2_147_483_648]) {
      asserts.assertExists(
        RefundItemRequestSchemaObject.safeParse({
          item_id: 'pdt_1',
          amount,
        })[0],
        String(amount),
      );
    }
  });

  it('rejects a blank item id and a string boolean', () => {
    asserts.assertExists(
      RefundItemRequestSchemaObject.safeParse({ item_id: '', amount: 1 })[0],
    );
    asserts.assertExists(
      RefundItemRequestSchemaObject.safeParse({
        item_id: 'pdt_1',
        tax_inclusive: 'false',
      })[0],
    );
  });
});

describe('DodoPayments.schema.Refund', () => {
  it('accepts the documented record and keeps metadata types', () => {
    const [error, refund] = RefundSchemaObject.safeParse(REFUND);
    asserts.assertEquals(error, null);
    asserts.assertEquals(refund?.metadata?.attempt, 2);
    asserts.assertEquals(refund?.customer.customer_id, 'cus_1');
  });

  it('reads a refund with no amount, currency or metadata', () => {
    const {
      amount: _a,
      currency: _c,
      metadata: _m,
      ...minimal
    } = REFUND;
    asserts.assertEquals(RefundSchemaObject.safeParse(minimal)[0], null);
  });

  it('reads a network reference of a kind added later', () => {
    const [error, refund] = RefundSchemaObject.safeParse({
      ...REFUND,
      network_reference: '74123456789012345678901',
      network_reference_type: 'some_new_kind',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(refund?.network_reference_type, 'some_new_kind');
  });

  it('keeps additive vendor fields', () => {
    const [, refund] = RefundSchemaObject.safeParse({
      ...REFUND,
      refund_receipt_url: 'https://example.com/r',
    });
    asserts.assertEquals(
      (refund as Record<string, unknown>).refund_receipt_url,
      'https://example.com/r',
    );
  });

  it('rejects a record missing a required field or with an unknown status', () => {
    const { customer: _, ...noCustomer } = REFUND;
    asserts.assertExists(RefundSchemaObject.safeParse(noCustomer)[0]);
    const { is_partial: __, ...noPartial } = REFUND;
    asserts.assertExists(RefundSchemaObject.safeParse(noPartial)[0]);
    asserts.assertExists(
      RefundSchemaObject.safeParse({ ...REFUND, status: 'done' })[0],
    );
  });
});

describe('DodoPayments.schema.RefundList', () => {
  it('reads a list item without brand, customer or metadata', () => {
    asserts.assertEquals(
      RefundListItemSchemaObject.safeParse(LIST_ITEM)[0],
      null,
    );
  });

  it('reads a page, a bare array, and an absent items as empty', () => {
    asserts.assertEquals(
      RefundListSchemaObject.safeParse({ items: [LIST_ITEM] })[1]?.items
        .length,
      1,
    );
    asserts.assertEquals(
      RefundListSchemaObject.safeParse([LIST_ITEM])[1]?.items.length,
      1,
    );
    asserts.assertEquals(RefundListSchemaObject.safeParse({})[1]?.items, []);
    asserts.assertExists(RefundListSchemaObject.safeParse({ items: [{}] })[0]);
  });
});
