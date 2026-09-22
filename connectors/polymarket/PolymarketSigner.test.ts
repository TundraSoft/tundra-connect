import * as asserts from '@asserts';
import { describe, it } from '@test';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import {
  addressWord,
  checksumAddress,
  domainSeparator,
  eip191Digest,
  fromHex,
  hashStruct,
  keccak256,
  stringWord,
  toHex,
  typedDataDigest,
  uintWord,
} from './PolymarketEip712.ts';
import { PolymarketSigner } from './PolymarketSigner.ts';

/** Recovers the signer address from a 65-byte `r‖s‖v` signature over `digest` — mirrors PolymarketOrder.test.ts's helper. */
function recoverSignerAddress(
  digest: Uint8Array,
  signatureHex: string,
): string {
  const bytes = fromHex(signatureHex);
  const recovery = bytes[64]! - 27;
  const recovered = new Uint8Array(65);
  recovered[0] = recovery;
  recovered.set(bytes.slice(0, 64), 1);
  const point = secp256k1.Signature.fromBytes(recovered, 'recovered')
    .recoverPublicKey(digest);
  const publicKey = point.toBytes(false);
  const hash = keccak256(publicKey.slice(1));
  return checksumAddress(toHex(hash.slice(12)));
}

// Publicly-known Hardhat/Anvil test key — safe to hardcode; used by Polymarket's
// own vendored-SDK test vectors (shared with this connect's Rust/TS siblings).
const TEST_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

describe('PolymarketSigner', () => {
  it('derives the checksummed address', () => {
    asserts.assertEquals(new PolymarketSigner(TEST_KEY).address, TEST_ADDR);
  });

  it('accepts a key with or without 0x and rejects bad hex without echoing it', () => {
    asserts.assertEquals(
      new PolymarketSigner(TEST_KEY.slice(2)).address,
      TEST_ADDR,
    );
    let message = '';
    try {
      new PolymarketSigner('not-a-key');
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    asserts.assert(message.includes('32 bytes of hex'));
    asserts.assert(!message.includes('not-a-key'));
    asserts.assertThrows(() => new PolymarketSigner('0x1234'));
  });

  it('rejects a zero private key (invalid secp256k1 scalar)', () => {
    asserts.assertThrows(() => new PolymarketSigner(`0x${'0'.repeat(64)}`));
  });

  it('has no accessible way to read the raw key back', () => {
    const signer = new PolymarketSigner(TEST_KEY);
    asserts.assertEquals(
      (signer as unknown as Record<string, unknown>).privateKey,
      undefined,
    );
    // Only an `address` own-property is enumerable — the private key field
    // is a true `#`-private class field, invisible to Object.keys/JSON.
    asserts.assertEquals(Object.keys(signer), ['address']);
    asserts.assertEquals(
      JSON.stringify(signer),
      JSON.stringify({ address: TEST_ADDR }),
    );
  });

  it('signDigest requires exactly 32 bytes', () => {
    const signer = new PolymarketSigner(TEST_KEY);
    asserts.assertThrows(() => signer.signDigest(new Uint8Array(31)));
  });

  it('reproduces the SDK ClobAuth L1 signature vector byte-for-byte (AMOY, ts=10000000, nonce=23)', () => {
    // Pins the whole stack: EIP-712 domain/struct hashing + secp256k1
    // signing. Reproducing this exact 65-byte signature is the guard that
    // this connect's real-money order path is wire-correct.
    const signer = new PolymarketSigner(TEST_KEY);
    const domainSep = domainSeparator('ClobAuthDomain', '1', 80_002);
    const structHash = hashStruct(
      'ClobAuth(address address,string timestamp,uint256 nonce,string message)',
      [
        addressWord(signer.address),
        stringWord('10000000'),
        uintWord(23n),
        stringWord('This message attests that I control the given wallet'),
      ],
    );
    const digest = typedDataDigest(domainSep, structHash);
    const signature = signer.signDigest(digest);
    asserts.assertEquals(
      signature,
      '0xf62319a987514da40e57e2f4d7529f7bac38f0355bd88bb5adbb3768d80de6c1682518e0af677d5260366425f4361e7b70c25ae232aff0ab2331e2b164a1aedc1b',
    );
  });

  it('signMessage (EIP-191 personal_sign) recovers to the signer address', () => {
    const signer = new PolymarketSigner(TEST_KEY);
    const message = new TextEncoder().encode('rlx:some-struct-hash-bytes');
    const signature = signer.signMessage(message);
    asserts.assertEquals(
      recoverSignerAddress(eip191Digest(message), signature),
      TEST_ADDR,
    );
  });
});
