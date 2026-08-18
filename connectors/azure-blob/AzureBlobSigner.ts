/**
 * Azure Blob Storage "Shared Key" (HMAC-SHA256) request signer.
 *
 * Implements the `StringToSign` construction and signature documented at
 * https://learn.microsoft.com/en-us/rest/api/storageservices/authorize-with-shared-key,
 * using only standard Web APIs (`crypto.subtle`, `TextEncoder`, `atob`/
 * `btoa`) so it runs unmodified on Deno, Bun, Node, Cloudflare Workers, and
 * in the browser — see `CONVENTIONS.md`'s "Runtime target" section.
 *
 * Kept independent of `RESTler`/`AzureBlob` so the signing math can be
 * tested directly against Microsoft's published fixtures without spinning
 * up a client or mocking `fetch`.
 *
 * @module
 */

/** Case-insensitive header bag, as assembled on a `RESTlerEndpoint`. */
export type SignableHeaders = Record<string, string>;

/** Input to {@link buildStringToSign} / {@link signSharedKey}. */
export type SharedKeySignInput = {
  /** HTTP verb (e.g. `GET`, `PUT`). Case-insensitive; upper-cased internally. */
  method: string;
  /**
   * The resource path exactly as it will be requested, e.g.
   * `/mycontainer/myblob.txt` — already URI-encoded per segment. This is
   * both signed (via {@link buildCanonicalizedResource}) and later sent as
   * `RESTlerEndpoint.path`, so signature and request must be built from the
   * SAME string.
   */
  path: string;
  /**
   * Query parameters exactly as they will be sent, e.g.
   * `{ comp: 'list', restype: 'container' }`. Values are the raw (decoded)
   * form — the same shape `RESTlerEndpoint.query` expects.
   */
  query?: Record<string, string>;
  /**
   * Every header that will be sent on the request — `Content-Type`,
   * `x-ms-*`, conditional headers, etc. Must be the FINAL set: anything
   * added after signing (there should be nothing) would not be covered by
   * the signature.
   */
  headers?: SignableHeaders;
  /** Azure Storage account name. */
  account: string;
  /** Base64-encoded Shared Key (the storage account's access key). */
  accountKey: string;
  /**
   * Byte length of the request payload, or `0` for a body-less request.
   * RESTler never exposes a real `Content-Length` header (`fetch` computes
   * it), so this is supplied independently purely for the `StringToSign`.
   */
  contentLength: number;
};

/** Result of {@link signSharedKey}. */
export type SharedKeySignResult = {
  /** The exact `StringToSign` that was signed — asserted directly in tests. */
  stringToSign: string;
  /** Base64-encoded HMAC-SHA256 signature. */
  signature: string;
  /** Ready-to-use `Authorization` header value: `SharedKey {account}:{signature}`. */
  authorizationHeader: string;
};

/** Case-insensitive lookup of a single header value; `''` when absent. */
function getHeader(headers: SignableHeaders | undefined, name: string): string {
  if (!headers) return '';
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return '';
}

/**
 * Builds the `CanonicalizedHeaders` component: every `x-ms-*` header
 * (case-insensitive), lower-cased, sorted lexicographically (codepoint
 * order) ascending, internal linear whitespace in values collapsed to a
 * single space, joined as `name:value\n` per header (including a trailing
 * `\n` on the last one).
 */
function buildCanonicalizedHeaders(
  headers: SignableHeaders | undefined,
): string {
  if (!headers) return '';
  const msHeaders = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower.startsWith('x-ms-')) {
      msHeaders.set(lower, value.replace(/\s+/g, ' ').trim());
    }
  }
  return [...msHeaders.keys()]
    .sort()
    .map((key) => `${key}:${msHeaders.get(key)}\n`)
    .join('');
}

/**
 * Builds the `CanonicalizedResource` component: `/{account}{path}`,
 * followed by every query parameter (name lower-cased, sorted ascending;
 * multiple values for the same name sorted and comma-joined), each
 * appended as `\nname:value`.
 *
 * Query names/values are used exactly as supplied — no decoding step runs
 * here. Per {@link SharedKeySignInput.query}'s documented contract they
 * arrive already in raw (decoded) form, the same shape
 * `RESTlerEndpoint.query` expects, so a `decodeURIComponent` call here
 * would double-decode an already-raw value (or throw on one that merely
 * contains a literal, non-escape `%`, e.g. a `prefix` like `'50% off/'`).
 */
function buildCanonicalizedResource(
  account: string,
  path: string,
  query: Record<string, string> | undefined,
): string {
  const resource = `/${account}${path}`;
  if (!query || Object.keys(query).length === 0) return resource;

  const params = new Map<string, string[]>();
  for (const [rawKey, rawValue] of Object.entries(query)) {
    const key = rawKey.toLowerCase();
    const values = params.get(key) ?? [];
    values.push(rawValue);
    params.set(key, values);
  }

  let out = resource;
  for (const key of [...params.keys()].sort()) {
    const values = (params.get(key) ?? []).slice().sort();
    out += `\n${key}:${values.join(',')}`;
  }
  return out;
}

/**
 * Builds the exact `StringToSign` for a Shared Key request. Every line is
 * present even when empty — omitting a line breaks the signature. See
 * https://learn.microsoft.com/en-us/rest/api/storageservices/authorize-with-shared-key#blob-queue-and-file-services-shared-key-authorization.
 *
 * `Date` is always emitted empty: this connect authenticates exclusively
 * via `x-ms-date` (never the plain `Date` header), which is instead picked
 * up by {@link buildCanonicalizedHeaders} as an `x-ms-*` header.
 *
 * @example
 * ```ts
 * import { buildStringToSign } from './AzureBlobSigner.ts';
 *
 * buildStringToSign({
 *   method: 'GET',
 *   path: '/mycontainer/myblob.txt',
 *   account: 'devstoreaccount1',
 *   accountKey: '...',
 *   contentLength: 0,
 *   headers: {
 *     'x-ms-date': 'Tue, 01 Jan 2019 12:00:00 GMT',
 *     'x-ms-version': '2021-08-06',
 *   },
 * });
 * ```
 */
export function buildStringToSign(
  input: Omit<SharedKeySignInput, 'account'> & { account: string },
): string {
  const headers = input.headers ?? {};
  const contentLength = input.contentLength > 0
    ? String(input.contentLength)
    : '';

  const lines = [
    input.method.toUpperCase(),
    getHeader(headers, 'content-encoding'),
    getHeader(headers, 'content-language'),
    contentLength,
    getHeader(headers, 'content-md5'),
    getHeader(headers, 'content-type'),
    '', // Date — always empty; this connect signs with x-ms-date instead.
    getHeader(headers, 'if-modified-since'),
    getHeader(headers, 'if-match'),
    getHeader(headers, 'if-none-match'),
    getHeader(headers, 'if-unmodified-since'),
    getHeader(headers, 'range'),
  ];

  return lines.join('\n') + '\n' +
    buildCanonicalizedHeaders(headers) +
    buildCanonicalizedResource(input.account, input.path, input.query);
}

/** Decode a base64 string (the storage account key) to raw bytes. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode raw bytes (an HMAC digest) as base64. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Signs a request per Azure's Shared Key scheme:
 * `Base64(HMAC-SHA256(UTF8(StringToSign), Base64-decode(accountKey)))`.
 *
 * Web Crypto only (`crypto.subtle`) — no `node:crypto` — per
 * `CONVENTIONS.md`'s runtime-target rule.
 *
 * @throws {DOMException} If `accountKey` is not valid base64 (surfaces from
 * `atob`) or `crypto.subtle.importKey` rejects a malformed key.
 *
 * @example
 * ```ts
 * import { signSharedKey } from './AzureBlobSigner.ts';
 *
 * const { authorizationHeader } = await signSharedKey({
 *   method: 'PUT',
 *   path: '/mycontainer/myblob.txt',
 *   account: 'devstoreaccount1',
 *   accountKey: '...',
 *   contentLength: 11,
 *   headers: {
 *     'Content-Type': 'text/plain; charset=UTF-8',
 *     'x-ms-blob-type': 'BlockBlob',
 *     'x-ms-date': 'Tue, 01 Jan 2019 12:00:00 GMT',
 *     'x-ms-version': '2021-08-06',
 *   },
 * });
 * // authorizationHeader === 'SharedKey devstoreaccount1:...'
 * ```
 */
export async function signSharedKey(
  input: SharedKeySignInput,
): Promise<SharedKeySignResult> {
  const stringToSign = buildStringToSign(input);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(input.accountKey) as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(stringToSign),
  );
  const signature = bytesToBase64(new Uint8Array(signatureBytes));
  return {
    stringToSign,
    signature,
    authorizationHeader: `SharedKey ${input.account}:${signature}`,
  };
}

/**
 * Byte length of a request payload, computed purely for the
 * `StringToSign`'s `Content-Length` line — RESTler never lets a caller set
 * a real `Content-Length` header (`fetch` computes it from the body), so
 * this is derived independently rather than read off any header.
 *
 * Returns `0` for `undefined`/`null` (body-less requests) and for any
 * payload shape not recognised below.
 */
export function payloadByteLength(payload: unknown): number {
  if (payload === undefined || payload === null) return 0;
  if (typeof payload === 'string') {
    return new TextEncoder().encode(payload).length;
  }
  if (payload instanceof Uint8Array) return payload.byteLength;
  if (payload instanceof ArrayBuffer) return payload.byteLength;
  if (typeof Blob !== 'undefined' && payload instanceof Blob) {
    return payload.size;
  }
  return 0;
}
