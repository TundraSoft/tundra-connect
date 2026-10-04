import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  VALIDATION_CODES,
  ValidationMessageSchemaObject,
  ValidationResponseSchemaObject,
} from './Validation.ts';

describe('GoogleAnalytics.schema.Validation', () => {
  it('accepts a response with messages', () => {
    const [error, value] = ValidationResponseSchemaObject.safeParse({
      validationMessages: [{
        fieldPath: 'events',
        description: 'bad',
        validationCode: 'NAME_INVALID',
      }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(
      value?.validationMessages[0]?.validationCode,
      'NAME_INVALID',
    );
  });

  it('reads a missing validationMessages as none', () => {
    const [error, value] = ValidationResponseSchemaObject.safeParse({});
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.validationMessages, []);
  });

  it('keeps an undocumented validation code', () => {
    asserts.assertEquals(
      ValidationMessageSchemaObject.safeParse({
        validationCode: 'NEW_CODE',
      })[0],
      null,
    );
  });

  it('rejects a non-array validationMessages and a non-object body', () => {
    asserts.assertExists(
      ValidationResponseSchemaObject.safeParse({ validationMessages: 'x' })[0],
    );
    asserts.assertExists(ValidationResponseSchemaObject.safeParse('x')[0]);
  });

  it('documents seven codes', () => {
    asserts.assertEquals(VALIDATION_CODES.length, 7);
  });
});
