/**
 * @fileoverview RSA-PSS-SHA256 request signer for one Kalshi account.
 *
 * Kalshi API v2 signs every authenticated request with RSA-PSS over
 * SHA-256 (MGF1-SHA256, salt length = 32 = the digest length) using the
 * private half of an RSA keypair generated in the account's API-key
 * settings — Kalshi issues PKCS#8 (`-----BEGIN PRIVATE KEY-----`) PEMs.
 * Unlike Polymarket's secp256k1/EIP-712 signing (see
 * `../polymarket/PolymarketSigner.ts`), RSA-PSS-SHA256 IS a standard Web
 * Crypto algorithm — no extra dependency needed; this connect stays
 * `@tundralibs`-only, unlike Polymarket.
 *
 * The signature is non-deterministic (PSS uses a random salt), so unlike
 * an HMAC it cannot be pinned to one byte-exact golden vector — correctness
 * is proven by a sign -> verify round trip with the matching public key
 * (exactly what Kalshi's server does), plus byte-pinning the signing
 * string itself (see `KalshiAuth.ts`).
 *
 * KEY CUSTODY: the private key is consumed once at construction (as raw
 * DER bytes) and held only long enough to import a non-extractable
 * `CryptoKey`; it is never logged, never returned by any getter, and
 * never included in a thrown error's message or context.
 *
 * `crypto.subtle.importKey`/`sign` are inherently async, so — unlike
 * `PolymarketSigner`'s fully synchronous construction — this class can
 * only synchronously validate the PEM's STRUCTURE (BEGIN/END markers,
 * valid base64) at construction; the full cryptographic validity of the
 * key is proven lazily, on the first {@link KalshiSigner.sign} call, and
 * cached from then on.
 *
 * @module
 */

/** SHA-256 digest length — Kalshi's (and every common RSA-PSS default's) PSS salt length. */
const PSS_SALT_LENGTH = 32;

const PEM_BEGIN = '-----BEGIN PRIVATE KEY-----';
const PEM_END = '-----END PRIVATE KEY-----';

/** Encodes raw bytes as standard (padded) base64, without any runtime `Buffer`. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Decodes a standard base64 string into raw bytes. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Extracts PKCS#8 DER bytes from a `-----BEGIN PRIVATE KEY-----` PEM,
 * tolerating openssl-style surrounding/interior blank lines and
 * leading/trailing whitespace — only the base64 payload between the
 * markers is read, everything else (including line breaks inside it) is
 * discarded before decoding. Throws a generic `Error` (never echoing
 * `pem`) when the markers are missing or the body isn't valid base64.
 *
 * PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`) is deliberately NOT accepted
 * — Kalshi's API-key UI only ever issues PKCS#8, and `crypto.subtle`
 * cannot import PKCS#1 directly (it would need re-wrapping in a PKCS#8
 * envelope first, complexity this connect doesn't need for a format the
 * vendor never hands out).
 */
function parsePkcs8Pem(pem: string): Uint8Array {
  const begin = pem.indexOf(PEM_BEGIN);
  const end = pem.indexOf(PEM_END);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      'invalid RSA private key PEM (expected a PKCS#8 "-----BEGIN PRIVATE KEY-----" block)',
    );
  }
  const body = pem.slice(begin + PEM_BEGIN.length, end).replace(/\s+/g, '');
  try {
    return base64ToBytes(body);
  } catch (cause) {
    throw new Error('invalid RSA private key PEM (body is not valid base64)', {
      cause: cause instanceof Error ? cause : undefined,
    });
  }
}

/**
 * Signs Kalshi request strings with one account's RSA private key. Never
 * exposes or logs key bytes — see this module's KEY CUSTODY note.
 */
export class KalshiSigner {
  readonly #pkcs8: Uint8Array;
  #keyPromise?: Promise<CryptoKey>;

  /**
   * @param privateKeyPem - PKCS#8 PEM (`-----BEGIN PRIVATE KEY-----`), the
   * format Kalshi issues from its API-key settings page.
   * @throws {Error} When the PEM's BEGIN/END markers are missing or its
   * body isn't valid base64. Never echoes `privateKeyPem`. This checks
   * structure only — a structurally valid PEM that isn't actually a valid
   * RSA key fails later, on the first {@link sign} call (see this
   * module's doc comment for why that can't happen synchronously).
   */
  constructor(privateKeyPem: string) {
    this.#pkcs8 = parsePkcs8Pem(privateKeyPem);
  }

  /**
   * RSA-PSS-SHA256 signature of `message`, standard (padded) base64 — the
   * form Kalshi expects in the `KALSHI-ACCESS-SIGNATURE` header. PSS's
   * random salt means signing the same message twice yields two different
   * (both valid) signatures — there is no single golden vector to pin.
   *
   * @throws {Error} When the PEM does not decode to a valid RSA private
   * key (surfaced from the underlying `crypto.subtle.importKey` call, on
   * whichever `sign` call is first).
   */
  public async sign(message: Uint8Array): Promise<string> {
    const key = await this.#importedKey();
    const signature = await crypto.subtle.sign(
      { name: 'RSA-PSS', saltLength: PSS_SALT_LENGTH },
      key,
      // See PolymarketAuth.ts's base64UrlDecode comment for why this cast
      // is needed: some TypeScript DOM lib versions type a bare
      // `Uint8Array` as `Uint8Array<ArrayBufferLike>`, which `BufferSource`
      // doesn't structurally accept even though every runtime's Web Crypto
      // accepts any `ArrayBufferView` at runtime.
      message as unknown as BufferSource,
    );
    return bytesToBase64(new Uint8Array(signature));
  }

  #importedKey(): Promise<CryptoKey> {
    if (!this.#keyPromise) {
      this.#keyPromise = crypto.subtle.importKey(
        'pkcs8',
        this.#pkcs8 as unknown as BufferSource,
        { name: 'RSA-PSS', hash: 'SHA-256' },
        false,
        ['sign'],
      ).catch((cause) => {
        // Don't cache a permanent failure onto the instance — a garbage
        // key will always fail the same way, but this avoids wedging the
        // signer if `importKey` ever rejects for a transient reason.
        this.#keyPromise = undefined;
        throw new Error('invalid RSA private key (expected PKCS#8)', { cause });
      });
    }
    return this.#keyPromise;
  }
}
