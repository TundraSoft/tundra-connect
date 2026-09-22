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
    const v = (27 + recovery).toString(16).padStart(2, '0');
    return `0x${toHex(rs)}${v}`;
  }

  /**
   * EIP-191 `personal_sign` over `message` — used by the Relayer's proxy
   * meta-tx path (see `PolymarketRelayer.ts`), which signs the 32 RAW
   * BYTES of its struct hash this way rather than as EIP-712 typed data
   * (the hex-string form of the hash is rejected by the relay server).
   */
  public signMessage(message: Uint8Array): `0x${string}` {
    return this.signDigest(eip191Digest(message));
  }
}
