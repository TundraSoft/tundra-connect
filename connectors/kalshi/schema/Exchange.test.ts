import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ExchangeStatusSchemaObject } from './Exchange.ts';

describe('ExchangeStatus schema', () => {
  it('parses an open exchange', () => {
    const status = ExchangeStatusSchemaObject.parse({
      exchange_active: true,
      trading_active: true,
    });
    asserts.assertEquals(status.exchangeActive, true);
    asserts.assertEquals(status.tradingActive, true);
  });

  it('parses a paused exchange with an estimated resume time', () => {
    const status = ExchangeStatusSchemaObject.parse({
      exchange_active: true,
      trading_active: false,
      exchange_estimated_resume_time: '2026-08-19T14:00:00Z',
    });
    asserts.assertEquals(status.tradingActive, false);
    asserts.assertEquals(
      status.exchangeEstimatedResumeTime,
      '2026-08-19T14:00:00Z',
    );
  });

  it('rejects a response missing the required booleans', () => {
    asserts.assertThrows(() => ExchangeStatusSchemaObject.parse({}));
  });
});
