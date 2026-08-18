import * as asserts from '@asserts';
import { describe, it } from '@test';
import { PersonalizationSchemaObject } from './Personalization.ts';

describe('SendGrid.schema.Personalization', () => {
  it('accepts a minimal personalization', () => {
    asserts.assertEquals(
      PersonalizationSchemaObject.safeParse({
        to: [{ email: 'dest@example.com' }],
      })[0],
      null,
    );
  });

  it('accepts a fully populated personalization', () => {
    const [error, personalization] = PersonalizationSchemaObject.safeParse({
      to: [{ email: 'dest@example.com', name: 'Destination' }],
      cc: [{ email: 'cc@example.com' }],
      bcc: [{ email: 'bcc@example.com' }],
      subject: 'Hello',
      headers: { 'X-Trace-Id': 'abc' },
      substitutions: { '-name-': 'Ada' },
      dynamic_template_data: { firstName: 'Ada', total: 42 },
      custom_args: { orderId: '1234' },
      send_at: 1_700_000_000,
      from: { email: 'override@example.com' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(personalization?.to.length, 1);
    asserts.assertEquals(
      personalization?.dynamic_template_data?.firstName,
      'Ada',
    );
  });

  it('rejects a personalization with no recipients', () => {
    asserts.assertExists(
      PersonalizationSchemaObject.safeParse({ to: [] })[0],
    );
  });

  it('rejects a personalization missing `to` entirely', () => {
    asserts.assertExists(
      PersonalizationSchemaObject.safeParse({ subject: 'Hello' })[0],
    );
  });

  it('rejects an invalid recipient email', () => {
    asserts.assertExists(
      PersonalizationSchemaObject.safeParse({
        to: [{ email: 'not-an-email' }],
      })[0],
    );
  });

  it('rejects a non-string substitution map value', () => {
    asserts.assertExists(
      PersonalizationSchemaObject.safeParse({
        to: [{ email: 'dest@example.com' }],
        substitutions: { count: null },
      })[0],
    );
  });
});
