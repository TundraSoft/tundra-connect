import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  MAX_RECIPIENTS,
  SendEmailRequestSchemaObject,
  TemplateSchemaObject,
} from './SendEmailRequest.ts';

const base = {
  from: 'onboarding@yourdomain.com',
  to: 'recipient@example.com',
  subject: 'Hello',
  html: '<p>Hi</p>',
};

describe('Resend.schema.SendEmailRequest', () => {
  it('normalizes bare-string recipient fields to arrays', () => {
    const [error, value] = SendEmailRequestSchemaObject.safeParse({
      ...base,
      cc: 'cc@example.com',
      bcc: 'bcc@example.com',
      reply_to: 'reply@example.com',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(value?.to, ['recipient@example.com']);
    asserts.assertEquals(value?.cc, ['cc@example.com']);
    asserts.assertEquals(value?.bcc, ['bcc@example.com']);
    asserts.assertEquals(value?.reply_to, ['reply@example.com']);
  });

  for (
    const from of [
      'a@b.com',
      'Acme <a@b.com>',
      '"Acme, Inc." <a@b.co.uk>',
    ]
  ) {
    it(`accepts the sender ${from}`, () => {
      const [error] = SendEmailRequestSchemaObject.safeParse({ ...base, from });
      asserts.assertEquals(error, null);
    });
  }

  for (const from of ['Acme', 'Acme <not-an-email>', 'a@b', '']) {
    it(`rejects the sender '${from}'`, () => {
      const [error] = SendEmailRequestSchemaObject.safeParse({ ...base, from });
      asserts.assertExists(error);
    });
  }

  it(`accepts exactly ${MAX_RECIPIENTS} recipients and rejects one more`, () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => `r${i}@example.com`);
    asserts.assertEquals(
      SendEmailRequestSchemaObject.safeParse({
        ...base,
        to: many(MAX_RECIPIENTS),
      })[0],
      null,
    );
    asserts.assertExists(
      SendEmailRequestSchemaObject.safeParse({
        ...base,
        to: many(MAX_RECIPIENTS + 1),
      })[0],
    );
  });

  it('rejects an invalid cc address', () => {
    const [error] = SendEmailRequestSchemaObject.safeParse({
      ...base,
      cc: ['nope'],
    });
    asserts.assertExists(error);
  });

  it('rejects an empty subject', () => {
    const [error] = SendEmailRequestSchemaObject.safeParse({
      ...base,
      subject: '',
    });
    asserts.assertExists(error);
  });

  it('rejects a non-object', () => {
    asserts.assertExists(SendEmailRequestSchemaObject.safeParse('x')[0]);
  });
});

describe('Resend.schema.Template', () => {
  it('accepts string and number variables', () => {
    const [error, value] = TemplateSchemaObject.safeParse({
      id: 'welcome',
      variables: { name: 'Ada', count: 3 },
    });
    asserts.assertEquals(error, null);
    // Numbers stay numbers — never coerced to strings.
    asserts.assertEquals(value?.variables, { name: 'Ada', count: 3 });
  });

  for (
    const [label, variables] of [
      ['a boolean value', { flag: true }],
      ['an object value', { nested: {} }],
      ['a string over 2,000 characters', { long: 'x'.repeat(2001) }],
      ['an unsafe integer', { big: 2 ** 53 }],
      ['a dashed key', { 'first-name': 'Ada' }],
      ['a key over 50 characters', { ['k'.repeat(51)]: 'x' }],
    ] as const
  ) {
    it(`rejects ${label}`, () => {
      const [error] = TemplateSchemaObject.safeParse({ id: 't', variables });
      asserts.assertExists(error);
    });
  }

  it('requires a non-empty id', () => {
    asserts.assertExists(TemplateSchemaObject.safeParse({ id: '' })[0]);
  });
});
