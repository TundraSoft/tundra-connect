import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  RelayerSubmitResponseSchemaObject,
  RelayPayloadSchemaObject,
} from './Relayer.ts';

describe('Relayer schemas', () => {
  it('parses a relay payload', () => {
    const payload = RelayPayloadSchemaObject.parse({
      address: '0x4444444444444444444444444444444444444444',
      nonce: '7',
    });
    asserts.assertEquals(payload.nonce, '7');
  });

  it('rejects a relay payload missing a required field', () => {
    asserts.assertThrows(() =>
      RelayPayloadSchemaObject.parse({ address: '0x4444' })
    );
  });

  it('parses a submit response and normalizes transactionID to transactionId', () => {
    const result = RelayerSubmitResponseSchemaObject.parse({
      transactionID: '0190b317-a1d3-7bec-9b91-eeb6dcd3a620',
      state: 'STATE_NEW',
    });
    asserts.assertEquals(
      result.transactionId,
      '0190b317-a1d3-7bec-9b91-eeb6dcd3a620',
    );
    asserts.assertEquals(result.state, 'STATE_NEW');
  });

  it('accepts an already-camelCase transactionId', () => {
    const result = RelayerSubmitResponseSchemaObject.parse({
      transactionId: 'abc',
    });
    asserts.assertEquals(result.transactionId, 'abc');
  });
});
