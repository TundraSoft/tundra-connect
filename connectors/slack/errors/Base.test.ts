import * as asserts from '@asserts';
import { describe, it } from '@test';
import { SlackError } from './Base.ts';
import { SlackErrorCodes } from './SlackErrorCodes.ts';

describe('Slack.errors.Base', () => {
  it('formats a known error code', () => {
    const error = new SlackError('SERVICE_UNAVAILABLE', { status: 503 });
    asserts.assertStringIncludes(error.message, 'unavailable');
    asserts.assertEquals(error.getContextValue('vendor'), 'Slack');
  });

  it('falls back to the unknown error code for an unregistered code', () => {
    const error = new SlackError('NOT_A_REAL_CODE' as never);
    asserts.assertStringIncludes(
      error.message,
      SlackErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(
      error.getContextValue('originalCode'),
      'NOT_A_REAL_CODE',
    );
    asserts.assertEquals(error.code, 'UNKNOWN_ERROR');
  });

  it('exposes the resolved code as a public, readonly property', () => {
    const error = new SlackError('INVALID_REQUEST', { reason: 'bad input' });
    asserts.assertEquals(error.code, 'INVALID_REQUEST');
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('network blip');
    const error = new SlackError('RESPONSE_ERROR', {}, cause);
    asserts.assertEquals(error.cause, cause);
  });

  it('fills missing message-template placeholders with a marker', () => {
    const error = new SlackError('INVALID_REQUEST');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<reason unavailable>');
  });

  it('fills a missing vendorError placeholder for a vendor-mapped code', () => {
    const error = new SlackError('NOT_FOUND');
    asserts.assertEquals(error.message.includes('${'), false);
    asserts.assertStringIncludes(error.message, '<vendorError unavailable>');
  });
});
