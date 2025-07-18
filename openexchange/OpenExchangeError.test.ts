import * as asserts from '$asserts';
import {
  OpenExchangeError,
  OpenExchangeErrorCodes,
} from './OpenExchangeError.ts';

Deno.test('OpenExchange.OpenExchangeError', async (t) => {
  await t.step('should create an error with a valid code', () => {
    const error = new OpenExchangeError('MISSING_APP_ID');
    asserts.assertStringIncludes(
      error.message,
      OpenExchangeErrorCodes.MISSING_APP_ID,
    );
  });

  await t.step('should replace placeholders in the message', () => {
    const error = new OpenExchangeError('CONFIG_INVALID_BASE_CURRENCY', {
      baseCurrency: 'XYZ',
    });
    asserts.assertStringIncludes(
      error.message,
      OpenExchangeErrorCodes.CONFIG_INVALID_BASE_CURRENCY.replace(
        '${baseCurrency}',
        'XYZ',
      ),
    );
  });

  await t.step('should default to UNKNOWN_ERROR for invalid code', () => {
    const error = new OpenExchangeError('INVALID_CODE' as any);
    asserts.assertStringIncludes(
      error.message,
      OpenExchangeErrorCodes.UNKNOWN_ERROR,
    );
    asserts.assertEquals(error.context.originalCode, 'INVALID_CODE');
  });
});
