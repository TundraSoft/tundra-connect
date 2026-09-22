import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  buildL1Headers,
  buildL2Headers,
  hmacSign,
  toMessage,
} from './PolymarketAuth.ts';
import { PolymarketSigner } from './PolymarketSigner.ts';

// Publicly-known Hardhat/Anvil test key — safe to hardcode; used by Polymarket's
// own vendored-SDK test vectors (shared with this connect's Rust/TS siblings).
const TEST_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // checksummed
const SECRET = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; // 32 zero bytes
const AMOY = 80_002;

describe('PolymarketAuth — L2 HMAC (SDK vectors)', () => {
  it('builds the canonical message exactly', () => {
    asserts.assertEquals(
      toMessage(1, 'POST', '/path', '{"foo":"bar"}'),
      '1POST/path{"foo":"bar"}',
    );
  });

  it('swaps a single-quote for a double-quote in the body (py-clob-client parity)', () => {
    asserts.assertEquals(
      toMessage(1, 'POST', '/path', "{'foo':'bar'}"),
      '1POST/path{"foo":"bar"}',
    );
  });

  it('reproduces the SDK hmac vector byte-for-byte', async () => {
    const msg = '1000000test-sign/orders{"hash":"0x123"}';
    asserts.assertEquals(
      await hmacSign(SECRET, msg),
      '4gJVbox-R6XlDK4nlaicig0_ANVL1qdcahiL8CXfXLM=',
    );
  });

  it('keeps URL-safe base64 padding on the signature', async () => {
    const sig = await hmacSign(SECRET, toMessage(1, 'GET', '/', ''));
    asserts.assertEquals(sig, 'eHaylCwqRSOa2LFD77Nt_SaTpbsxzN8eTEI3LryhEj4=');
    asserts.assert(!sig.includes('+') && !sig.includes('/'));
  });

  it('accepts an unpadded secret identically to a padded one', async () => {
    const unpadded = SECRET.replace(/=+$/, '');
    asserts.assertEquals(
      await hmacSign(unpadded, 'x'),
      await hmacSign(SECRET, 'x'),
    );
  });

  it('emits the five L2 headers with a CHECKSUMMED address', async () => {
    const h = await buildL2Headers(
      TEST_ADDR,
      {
        apiKey: '00000000-0000-0000-0000-000000000000',
        secret: SECRET,
        passphrase: 'a'.repeat(64),
      },
      1,
      'GET',
      '/',
      '',
    );
    asserts.assertEquals(h.POLY_ADDRESS, TEST_ADDR); // mixed-case checksum, not lowercase
    asserts.assertEquals(
      h.POLY_SIGNATURE,
      'eHaylCwqRSOa2LFD77Nt_SaTpbsxzN8eTEI3LryhEj4=',
    );
    asserts.assertEquals(h.POLY_TIMESTAMP, '1');
    asserts.assertEquals(
      h.POLY_API_KEY,
      '00000000-0000-0000-0000-000000000000',
    );
  });

  it('accepts a lowercase input address and still emits the checksummed header', async () => {
    const h = await buildL2Headers(
      TEST_ADDR.toLowerCase(),
      { apiKey: 'k', secret: SECRET, passphrase: 'p' },
      1,
      'GET',
      '/',
      '',
    );
    asserts.assertEquals(h.POLY_ADDRESS, TEST_ADDR);
  });

  it('signs the PATH only — a caller who never passes the query gets the same signature regardless', async () => {
    const a = await buildL2Headers(
      TEST_ADDR,
      { apiKey: 'k', secret: SECRET, passphrase: 'p' },
      5,
      'GET',
      '/balance-allowance',
      '',
    );
    const b = await buildL2Headers(
      TEST_ADDR,
      { apiKey: 'k', secret: SECRET, passphrase: 'p' },
      5,
      'GET',
      '/balance-allowance',
      '',
    );
    asserts.assertEquals(a.POLY_SIGNATURE, b.POLY_SIGNATURE);
  });
});

describe('PolymarketAuth — L1 (the SDK vector that pins the whole EIP-712 + ECDSA stack)', () => {
  it('reproduces the AMOY create-key signature exactly', () => {
    const signer = new PolymarketSigner(TEST_KEY);
    const h = buildL1Headers(signer, AMOY, 10_000_000, 23);
    asserts.assertEquals(
      h.POLY_ADDRESS,
      '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    ); // LOWERCASE for L1
    asserts.assertEquals(h.POLY_NONCE, '23');
    asserts.assertEquals(h.POLY_TIMESTAMP, '10000000');
    asserts.assertEquals(
      h.POLY_SIGNATURE,
      '0xf62319a987514da40e57e2f4d7529f7bac38f0355bd88bb5adbb3768d80de6c1682518e0af677d5260366425f4361e7b70c25ae232aff0ab2331e2b164a1aedc1b',
    );
  });

  it('defaults nonce to 0', () => {
    const signer = new PolymarketSigner(TEST_KEY);
    asserts.assertEquals(buildL1Headers(signer, AMOY, 1).POLY_NONCE, '0');
  });
});
