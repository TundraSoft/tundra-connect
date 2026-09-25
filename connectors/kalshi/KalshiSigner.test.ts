import * as asserts from '@asserts';
import { describe, it } from '@test';
import { KalshiSigner } from './KalshiSigner.ts';

/** Generates a fresh RSA-PSS keypair and returns its private key as a PKCS#8 PEM. */
async function generateTestKeyPair(): Promise<
  { pem: string; publicKey: CryptoKey }
> {
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
  const b64 = btoa(binary);
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 64) lines.push(b64.slice(i, i + 64));
  const pem = `-----BEGIN PRIVATE KEY-----\n${
    lines.join('\n')
  }\n-----END PRIVATE KEY-----\n`;
  return { pem, publicKey };
}

async function verify(
  publicKey: CryptoKey,
  message: Uint8Array,
  signatureB64: string,
): Promise<boolean> {
  const binary = atob(signatureB64);
  const sig = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) sig[i] = binary.charCodeAt(i);
  return await crypto.subtle.verify(
    { name: 'RSA-PSS', saltLength: 32 },
    publicKey,
    sig,
    message as unknown as BufferSource,
  );
}

describe('KalshiSigner', () => {
  it('sign then verify round-trips against the matching public key', async () => {
    const { pem, publicKey } = await generateTestKeyPair();
    const signer = new KalshiSigner(pem);
    const message = new TextEncoder().encode(
      '1700000000000GET/trade-api/v2/portfolio/balance',
    );
    const sig = await signer.sign(message);
    asserts.assert(await verify(publicKey, message, sig));
  });

  it('signatures are randomized but all verify (PSS random salt)', async () => {
    const { pem, publicKey } = await generateTestKeyPair();
    const signer = new KalshiSigner(pem);
    const message = new TextEncoder().encode(
      '1700000000000POST/trade-api/v2/portfolio/events/orders',
    );
    const a = await signer.sign(message);
    const b = await signer.sign(message);
    asserts.assertNotEquals(a, b);
    asserts.assert(await verify(publicKey, message, a));
    asserts.assert(await verify(publicKey, message, b));
  });

  it('a tampered message fails verification', async () => {
    const { pem, publicKey } = await generateTestKeyPair();
    const signer = new KalshiSigner(pem);
    const sig = await signer.sign(
      new TextEncoder().encode(
        '1700000000000GET/trade-api/v2/portfolio/balance',
      ),
    );
    const tampered = new TextEncoder().encode(
      '1700000000000GET/trade-api/v2/portfolio/orders',
    );
    asserts.assertEquals(await verify(publicKey, tampered, sig), false);
  });

  it('bad PEM is rejected without echoing the input', () => {
    const error = asserts.assertThrows(() => new KalshiSigner('not a pem'));
    asserts.assertStringIncludes((error as Error).message, 'PKCS#8');
    asserts.assertEquals((error as Error).message.includes('not a pem'), false);
  });

  it('tolerates openssl-style leading/trailing/interior blank lines', async () => {
    const { pem, publicKey } = await generateTestKeyPair();
    const messy = pem.split('\n').join('\n\n');
    const signer = new KalshiSigner(`\n\n${messy}\n\n`);
    const message = new TextEncoder().encode(
      '1700000000000GET/trade-api/v2/exchange/status',
    );
    const sig = await signer.sign(message);
    asserts.assert(await verify(publicKey, message, sig));
  });

  it('rejects a structurally-plausible but cryptographically invalid key on sign()', async () => {
    // A PKCS#8-shaped PEM whose base64 body isn't a real RSA key — passes
    // the synchronous structural check but must fail on first sign().
    const fakeDer = new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x00]);
    let binary = '';
    for (const b of fakeDer) binary += String.fromCharCode(b);
    const pem = `-----BEGIN PRIVATE KEY-----\n${
      btoa(binary)
    }\n-----END PRIVATE KEY-----\n`;
    const signer = new KalshiSigner(pem);
    await asserts.assertRejects(() =>
      signer.sign(new TextEncoder().encode('x'))
    );
  });
});
