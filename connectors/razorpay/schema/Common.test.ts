import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  amountGuard,
  currencyGuard,
  keyIdGuard,
  notesGuard,
  notesResponseGuard,
  receiptGuard,
} from './Common.ts';

describe('Razorpay.schema.Common', () => {
  describe('keyIdGuard', () => {
    it('accepts a test-mode key_id', () => {
      asserts.assertEquals(keyIdGuard.safeParse('rzp_test_abc123')[0], null);
    });

    it('accepts a live-mode key_id', () => {
      asserts.assertEquals(keyIdGuard.safeParse('rzp_live_abc123')[0], null);
    });

    it('rejects a key_id with the wrong prefix', () => {
      asserts.assertExists(keyIdGuard.safeParse('sk_test_abc123')[0]);
    });

    it('rejects a key_id missing the test/live segment', () => {
      asserts.assertExists(keyIdGuard.safeParse('rzp_abc123')[0]);
    });
  });

  describe('amountGuard', () => {
    it('accepts a positive integer', () => {
      asserts.assertEquals(amountGuard.safeParse(29900)[0], null);
    });

    it('rejects a decimal amount (e.g. a major-unit rupee amount)', () => {
      asserts.assertExists(amountGuard.safeParse(299.5)[0]);
    });

    it('rejects zero', () => {
      asserts.assertExists(amountGuard.safeParse(0)[0]);
    });

    it('rejects a negative amount', () => {
      asserts.assertExists(amountGuard.safeParse(-100)[0]);
    });
  });

  describe('currencyGuard', () => {
    it('accepts an uppercase ISO 4217 currency code', () => {
      asserts.assertEquals(currencyGuard.safeParse('INR')[0], null);
    });

    it('rejects a lowercase currency code', () => {
      asserts.assertExists(currencyGuard.safeParse('inr')[0]);
    });

    it('rejects a currency code of the wrong length', () => {
      asserts.assertExists(currencyGuard.safeParse('IN')[0]);
    });
  });

  describe('receiptGuard', () => {
    it('accepts a receipt at the 40-character limit', () => {
      asserts.assertEquals(receiptGuard.safeParse('r'.repeat(40))[0], null);
    });

    it('rejects a receipt over 40 characters', () => {
      asserts.assertExists(receiptGuard.safeParse('r'.repeat(41))[0]);
    });
  });

  describe('notesGuard', () => {
    it('accepts up to 15 key/value pairs', () => {
      const notes: Record<string, string> = {};
      for (let i = 0; i < 15; i++) notes[`key${i}`] = 'value';
      asserts.assertEquals(notesGuard.safeParse(notes)[0], null);
    });

    it('rejects more than 15 key/value pairs', () => {
      const notes: Record<string, string> = {};
      for (let i = 0; i < 16; i++) notes[`key${i}`] = 'value';
      asserts.assertExists(notesGuard.safeParse(notes)[0]);
    });

    it('rejects a value over 256 characters', () => {
      asserts.assertExists(
        notesGuard.safeParse({ key: 'v'.repeat(257) })[0],
      );
    });

    it('accepts an empty notes object', () => {
      asserts.assertEquals(notesGuard.safeParse({})[0], null);
    });
  });

  describe('notesResponseGuard', () => {
    it('accepts a populated notes object', () => {
      const [error, parsed] = notesResponseGuard.safeParse({ orderId: '42' });
      asserts.assertEquals(error, null);
      asserts.assertEquals(parsed?.orderId, '42');
    });

    it("normalizes Razorpay's `notes: []` empty-notes quirk to `{}`", () => {
      const [error, parsed] = notesResponseGuard.safeParse([]);
      asserts.assertEquals(error, null);
      asserts.assertEquals(parsed, {});
    });

    it('rejects a non-empty array', () => {
      asserts.assertExists(notesResponseGuard.safeParse(['not', 'notes'])[0]);
    });
  });
});
