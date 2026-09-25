/**
 * @fileoverview Polymarket CLOB L1 (create/derive API key) + L2
 * (per-request HMAC) authentication.
 *
 * Every recipe here is pinned to Polymarket's own vendored-SDK test
 * vectors (the same ones this connect's Rust and TypeScript sibling
 * implementations reproduce byte-for-byte) — see
 * `PolymarketAuth.test.ts`. A single drifted byte anywhere in this file
 * fails those tests; that is the guard that the real-money order path
 * stays wire-correct.
 *
 * The wallet private key never reaches this module — L1 signing goes
 * through a caller-supplied {@link PolymarketSigner}, so this file only
 * ever sees a signer's checksummed address and its `signDigest` output.
 *
 * Uses only Web Crypto (`crypto.subtle`) for the L2 HMAC — the same
 * approach as `connectors/s3/SigV4.ts` — plus `PolymarketEip712.ts` for
 * the L1 EIP-712 struct that gets signed. No `node:crypto`, so this runs
 * unmodified on Deno, Bun, Node, Cloudflare Workers, and in the browser.
 *
 * @module
 */

import {
  addressWord,
  checksumAddress,
  domainSeparator,
  hashStruct,
  stringWord,
  typedDataDigest,
  uintWord,
} from './PolymarketEip712.ts';
import type { PolymarketSigner } from './PolymarketSigner.ts';
import { decodeBase64, encodeBase64 } from '@encoding';

// EIP-712 domain + struct for the L1 "attest control of wallet" signature.
export const CLOB_AUTH_DOMAIN_NAME = 'ClobAuthDomain';
export const CLOB_AUTH_DOMAIN_VERSION = '1';
export const CLOB_AUTH_TYPE =
  'ClobAuth(address address,string timestamp,uint256 nonce,string message)';
export const CLOB_AUTH_MESSAGE =
  'This message attests that I control the given wallet';

/** L2 API credentials, as returned by `/auth/api-key` or `/auth/derive-api-key`. */
export type L2Credentials = {
  /** UUID. */
  apiKey: string;
  /** URL-safe base64 (with or without padding — both accepted). */
  secret: string;
  passphrase: string;
};

/** The five L2 headers, in the exact names the venue expects. */
export type L2Headers = {
  POLY_ADDRESS: string;
  POLY_API_KEY: string;
  POLY_PASSPHRASE: string;
  POLY_SIGNATURE: string;
  POLY_TIMESTAMP: string;
};

/** The four L1 headers, in the exact names the venue expects. */
export type L1Headers = {
  POLY_ADDRESS: string;
  POLY_NONCE: string;
  POLY_SIGNATURE: string;
  POLY_TIMESTAMP: string;
};

/**
 * Canonical HMAC message: `{timestamp}{METHOD}{path}{body}`.
 * - `path` is the URL PATH ONLY — the query string is excluded.
 * - `body` is the exact serialized bytes sent, with every `'` replaced by
 *   `"` (py-clob-client parity; a no-op for `JSON.stringify` output but
 *   applied verbatim to match the SDK).
 *
 * @example
 * ```typescript
 * toMessage(1, 'POST', '/path', '{"foo":"bar"}'); // '1POST/path{"foo":"bar"}'
 * ```
 */
export function toMessage(
  timestampSec: number,
  method: string,
  path: string,
  body: string,
): string {
  return `${timestampSec}${method.toUpperCase()}${path}${
    body.replace(/'/g, '"')
  }`;
}

/** UTF-8 encodes a string into bytes. */
function utf8(value: string): BufferSource {
  return new TextEncoder().encode(value);
}

/**
 * Decodes a URL-safe base64 string, restoring padding first — CLOB
 * secrets have been observed both padded and unpadded. Decoding itself is
 * `@std/encoding`'s `decodeBase64`.
 */
function base64UrlDecode(value: string): BufferSource {
  const standard = value.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = standard.length % 4;
  const padded = remainder === 0
    ? standard
    : standard + '='.repeat(4 - remainder);
  return decodeBase64(padded) as unknown as BufferSource;
}

/**
 * Encodes raw bytes as URL-safe base64 KEEPING the trailing `=` padding —
 * the SDK retains it, so `@std/encoding`'s unpadded `encodeBase64Url` is
 * deliberately not used; standard base64 with the two-character swap is.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * L2 signature = URL-safe base64 (WITH padding) of
 * `HMAC-SHA256(base64url-decode(secret), message)`.
 *
 * @example
 * ```typescript
 * await hmacSign(
 *   'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
 *   '1000000test-sign/orders{"hash":"0x123"}',
 * ); // '4gJVbox-R6XlDK4nlaicig0_ANVL1qdcahiL8CXfXLM='
 * ```
 */
export async function hmacSign(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    base64UrlDecode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, utf8(message));
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Builds the five L2 headers for one authenticated request.
 *
 * `POLY_ADDRESS` is the SIGNER EOA, EIP-55 CHECKSUMMED (differs from L1,
 * which is lowercase — not a typo, both come from the same SDK).
 * `timestampSec` is Unix SECONDS — auth uses seconds everywhere; never
 * pass milliseconds.
 */
export async function buildL2Headers(
  signerAddress: string,
  creds: L2Credentials,
  timestampSec: number,
  method: string,
  path: string,
  body = '',
): Promise<L2Headers> {
  const message = toMessage(timestampSec, method, path, body);
  return {
    POLY_ADDRESS: checksumAddress(signerAddress),
    POLY_API_KEY: creds.apiKey,
    POLY_PASSPHRASE: creds.passphrase,
    POLY_SIGNATURE: await hmacSign(creds.secret, message),
    POLY_TIMESTAMP: String(timestampSec),
  };
}

/**
 * L1 headers: an EIP-712 signature over `ClobAuth` attesting wallet
 * control, used once to `POST /auth/api-key` (create) or
 * `GET /auth/derive-api-key`. `POLY_ADDRESS` is LOWERCASE here.
 * `chainId` is 137 (Polygon) in production, 80002 (Amoy) in the SDK test
 * vector. `timestampSec` and `nonce` are STRINGS in the signed struct
 * (`nonce` is also typed `uint256`, so it is both encoded as a uint word
 * AND rendered as a decimal string on the header).
 */
export function buildL1Headers(
  signer: PolymarketSigner,
  chainId: number,
  timestampSec: number,
  nonce = 0,
): L1Headers {
  const domainSep = domainSeparator(
    CLOB_AUTH_DOMAIN_NAME,
    CLOB_AUTH_DOMAIN_VERSION,
    chainId,
  );
  const structHash = hashStruct(CLOB_AUTH_TYPE, [
    addressWord(signer.address),
    stringWord(String(timestampSec)),
    uintWord(BigInt(nonce)),
    stringWord(CLOB_AUTH_MESSAGE),
  ]);
  const signature = signer.signDigest(typedDataDigest(domainSep, structHash));
  return {
    POLY_ADDRESS: signer.address.toLowerCase(),
    POLY_NONCE: String(nonce),
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: String(timestampSec),
  };
}
