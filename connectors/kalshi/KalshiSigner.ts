/**
 * @fileoverview RSA-PSS-SHA256 request signer for one Kalshi account.
 *
 * Kalshi API v2 signs every authenticated request with RSA-PSS over
 * SHA-256 (MGF1-SHA256, salt length = 32 = the digest length) using the
 * private half of an RSA keypair generated in the account's API-key
 * settings — Kalshi issues PKCS#8 (`-----BEGIN PRIVATE KEY-----`) PEMs.
 *
 * Signing is delegated to `@tundralibs/crypt`'s `signRSA`, whose PSS mode
 * uses exactly that salt length for SHA-256 and returns standard base64 —
 * the form the `KALSHI-ACCESS-SIGNATURE` header carries. No hand-rolled
 * Web Crypto or base64 remains here.
 *
 * The signature is non-deterministic (PSS uses a random salt), so unlike
 * an HMAC it cannot be pinned to one byte-exact golden vector — correctness
 * is proven by a sign -> verify round trip with the matching public key
 * (exactly what Kalshi's server does), plus byte-pinning the signing
 * string itself (see `KalshiAuth.ts`).
 *
 * KEY CUSTODY: the PEM is validated once at construction and held in a
 * true (`#`) private field — not enumerable, not reachable by
 * `JSON.stringify` or generic inspection. It is never logged, never
 * returned by any getter, and never included in a thrown error's message
 * or context. `@tundralibs/crypt` imports it as a non-exportable
 * `CryptoKey` on each signing call.
 *
 * @module
 */

import { signRSA } from '@crypt';

const PEM_BEGIN = '-----BEGIN PRIVATE KEY-----';
const PEM_END = '-----END PRIVATE KEY-----';

/**
 * Validates the STRUCTURE of a `-----BEGIN PRIVATE KEY-----` PEM — the
 * markers and a base64 body — tolerating openssl-style surrounding
 * whitespace. Throws a generic `Error` (never echoing `pem`) on failure.
 *
 * PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`) is deliberately NOT accepted
 * — Kalshi's API-key UI only ever issues PKCS#8.
 */
function validatePkcs8Pem(pem: string): void {
  const begin = pem.indexOf(PEM_BEGIN);
  const end = pem.indexOf(PEM_END);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      'invalid RSA private key PEM (expected a PKCS#8 "-----BEGIN PRIVATE KEY-----" block)',
    );
  }
  const body = pem.slice(begin + PEM_BEGIN.length, end).replace(/\s+/g, '');
  if (body.length === 0 || !/^[A-Za-z0-9+/]+=*$/.test(body)) {
    throw new Error('invalid RSA private key PEM (body is not valid base64)');
  }
}

/**
 * Signs Kalshi request strings with one account's RSA private key. Never
 * exposes or logs key material — see this module's KEY CUSTODY note.
 */
export class KalshiSigner {
  readonly #pem: string;

  /**
   * @param privateKeyPem - PKCS#8 PEM (`-----BEGIN PRIVATE KEY-----`), the
   * format Kalshi issues from its API-key settings page.
   * @throws {Error} When the PEM's BEGIN/END markers are missing or its
   * body isn't base64. Never echoes `privateKeyPem`. This checks structure
   * only — a structurally valid PEM that isn't actually a valid RSA key
   * fails on the first {@link sign} call.
   */
  constructor(privateKeyPem: string) {
    validatePkcs8Pem(privateKeyPem);
    this.#pem = privateKeyPem;
  }

  /**
   * RSA-PSS-SHA256 signature of `message`, standard (padded) base64 — the
   * form Kalshi expects in the `KALSHI-ACCESS-SIGNATURE` header. PSS's
   * random salt means signing the same message twice yields two different
   * (both valid) signatures — there is no single golden vector to pin.
   *
   * @throws {Error} When the PEM does not decode to a valid RSA private
   * key (surfaced from `@tundralibs/crypt`'s key import).
   */
  public async sign(message: Uint8Array): Promise<string> {
    try {
      return await signRSA(message, this.#pem, {
        scheme: 'PSS',
        hashAlgorithm: 'SHA-256',
      });
    } catch (cause) {
      throw new Error('invalid RSA private key (expected PKCS#8)', { cause });
    }
  }
}
