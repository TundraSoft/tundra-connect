import * as asserts from '@asserts';
import { describe, it } from '@test';
import { S3Error, S3ErrorCodes } from './mod.ts';

describe('S3.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new S3Error('NO_SUCH_KEY', { key: 'missing.txt' });
    asserts.assertStringIncludes(
      error.message,
      'The specified key missing.txt does not exist.',
    );
    asserts.assertEquals(error.getContextValue('vendor'), 'S3');
    asserts.assertEquals(error.code, 'NO_SUCH_KEY');
  });

  it('interpolates contextual error metadata', () => {
    const error = new S3Error('CONFIG_INVALID_BUCKET', { bucket: '' });
    asserts.assertStringIncludes(
      error.message,
      'Bucket name must be a non-empty string, got .',
    );
  });

  it('falls back to the unknown error code and records the original', () => {
    const error = new S3Error('SomeVendorCode' as never);
    asserts.assertStringIncludes(error.message, S3ErrorCodes.UNKNOWN_ERROR);
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'SomeVendorCode',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new S3Error('NO_SUCH_KEY');
    asserts.assertStringIncludes(error.message, '<key unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);
  });
});
