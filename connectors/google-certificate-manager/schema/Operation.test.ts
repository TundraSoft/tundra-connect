import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  OperationSchemaObject,
  OperationStatusSchemaObject,
} from './Operation.ts';

describe('GoogleCertificateManager.schema.Operation', () => {
  const name = 'projects/p/locations/global/operations/operation-1';

  it('accepts a running, a succeeded and a failed operation', () => {
    asserts.assertEquals(OperationSchemaObject.parse({ name }).done, undefined);
    const ok = OperationSchemaObject.parse({
      name,
      done: true,
      metadata: { '@type': 'x', verb: 'create', endTime: null },
      response: { '@type': 'y', name: 'cert' },
    });
    asserts.assertEquals(ok.response?.name, 'cert');
    const failed = OperationSchemaObject.parse({
      name,
      done: true,
      error: { code: 6, message: 'exists', details: [{ '@type': 'z' }] },
    });
    asserts.assertEquals(failed.error?.code, 6);
  });

  it('rejects a missing name and a non-boolean done', () => {
    for (const bad of [{}, { name, done: 'true' }, { name, done: 1 }]) {
      const [error] = OperationSchemaObject.safeParse(bad);
      asserts.assertExists(error, JSON.stringify(bad));
    }
  });

  it('requires a numeric status code', () => {
    const [error] = OperationStatusSchemaObject.safeParse({ code: '6' });
    asserts.assertExists(error);
  });
});
