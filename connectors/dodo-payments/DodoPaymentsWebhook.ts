/**
 * @fileoverview Standard Webhooks signature verification for Dodo
 * Payments webhooks.
 *
 * Dodo implements the [Standard Webhooks](https://standardwebhooks.com/)
 * spec: three headers (`webhook-id`, `webhook-timestamp`,
 * `webhook-signature`) and an HMAC-SHA256 over
 * `{id}.{timestamp}.{rawPayload}`.
 *
 * Uses only Web Crypto (`crypto.subtle`) — the same approach as
 * `connectors/s3/SigV4.ts` — so this runs unmodified on Deno, Bun, Node,
 * Cloudflare Workers and in the browser. No `node:crypto`.
 *
 * SECURITY: this is the only thing standing between your fulfilment logic
 * and an attacker who POSTs a `payment.succeeded` body at your endpoint.
 * Three properties are load-bearing and all three are tested:
 *
 * 1. The signature is compared in CONSTANT TIME. A `===` comparison leaks
 *    how many leading bytes matched, which is enough to forge a signature
 *    byte-by-byte given enough attempts.
 * 2. The timestamp is checked against a tolerance window, so a valid
 *    request captured off the wire can't be replayed indefinitely.
 * 3. The payload is the RAW request body. Re-serializing parsed JSON
 *    (`JSON.stringify(await req.json())`) changes whitespace and key order
 *    and will fail verification for a genuine webhook — and, worse, would
 *    verify a body that isn't the one you go on to act upon.
 *
 * @module
 */

import { DodoPaymentsError } from './errors/mod.ts';

/** Standard Webhooks' recommended replay window, in seconds. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

/** The `whsec_` prefix Standard Webhooks secrets conventionally carry. */
const SECRET_PREFIX = 'whsec_';

/**
 * Anything a runtime might hand you as request headers: a `Headers`
 * instance, or a plain object. Lookup is case-insensitive either way,
 * since HTTP header names are.
 */
export type WebhookHeadersLike =
  | Headers
  | Record<string, string | string[] | undefined>;

/** Arguments to {@link verifyWebhookSignature}. */
export type VerifyWebhookOptions = {
  /**
   * The RAW request body, exactly as received — `await req.text()`, never
   * a re-serialized object. See this module's SECURITY note.
   */
  payload: string;
  /** The incoming request's headers. */
  headers: WebhookHeadersLike;
  /** The endpoint's signing secret from the dashboard, with or without `whsec_`. */
  secret: string;
  /** Replay window in seconds. Defaults to {@link DEFAULT_TOLERANCE_SECONDS}. */
  toleranceSeconds?: number;
  /** Clock override, for tests. Defaults to `Date.now()`. */
  nowMs?: number;
};

/** Case-insensitive single-header lookup across both supported shapes. */
function getHeader(headers: WebhookHeadersLike, name: string): string | null {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return headers.get(name);
  }
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lower) continue;
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }
  return null;
}

/** Decodes a standard base64 string into raw bytes. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encodes raw bytes as standard base64, without any runtime `Buffer`. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Constant-time comparison of two ASCII strings.
 *
 * Returns after examining EVERY byte of `a`, so the time taken does not
 * depend on where the first difference is. Differing lengths short-circuit
 * — the length of a base64 HMAC is fixed and public, so it is not secret.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Imports the signing secret as an HMAC-SHA256 key. */
async function importSecret(secret: string): Promise<CryptoKey> {
  const raw = secret.startsWith(SECRET_PREFIX)
    ? secret.slice(SECRET_PREFIX.length)
    : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64ToBytes(raw);
  } catch (cause) {
    throw new DodoPaymentsError(
      'WEBHOOK_INVALID_SECRET',
      {},
      cause instanceof Error ? cause : undefined,
    );
  }
  return await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * The exact string Standard Webhooks signs: `{id}.{timestamp}.{payload}`.
 *
 * @example
 * ```typescript
 * signedContent('msg_1', '1700000000', '{"a":1}');
 * // 'msg_1.1700000000.{"a":1}'
 * ```
 */
export function signedContent(
  webhookId: string,
  timestamp: string,
  payload: string,
): string {
  return `${webhookId}.${timestamp}.${payload}`;
}

/**
 * Verifies a Dodo webhook's signature and returns the PARSED payload.
 *
 * Returning the parsed body (rather than a boolean) is deliberate: it
 * makes the verified payload the natural thing to act on, so there is no
 * unverified object lying around to reach for by mistake.
 *
 * @throws {DodoPaymentsError} `WEBHOOK_INVALID_HEADERS` when a required
 * header is absent; `WEBHOOK_TIMESTAMP_INVALID` when the timestamp is
 * unparseable or outside the tolerance window;
 * `WEBHOOK_SIGNATURE_INVALID` when no supplied signature matches;
 * `WEBHOOK_INVALID_SECRET` when `secret` isn't valid base64;
 * `RESPONSE_ERROR` when the verified payload isn't JSON.
 *
 * @example
 * ```typescript
 * import { verifyWebhookSignature } from '@tundraconnect/dodo-payments';
 *
 * // In your HTTP handler — note `req.text()`, NOT `req.json()`.
 * const raw = await req.text();
 * const event = await verifyWebhookSignature({
 *   payload: raw,
 *   headers: req.headers,
 *   secret: WEBHOOK_SIGNING_SECRET, // from your runtime's env
 * });
 * // `event` is now trustworthy.
 * ```
 */
export async function verifyWebhookSignature(
  options: VerifyWebhookOptions,
): Promise<unknown> {
  const {
    payload,
    headers,
    secret,
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
    nowMs = Date.now(),
  } = options;

  const id = getHeader(headers, 'webhook-id');
  const timestamp = getHeader(headers, 'webhook-timestamp');
  const signature = getHeader(headers, 'webhook-signature');

  const missing = [
    ['webhook-id', id],
    ['webhook-timestamp', timestamp],
    ['webhook-signature', signature],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new DodoPaymentsError('WEBHOOK_INVALID_HEADERS', {
      reason: `missing ${missing.join(', ')}`,
    });
  }

  const sentAtSec = Number(timestamp);
  if (!Number.isFinite(sentAtSec)) {
    throw new DodoPaymentsError('WEBHOOK_TIMESTAMP_INVALID', {
      reason: `'${timestamp}' is not a Unix timestamp in seconds`,
    });
  }
  const driftSec = Math.abs(nowMs / 1000 - sentAtSec);
  if (driftSec > toleranceSeconds) {
    // Checked in BOTH directions — a future-dated timestamp is just as
    // suspect as a stale one, and only rejecting old ones would let a
    // forged far-future timestamp be replayed indefinitely.
    throw new DodoPaymentsError('WEBHOOK_TIMESTAMP_INVALID', {
      reason: `${
        Math.round(driftSec)
      }s drift exceeds the ${toleranceSeconds}s tolerance`,
    });
  }

  const key = await importSecret(secret);
  const expected = bytesToBase64(
    new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(
          signedContent(id!, timestamp!, payload),
        ) as unknown as BufferSource,
      ),
    ),
  );

  // The header carries a space-delimited list of `v<version>,<signature>`
  // entries — a rotating secret produces more than one, and any single
  // match is a pass. Every candidate is compared in constant time, and the
  // loop deliberately does NOT break early on success.
  let matched = false;
  for (const entry of signature!.split(' ')) {
    const comma = entry.indexOf(',');
    if (comma === -1) continue;
    const version = entry.slice(0, comma);
    if (version !== 'v1') continue;
    if (timingSafeEqual(entry.slice(comma + 1), expected)) matched = true;
  }
  if (!matched) {
    throw new DodoPaymentsError('WEBHOOK_SIGNATURE_INVALID', {});
  }

  try {
    return JSON.parse(payload);
  } catch (cause) {
    throw new DodoPaymentsError(
      'RESPONSE_ERROR',
      {},
      cause instanceof Error ? cause : undefined,
    );
  }
}
