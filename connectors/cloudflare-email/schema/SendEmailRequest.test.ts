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

  it('accepts named objects on every address field, mixed with strings', () => {
    const [error, body] = SendEmailRequestSchemaObject.safeParse({
      ...base,
      from: { address: 'welcome@yourdomain.com', name: 'Welcome' },
      to: ['a@example.com', { address: 'b@example.com', name: 'B' }],
      cc: { address: 'c@example.com' },
      bcc: [{ address: 'd@example.com', name: 'D' }],
      reply_to: { address: 'r@example.com', name: 'Support' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.from, {
      address: 'welcome@yourdomain.com',
      name: 'Welcome',
    });
    asserts.assertEquals(body?.to, [
      'a@example.com',
      { address: 'b@example.com', name: 'B' },
    ]);
    asserts.assertEquals(body?.cc, [{ address: 'c@example.com' }]);
    asserts.assertEquals(body?.bcc, [{ address: 'd@example.com', name: 'D' }]);
    asserts.assertEquals(body?.reply_to, {
      address: 'r@example.com',
      name: 'Support',
    });
  });

  it('parses "Name <address>" strings into named objects', () => {
    const [error, body] = SendEmailRequestSchemaObject.safeParse({
      ...base,
      from: 'Acme <no-reply@yourdomain.com>',
      to: ['  Jane Doe   <jane@example.com>  ', 'plain@example.com'],
      reply_to: 'Support <support@yourdomain.com>',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.from, {
      address: 'no-reply@yourdomain.com',
      name: 'Acme',
    });
    asserts.assertEquals(body?.to, [
      { address: 'jane@example.com', name: 'Jane Doe' },
      'plain@example.com',
    ]);
    asserts.assertEquals(body?.reply_to, {
      address: 'support@yourdomain.com',
      name: 'Support',
    });
  });

  it('unquotes a quoted display name, including escaped quotes', () => {
    const [error, body] = SendEmailRequestSchemaObject.safeParse({
      ...base,
      to: [
        '"Doe, Jane" <jane@example.com>',
        '"The \\"Ops\\" Team" <ops@example.com>',
      ],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.to, [
      { address: 'jane@example.com', name: 'Doe, Jane' },
      { address: 'ops@example.com', name: 'The "Ops" Team' },
    ]);
  });

  it('collapses a nameless "<address>" to the plain address', () => {
    const [error, body] = SendEmailRequestSchemaObject.safeParse({
      ...base,
      from: '<welcome@yourdomain.com>',
      to: '"" <a@example.com>',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.from, 'welcome@yourdomain.com');
    asserts.assertEquals(body?.to, ['a@example.com']);
  });

  it('rejects a "Name <address>" whose address is malformed', () => {
    asserts.assertExists(
      SendEmailRequestSchemaObject.safeParse({
        ...base,
        from: 'Acme <not-an-email>',
      })[0],
    );
  });

  it('wraps a single named `to` object into an array', () => {
    const [error, body] = SendEmailRequestSchemaObject.safeParse({
      ...base,
      to: { address: 'jane@example.com', name: 'Jane' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.to, [{
      address: 'jane@example.com',
      name: 'Jane',
    }]);
  });

  it('rejects a malformed named reply_to', () => {
    asserts.assertExists(
      SendEmailRequestSchemaObject.safeParse({
        ...base,
        reply_to: { address: 'nope' },
      })[0],
    );
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
