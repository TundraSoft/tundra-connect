import * as asserts from '@asserts';
import { describe, it } from '@test';
import { AzureBlobError, AzureBlobErrorCodes } from './mod.ts';

describe('AzureBlob.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new AzureBlobError('BLOB_NOT_FOUND', {
      bucket: 'my-container',
      key: 'my-blob.txt',
    });
    asserts.assertStringIncludes(error.message, 'my-blob.txt');
    asserts.assertStringIncludes(error.message, 'my-container');
    asserts.assertEquals(error.getContextValue('vendor'), 'AzureBlob');
    asserts.assertEquals(error.code, 'BLOB_NOT_FOUND');
  });

  it('interpolates contextual error metadata', () => {
    const error = new AzureBlobError('CONFIG_MISSING_CREDENTIALS', {
      account: 'myaccount',
    });
    asserts.assertStringIncludes(error.message, 'myaccount');
  });

  it('falls back to the unknown error code for an unrecognised code', () => {
    const error = new AzureBlobError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      AzureBlobErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('prefixes the rendered message with the vendor tag', () => {
    const error = new AzureBlobError('CONTAINER_NOT_FOUND', {
      bucket: 'my-container',
    });
    asserts.assertStringIncludes(error.message, '[AzureBlob]');
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new AzureBlobError('CONTAINER_NOT_FOUND');
    asserts.assertStringIncludes(error.message, '<bucket unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);
  });
});
