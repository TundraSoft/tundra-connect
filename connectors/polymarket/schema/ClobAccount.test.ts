import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  ClobApiCredentialsSchemaObject,
  ClobBalanceSchemaObject,
  ClobNegRiskSchemaObject,
  ClobTickSizeSchemaObject,
  ClobVersionSchemaObject,
} from './ClobAccount.ts';

describe('ClobAccount schemas', () => {
  it('parses the protocol version', () => {
    asserts.assertEquals(
      ClobVersionSchemaObject.parse({ version: 2 }).version,
      2,
    );
  });

  it('coerces the tick size and defaults missing/zero/garbage to 0.01', () => {
    asserts.assertEquals(
      ClobTickSizeSchemaObject.parse({ minimum_tick_size: '0.001' })
        .minimumTickSize,
      0.001,
    );
    asserts.assertEquals(
      ClobTickSizeSchemaObject.parse({}).minimumTickSize,
      0.01,
    );
    asserts.assertEquals(
      ClobTickSizeSchemaObject.parse({ minimum_tick_size: '0' })
        .minimumTickSize,
      0.01,
    );
    asserts.assertEquals(
      ClobTickSizeSchemaObject.parse({ minimum_tick_size: 'garbage' })
        .minimumTickSize,
      0.01,
    );
  });

  it('coerces neg_risk truthiness', () => {
    asserts.assertEquals(
      ClobNegRiskSchemaObject.parse({ neg_risk: true }).negRisk,
      true,
    );
    asserts.assertEquals(ClobNegRiskSchemaObject.parse({}).negRisk, false);
  });

  it('coerces the balance to a number', () => {
    const balance = ClobBalanceSchemaObject.parse({ balance: '125.50' });
    asserts.assertEquals(balance.balance, 125.5);
  });

  it('parses balance allowances when present', () => {
    const balance = ClobBalanceSchemaObject.parse({
      balance: '10',
      allowances: { '0xabc': '1000000' },
    });
    asserts.assertEquals(balance.allowances, { '0xabc': '1000000' });
  });

  it('parses api credentials with the apiKey field', () => {
    const creds = ClobApiCredentialsSchemaObject.parse({
      apiKey: '00000000-0000-0000-0000-000000000000',
      secret: 'AAAA',
      passphrase: 'p',
    });
    asserts.assertEquals(creds.apiKey, '00000000-0000-0000-0000-000000000000');
  });

  it('normalizes a "key" field to apiKey', () => {
    const creds = ClobApiCredentialsSchemaObject.parse({
      key: '00000000-0000-0000-0000-000000000000',
      secret: 'AAAA',
      passphrase: 'p',
    });
    asserts.assertEquals(creds.apiKey, '00000000-0000-0000-0000-000000000000');
  });

  it('rejects credentials missing a required field', () => {
    asserts.assertThrows(() =>
      ClobApiCredentialsSchemaObject.parse({ secret: 'AAAA', passphrase: 'p' })
    );
  });
});
