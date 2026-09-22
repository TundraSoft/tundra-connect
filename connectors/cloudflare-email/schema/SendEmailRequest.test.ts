import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  MAX_RECIPIENTS,
  SendEmailRequestSchemaObject,
} from './SendEmailRequest.ts';

const base = {
  from: 'welcome@yourdomain.com',
  to: 'recipient@example.com',
  subject: 'Welcome!',
  text: 'Thanks.',
};

describe('CloudflareEmail.schema.SendEmailRequest', () => {
  it('normalizes a bare string `to` into an array', () => {
    const [error, body] = SendEmailRequestSchemaObject.safeParse(base);
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.to, ['recipient@example.com']);
  });

  it('normalizes bare string cc and bcc too', () => {
    const [error, body] = SendEmailRequestSchemaObject.safeParse({
      ...base,
      cc: 'c@example.com',
      bcc: 'b@example.com',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.cc, ['c@example.com']);
    asserts.assertEquals(body?.bcc, ['b@example.com']);
  });

  it('passes an array through unchanged', () => {
    const [error, body] = SendEmailRequestSchemaObject.safeParse({
      ...base,
      to: ['a@example.com', 'b@example.com'],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.to, ['a@example.com', 'b@example.com']);
  });

  it('accepts html instead of text', () => {
    const { text: _text, ...noText } = base;
    asserts.assertEquals(
      SendEmailRequestSchemaObject.safeParse({
        ...noText,
        html: '<p>Hi</p>',
      })[0],
      null,
    );
  });

  it('accepts reply_to and custom headers', () => {
    const [error, body] = SendEmailRequestSchemaObject.safeParse({
      ...base,
      reply_to: 'reply@example.com',
      headers: { 'X-Campaign-ID': 'welcome' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.reply_to, 'reply@example.com');
    asserts.assertEquals(body?.headers?.['X-Campaign-ID'], 'welcome');
  });

  it('rejects a malformed from address', () => {
    asserts.assertExists(
      SendEmailRequestSchemaObject.safeParse({ ...base, from: 'nope' })[0],
    );
  });

  it('rejects a malformed recipient inside an array', () => {
    asserts.assertExists(
      SendEmailRequestSchemaObject.safeParse({
        ...base,
        to: ['ok@example.com', 'nope'],
      })[0],
    );
  });

  it('rejects an empty recipient array', () => {
    asserts.assertExists(
      SendEmailRequestSchemaObject.safeParse({ ...base, to: [] })[0],
    );
  });

  it('rejects an empty subject', () => {
    asserts.assertExists(
      SendEmailRequestSchemaObject.safeParse({ ...base, subject: '' })[0],
    );
  });

  it('coerces a numeric custom header value to a string', () => {
    // Guardian coerces string-coercible primitives rather than rejecting
    // them — the same rule upstash-redis's Error/Pipeline schemas pin.
    // Useful here: header values must be strings on the wire anyway.
    const [error, body] = SendEmailRequestSchemaObject.safeParse({
      ...base,
      headers: { 'X-Count': 5 },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.headers?.['X-Count'], '5');
  });

  it('rejects a custom header value that is not coercible to a string', () => {
    asserts.assertExists(
      SendEmailRequestSchemaObject.safeParse({
        ...base,
        headers: { 'X-Obj': { nested: true } },
      })[0],
    );
  });

  it('does NOT enforce the cross-field rules the client owns', () => {
    // Neither html nor text, and 51 recipients — both are legal as far as
    // this object schema is concerned; `CloudflareEmail.send` rejects them.
    const { text: _text, ...noBody } = base;
    asserts.assertEquals(
      SendEmailRequestSchemaObject.safeParse(noBody)[0],
      null,
    );
    const many = Array.from(
      { length: MAX_RECIPIENTS + 1 },
      (_, i) => `t${i}@example.com`,
    );
    asserts.assertEquals(
      SendEmailRequestSchemaObject.safeParse({ ...base, to: many })[0],
      null,
    );
  });

  it('rejects a non-object value', () => {
    asserts.assertExists(SendEmailRequestSchemaObject.safeParse('send')[0]);
  });
});
