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
import {
  builtInSigner,
  externalSigner,
  normalizeSignature,
  type PolymarketExternalSigner,
  PolymarketSigner,
  signMessageWith,
} from './PolymarketSigner.ts';
import { buildL1Headers, buildL2Headers, hmacSign } from './PolymarketAuth.ts';
import vectors from './fixtures/signing-vectors.json' with { type: 'json' };

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

// ── Injected signers vs. the shared vectors ─────────────────────────────────

describe('PolymarketSigner — injected signers reproduce the shared vectors', () => {
  const key = fromHex(vectors.key.privateKey.slice(2));
  const N = secp256k1.Point.CURVE().n;

  /** A stand-in for an out-of-process signer, returning `format`. */
  const injected = (
    format: 'rsv-hex' | 'rsv-bigint' | 'bytes' | 'high-s' | 'v01',
    signingKey = key,
  ): PolymarketExternalSigner => ({
    address: vectors.key.address.toLowerCase(),
    signDigest: (digest) => {
      const sig = secp256k1.sign(digest, signingKey, {
        prehash: false,
        format: 'recovered',
      });
      const recovery = sig[0]!;
      const r = sig.slice(1, 33);
      const s = sig.slice(33, 65);
      const big = (b: Uint8Array) => BigInt(`0x${toHex(b)}`);
      switch (format) {
        case 'rsv-hex':
          return Promise.resolve({
            r: `0x${toHex(r)}`,
            s: `0x${toHex(s)}`,
            v: 27 + recovery,
          });
        case 'rsv-bigint':
          return Promise.resolve({ r: big(r), s: big(s), v: 27 + recovery });
        case 'v01':
          return Promise.resolve({ r, s, v: recovery });
        case 'high-s':
          return Promise.resolve({ r, s: N - big(s), v: 27 + (recovery ^ 1) });
        case 'bytes': {
          const out = new Uint8Array(65);
          out.set(r, 0);
          out.set(s, 32);
          out[64] = 27 + recovery;
          return Promise.resolve(out);
        }
      }
    },
  });

  const formats = ['rsv-hex', 'rsv-bigint', 'bytes', 'high-s', 'v01'] as const;

  it('the built-in signer reproduces every vector', async () => {
    const signer = builtInSigner(new PolymarketSigner(vectors.key.privateKey));
    asserts.assertEquals(signer.address, vectors.key.address);
    for (const order of vectors.orders) {
      asserts.assertEquals(
        await signer.signDigest(fromHex(order.digest.slice(2))),
        order.signature,
      );
    }
    asserts.assertEquals(
      await signer.signDigest(fromHex(vectors.eip191.digest.slice(2))),
      vectors.eip191.signature,
    );
  });

  for (const format of formats) {
    it(`an injected signer returning ${format} gives identical signatures`, async () => {
      const signer = externalSigner(injected(format));
      asserts.assertEquals(signer.address, vectors.key.address); // checksummed
      for (const order of vectors.orders) {
        asserts.assertEquals(
          await signer.signDigest(fromHex(order.digest.slice(2))),
          order.signature,
        );
      }
      asserts.assertEquals(
        (await buildL1Headers(
          signer,
          vectors.l1.chainId,
          vectors.l1.timestampSec,
          vectors.l1.nonce,
        ))
          .POLY_SIGNATURE,
        vectors.l1.headers.POLY_SIGNATURE,
      );
      asserts.assertEquals(
        await signMessageWith(signer, fromHex(vectors.eip191.message.slice(2))),
        vectors.eip191.signature,
      );
    });
  }

  it('an injected hmac gives the same L2 signature as the secret', async () => {
    const creds = { apiKey: 'k', passphrase: 'p' };
    const fromSecret = await buildL2Headers(
      vectors.key.address,
      { ...creds, secret: vectors.hmac.secret },
      1_000_000,
      'POST',
      '/order',
      '{"hash":"0x123"}',
    );
    const seen: string[] = [];
    const fromHmac = await buildL2Headers(
      vectors.key.address,
      {
        ...creds,
        hmac: (message) => {
          seen.push(message);
          return hmacSign(vectors.hmac.secret, message);
        },
      },
      1_000_000,
      'POST',
      '/order',
      '{"hash":"0x123"}',
    );
    asserts.assertEquals(seen, [vectors.hmac.message]);
    asserts.assertEquals(fromHmac.POLY_SIGNATURE, vectors.hmac.signature);
    asserts.assertEquals(fromSecret.POLY_SIGNATURE, vectors.hmac.signature);
  });

  it('refuses a signature from a different key', async () => {
    const other = fromHex(
      '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    );
    const signer = externalSigner(injected('bytes', other));
    await asserts.assertRejects(
      () => signer.signDigest(fromHex(vectors.orders[0]!.digest.slice(2))),
      Error,
      'recovers to',
    );
  });

  it('refuses a signer that hashes the digest again', async () => {
    const signer = externalSigner({
      address: vectors.key.address,
      signDigest: (digest) =>
        Promise.resolve(
          secp256k1.sign(digest, key, { format: 'recovered' }), // prehash: true (default)
        ).then((sig) => ({
          r: sig.slice(1, 33),
          s: sig.slice(33),
          v: sig[0]!,
        })),
    });
    await asserts.assertRejects(
      () => signer.signDigest(fromHex(vectors.orders[0]!.digest.slice(2))),
      Error,
      'recovers to',
    );
  });

  it('rejects malformed signatures and addresses', async () => {
    asserts.assertThrows(() =>
      externalSigner({
        address: 'nope',
        signDigest: () => Promise.resolve(new Uint8Array(65)),
      })
    );
    const signer = externalSigner({
      address: vectors.key.address,
      signDigest: () => Promise.resolve(new Uint8Array(64)),
    });
    await asserts.assertRejects(
      () => signer.signDigest(new Uint8Array(32)),
      Error,
      '65 bytes',
    );
    asserts.assertThrows(
      () => normalizeSignature({ r: 1n, s: 1n, v: 29 }),
      Error,
      'invalid v',
    );
    asserts.assertThrows(
      () => normalizeSignature({ r: 0n, s: 1n, v: 27 }),
      Error,
      'out of range',
    );
  });
});
