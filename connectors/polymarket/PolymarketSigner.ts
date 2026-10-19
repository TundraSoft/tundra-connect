/**
 * @fileoverview Wraps a raw wallet private key for EIP-712 signing.
 * Polymarket's L1 credential derivation and order-signing paths (see
 * `PolymarketAuth.ts` and `PolymarketOrder.ts`) both need a genuine
 * secp256k1 ECDSA signature, which Web Crypto cannot produce — it only
 * implements the NIST P-256/P-384/P-521 curves, not the curve Ethereum
 * (and therefore Polymarket) uses. `@noble/curves` is pure JS with no
 * runtime-specific APIs and RFC6979-deterministic by default (no CSPRNG
 * dependency for signing itself), so this runs unmodified on every runtime
 * this repo targets — see `PolymarketEip712.ts`'s module doc for the same
 * reasoning applied to Keccak-256.
 *
 * KEY CUSTODY: the private key is consumed once at construction and held
 * only as the raw bytes needed to sign; it is never logged, never returned
 * by any getter, and never included in a thrown error's message or
 * context. It is stored in a true (`#`) private class field rather than
 * this repo's usual `__`-prefixed TypeScript-private convention — a
 * TypeScript `private` field is still a normal, enumerable runtime
 * property that generic object inspection or `JSON.stringify` can surface;
 * a `#`-private field cannot be read or enumerated from outside the class
 * at all, which is the stronger guarantee this one field's sensitivity
 * (an irreversible-loss-capable wallet key, unlike a revocable API key)
 * warrants.
 *
 * @module
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import {
  checksumAddress,
  eip191Digest,
  fromHex,
  keccak256,
  toHex,
} from './PolymarketEip712.ts';

/** A `0x`-prefixed, EIP-55 checksummed 20-byte Ethereum address. */
export type Address = `0x${string}`;

/** Derives the checksummed EOA address for `privateKey` (uncompressed pubkey -> keccak256 -> last 20 bytes). */
function deriveAddress(privateKey: Uint8Array): Address {
  const publicKey = secp256k1.getPublicKey(privateKey, false); // uncompressed, 65 bytes: 0x04 ‖ X ‖ Y
  const hash = keccak256(publicKey.slice(1)); // drop the 0x04 prefix before hashing
  return checksumAddress(toHex(hash.slice(12)));
}

/**
 * Signs 32-byte EIP-712 digests with a wallet private key given at
 * construction. Never exposes or logs the key — see this module's KEY
 * CUSTODY note.
 */
export class PolymarketSigner {
  readonly #privateKey: Uint8Array;

  /** Checksummed signer EOA address. Safe to display for operator confirmation. */
  public readonly address: Address;

  /**
   * @param privateKey - 32 bytes of hex, with or without a `0x` prefix,
   * whitespace-tolerant.
   * @throws {Error} When the key is not 32 bytes of valid hex, or is not a
   * valid secp256k1 scalar. The message never echoes the input.
   */
  constructor(privateKey: string) {
    const trimmed = privateKey.trim();
    const hexPart = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (!/^[0-9a-fA-F]{64}$/.test(hexPart)) {
      throw new Error(
        'invalid private key: expected 32 bytes of hex (64 hex chars)',
      );
    }
    const bytes = fromHex(hexPart);
    if (!secp256k1.utils.isValidSecretKey(bytes)) {
      throw new Error('invalid private key: not a valid secp256k1 scalar');
    }
    this.#privateKey = bytes;
    this.address = deriveAddress(bytes);
  }

  /**
   * Ethereum recoverable-ECDSA signature over a 32-byte digest —
   * `0x`-prefixed 65-byte `r‖s‖v` hex, `v ∈ {27, 28}`, the shape a
   * wallet's `signTypedData` emits. `prehash: false` signs `digest`
   * directly rather than hashing it again first — the caller (see
   * {@link PolymarketEip712.ts}'s `typedDataDigest`) has already produced
   * the final EIP-712 digest.
   *
   * @throws {Error} When `digest` is not exactly 32 bytes.
   */
  public signDigest(digest: Uint8Array): `0x${string}` {
    if (digest.length !== 32) {
      throw new Error('digest must be exactly 32 bytes');
    }
    const signed = secp256k1.sign(digest, this.#privateKey, {
      prehash: false,
      format: 'recovered',
    });
    const recovery = signed[0]!;
    const rs = signed.slice(1);
    return `0x${toHex(rs)}${toHex(Uint8Array.of(27 + recovery))}`;
  }

  /**
   * EIP-191 `personal_sign` over `message` — used by the Relayer's proxy
   * meta-tx path (see `PolymarketRelayer.ts`), which signs the 32 RAW
   * BYTES of its struct hash this way rather than as EIP-712 typed data
   * (the hex-string form of the hash is rejected by the relay server).
   *
   * @throws {Error} Never in practice — {@link signDigest} throws only for a
   * non-32-byte digest, and the EIP-191 envelope always yields 32 bytes.
   */
  public signMessage(message: Uint8Array): `0x${string}` {
    return this.signDigest(eip191Digest(message));
  }
}

// ── Caller-supplied signers ────────────────────────────────────────────────

/**
 * A secp256k1 signature as an injected signer may return it: `{ r, s, v }`
 * (`r`/`s` as 32-byte arrays, `0x` hex or bigints; `v` as 0/1 or 27/28), or
 * 65 bytes `r ‖ s ‖ v`.
 */
export type PolymarketRawSignature =
  | {
    r: Uint8Array | string | bigint;
    s: Uint8Array | string | bigint;
    v: number;
  }
  | Uint8Array;

/**
 * Signs for the wallet at `address` without the private key ever entering
 * JavaScript — a native module, an HSM, a remote signer. It receives the
 * final 32-byte digest (EIP-712 or EIP-191, already hashed — sign it as-is,
 * never hash again) and returns the raw secp256k1 signature. Digest
 * construction stays in this connect.
 *
 * @example
 * ```ts ignore
 * const signer: PolymarketExternalSigner = {
 *   address: '0xYourEoa',
 *   signDigest: (digest) => rustSigner.sign(digest), // -> { r, s, v } or 65 bytes
 * };
 * ```
 */
export type PolymarketExternalSigner = {
  /** The signing EOA. Every signature is checked to recover to it. */
  address: string;
  signDigest(digest: Uint8Array): Promise<PolymarketRawSignature>;
};

/**
 * The async signer every signing path in this connect uses — the built-in
 * key ({@link PolymarketSigner}) and an injected
 * {@link PolymarketExternalSigner} both become one of these.
 *
 * @internal
 */
export type DigestSigner = {
  readonly address: Address;
  signDigest(digest: Uint8Array): Promise<`0x${string}`>;
};

const CURVE_N = secp256k1.Point.CURVE().n;

function toBigInt(value: Uint8Array | string | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string') {
    const hex = value.startsWith('0x') ? value.slice(2) : value;
    if (!/^[0-9a-fA-F]{1,64}$/.test(hex)) throw new Error('not 32-byte hex');
    return BigInt(`0x${hex}`);
  }
  if (value.length !== 32) throw new Error('not 32 bytes');
  return BigInt(`0x${toHex(value)}`);
}

const word = (value: bigint): string => value.toString(16).padStart(64, '0');

/**
 * Normalizes an injected signature to the `0x` 65-byte `r‖s‖v` form with
 * low `s` and `v ∈ {27, 28}` — the form {@link PolymarketSigner} emits and
 * the exchange contracts accept.
 *
 * @internal
 */
export function normalizeSignature(raw: PolymarketRawSignature): {
  r: bigint;
  s: bigint;
  recovery: number;
} {
  let r: bigint;
  let s: bigint;
  let v: number;
  if (raw instanceof Uint8Array) {
    if (raw.length !== 65) throw new Error('expected 65 bytes r ‖ s ‖ v');
    r = toBigInt(raw.slice(0, 32));
    s = toBigInt(raw.slice(32, 64));
    v = raw[64]!;
  } else {
    r = toBigInt(raw.r);
    s = toBigInt(raw.s);
    v = raw.v;
  }
  let recovery = v >= 27 ? v - 27 : v;
  if (recovery !== 0 && recovery !== 1) throw new Error(`invalid v: ${v}`);
  if (r <= 0n || r >= CURVE_N || s <= 0n || s >= CURVE_N) {
    throw new Error('r or s out of range');
  }
  if (s > CURVE_N / 2n) {
    s = CURVE_N - s; // canonical low-s; flips the recovery bit
    recovery ^= 1;
  }
  return { r, s, recovery };
}

/** Wraps the built-in key signer in the async {@link DigestSigner} shape. @internal */
export function builtInSigner(signer: PolymarketSigner): DigestSigner {
  return {
    address: signer.address,
    signDigest: (digest) => Promise.resolve(signer.signDigest(digest)),
  };
}

/**
 * Wraps a caller-supplied signer: checksums its address up front, then for
 * every digest normalizes the returned signature and refuses one that does
 * not recover to that address (a wrong key, a double-hashed digest).
 *
 * @throws {Error} When `external.address` is not a valid address.
 * @internal
 */
export function externalSigner(
  external: PolymarketExternalSigner,
): DigestSigner {
  const address = checksumAddress(external.address);
  return {
    address,
    async signDigest(digest) {
      if (digest.length !== 32) {
        throw new Error('digest must be exactly 32 bytes');
      }
      const { r, s, recovery } = normalizeSignature(
        await external.signDigest(digest),
      );
      const recovered = secp256k1.Signature
        .fromBytes(fromHex(word(r) + word(s)), 'compact')
        .addRecoveryBit(recovery)
        .recoverPublicKey(digest)
        .toBytes(false);
      const recoveredAddress = checksumAddress(
        toHex(keccak256(recovered.slice(1)).slice(12)),
      );
      if (recoveredAddress !== address) {
        throw new Error(
          `signature recovers to ${recoveredAddress}, not the signer address ${address}`,
        );
      }
      return `0x${word(r)}${word(s)}${(27 + recovery).toString(16)}`;
    },
  };
}

/** EIP-191 `personal_sign` over `message` with any {@link DigestSigner}. @internal */
export function signMessageWith(
  signer: DigestSigner,
  message: Uint8Array,
): Promise<`0x${string}`> {
  return signer.signDigest(eip191Digest(message));
}
