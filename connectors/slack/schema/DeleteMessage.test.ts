import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  DeleteMessageRequestSchemaObject,
  DeleteMessageResponseSchemaObject,
} from './DeleteMessage.ts';

describe('Slack.schema.DeleteMessage', () => {
  describe('DeleteMessageRequestSchemaObject', () => {
    it('accepts the required fields', () => {
      const [error, request] = DeleteMessageRequestSchemaObject.safeParse({
        channel: 'C123ABC456',
        ts: '1401383885.000061',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(request?.ts, '1401383885.000061');
    });

    it('rejects a missing channel', () => {
      asserts.assertExists(
        DeleteMessageRequestSchemaObject.safeParse({
          ts: '1401383885.000061',
        })[0],
      );
    });

    it('rejects a malformed ts', () => {
      asserts.assertExists(
        DeleteMessageRequestSchemaObject.safeParse({
          channel: 'C1',
          ts: 'not-a-ts',
        })[0],
      );
    });
  });

  describe('DeleteMessageResponseSchemaObject', () => {
    it('accepts the documented success response', () => {
      const [error, response] = DeleteMessageResponseSchemaObject.safeParse({
        ok: true,
        channel: 'C123ABC456',
        ts: '1401383885.000061',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(response?.ok, true);
    });

    it('rejects a response missing ts', () => {
      asserts.assertExists(
        DeleteMessageResponseSchemaObject.safeParse({
          ok: true,
          channel: 'C1',
        })[0],
      );
    });
  });
});
