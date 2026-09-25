import * as asserts from '@asserts';
import { describe, it } from '@test';
import { TelegramError } from './Base.ts';
import { TelegramErrorCodes } from './TelegramErrorCodes.ts';

describe('Telegram.errors.Base', () => {
  it('formats a known vendor error code', () => {
    const error = new TelegramError('AUTH_FAILED', {
      status: 401,
      description: 'Unauthorized',
    });
    asserts.assertStringIncludes(
      error.message,
      'Telegram rejected the configured bot token',
    );
    asserts.assertStringIncludes(error.message, 'HTTP 401');
    asserts.assertEquals(error.getContextValue('vendor'), 'Telegram');
    asserts.assertEquals(error.code, 'AUTH_FAILED');
  });

  it('interpolates contextual error metadata', () => {
    const error = new TelegramError('RATE_LIMITED', {
      status: 429,
      retryAfter: 33,
    });
    asserts.assertStringIncludes(error.message, 'retry after 33 second(s)');
    asserts.assertStringIncludes(error.message, 'HTTP 429');
  });

  it('falls back to the unknown error code', () => {
    const error = new TelegramError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      TelegramErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('carries diagnostic metadata such as errorCode and migrateToChatId', () => {
    const error = new TelegramError('BAD_REQUEST', {
      status: 400,
      errorCode: 400,
      description: 'Bad Request: group chat was upgraded to a supergroup chat',
      migrateToChatId: -1001234567890,
    });
    asserts.assertEquals(error.getContextValue('status'), 400);
    asserts.assertEquals(
      error.getContextValue('migrateToChatId'),
      -1001234567890,
    );
  });

  it('defaults to the config-invalid-bot-token message when constructed without metadata', () => {
    const error = new TelegramError('CONFIG_INVALID_BOT_TOKEN');
    asserts.assertStringIncludes(
      error.message,
      TelegramErrorCodes.CONFIG_INVALID_BOT_TOKEN,
    );
  });

  it('fills a missing template placeholder instead of rendering it literally', () => {
    const error = new TelegramError('SERVICE_UNAVAILABLE');
    asserts.assertStringIncludes(error.message, '<status unavailable>');
    asserts.assertEquals(error.message.includes('${'), false);
  });
});
