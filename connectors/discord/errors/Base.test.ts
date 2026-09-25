import * as asserts from '@asserts';
import { describe, it } from '@test';
import { DiscordError } from './Base.ts';
import { DiscordErrorCodes } from './DiscordErrorCodes.ts';

describe('Discord.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new DiscordError('MISSING_PERMISSIONS', { status: 403 });
    asserts.assertStringIncludes(
      error.message,
      'The bot lacks permission to perform this action',
    );
    asserts.assertEquals(error.getContextValue('vendor'), 'Discord');
    asserts.assertEquals(error.code, 'MISSING_PERMISSIONS');
  });

  it('interpolates contextual error metadata', () => {
    const error = new DiscordError('RATE_LIMITED', {
      status: 429,
      retryAfter: 12.5,
    });
    asserts.assertStringIncludes(error.message, 'retry after 12.5s');
  });

  it('falls back to the unknown error code', () => {
    const error = new DiscordError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      DiscordErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('preserves an underlying cause', () => {
    const cause = new Error('network down');
    const error = new DiscordError(
      'SERVICE_UNAVAILABLE',
      { status: 503 },
      cause,
    );
    asserts.assertEquals(error.cause, cause);
  });

  it('defaults to the config-missing-credentials message when constructed without metadata', () => {
    const error = new DiscordError('CONFIG_MISSING_CREDENTIALS');
    asserts.assertStringIncludes(
      error.message,
      DiscordErrorCodes.CONFIG_MISSING_CREDENTIALS,
    );
  });

  it('carries vendor code/message metadata for a mapped JSON error', () => {
    const error = new DiscordError('EMPTY_MESSAGE', {
      status: 400,
      vendorCode: 50006,
      vendorMessage: 'Cannot send an empty message',
    });
    asserts.assertEquals(error.getContextValue('vendorCode'), 50006);
    asserts.assertStringIncludes(error.message, 'Cannot send an empty message');
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new DiscordError('NOT_FOUND');
    asserts.assertStringIncludes(error.message, '<status unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);
  });
});
