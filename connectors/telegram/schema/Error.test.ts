import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ResponseEnvelopeSchemaObject,
  ResponseParametersSchemaObject,
} from './Error.ts';

describe('Telegram.schema.Error', () => {
  describe('ResponseParametersSchemaObject', () => {
    it('accepts retry_after alone', () => {
      const [error, parameters] = ResponseParametersSchemaObject.safeParse({
        retry_after: 30,
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(parameters?.retry_after, 30);
      asserts.assertEquals(parameters?.migrate_to_chat_id, undefined);
    });

    it('accepts migrate_to_chat_id alone', () => {
      asserts.assertEquals(
        ResponseParametersSchemaObject.safeParse({
          migrate_to_chat_id: -1001234567890,
        })[0],
        null,
      );
    });

    it('accepts an empty object', () => {
      asserts.assertEquals(
        ResponseParametersSchemaObject.safeParse({})[0],
        null,
      );
    });
  });

  describe('ResponseEnvelopeSchemaObject', () => {
    it('accepts a successful envelope carrying a result', () => {
      const [error, envelope] = ResponseEnvelopeSchemaObject.safeParse({
        ok: true,
        result: { message_id: 1 },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(envelope?.ok, true);
      asserts.assertEquals(
        (envelope?.result as Record<string, unknown>)?.message_id,
        1,
      );
    });

    it('accepts a failure envelope with error_code and description', () => {
      const [error, envelope] = ResponseEnvelopeSchemaObject.safeParse({
        ok: false,
        error_code: 400,
        description: 'Bad Request: chat not found',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(envelope?.ok, false);
      asserts.assertEquals(envelope?.error_code, 400);
    });

    it('accepts a rate-limit envelope carrying parameters.retry_after', () => {
      const [error, envelope] = ResponseEnvelopeSchemaObject.safeParse({
        ok: false,
        error_code: 429,
        description: 'Too Many Requests: retry after 30',
        parameters: { retry_after: 30 },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(envelope?.parameters?.retry_after, 30);
    });

    it('rejects an envelope missing ok', () => {
      asserts.assertExists(
        ResponseEnvelopeSchemaObject.safeParse({ result: {} })[0],
      );
    });

    it('rejects a non-boolean ok', () => {
      // `Guardian.boolean()` coerces a strict allow-list of strings
      // (`'true'`, `'yes'`, …), so use a string outside that list to
      // exercise real rejection.
      asserts.assertExists(
        ResponseEnvelopeSchemaObject.safeParse({ ok: 'maybe' })[0],
      );
    });
  });
});
