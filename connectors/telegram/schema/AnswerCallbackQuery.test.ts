import * as asserts from '@asserts';
import { describe, it } from '@test';
import { AnswerCallbackQueryRequestSchemaObject } from './AnswerCallbackQuery.ts';

describe('Telegram.schema.AnswerCallbackQuery', () => {
  it('accepts just the query id', () => {
    asserts.assertEquals(
      AnswerCallbackQueryRequestSchemaObject.safeParse({
        callback_query_id: 'q1',
      })[0],
      null,
    );
  });

  it('accepts every documented field', () => {
    const [error, request] = AnswerCallbackQueryRequestSchemaObject.safeParse({
      callback_query_id: 'q1',
      text: 'Done',
      show_alert: true,
      url: 't.me/example_bot?start=abc',
      cache_time: 30,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(request?.show_alert, true);
  });

  it('accepts empty text and exactly 200 characters, rejects 201', () => {
    const parse = (text: string) =>
      AnswerCallbackQueryRequestSchemaObject.safeParse({
        callback_query_id: 'q1',
        text,
      })[0];
    asserts.assertEquals(parse(''), null);
    asserts.assertEquals(parse('a'.repeat(200)), null);
    asserts.assertExists(parse('a'.repeat(201)));
  });

  it('rejects a negative or non-integer cache_time and a string show_alert', () => {
    for (
      const fields of [
        { cache_time: -1 },
        { cache_time: 1.5 },
        { cache_time: '30' },
        { show_alert: 'true' },
      ]
    ) {
      asserts.assertExists(
        AnswerCallbackQueryRequestSchemaObject.safeParse({
          callback_query_id: 'q1',
          ...fields,
        })[0],
        JSON.stringify(fields),
      );
    }
  });

  it('rejects a missing or empty callback_query_id', () => {
    asserts.assertExists(
      AnswerCallbackQueryRequestSchemaObject.safeParse({})[0],
    );
    asserts.assertExists(
      AnswerCallbackQueryRequestSchemaObject.safeParse({
        callback_query_id: '',
      })[0],
    );
  });
});
