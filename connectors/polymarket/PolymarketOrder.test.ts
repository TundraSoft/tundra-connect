import * as asserts from '@asserts';
import { describe, it } from '@test';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import {
  checksumAddress,
  fromHex,
  keccak256,
  toHex,
} from './PolymarketEip712.ts';
import { PolymarketSigner } from './PolymarketSigner.ts';
import {
  buildOrder,
  gcd,
  makeSalt,
  MIN_ORDER_USD,
  orderDigest,
  orderWireJson,
  quantizeBuy,
  shareStep,
  SIG_TYPE_POLY_PROXY,
  signOrder,
  toFixed6,
  VERIFYING_CONTRACT,
} from './PolymarketOrder.ts';

const TEST_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PROXY = '0x8ba1f109551bD432803012645Ac136ddd64DBA72'; // arbitrary funder
const TOKEN =
  '71321045679252212594626385532706912750332728571942532289631379312455583992563';

function params(
  version: 1 | 2,
  side: 'BUY' | 'SELL',
  price: number,
  shares: number,
  nowMs: number,
) {
  return {
    version,
    negRisk: false,
    funder: PROXY,
    signerAddress: TEST_ADDR,
    tokenId: TOKEN,
    side,
    price,
    shares,
    nowMs,
  };
}

/** Recovers the signer address from a `signOrder` output, to prove the digest that was hashed is exactly the digest the signature verifies against. */
function recoverSignerAddress(
  digest: Uint8Array,
  signatureHex: string,
): string {
  const bytes = fromHex(signatureHex);
  const recovery = bytes[64]! - 27;
  // noble's 'recovered' format is [recovery, ...r, ...s] — Ethereum's is [...r, ...s, v].
  const recovered = new Uint8Array(65);
  recovered[0] = recovery;
  recovered.set(bytes.slice(0, 64), 1);
  // The top-level `recoverPublicKey()` convenience function always returns a
  // COMPRESSED point (33 bytes); go through `Signature`/`Point` directly so
  // `toBytes(false)` gives the uncompressed X‖Y form address derivation needs.
  const point = secp256k1.Signature.fromBytes(recovered, 'recovered')
    .recoverPublicKey(digest);
  const publicKey = point.toBytes(false);
  const hash = keccak256(publicKey.slice(1));
  return checksumAddress(toHex(hash.slice(12)));
}

describe('PolymarketOrder — cent rule (quantize)', () => {
  it('derives the share step from gcd math', () => {
    asserts.assertAlmostEquals(shareStep(55), 0.2, 1e-12);
    asserts.assertAlmostEquals(shareStep(50), 0.02, 1e-12);
    asserts.assertAlmostEquals(shareStep(33), 1.0, 1e-12);
    asserts.assertAlmostEquals(shareStep(25), 0.04, 1e-12);
    asserts.assertAlmostEquals(shareStep(99), 1.0, 1e-12);
    asserts.assertAlmostEquals(shareStep(10), 0.1, 1e-12);
  });

  it('quantizes the largest cent-aligned size within budget', () => {
    // $5 at 0.55: naive 9.09 shares; cent-aligned step 0.2 -> 9.0 = $4.95
    const q = quantizeBuy(5.0, 0.55, MIN_ORDER_USD)!;
    asserts.assertAlmostEquals(q.shares, 9.0, 1e-9);
    asserts.assertAlmostEquals(q.usd, 4.95, 1e-9);
    asserts.assertEquals((q.shares * 55) % 1, 0);
  });

  it('lands on cents or refuses for awkward prices', () => {
    // $1 at 0.33: step 1.0 -> 3 shares = $0.99, under the $1 floor -> refuse
    asserts.assertEquals(quantizeBuy(1.0, 0.33, MIN_ORDER_USD), null);
    // $2 clears: 6 shares = $1.98
    const q = quantizeBuy(2.0, 0.33, MIN_ORDER_USD)!;
    asserts.assertEquals(q.shares, 6.0);
    asserts.assertAlmostEquals(q.usd, 1.98, 1e-9);
    asserts.assertEquals(quantizeBuy(0.3, 0.33, MIN_ORDER_USD), null); // can't afford one step
  });

  it('enforces the $1 venue minimum', () => {
    // $1 at 0.54: cent rule -> 1.5 shares = $0.81 < $1 -> refuse
    asserts.assertEquals(quantizeBuy(1.0, 0.54, MIN_ORDER_USD), null);
    const q = quantizeBuy(2.0, 0.54, MIN_ORDER_USD)!;
    asserts.assert(q.usd >= 1.0 && q.usd <= 2.0);
    asserts.assertEquals((q.shares * 54) % 1, 0); // still cent-aligned
    asserts.assert(quantizeBuy(2.0, 0.99, MIN_ORDER_USD)!.usd >= 1.0);
  });

  it('rejects off-tick and out-of-band prices', () => {
    asserts.assertThrows(
      () => quantizeBuy(5.0, 0.555, MIN_ORDER_USD),
      Error,
      'tick',
    );
    asserts.assertThrows(() => quantizeBuy(5.0, 0.0, MIN_ORDER_USD));
    asserts.assertThrows(() => quantizeBuy(5.0, 1.0, MIN_ORDER_USD));
  });

  it('computes gcd correctly', () => {
    asserts.assertEquals(gcd(55, 100), 5);
    asserts.assertEquals(gcd(50, 100), 50);
    asserts.assertEquals(gcd(0, 100), 100);
  });
});

describe('PolymarketOrder — amount arithmetic (vendor SDK example)', () => {
  it('matches the SDK buy example', () => {
    const built = buildOrder(params(2, 'BUY', 0.55, 10.0, 1_784_600_000_000));
    asserts.assertEquals(built.makerAmount, 5_500_000n);
    asserts.assertEquals(built.takerAmount, 10_000_000n);
  });

  it('mirrors for a sell', () => {
    const built = buildOrder(params(2, 'SELL', 0.55, 10.0, 1));
    asserts.assertEquals(built.makerAmount, 10_000_000n);
    asserts.assertEquals(built.takerAmount, 5_500_000n);
  });

  it('matches the SDK fixed-point examples', () => {
    asserts.assertEquals(toFixed6(123.45), 123_450_000n);
    asserts.assertEquals(toFixed6(0.2), 200_000n);
  });
});

describe('PolymarketOrder — salt', () => {
  it('is always below 2^53', () => {
    for (let i = 0; i < 200; i++) {
      asserts.assert(makeSalt(1_784_600_000_000, Math.random) < 2 ** 53);
    }
  });

  it('is deterministic for a fixed rand()', () => {
    const a = makeSalt(1_784_600_000_000, () => 0.5);
    const b = makeSalt(1_784_600_000_000, () => 0.5);
    asserts.assertEquals(a, b);
  });
});

describe('PolymarketOrder — build/sign shape', () => {
  it('selects the right verifying contract per version × neg-risk', () => {
    asserts.assertEquals(
      buildOrder({ ...params(1, 'BUY', 0.5, 2.0, 1), negRisk: false })
        .verifyingContract,
      VERIFYING_CONTRACT[1].std,
    );
    asserts.assertEquals(
      buildOrder({ ...params(1, 'BUY', 0.5, 2.0, 1), negRisk: true })
        .verifyingContract,
      VERIFYING_CONTRACT[1].negRisk,
    );
    asserts.assertEquals(
      buildOrder({ ...params(2, 'BUY', 0.5, 2.0, 1), negRisk: false })
        .verifyingContract,
      VERIFYING_CONTRACT[2].std,
    );
  });

  it('defaults signatureType to PolyProxy', () => {
    asserts.assertEquals(
      buildOrder(params(2, 'BUY', 0.5, 2.0, 1)).signatureType,
      SIG_TYPE_POLY_PROXY,
    );
  });

  it('v1 wire shape carries taker/nonce/feeRateBps, v2 does not', () => {
    const v1 = buildOrder(params(1, 'BUY', 0.5, 2.0, 1));
    const w1 = orderWireJson(v1, '0xsig');
    asserts.assertEquals(
      w1.taker,
      '0x0000000000000000000000000000000000000000',
    );
    asserts.assertEquals(w1.expiration, '0');
    asserts.assertEquals(w1.nonce, '0');
    asserts.assertEquals(w1.feeRateBps, '0');

    const v2 = buildOrder(params(2, 'BUY', 0.5, 2.0, 777));
    const w2 = orderWireJson(v2, '0xsig');
    asserts.assertEquals('taker' in w2, false);
    asserts.assertEquals(w2.timestamp, '777');
  });

  it('a GTD expirationTime is carried on the wire for both V1 and V2', () => {
    const v1 = buildOrder({
      ...params(1, 'BUY', 0.5, 2.0, 1),
      expirationTime: 1_800_000_000,
    });
    asserts.assertEquals(orderWireJson(v1, '0xsig').expiration, '1800000000');

    const v2 = buildOrder({
      ...params(2, 'BUY', 0.5, 2.0, 777),
      expirationTime: 1_800_000_000,
    });
    asserts.assertEquals(orderWireJson(v2, '0xsig').expiration, '1800000000');
  });

  it('V1: expirationTime is part of the SIGNED struct — changing it changes the digest', () => {
    const noExpiry = buildOrder(params(1, 'BUY', 0.5, 2.0, 1));
    const withExpiry = buildOrder({
      ...params(1, 'BUY', 0.5, 2.0, 1),
      expirationTime: 1_800_000_000,
    });
    asserts.assertNotEquals(
      toHex(orderDigest(noExpiry)),
      toHex(orderDigest(withExpiry)),
    );
  });

  it("V2: expirationTime is NOT signed — it's wire-only, so the digest is unchanged", () => {
    const noExpiry = buildOrder(params(2, 'BUY', 0.5, 2.0, 777));
    const withExpiry = buildOrder({
      ...params(2, 'BUY', 0.5, 2.0, 777),
      expirationTime: 1_800_000_000,
    });
    asserts.assertEquals(
      toHex(orderDigest(noExpiry)),
      toHex(orderDigest(withExpiry)),
    );
    // ...yet the wire payload still differs, since expiration travels on
    // the outer (unsigned) payload for V2.
    asserts.assertNotEquals(
      orderWireJson(noExpiry, '0xsig').expiration,
      orderWireJson(withExpiry, '0xsig').expiration,
    );
  });

  it('matches the SDK wire-json example: salt number, amounts strings, side BUY', () => {
    const built = buildOrder(params(2, 'BUY', 0.55, 9.0, 5));
    const wire = orderWireJson(built, '0xsig');
    asserts.assertEquals(typeof wire.salt, 'number');
    asserts.assertEquals(wire.makerAmount, '4950000'); // 9 × 0.55 = $4.95
    asserts.assertEquals(wire.takerAmount, '9000000');
    asserts.assertEquals(wire.side, 'BUY');
    asserts.assertEquals(wire.tokenId, TOKEN);
    asserts.assertEquals(wire.expiration, '0'); // V2: outer payload
    asserts.assertEquals(wire.signature, '0xsig');
  });

  it('v1 and v2 signatures recover to the signer address', () => {
    const signer = new PolymarketSigner(TEST_KEY);
    for (const version of [1, 2] as const) {
      const built = buildOrder(
        params(version, 'BUY', 0.55, 9.0, 1_784_600_000_000),
      );
      const signature = signOrder(signer, built);
      const digest = orderDigest(built);
      asserts.assertEquals(recoverSignerAddress(digest, signature), TEST_ADDR);
    }
  });

  it('the shared envelope inputs (build+sign) match the hand-verified SDK example end-to-end', () => {
    const signer = new PolymarketSigner(TEST_KEY);
    const p = params(2, 'BUY', 0.55, 9.0, 5);
    const built = buildOrder(p);
    const signature = signOrder(signer, built);
    const wire = orderWireJson(built, signature);
    asserts.assertEquals(wire.side, 'BUY');
    asserts.assertEquals(wire.makerAmount, '4950000');
    asserts.assertEquals(wire.takerAmount, '9000000');
    asserts.assertEquals(
      recoverSignerAddress(orderDigest(built), signature),
      TEST_ADDR,
    );
  });
});
