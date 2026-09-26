import * as asserts from '@asserts';
import { describe, it } from '@test';
import { SendBatchResponseSchemaObject } from './SendBatchResponse.ts';

describe('Resend.schema.SendBatchResponse', () => {
  it('accepts a list of ids', () => {
    const [error, value] = SendBatchResponseSchemaObject.safeParse({
      data: [{ id: 'e1' }, { id: 'e2' }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.data.length, 2);
  });

  it('rejects a missing data array', () => {
    asserts.assertExists(SendBatchResponseSchemaObject.safeParse({})[0]);
  });

  it('rejects an entry without an id', () => {
    const [error] = SendBatchResponseSchemaObject.safeParse({ data: [{}] });
    asserts.assertExists(error);
  });
});
