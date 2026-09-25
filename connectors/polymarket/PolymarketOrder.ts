/**
 * @fileoverview Polymarket CLOB order construction, quantization, and
 * EIP-712 signing.
 *
 * Field ORDER in the type strings below is the on-chain typehash — it must
 * never be reordered independently of these declarations.
 *
 * Every function here is pure (no I/O; `nowMs` and randomness are always
 * injected, never read from the clock directly) and independently
 * testable — see `PolymarketOrder.test.ts`, verified against Polymarket's
 * own vendored-SDK worked examples (the same ones this connect's Rust and
 * TypeScript sibling implementations pin against).
 *
 * @module
 */

import {
  addressWord,
  bytes32Word,
  domainSeparator,
  hashStruct,
  typedDataDigest,
  uintWord,
} from './PolymarketEip712.ts';
import type { PolymarketSigner } from './PolymarketSigner.ts';

export const POLYGON_CHAIN_ID = 137;
export const EXCHANGE_DOMAIN_NAME = 'Polymarket CTF Exchange';

/**
 * `verifyingContract` by (protocol version × neg-risk), Polygon 137.
 * btc/eth/sol/xrp updown markets are NOT neg-risk.
 */
export const VERIFYING_CONTRACT = {
  1: {
    std: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
    negRisk: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  },
  2: {
    std: '0xE111180000d2663C0091e4f400237545B87B996B',
    negRisk: '0xe2222d279d744050d28e00520010520000310F59',
  },
} as const;

/** sigType: 0=EOA, 1=PolyProxy (funds in a Polymarket proxy, EOA signs), 2=GnosisSafe. Numeric values are load-bearing. */
export const SIG_TYPE_EOA = 0;
export const SIG_TYPE_POLY_PROXY = 1;
export const SIG_TYPE_GNOSIS_SAFE = 2;

// EIP-712 struct name MUST be "Order" (hashed into the typehash).
export const ORDER_TYPE_V1 =
  'Order(uint256 salt,address maker,address signer,address taker,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint256 nonce,uint256 feeRateBps,uint8 side,uint8 signatureType)';
export const ORDER_TYPE_V2 =
  'Order(uint256 salt,address maker,address signer,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint8 side,uint8 signatureType,uint256 timestamp,bytes32 metadata,bytes32 builder)';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const;
const ZERO_BYTES32_RAW = new Uint8Array(32);

/** USDC / share fixed point: 6 decimals. */
export const SCALE = 1_000_000n;

/** Greatest common divisor of two non-negative integers. */
export function gcd(a: number, b: number): number {
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * The server-enforced CENT RULE (learned live, not documented by the
 * vendor): `shares × price` must land on a whole USDC cent or the API
 * rejects with "maker amount supports a max accuracy of 2 decimals". The
 * largest share step that keeps every multiple cent-aligned at price `P`
 * (in cents) is `(100 / gcd(P_cents, 100)) / 100`.
 *
 * @example
 * ```typescript
 * shareStep(55); // 0.2   — 0.20 × 0.55 = $0.11 ✓
 * shareStep(50); // 0.02
 * shareStep(33); // 1.0
 * ```
 */
export function shareStep(priceCents: number): number {
  return 100 / gcd(priceCents, 100) / 100;
}

/** Result of {@link quantizeBuy} — a cent-aligned share count and its exact USD cost. */
export type Quantized = {
  /** Multiple of the cent-rule step, at most 2 decimal places. */
  shares: number;
  /** `shares × price`, exact cents. */
  usd: number;
};

/**
 * The venue's minimum notional for a marketable order — $1.00. Learned
 * live (a 403 "invalid amount … min size: 1"); not documented by the
 * vendor.
 */
export const MIN_ORDER_USD = 1;

/**
 * Largest cent-aligned share count whose notional fits `budgetUsd` at
 * `price`. `price` must sit on the 0.01 tick in `[0.01, 0.99]` —
 * validated, never rounded (the venue rejects an off-tick price rather
 * than rounding it, and this mirrors that reject-not-round behavior).
 *
 * Returns `null` when no cent-aligned size sits in
 * `[minUsd, budgetUsd]` — the caller should abort with a clear reason
 * rather than send a doomed order.
 *
 * @throws {Error} When `price` is off the 0.01 tick or outside `[0.01, 0.99]`.
 */
export function quantizeBuy(
  budgetUsd: number,
  price: number,
  minUsd: number = MIN_ORDER_USD,
): Quantized | null {
  const cents = Math.round(price * 100);
  if (!Number.isFinite(price) || Math.abs(price * 100 - cents) > 1e-9) {
    throw new Error(
      `price ${price} is not on the 0.01 tick — refusing (venue rejects, never rounds)`,
    );
  }
  if (cents < 1 || cents > 99) {
    throw new Error(`price ${price} outside [0.01, 0.99]`);
  }
  const step = shareStep(cents);
  const maxShares = Math.floor(budgetUsd / price / step + 1e-9) * step;
  // float-safe: recompute in integer cents
  const shares = Math.round(maxShares * 100) / 100;
  if (shares < step) return null; // one step already exceeds the budget
  const usdCents = Math.round(shares * 100) * cents; // (shares×100) × cents = cents×100
  const usd = usdCents / 10_000;
  if (usd + 1e-9 < minUsd) return null; // largest within budget still under the venue floor
  return { shares, usd };
}

/** 6dp fixed-point mantissa of a 2dp-safe quantity, as the venue's scaling expects. */
export function toFixed6(x: number): bigint {
  return BigInt(Math.round(x * 100)) * 10_000n;
}

/** The CLOB's order-signing protocol version, as reported by `GET /version`. */
export type ProtocolVersion = 1 | 2;
/** Which side of the book an order takes. */
export type OrderSide = 'BUY' | 'SELL';

/** Inputs to {@link buildOrder}. */
export type BuildOrderParams = {
  version: ProtocolVersion;
  negRisk: boolean;
  /** Funds holder (the proxy). Goes in `maker`. */
  funder: string;
  /** Signer EOA (derived from the loaded key). Goes in `signer`. */
  signerAddress: string;
  /** `uint256` decimal string. */
  tokenId: string;
  side: OrderSide;
  /** On-tick, `[0.01, 0.99]`. */
  price: number;
  /** Cent-aligned (from {@link quantizeBuy}). */
  shares: number;
  /** ms clock for the V2 `timestamp` field and salt entropy. Injected for testability. */
  nowMs: number;
  /** @default {@link SIG_TYPE_POLY_PROXY} */
  signatureType?: number;
  /** Unix SECONDS the order auto-cancels at — only meaningful for a `GTD` order. `0`/omitted means "never" (GTC/FOK/FAK's existing behavior, unchanged). */
  expirationTime?: number;
};

/** An order's fields exactly as signed (amounts as `bigint`; {@link orderWireJson} stringifies them). */
export type BuiltOrder = {
  version: ProtocolVersion;
  domainVersion: string;
  verifyingContract: string;
  /** `< 2^53` by construction — safe to carry as a plain `number`. */
  salt: number;
  maker: string;
  signer: string;
  /** `0x0` (public order) — only meaningful (and only serialized) for V1. */
  taker: string;
  tokenId: string;
  makerAmount: bigint;
  takerAmount: bigint;
  /** `0` = BUY, `1` = SELL (on-chain encoding). */
  side: 0 | 1;
  signatureType: number;
  /** V2 only: the build-time ms clock. */
  timestampMs: number;
  /** Unix SECONDS the order auto-cancels at; `0` means "never". Part of the SIGNED struct for V1 (see {@link orderDigest}); V2 carries it only on the outer wire payload — see {@link orderWireJson}. */
  expirationSec: number;
};

/** Salt: masked below `2^53` — the CLOB parses it as a JS number. Not cryptographic. */
export function makeSalt(
  nowMs: number,
  rand: () => number = Math.random,
): number {
  const multiplier = BigInt(Math.floor(rand() * 0xffff_ffff) + 1);
  const value = BigInt(Math.floor(nowMs / 1000)) * multiplier;
  return Number(value & ((1n << 53n) - 1n));
}

/**
 * Builds the typed-data fields for a marketable-limit order.
 *
 * BUY: `makerAmount = shares × price` (USDC), `takerAmount = shares`.
 * SELL is mirrored. Both are 6dp fixed point — the cent rule guarantees
 * `makerAmount` lands on a whole cent for a BUY.
 */
export function buildOrder(p: BuildOrderParams): BuiltOrder {
  const usd6 =
    (BigInt(Math.round(p.shares * 100)) * BigInt(Math.round(p.price * 100)) *
      SCALE) / 10_000n;
  const shares6 = toFixed6(p.shares);
  const [makerAmount, takerAmount] = p.side === 'BUY'
    ? [usd6, shares6]
    : [shares6, usd6];
  const verifyingContract =
    VERIFYING_CONTRACT[p.version][p.negRisk ? 'negRisk' : 'std'];
  return {
    version: p.version,
    domainVersion: String(p.version),
    verifyingContract,
    salt: makeSalt(p.nowMs),
    maker: p.funder,
    signer: p.signerAddress,
    taker: ZERO_ADDRESS,
    tokenId: p.tokenId,
    makerAmount,
    takerAmount,
    side: p.side === 'BUY' ? 0 : 1,
    signatureType: p.signatureType ?? SIG_TYPE_POLY_PROXY,
    timestampMs: p.nowMs,
    expirationSec: p.expirationTime ?? 0,
  };
}

/** EIP-712 signing digest for a built order (V1/V2 struct + the versioned, verifyingContract-scoped domain). */
export function orderDigest(built: BuiltOrder): Uint8Array {
  const domainSep = domainSeparator(
    EXCHANGE_DOMAIN_NAME,
    built.domainVersion,
    POLYGON_CHAIN_ID,
    built.verifyingContract,
  );
  const token = uintWord(BigInt(built.tokenId));
  const structHash = built.version === 1
    ? hashStruct(ORDER_TYPE_V1, [
      uintWord(BigInt(built.salt)),
      addressWord(built.maker),
      addressWord(built.signer),
      // `built.taker`, not a hardcoded ZERO_ADDRESS — `orderWireJson`
      // serializes `built.taker` for V1, so signing anything else would
      // silently disagree with the payload the venue verifies against the
      // moment a non-public (non-zero) taker is ever supported.
      addressWord(built.taker),
      token,
      uintWord(built.makerAmount),
      uintWord(built.takerAmount),
      uintWord(BigInt(built.expirationSec)), // expiration — 0 for GTC/FOK/FAK, unchanged from before
      uintWord(0n), // nonce
      uintWord(0n), // feeRateBps
      uintWord(BigInt(built.side)),
      uintWord(BigInt(built.signatureType)),
    ])
    : hashStruct(ORDER_TYPE_V2, [
      uintWord(BigInt(built.salt)),
      addressWord(built.maker),
      addressWord(built.signer),
      token,
      uintWord(built.makerAmount),
      uintWord(built.takerAmount),
      uintWord(BigInt(built.side)),
      uintWord(BigInt(built.signatureType)),
      uintWord(BigInt(built.timestampMs)),
      bytes32Word(ZERO_BYTES32_RAW), // metadata
      bytes32Word(ZERO_BYTES32_RAW), // builder
    ]);
  return typedDataDigest(domainSep, structHash);
}

/** Signs a built order; returns the 65-byte `r‖s‖v` hex signature. */
export function signOrder(
  signer: PolymarketSigner,
  built: BuiltOrder,
): `0x${string}` {
  return signer.signDigest(orderDigest(built));
}

/**
 * Serializes a built order (plus its signature) to the wire JSON the CLOB
 * expects: `salt` as a JSON NUMBER, addresses as hex, `uint256`s as
 * DECIMAL STRINGS, `side` as `"BUY"`/`"SELL"`, `signatureType` numeric. V1
 * carries `taker`/`nonce`/`feeRateBps` plus `expiration` inside (part of
 * its SIGNED struct — see {@link orderDigest}); V2 carries
 * `timestamp`/`metadata`/`builder`, and `expiration` travels only on the
 * OUTER payload (not signed over — V2's EIP-712 type has no `expiration`
 * field at all). Both default to `"0"` (never) unless
 * {@link BuildOrderParams.expirationTime} was set, i.e. a `GTD` order.
 */
export function orderWireJson(
  built: BuiltOrder,
  signature: string,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    salt: built.salt,
    maker: built.maker,
    signer: built.signer,
    tokenId: built.tokenId,
    makerAmount: built.makerAmount.toString(),
    takerAmount: built.takerAmount.toString(),
    side: built.side === 0 ? 'BUY' : 'SELL',
    signatureType: built.signatureType,
    signature,
  };
  if (built.version === 1) {
    return {
      ...base,
      taker: built.taker,
      expiration: String(built.expirationSec),
      nonce: '0',
      feeRateBps: '0',
    };
  }
  return {
    ...base,
    expiration: String(built.expirationSec),
    timestamp: String(built.timestampMs),
    metadata: ZERO_BYTES32,
    builder: ZERO_BYTES32,
  };
}
