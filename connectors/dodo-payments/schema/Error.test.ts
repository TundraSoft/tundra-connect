import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ErrorResponseSchemaObject } from './Error.ts';

describe('DodoPayments.schema.ErrorResponse', () => {
  it('accepts the documented envelope', () => {
    const [error, body] = ErrorResponseSchemaObject.safeParse({
      code: 'INVALID_REQUEST',
      message: 'product_cart must not be empty',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.code, 'INVALID_REQUEST');
  });

  it('keeps additional vendor fields', () => {
    const [error, body] = ErrorResponseSchemaObject.safeParse({
      code: 'X',
      message: 'y',
      request_id: 'req_1',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      (body as Record<string, unknown>).request_id,
      'req_1',
    );
  });

  it('rejects an envelope missing its message', () => {
    asserts.assertExists(ErrorResponseSchemaObject.safeParse({ code: 'X' })[0]);
  });

  it('rejects a non-object body — the gateway-HTML case', () => {
    asserts.assertExists(
      ErrorResponseSchemaObject.safeParse('<html>502</html>')[0],
    );
  });
});
