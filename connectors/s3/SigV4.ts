/**
 * @fileoverview AWS Signature Version 4 (SigV4) request signing, scoped to
 * the `s3` service.
 *
 * Every function here is pure (no I/O, no `Date.now()`) and independently
 * testable — {@link S3.test.ts} does not need to reach any of this: it is
 * verified directly in {@link SigV4.test.ts} against AWS's own published
 * worked examples. `S3.ts`'s `_authInjector` is a thin caller that supplies
 * the endpoint's method/path/query/headers/payload and the configured
 * credentials.
 *
 * Uses only Web Crypto (`crypto.subtle`) and `TextEncoder` — no
 * `node:crypto` — so the same signing math runs unmodified on Deno, Bun,
 * Node, Cloudflare Workers, and in the browser.
 *
 * @module
 */

/** SHA-256 hex digest of an empty string — the `x-amz-content-sha256` value for every body-less request (GET/HEAD/DELETE). */
export const EMPTY_PAYLOAD_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** Sentinel `x-amz-content-sha256` value for a request whose payload is not hashed up front (e.g. a streamed upload). */
export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

/** Credentials a SigV4 signature is computed against. */
export type SigV4Credentials = {
  /** AWS (or S3-compatible) access key id. */
  accessKeyId: string;
  /** AWS (or S3-compatible) secret access key. */
  secretAccessKey: string;
  /** Signing region — `us-east-1` for AWS, `auto` for Cloudflare R2. */
  region: string;
  /** Temporary-credential session token, when present. */
  sessionToken?: string;
};

/** Inputs to {@link signV4} — everything needed to sign one S3 request. */
export type SigV4Params = {
  /** HTTP method, e.g. `GET` / `PUT` / `DELETE` / `HEAD`. */
  method: string;
  /**
   * Already URI-encoded request path (the `CanonicalURI`), e.g.
   * `/test.txt` or `/`. Callers are responsible for producing this with
   * {@link uriEncode} — it is used byte-for-byte, both for the signature
   * and (by the caller) as the literal request path, so the two never
   * diverge.
   */
  canonicalUri: string;
  /** Raw (un-encoded) query parameters, if any. */
  query?: Record<string, string>;
  /**
   * Every header to sign, keyed by their as-sent name (case is
   * normalized internally). Must include `host`, `x-amz-date`, and
   * `x-amz-content-sha256` — SigV4 signs whatever headers are present,
   * so any additional header the caller intends to send (`Content-Type`,
   * `x-amz-meta-*`, `Range`, ...) should already be in this map.
   */
  headers: Record<string, string>;
  /** Lowercase-hex SHA-256 of the payload, or {@link UNSIGNED_PAYLOAD}. */
  payloadHash: string;
  /** Request timestamp — determines `x-amz-date` and the credential scope's date. */
  date: Date;
  /** Signing credentials. */
  credentials: SigV4Credentials;
};

/** Full output of {@link signV4} — the final `Authorization` header plus every intermediate value, for testing and diagnostics. */
export type SigV4Result = {
  /** `YYYYMMDDTHHMMSSZ`, matching the signed `x-amz-date` header value. */
  amzDate: string;
  /** `YYYYMMDD` — the date component of the credential scope. */
  dateStamp: string;
  /** `${dateStamp}/${region}/s3/aws4_request`. */
  credentialScope: string;
  /** The `CanonicalQueryString` component of the canonical request. */
  canonicalQueryString: string;
  /** The `CanonicalHeaders` component of the canonical request (each line `name:value\n`). */
  canonicalHeaders: string;
  /** `;`-joined, sorted, lowercase signed header names. */
  signedHeaders: string;
  /** The full canonical request string that gets SHA-256 hashed. */
  canonicalRequest: string;
  /** The `AWS4-HMAC-SHA256\n...` string that gets HMAC-signed. */
  stringToSign: string;
  /** Lowercase-hex final signature. */
  signature: string;
  /** The complete `Authorization` header value. */
  authorization: string;
};

/**
 * SigV4's stricter-than-`encodeURIComponent` URI-encoding rule: unreserved
 * characters (`A-Z a-z 0-9 - . _ ~`) are left literal, everything else —
 * including space (`%20`, never `+`) and `/` — is percent-encoded with
 * uppercase hex digits.
 *
 * `encodeURIComponent` already does most of this, except it leaves
 * `! ' ( ) *` unescaped where AWS wants them escaped too — the trailing
 * `.replace` fixes exactly that gap.
 *
 * Callers building a path build it segment-by-segment and rejoin with a
 * literal `/` themselves (see {@link S3.ts}'s path builder) — this
 * function always encodes `/`, so it must never be run over a string that
 * already contains an intentional path separator.
 *
 * @param value - The raw (un-encoded) string.
 * @returns The SigV4-canonical percent-encoding of `value`.
 */
export function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/**
 * Builds the `CanonicalQueryString` component: every parameter
 * individually {@link uriEncode}d, sorted by encoded key (ties broken by
 * encoded value), `&`-joined. A parameter with an empty value still emits
 * `key=`. Returns `''` when `query` is absent or empty (also the correct
 * canonical value for a request with no query string).
 *
 * @param query - Raw (un-encoded) query parameters.
 */
export function canonicalQueryString(query?: Record<string, string>): string {
  if (!query) return '';
  const pairs = Object.entries(query).map(
    ([key, value]) => [uriEncode(key), uriEncode(value ?? '')] as const,
  );
  pairs.sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey < bKey) return -1;
    if (aKey > bKey) return 1;
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
  });
  return pairs.map(([key, value]) => `${key}=${value}`).join('&');
}

/**
 * Builds the `CanonicalHeaders` and `SignedHeaders` components: every
 * header name lowercased and its value trimmed with sequential internal
 * whitespace collapsed to a single space (SigV4's documented
 * canonicalization — the value actually SENT keeps its original spacing;
 * only this canonical form collapses, and the server re-derives the same
 * collapsed form from the received header before verifying), sorted
 * alphabetically by lowercase name. `CanonicalHeaders` is `name:value\n`
 * per header (including a trailing `\n` after the last one, per SigV4) —
 * {@link buildCanonicalRequest} relies on that trailing newline to produce
 * the blank-line separator before `SignedHeaders`.
 *
 * @param headers - Every header the caller intends to send and sign.
 */
export function canonicalHeaders(
  headers: Record<string, string>,
): { canonicalHeaders: string; signedHeaders: string } {
  const entries = Object.entries(headers).map(
    ([name, value]) =>
      [name.toLowerCase(), value.replace(/\s+/g, ' ').trim()] as const,
  );
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    canonicalHeaders: entries.map(([name, value]) => `${name}:${value}\n`)
      .join(''),
    signedHeaders: entries.map(([name]) => name).join(';'),
  };
}

/**
 * Assembles the six-line canonical request string:
 * `Method\nCanonicalURI\nCanonicalQueryString\nCanonicalHeaders\nSignedHeaders\nHashedPayload`.
 *
 * `canonicalHeaders` already carries its own trailing `\n` (see
 * {@link canonicalHeaders}), so joining the six parts with `\n` naturally
 * produces the blank line SigV4 requires between the headers block and
 * `SignedHeaders`.
 */
export function buildCanonicalRequest(params: {
  method: string;
  canonicalUri: string;
  canonicalQueryString: string;
  canonicalHeaders: string;
  signedHeaders: string;
  payloadHash: string;
}): string {
  return [
    params.method.toUpperCase(),
    params.canonicalUri,
    params.canonicalQueryString,
    params.canonicalHeaders,
    params.signedHeaders,
    params.payloadHash,
  ].join('\n');
}

/** Formats a {@link Date} as SigV4's `YYYYMMDDTHHMMSSZ` timestamp (always UTC). */
export function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

/** Encodes `input` (UTF-8) if it's a string, otherwise passes the bytes through as-is. */
function toBytes(input: BufferSource | string): BufferSource {
  return typeof input === 'string' ? new TextEncoder().encode(input) : input;
}

/** Lowercase-hex encoding of raw digest/signature bytes. */
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 digest of `data`, as lowercase hex. Web Crypto only — see the module doc. */
export async function sha256Hex(data: BufferSource | string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toBytes(data));
  return toHex(digest);
}

/** HMAC-SHA256 of `data` under `key`, returning the raw signature bytes (chainable into the next HMAC step). */
export async function hmacSha256(
  key: BufferSource,
  data: BufferSource | string,
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, toBytes(data));
}

/**
 * Derives the SigV4 signing key via the documented four-step HMAC chain:
 * `HMAC(HMAC(HMAC(HMAC("AWS4"+secret, date), region), "s3"), "aws4_request")`.
 */
export async function getSignatureKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(
    new TextEncoder().encode('AWS4' + secretAccessKey),
    dateStamp,
  );
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, 's3');
  return await hmacSha256(kService, 'aws4_request');
}

/**
 * Signs one S3 request end-to-end: builds the canonical request, hashes
 * it, derives the signing key, computes the final signature, and formats
 * the `Authorization` header — returning every intermediate value so
 * callers (and tests) can assert on each stage independently.
 *
 * @example
 * ```ts
 * const result = await signV4({
 *   method: 'GET',
 *   canonicalUri: '/test.txt',
 *   headers: {
 *     host: 'examplebucket.s3.amazonaws.com',
 *     'x-amz-date': '20130524T000000Z',
 *     'x-amz-content-sha256': EMPTY_PAYLOAD_SHA256,
 *   },
 *   payloadHash: EMPTY_PAYLOAD_SHA256,
 *   date: new Date('2013-05-24T00:00:00Z'),
 *   credentials: {
 *     accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *     secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
 *     region: 'us-east-1',
 *   },
 * });
 * ```
 */
export async function signV4(params: SigV4Params): Promise<SigV4Result> {
  const amzDate = formatAmzDate(params.date);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope =
    `${dateStamp}/${params.credentials.region}/s3/aws4_request`;

  const qs = canonicalQueryString(params.query);
  const { canonicalHeaders: chBlock, signedHeaders } = canonicalHeaders(
    params.headers,
  );

  const canonicalRequest = buildCanonicalRequest({
    method: params.method,
    canonicalUri: params.canonicalUri,
    canonicalQueryString: qs,
    canonicalHeaders: chBlock,
    signedHeaders,
    payloadHash: params.payloadHash,
  });

  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  const signingKey = await getSignatureKey(
    params.credentials.secretAccessKey,
    dateStamp,
    params.credentials.region,
  );
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${params.credentials.accessKeyId}/${credentialScope},SignedHeaders=${signedHeaders},Signature=${signature}`;

  return {
    amzDate,
    dateStamp,
    credentialScope,
    canonicalQueryString: qs,
    canonicalHeaders: chBlock,
    signedHeaders,
    canonicalRequest,
    stringToSign,
    signature,
    authorization,
  };
}
