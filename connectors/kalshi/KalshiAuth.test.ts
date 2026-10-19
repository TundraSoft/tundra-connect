import * as asserts from '@asserts';
import { describe, it } from '@test';
import { API_PREFIX, buildAuthHeaders, signingString } from './KalshiAuth.ts';
import { KalshiSigner } from './KalshiSigner.ts';
import vectors from './fixtures/signing-vectors.json' with { type: 'json' };

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

describe('KalshiAuth — built-in and injected signers against the shared vectors', () => {
  const pssKeys = async () => {
    const { privateKey, publicKey } = await crypto.subtle.generateKey(
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
      btoa(binary).match(/.{1,64}/g)!.join('\n')
    }\n-----END PRIVATE KEY-----\n`;
    return { privateKey, publicKey, pem };
  };
  const verify = (publicKey: CryptoKey, message: string, b64: string) =>
    crypto.subtle.verify(
      { name: 'RSA-PSS', saltLength: 32 },
      publicKey,
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      new TextEncoder().encode(message),
    );

  it('every vector signing string is reproduced exactly', () => {
    for (const v of vectors.requests) {
      asserts.assertEquals(
        signingString(v.timestampMs, v.method, v.path),
        v.signingString,
      );
    }
  });

  it('built-in and injected signers both produce verifiable signatures over the same string', async () => {
    const { privateKey, publicKey, pem } = await pssKeys();
    const seen: string[] = [];
    const injected = {
      sign: async (message: string) => {
        seen.push(message);
        const sig = new Uint8Array(
          await crypto.subtle.sign(
            { name: 'RSA-PSS', saltLength: 32 },
            privateKey,
            new TextEncoder().encode(message),
          ),
        );
        let binary = '';
        for (const byte of sig) binary += String.fromCharCode(byte);
        return btoa(binary);
      },
    };
    const builtIn = new KalshiSigner(pem);
    for (const v of vectors.requests) {
      const a = await buildAuthHeaders(
        builtIn,
        'key',
        v.timestampMs,
        v.method,
        v.path,
      );
      const b = await buildAuthHeaders(
        injected,
        'key',
        v.timestampMs,
        v.method,
        v.path,
      );
      asserts.assertEquals(seen.at(-1), v.signingString);
      for (const headers of [a, b]) {
        asserts.assertEquals(
          headers['KALSHI-ACCESS-TIMESTAMP'],
          String(v.timestampMs),
        );
        asserts.assert(
          await verify(
            publicKey,
            v.signingString,
            headers['KALSHI-ACCESS-SIGNATURE'],
          ),
        );
      }
    }
  });
});
