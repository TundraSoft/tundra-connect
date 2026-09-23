/**
 * @fileoverview EIP-712 typed-data hashing primitives for Polymarket's CLOB —
 * domain separator, struct hash, and the final signing digest, plus the
 * small set of encoding helpers (address checksum, EIP-712 `encodeData`
 * words) its two typed-data families need: `ClobAuth` (L1 credential
 * derivation, see {@link PolymarketAuth.ts}) and `Order` (order signing, see
 * {@link PolymarketOrder.ts}).
 *
 * Every function here is pure (no I/O, no clock) and independently
 * testable — `PolymarketEip712.test.ts` verifies each one against
 * Polymarket's own vendored-SDK test vectors (the same vectors this
 * connect's Rust and TypeScript sibling implementations pin against), not
 * against this module's own derivation.
 *
 * Uses `@noble/hashes/sha3.js` for Keccak-256 — Web Crypto has no SHA-3/
 * Keccak support, so this is the one primitive this connect can't get from
 * `crypto.subtle` alone (contrast `connectors/s3/SigV4.ts`, which needs only
 * SHA-256/HMAC and stays on Web Crypto). `@noble/hashes` is pure JS with no
 * runtime-specific APIs, so it runs unmodified on Deno, Bun, Node,
 * Cloudflare Workers, and in the browser — see {@link PolymarketSigner.ts}
 * for the matching secp256k1 signing primitive.
 *
 * @module
 */

import { keccak_256 } from '@noble/hashes/sha3.js';
import { decodeHex, encodeHex } from '@encoding';

/** Keccak-256 digest of `data`, as raw bytes. */
export function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

/** Lowercase-hex encoding of raw bytes, no `0x` prefix. */
export function toHex(bytes: Uint8Array): string {
  return encodeHex(bytes);
}

/**
 * Decodes a `0x`-prefixed (or bare) hex string into raw bytes.
 *
 * @throws {Error} When `hex` has an odd number of digits or contains a
 * non-hex character. The message never echoes `hex` itself — a caller
 * decoding a private key must not risk the key surfacing in a thrown error.
 */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('invalid hex string: odd length or non-hex character');
  }
  // Validated above, so `decodeHex` can never throw here — its own error
  // would echo the offending character, and this function's contract is
  // that a private key passing through it never surfaces in a message.
  return decodeHex(clean);
}

/**
 * EIP-55 checksummed form of a 20-byte address (accepts any-case hex
 * input). Mirror of viem's `getAddress` / ethers' `getAddress`: lowercase
 * the address, keccak256-hash the lowercase hex STRING (not the raw
 * bytes), then uppercase each hex letter whose corresponding nibble in the
 * hash is >= 8.
 *
 * @throws {Error} When `address` is not exactly 20 bytes of hex.
 */
export function checksumAddress(address: string): `0x${string}` {
  const hexPart = (address.startsWith('0x') ? address.slice(2) : address)
    .toLowerCase();
  if (hexPart.length !== 40 || !/^[0-9a-f]+$/.test(hexPart)) {
    throw new Error(`invalid address: ${address}`);
  }
  const hash = keccak256(new TextEncoder().encode(hexPart));
  let out = '0x';
  for (let i = 0; i < hexPart.length; i++) {
    const char = hexPart[i]!;
    const nibble = (hash[i >> 1]! >> (i % 2 === 0 ? 4 : 0)) & 0xf;
    out += /[a-f]/.test(char) && nibble >= 8 ? char.toUpperCase() : char;
  }
  return out as `0x${string}`;
}

/**
 * Parses a `0x`-prefixed address into its 20 raw bytes.
 *
 * @throws {Error} When the decoded value is not exactly 20 bytes.
 */
export function addressBytes(address: string): Uint8Array {
  const bytes = fromHex(address);
  if (bytes.length !== 20) {
    throw new Error(`address is not 20 bytes: ${address}`);
  }
  return bytes;
}

/** Right-aligns `bytes` into a 32-byte big-endian EIP-712 word (left-padded with zero bytes). */
function toWord(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 32) throw new Error('value exceeds 32 bytes');
  const word = new Uint8Array(32);
  word.set(bytes, 32 - bytes.length);
  return word;
}

/** A non-negative `uint256`/`uint8` value as a 32-byte big-endian EIP-712 word. */
export function uintWord(value: bigint): Uint8Array {
  if (value < 0n) throw new Error('uint value cannot be negative');
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  return toWord(fromHex(hex));
}

/** A 20-byte `address` value, right-aligned into a 32-byte EIP-712 word. */
export function addressWord(address: string): Uint8Array {
  return toWord(addressBytes(address));
}

/**
 * A `bytes32` value, passed through unchanged.
 *
 * @throws {Error} When `bytes` is not exactly 32 bytes.
 */
export function bytes32Word(bytes: Uint8Array): Uint8Array {
  if (bytes.length !== 32) throw new Error('value is not 32 bytes');
  return bytes;
}

/** A `string` EIP-712 value — per the spec, a dynamic type contributes its own keccak256 hash, not its raw bytes. */
export function stringWord(value: string): Uint8Array {
  return keccak256(new TextEncoder().encode(value));
}

/** Concatenates byte arrays into one. */
export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * `keccak256(typeHash ‖ encodeData(values))` — EIP-712's `hashStruct`.
 *
 * @param typeString - The full, canonical type signature, e.g.
 * `"ClobAuth(address address,string timestamp,uint256 nonce,string message)"`.
 * Field ORDER here is the on-chain typehash — it must match the struct's
 * declared field order exactly; reordering it independently changes the
 * hash and invalidates every signature.
 * @param values - One pre-encoded 32-byte EIP-712 word per field, in the
 * same order as `typeString` — see {@link uintWord}/{@link addressWord}/
 * {@link stringWord}/{@link bytes32Word}.
 */
export function hashStruct(
  typeString: string,
  values: readonly Uint8Array[],
): Uint8Array {
  const typeHash = keccak256(new TextEncoder().encode(typeString));
  return keccak256(concatBytes(typeHash, ...values));
}

/**
 * EIP-712 domain separator. Polymarket's two typed-data families use
 * different domain shapes: `ClobAuth` (L1 auth, see
 * {@link PolymarketAuth.ts}) has no `verifyingContract`; `Order` (order
 * signing, see {@link PolymarketOrder.ts}) does — omitting
 * `verifyingContract` here switches to the 3-field domain type, matching
 * what a wallet's `signTypedData` derives from the same
 * `{name, version, chainId, verifyingContract?}` object.
 */
export function domainSeparator(
  name: string,
  version: string,
  chainId: number,
  verifyingContract?: string,
): Uint8Array {
  if (verifyingContract === undefined) {
    return hashStruct(
      'EIP712Domain(string name,string version,uint256 chainId)',
      [stringWord(name), stringWord(version), uintWord(BigInt(chainId))],
    );
  }
  return hashStruct(
    'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)',
    [
      stringWord(name),
      stringWord(version),
      uintWord(BigInt(chainId)),
      addressWord(verifyingContract),
    ],
  );
}

/**
 * The final EIP-712 signing digest: `keccak256(0x1901 ‖ domainSeparator ‖
 * structHash)` — what actually gets ECDSA-signed (see
 * {@link PolymarketSigner.ts}'s `signDigest`).
 */
export function typedDataDigest(
  domainSep: Uint8Array,
  structHash: Uint8Array,
): Uint8Array {
  return keccak256(
    concatBytes(Uint8Array.of(0x19, 0x01), domainSep, structHash),
  );
}

/**
 * EIP-191 `personal_sign` digest: `keccak256("\x19Ethereum Signed
 * Message:\n" ‖ decimalByteLength ‖ message)`. Distinct from
 * {@link typedDataDigest} (EIP-712) — used by the Relayer's proxy meta-tx
 * path (see `PolymarketRelayer.ts`), which signs a raw 32-byte struct hash
 * this way rather than as EIP-712 typed data.
 */
export function eip191Digest(message: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(
    `\x19Ethereum Signed Message:\n${message.length}`,
  );
  return keccak256(concatBytes(prefix, message));
}
