import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  GoogleErrorDetailSchemaObject,
  GoogleErrorEnvelopeSchemaObject,
} from './Error.ts';

describe('GoogleWebRisk.schema.Error', () => {
  it('parses the envelope Google returns for an invalid API key', () => {
    const [error, envelope] = GoogleErrorEnvelopeSchemaObject.safeParse({
      error: {
        code: 400,
        message: 'API key not valid. Please pass a valid API key.',
        status: 'INVALID_ARGUMENT',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'API_KEY_INVALID',
            domain: 'googleapis.com',
            metadata: { service: 'webrisk.googleapis.com' },
          },
          {
            '@type': 'type.googleapis.com/google.rpc.LocalizedMessage',
            locale: 'en-US',
            message: 'API key not valid. Please pass a valid API key.',
          },
        ],
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(envelope?.error.status, 'INVALID_ARGUMENT');
    asserts.assertEquals(
      envelope?.error.details?.[0]?.reason,
      'API_KEY_INVALID',
    );
  });

  it('rejects a body that is not an error envelope', () => {
    asserts.assertExists(
      GoogleErrorEnvelopeSchemaObject.safeParse('<html>502</html>')[0],
    );
    asserts.assertExists(GoogleErrorEnvelopeSchemaObject.safeParse({})[0]);
  });

  it('accepts a detail without a reason', () => {
    asserts.assertEquals(
      GoogleErrorDetailSchemaObject.safeParse({
        '@type': 'type.googleapis.com/google.rpc.BadRequest',
      })[0],
      null,
    );
  });
});
