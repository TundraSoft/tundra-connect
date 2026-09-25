import * as asserts from '@asserts';
import { describe, it } from '@test';
import { API_PREFIX, buildAuthHeaders, signingString } from './KalshiAuth.ts';
import { KalshiSigner } from './KalshiSigner.ts';

async function testSigner(): Promise<KalshiSigner> {
  const { privateKey } = await crypto.subtle.generateKey(
    {
      name: 'RSA-PSS',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const der = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', privateKey),
  );
  let binary = '';
  for (const byte of der) binary += String.fromCharCode(byte);
  const pem = `-----BEGIN PRIVATE KEY-----\n${
    btoa(binary)
  }\n-----END PRIVATE KEY-----\n`;
  return new KalshiSigner(pem);
}

describe('KalshiAuth', () => {
  it('signingString is {timestamp}{METHOD}{path}, method uppercased', () => {
    asserts.assertEquals(
      signingString(1_700_000_000_000, 'get', '/trade-api/v2/portfolio/orders'),
      '1700000000000GET/trade-api/v2/portfolio/orders',
    );
    asserts.assertEquals(
      signingString(1, 'POST', '/trade-api/v2/portfolio/orders'),
      '1POST/trade-api/v2/portfolio/orders',
    );
  });

  it('API_PREFIX is /trade-api/v2', () => {
    asserts.assertEquals(API_PREFIX, '/trade-api/v2');
  });

  it('header timestamp matches the signed timestamp, and the key id is echoed verbatim', async () => {
    const signer = await testSigner();
    const headers = await buildAuthHeaders(
      signer,
      'key-id',
      1_700_000_000_000,
      'GET',
      '/trade-api/v2/exchange/status',
    );
    asserts.assertEquals(headers['KALSHI-ACCESS-TIMESTAMP'], '1700000000000');
    asserts.assertEquals(headers['KALSHI-ACCESS-KEY'], 'key-id');
    asserts.assert(headers['KALSHI-ACCESS-SIGNATURE'].length > 0);
  });
});
