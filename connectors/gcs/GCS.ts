import {
  type ResponseBody,
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerRequestOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
  RESTlerTimeoutError,
} from '@restler';
import { RESTlerRateLimitError } from '@restler/errors';
import type { EventOptionKeys } from '@utils';
import { issueJWT } from '@crypt';
import { type BaseGuardian, Guardian, GuardianError } from '@guardian';
import {
  ErrorEnvelopeSchemaObject,
  ListObjectsResponseSchemaObject,
  type ObjectSchema,
  ObjectSchemaObject,
} from './schema/mod.ts';
import { GCSError, type GCSErrorCode } from './errors/mod.ts';

/** Metadata-operations base URL: bucket/object CRUD and listing. */
const GCS_METADATA_BASE_URL = 'https://storage.googleapis.com/storage/v1';
/**
 * Upload base URL. Distinct from {@link GCS_METADATA_BASE_URL} — GCS serves
 * uploads from a separate `/upload/` path — so `putObject` overrides the
 * per-request `baseURL` rather than using the client's default.
 */
const GCS_UPLOAD_BASE_URL = 'https://storage.googleapis.com/upload/storage/v1';
/** OAuth2 token endpoint used to exchange a signed JWT for an access token. */
const GCS_TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Default OAuth scope requested for service-account (CUSTOM) auth. */
const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/devstorage.full_control';
/** Lifetime of a signed service-account JWT assertion, in seconds. */
const JWT_LIFETIME_SECONDS = 3600;
/**
 * How long before its documented expiry a cached access token is treated as
 * stale and refreshed. Keeps a request from racing a token that expires
 * mid-flight.
 */
const TOKEN_REFRESH_SKEW_SECONDS = 60;

/**
 * Normalise the accepted {@link PutObjectOptions.body} shapes to a `Blob`.
 *
 * A plain `Uint8Array` view is passed through with an `as BlobPart` cast
 * rather than copied: some TypeScript DOM lib versions type the bare
 * `Uint8Array` alias as `Uint8Array<ArrayBufferLike>` (which also covers
 * `SharedArrayBuffer`-backed views), which the `BlobPart` type doesn't
 * accept even though every runtime's `Blob` constructor accepts any
 * `ArrayBufferView` at runtime — the cast resolves the type-only mismatch
 * without copying the underlying bytes. Mirrors the identical cast in
 * `s3/S3.ts`'s `__toBlob` and `azure-blob/AzureBlob.ts`'s `putObject`.
 */
function toBlob(body: Blob | Uint8Array | ArrayBuffer | string): Blob {
  if (body instanceof Blob) return body;
  if (typeof body === 'string' || body instanceof ArrayBuffer) {
    return new Blob([body]);
  }
  return new Blob([body as BlobPart]);
}

/**
 * Every non-final chunk of a resumable upload must be a multiple of this
 * (256 KiB) — GCS rejects the chunk otherwise.
 */
export const RESUMABLE_CHUNK_MULTIPLE = 256 * 1024;
/** Default chunk size for {@link GCS.putObjectStream}: 8 MiB. */
export const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;

/**
 * Re-chunks a byte stream into exact `size`-byte blocks (the last one may
 * be shorter), regardless of how the source happens to be chunked. Holds
 * at most `size` bytes plus one source chunk in memory.
 *
 * On normal completion the source is fully consumed and only the reader
 * lock is released. When the generator is abandoned early (the consumer
 * threw, or called `return()`), the source is also **cancelled** — a
 * partially consumed stream left open keeps its underlying resource (a
 * file handle, a socket) alive until GC. The cancel is best-effort and
 * never masks the consumer's own error.
 */
async function* chunked(
  source: ReadableStream<Uint8Array>,
  size: number,
): AsyncGenerator<Uint8Array, void, unknown> {
  const reader = source.getReader();
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let completed = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending.push(value);
      pendingBytes += value.byteLength;
      while (pendingBytes >= size) {
        const out = new Uint8Array(size);
        let filled = 0;
        while (filled < size) {
          const head = pending[0]!;
          const take = Math.min(head.byteLength, size - filled);
          out.set(head.subarray(0, take), filled);
          filled += take;
          if (take === head.byteLength) pending.shift();
          else pending[0] = head.subarray(take);
        }
        pendingBytes -= size;
        yield out;
      }
    }
    if (pendingBytes > 0) {
      const out = new Uint8Array(pendingBytes);
      let filled = 0;
      for (const p of pending) {
        out.set(p, filled);
        filled += p.byteLength;
      }
      pending = [];
      yield out;
    }
    completed = true;
  } finally {
    reader.releaseLock();
    if (!completed) {
      await source.cancel(
        new Error('upload abandoned before the source was fully read'),
      )
        .catch(() => {});
    }
  }
}

/**
 * Guardian schema for the OAuth2 token-exchange response
 * (`POST https://oauth2.googleapis.com/token`). Internal to service-account
 * auth — not part of this connect's public schema surface.
 */
const TokenResponseSchemaObject = Guardian.object({
  access_token: Guardian.string().minLength(1),
  expires_in: Guardian.number().positive(),
  token_type: Guardian.string().optional(),
}).passthrough();

/**
 * Maps GCS's documented `error.errors[0].reason` values to this connect's
 * error codes (see
 * https://cloud.google.com/storage/docs/json_api/v1/status-codes). A reason
 * not listed here — or an envelope with no `errors` entries — falls back to
 * a status-code mapping in {@link GCS.__statusToErrorCode}.
 */
const VENDOR_REASON_TO_ERROR_CODE: Record<string, GCSErrorCode> = {
  required: 'INVALID_REQUEST',
  invalid: 'INVALID_REQUEST',
  invalidParameter: 'INVALID_REQUEST',
  authError: 'AUTH_ERROR',
  forbidden: 'FORBIDDEN',
  insufficientPermissions: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  conflict: 'CONFLICT',
  'usageLimits.rateLimitExceeded': 'RATE_LIMIT_EXCEEDED',
  backendError: 'BACKEND_ERROR',
  internalError: 'BACKEND_ERROR',
};

/** HTTP Bearer auth — caller supplies an already-obtained OAuth2 access token. */
export type GCSBearerAuth = {
  type: 'BEARER';
  /** OAuth2 access token (e.g. from `gcloud auth print-access-token`). */
  token: string;
  /** Authorization header scheme prefix. Defaults to `BEARER`. */
  prefix?: string;
};

/**
 * Service-account auth — the connect signs an RS256 JWT and exchanges it
 * for a short-lived access token, caching it until near expiry.
 */
export type GCSServiceAccountAuth = {
  type: 'CUSTOM';
  /** Service account's `client_email`, from its downloaded JSON key. */
  clientEmail: string;
  /** Service account's `private_key` (PKCS8 PEM), from its JSON key. */
  privateKey: string;
  /**
   * Space-delimited OAuth scopes to request.
   * @default 'https://www.googleapis.com/auth/devstorage.full_control'
   */
  scope?: string;
};

/**
 * GCS authentication — a Bearer token supplied by the caller, or a service
 * account this connect signs and exchanges for one. `auth` may be omitted
 * entirely for anonymous reads against a public bucket.
 */
export type GCSAuth = GCSBearerAuth | GCSServiceAccountAuth;

/** Options for configuring a {@link GCS} client. */
export type GCSOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link GCSAuth}. Omit for anonymous public-bucket reads. */
  auth?: GCSAuth;
};

/** Options for {@link GCS.putObject}. */
export type PutObjectOptions = {
  /** Name of the bucket to upload to. */
  bucket: string;
  /** Object name (GCS's `name` field — may contain `/`). */
  key: string;
  /** Object data. */
  body: Blob | Uint8Array | ArrayBuffer | string;
  /** MIME type stored as the object's `Content-Type`. */
  contentType?: string;
  /**
   * Custom object metadata. Applied via a follow-up `patch` request after
   * the simple upload completes — see {@link GCS.putObject}.
   */
  metadata?: Record<string, string>;
};

/** Options for {@link GCS.putObjectStream}. */
export type PutObjectStreamOptions = {
  /** Name of the bucket to upload to. */
  bucket: string;
  /** Object name (GCS's `name` field — may contain `/`). */
  key: string;
  /** The data — consumed exactly once, one chunk in memory at a time. */
  body: ReadableStream<Uint8Array> | Blob;
  /** MIME type stored as the object's `Content-Type`. Defaults to `application/octet-stream`. */
  contentType?: string;
  /** Custom object metadata — folded into the resumable session, so no follow-up `patch` is needed. */
  metadata?: Record<string, string>;
  /**
   * Bytes per chunk. Must be a positive multiple of
   * {@link RESUMABLE_CHUNK_MULTIPLE} (256 KiB).
   * @default DEFAULT_CHUNK_SIZE (8 MiB)
   */
  chunkSize?: number;
};

/** Options for {@link GCS.getObjectStream}. */
export type GetObjectStreamOptions = GetObjectOptions & {
  /**
   * Seconds the transfer may stall (no chunk received) before the stream
   * errors; the timer resets on every chunk. Defaults to RESTler's 60 s —
   * raise it for very slow or bursty links.
   */
  idleTimeout?: number;
};

/** Result of {@link GCS.getObjectStream}. */
export type GetObjectStreamResult = {
  /** Unread object bytes — consume or `cancel()` it. */
  body: ReadableStream<Uint8Array>;
  /** Object metadata, fetched first — see {@link GCS.getObjectStream}. */
  metadata: ObjectSchema;
};

/** Options for {@link GCS.getObject} and {@link GCS.headObject}. */
export type GetObjectOptions = {
  /** Name of the bucket containing the object. */
  bucket: string;
  /** Object name. */
  key: string;
};

/** Options for {@link GCS.deleteObject}. */
export type DeleteObjectOptions = {
  /** Name of the bucket containing the object. */
  bucket: string;
  /** Object name. */
  key: string;
};

/** Options for {@link GCS.headObject}. */
export type HeadObjectOptions = GetObjectOptions;

/** Options for {@link GCS.listObjects}. */
export type ListObjectsOptions = {
  /** Name of the bucket to list. */
  bucket: string;
  /** Restrict results to object names starting with this prefix. */
  prefix?: string;
  /** Maximum number of results per page (GCS's `maxResults`). */
  maxKeys?: number;
  /** Opaque pagination token from a previous page's `nextContinuationToken`. */
  continuationToken?: string;
};

/** Result of {@link GCS.getObject}. */
export type GetObjectResult = {
  /** Raw object bytes. */
  body: Blob;
  /** Object metadata, fetched separately — see {@link GCS.getObject}. */
  metadata: ObjectSchema;
};

/** Result of {@link GCS.listObjects}. */
export type ListObjectsResult = {
  /** Matching objects (empty when the bucket/prefix had no matches). */
  objects: ObjectSchema[];
  /** Pass to `listObjects`'s `continuationToken` to fetch the next page. */
  nextContinuationToken?: string;
};

/**
 * GCS client for the Google Cloud Storage JSON API
 *
 * Implements this repository's canonical object-storage interface
 * (`putObject`/`getObject`/`deleteObject`/`listObjects`/`headObject`) over
 * GCS's JSON API. Authenticates either with a caller-supplied OAuth2 Bearer
 * token, or a service account this connect signs into short-lived access
 * tokens itself — see {@link GCSAuth}.
 *
 * @example
 * ```typescript
 * import { GCS } from '@tundraconnect/gcs';
 *
 * // Mode 1 — an already-obtained access token.
 * const client = new GCS({
 *   auth: { type: 'BEARER', token: 'ya29....' },
 * });
 *
 * // Mode 2 — a service account, signed and exchanged automatically.
 * const client2 = new GCS({
 *   auth: {
 *     type: 'CUSTOM',
 *     clientEmail: 'svc@project.iam.gserviceaccount.com',
 *     privateKey: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n',
 *   },
 * });
 *
 * await client.putObject({
 *   bucket: 'my-bucket',
 *   key: 'reports/2024-01.csv',
 *   body: new TextEncoder().encode('a,b,c\n1,2,3\n'),
 *   contentType: 'text/csv',
 * });
 *
 * const { body, metadata } = await client.getObject({
 *   bucket: 'my-bucket',
 *   key: 'reports/2024-01.csv',
 * });
 * console.log(metadata.size, await body.text());
 * ```
 */
export class GCS extends RESTler<GCSOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'GCS';

  /**
   * Cached service-account access tokens, populated by
   * {@link __getAccessToken} and reused until each nears expiry.
   *
   * Keyed by {@link __authIdentity} rather than a single field: `_authInjector`
   * resolves `auth` per-request (`endpoint.auth ?? this._getOption('auth')`,
   * the standard RESTler per-call override pattern), and a single unkeyed
   * cache would hand a token exchanged for one service account (or scope) to
   * a later call resolving a *different* one. This connect's own public
   * methods never supply a per-call `auth` override today, so that path is
   * currently unreachable through them — but a future method (or a
   * subclass) could, and this keeps that latent case from ever silently
   * reusing the wrong identity's token.
   */
  private __tokenCache = new Map<
    string,
    { accessToken: string; expiresAt: number }
  >();

  /**
   * In-flight token-exchange promises, keyed identically to
   * {@link __tokenCache} (see {@link __authIdentity}). RESTler has no
   * request queue/serialization of its own, so N concurrent
   * {@link __getAccessToken} calls that all miss a cold/expired
   * {@link __tokenCache} entry would otherwise each independently redo the
   * PEM import, RSA sign, and network token-exchange for the very same
   * identity. Caching the in-flight `Promise` here the moment an exchange
   * starts lets every concurrent caller for that identity await the SAME
   * exchange instead — see {@link __getAccessToken}.
   */
  private __tokenExchangeInFlight = new Map<
    string,
    Promise<{ accessToken: string; expiresAt: number }>
  >();

  /**
   * Creates a new GCS client instance.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - See {@link GCSAuth}. Omit for anonymous
   * public-bucket reads.
   * @throws {GCSError} `CONFIG_INVALID_AUTH_TYPE` when `auth.type` is
   * neither `BEARER` nor `CUSTOM`; `CONFIG_INVALID_SERVICE_ACCOUNT` when a
   * `CUSTOM` auth is missing `clientEmail`/`privateKey`.
   */
  constructor(options: EventOptionKeys<GCSOptions, RESTlerEvents>) {
    super(options, {
      baseURL: GCS_METADATA_BASE_URL,
      timeout: 30,
      contentType: 'JSON',
    });
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Upload an object via GCS's simple media upload.
   *
   * `POST {uploadBase}/b/{bucket}/o?uploadType=media&name={key}` with the
   * raw body and a `Content-Type` header. Simple/media uploads cannot carry
   * custom object metadata in the same request, so when `options.metadata`
   * is supplied this issues a second `PATCH
   * /storage/v1/b/{bucket}/o/{key}` request immediately after the upload to
   * set it, returning the metadata `patch` response (which reflects the
   * merged metadata) instead of the upload response.
   *
   * These two requests are not atomic (this deliberately stops short of
   * GCS's `uploadType=multipart`, which would fold the metadata into the
   * single upload request — a larger change than this method's contract
   * warrants). If the PATCH fails after the upload has already succeeded,
   * this makes a best-effort compensating `deleteObject` call for the
   * object it just created, so a failed `putObject` doesn't silently leave
   * an orphaned, default-metadata object behind — then re-throws the
   * original PATCH failure regardless of whether that cleanup succeeded.
   *
   * @param options - See {@link PutObjectOptions}.
   * @returns Promise resolving to the created/updated {@link ObjectSchema}.
   * @throws {GCSError} `INVALID_BUCKET`/`INVALID_KEY` when `bucket`/`key`
   * is missing or blank; `INVALID_OBJECT_KEY` when `bucket`/`key` contains
   * a `.`/`..` path segment; otherwise a vendor-mapped code (see
   * {@link __toError}) or `RESPONSE_ERROR` for a malformed success body —
   * including from the metadata PATCH, after the compensating delete
   * described above.
   *
   * @example
   * ```typescript
   * const object = await client.putObject({
   *   bucket: 'my-bucket',
   *   key: 'images/logo.png',
   *   body: pngBytes,
   *   contentType: 'image/png',
   *   metadata: { uploadedBy: 'ci' },
   * });
   * console.log(object.mediaLink);
   * ```
   */
  public async putObject(options: PutObjectOptions): Promise<ObjectSchema> {
    const { bucket, key, body, contentType, metadata } = options;
    this.__requireSafePathSegment(bucket, 'bucket');
    this.__requireSafePathSegment(key, 'key');

    const blob = toBlob(body);
    let created = await this.__requestAndValidate(
      {
        baseURL: GCS_UPLOAD_BASE_URL,
        path: `/b/${encodeURIComponent(bucket)}/o`,
        method: 'POST',
        contentType: 'BLOB',
        payload: blob,
        query: {
          uploadType: 'media',
          name: key,
        },
        headers: {
          'Content-Type': contentType ?? 'application/octet-stream',
        },
      },
      ObjectSchemaObject,
    );

    if (metadata && Object.keys(metadata).length > 0) {
      try {
        created = await this.__requestAndValidate(
          {
            path: this.__objectPath(bucket, key),
            method: 'PATCH',
            contentType: 'JSON',
            payload: { metadata },
          },
          ObjectSchemaObject,
        );
      } catch (patchError) {
        // The simple upload above already succeeded, so leaving this
        // failure as-is would strand a real object in the bucket with
        // default (empty) metadata and no signal to the caller that it's
        // there. Best-effort clean it up — but the caller's primary
        // signal must stay "the metadata update failed", so `patchError`
        // is always what gets re-thrown below: never swallowed, and never
        // replaced by a different error, whether or not the cleanup
        // itself succeeds.
        try {
          await this.deleteObject({ bucket, key });
        } catch (cleanupError) {
          // Don't let a failure here mask `patchError` — catch it
          // separately and, when possible, attach it to the error that's
          // actually thrown so it isn't lost outright.
          if (patchError instanceof GCSError) {
            (patchError.context as Record<string, unknown>).cleanupError =
              cleanupError;
          }
        }
        throw patchError;
      }
    }

    return created;
  }

  /**
   * Download an object's data and metadata.
   *
   * Issues two requests concurrently (`Promise.allSettled` — neither
   * response depends on the other's result, so there's no reason to pay
   * their latency serially): a metadata-only `GET` (see {@link headObject})
   * — so a missing/forbidden object surfaces a proper vendor-mapped
   * {@link GCSError} through the same JSON error-envelope path every other
   * method uses — and a `GET ...?alt=media` for the raw bytes (fetched as a
   * `Blob`, since it isn't JSON). This connect took two requests over
   * reconstructing metadata from the media response's headers: GCS's media
   * response headers don't carry every {@link ObjectSchema} field (e.g.
   * `kind`, `id`, `selfLink`, `timeCreated`), and an error status on the
   * media request itself would arrive as a binary body, without the
   * connect's normal JSON envelope handling.
   *
   * When either request rejects, the metadata request's rejection always
   * wins the race and is what's thrown: it carries the better-quality
   * vendor error described above (a parsed JSON envelope), whereas the
   * media request's own rejection — on the rare error that reaches it
   * despite the object having just been confirmed to exist — would only
   * carry an opaque/binary body. The media request's rejection is only
   * surfaced when metadata succeeded but media failed.
   *
   * @param options - See {@link GetObjectOptions}.
   * @returns Promise resolving to `{ body, metadata }` — see
   * {@link GetObjectResult}.
   * @throws {GCSError} `INVALID_BUCKET`/`INVALID_KEY` when `bucket`/`key`
   * is missing or blank; `INVALID_OBJECT_KEY` when `bucket`/`key` contains
   * a `.`/`..` path segment; `NOT_FOUND` when the object doesn't exist;
   * otherwise a vendor-mapped code (see {@link __toError}) — preferring the
   * metadata request's error over the media request's, as described above.
   *
   * @example
   * ```typescript
   * const { body, metadata } = await client.getObject({
   *   bucket: 'my-bucket',
   *   key: 'images/logo.png',
   * });
   * console.log(metadata.contentType, body.size);
   * ```
   */
  public async getObject(options: GetObjectOptions): Promise<GetObjectResult> {
    const { bucket, key } = options;
    this.__requireSafePathSegment(bucket, 'bucket');
    this.__requireSafePathSegment(key, 'key');

    const [metadataResult, mediaResult] = await Promise.allSettled([
      this.__getObjectMetadata(bucket, key),
      this._makeRequest<Blob>({
        path: this.__objectPath(bucket, key),
        method: 'GET',
        query: { alt: 'media' },
        responseType: 'BLOB',
      }),
    ]);

    // Metadata's rejection wins the race regardless of which request
    // actually rejected first — see the JSDoc above for why its error is
    // always the higher-quality one to surface.
    if (metadataResult.status === 'rejected') {
      throw metadataResult.reason;
    }
    if (mediaResult.status === 'rejected') {
      throw mediaResult.reason;
    }

    return {
      body: mediaResult.value.body ?? new Blob([]),
      metadata: metadataResult.value,
    };
  }

  /**
   * Delete an object.
   *
   * `DELETE /storage/v1/b/{bucket}/o/{key}`. GCS returns an empty 2xx body
   * on success — there is nothing to parse or return.
   *
   * @param options - See {@link DeleteObjectOptions}.
   * @throws {GCSError} `INVALID_BUCKET`/`INVALID_KEY` when `bucket`/`key`
   * is missing or blank; `INVALID_OBJECT_KEY` when `bucket`/`key` contains
   * a `.`/`..` path segment (rejected up front — a `key` of `..`, left
   * unvalidated, would build a path that `path.join` collapses onto GCS's
   * *Delete Bucket* endpoint instead of Delete Object); `NOT_FOUND` when
   * the object doesn't exist; otherwise a vendor-mapped code (see
   * {@link __toError}).
   *
   * @example
   * ```typescript
   * await client.deleteObject({ bucket: 'my-bucket', key: 'tmp/scratch.csv' });
   * ```
   */
  public async deleteObject(options: DeleteObjectOptions): Promise<void> {
    const { bucket, key } = options;
    this.__requireSafePathSegment(bucket, 'bucket');
    this.__requireSafePathSegment(key, 'key');

    await this._makeRequest({
      path: this.__objectPath(bucket, key),
      method: 'DELETE',
    });
  }

  /**
   * List objects in a bucket, optionally narrowed by prefix and paginated.
   *
   * `GET /storage/v1/b/{bucket}/o?prefix=...&maxResults=...&pageToken=...`.
   * GCS omits `items` (rather than returning `[]`) when nothing matches —
   * this normalises that to an empty `objects` array.
   *
   * @param options - See {@link ListObjectsOptions}.
   * @returns Promise resolving to `{ objects, nextContinuationToken }` —
   * see {@link ListObjectsResult}. Pass `nextContinuationToken` back as
   * `continuationToken` to fetch the following page.
   * @throws {GCSError} `INVALID_BUCKET` when `bucket` is missing or blank;
   * `INVALID_OBJECT_KEY` when `bucket` contains a `.`/`..` path segment;
   * otherwise a vendor-mapped code (see {@link __toError}).
   *
   * @example
   * ```typescript
   * const { objects, nextContinuationToken } = await client.listObjects({
   *   bucket: 'my-bucket',
   *   prefix: 'reports/',
   *   maxKeys: 100,
   * });
   * for (const object of objects) console.log(object.name);
   * ```
   */
  public async listObjects(
    options: ListObjectsOptions,
  ): Promise<ListObjectsResult> {
    const { bucket, prefix, maxKeys, continuationToken } = options;
    this.__requireSafePathSegment(bucket, 'bucket');

    // `prefix` (unlike `bucket`/`key`) never becomes a request *path*
    // segment — it's sent as a `?prefix=` query value (see
    // `_processEndpoint`'s `url.searchParams.set`), which the URL API
    // percent-encodes as a whole. It can't collapse a `..`/`.` the way
    // `path.join` does for the path, so it doesn't need the same guard.
    const query: Record<string, string> = {};
    if (prefix !== undefined) query['prefix'] = prefix;
    if (maxKeys !== undefined) query['maxResults'] = String(maxKeys);
    if (continuationToken !== undefined) query['pageToken'] = continuationToken;

    const parsed = await this.__requestAndValidate(
      { path: this.__bucketPath(bucket), method: 'GET', query },
      ListObjectsResponseSchemaObject,
    );

    return {
      objects: parsed.items ?? [],
      nextContinuationToken: parsed.nextPageToken,
    };
  }

  /**
   * Fetch an object's metadata without its data.
   *
   * GCS's JSON API has no genuine HTTP `HEAD` verb for objects (confirmed
   * against the live Discovery document) — this is a thin wrapper around
   * the same metadata-only `GET` that {@link getObject} uses internally
   * (`GET /storage/v1/b/{bucket}/o/{key}`, without `alt=media`).
   *
   * @param options - See {@link HeadObjectOptions}.
   * @returns Promise resolving to {@link ObjectSchema}.
   * @throws {GCSError} `INVALID_BUCKET`/`INVALID_KEY` when `bucket`/`key`
   * is missing or blank; `INVALID_OBJECT_KEY` when `bucket`/`key` contains
   * a `.`/`..` path segment; `NOT_FOUND` when the object doesn't exist;
   * otherwise a vendor-mapped code (see {@link __toError}).
   *
   * @example
   * ```typescript
   * const metadata = await client.headObject({
   *   bucket: 'my-bucket',
   *   key: 'images/logo.png',
   * });
   * console.log(metadata.contentType, metadata.size);
   * ```
   */
  public async headObject(options: HeadObjectOptions): Promise<ObjectSchema> {
    const { bucket, key } = options;
    this.__requireSafePathSegment(bucket, 'bucket');
    this.__requireSafePathSegment(key, 'key');

    return await this.__getObjectMetadata(bucket, key);
  }

  /**
   * Upload a large object from a `ReadableStream<Uint8Array>` (or a
   * `Blob`) via GCS's resumable upload protocol, holding one chunk in
   * memory at a time.
   *
   * `POST {uploadBase}/b/{bucket}/o?uploadType=resumable&name={key}` (with
   * `contentType`/`metadata` as the JSON metadata body, so — unlike
   * {@link putObject} — no follow-up `patch` is needed) returns a session
   * URI in its `Location` header. Each chunk is then `PUT` to that URI
   * with `Content-Range: bytes a-b/*`; GCS answers `308 Resume Incomplete`
   * and echoes what it has persisted in a `Range` header. The final chunk
   * declares the total (`bytes a-b/total`, or `bytes *\/0` for an empty
   * body) and returns the created {@link ObjectSchema}.
   *
   * Why not one streamed `POST`: `fetch` sends a stream body with chunked
   * transfer encoding and no `Content-Length`, which the upload endpoint
   * rejects. Resumable upload is GCS's own answer to large uploads, and
   * each chunk is a bounded `Blob` that RESTler can also retry on a 429.
   *
   * The source is consumed as it goes, so a chunk the server reports as
   * only partially persisted (its `Range` ends short of what was sent)
   * cannot be replayed — that is surfaced as `RESPONSE_ERROR` rather than
   * silently committing a truncated object. On any failure after the
   * session was created, the session is cancelled (`DELETE` to the session
   * URI, which GCS acknowledges with `499`) on a best-effort basis; the
   * original error is re-thrown regardless, with a `cleanupError` context
   * entry if the cancel itself failed.
   *
   * @param options - See {@link PutObjectStreamOptions}.
   * @returns Promise resolving to the created {@link ObjectSchema}.
   * @throws {GCSError} `INVALID_BUCKET`/`INVALID_KEY`/`INVALID_OBJECT_KEY`
   * for a bad target; `CONFIG_INVALID_CHUNK_SIZE` when `chunkSize` isn't a
   * positive multiple of 256 KiB; `RESPONSE_ERROR` when the session
   * response carries no `Location`, an intermediate chunk isn't answered
   * with `308`, the server persisted fewer bytes than were sent, or the
   * final response isn't an Object resource; otherwise a vendor-mapped
   * code (see {@link __toError}).
   *
   * @example
   * ```typescript
   * const file = await Deno.open('backup.tar');
   * const object = await client.putObjectStream({
   *   bucket: 'backups',
   *   key: 'backup.tar',
   *   body: file.readable,
   *   contentType: 'application/x-tar',
   * });
   * console.log(object.size);
   * ```
   */
  public async putObjectStream(
    options: PutObjectStreamOptions,
  ): Promise<ObjectSchema> {
    const { bucket, key, contentType, metadata } = options;
    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    this.__requireSafePathSegment(bucket, 'bucket');
    this.__requireSafePathSegment(key, 'key');
    if (
      !Number.isInteger(chunkSize) || chunkSize <= 0 ||
      chunkSize % RESUMABLE_CHUNK_MULTIPLE !== 0
    ) {
      throw new GCSError('CONFIG_INVALID_CHUNK_SIZE', {
        value: chunkSize,
        multiple: RESUMABLE_CHUNK_MULTIPLE,
      });
    }
    const source = options.body instanceof Blob
      ? options.body.stream()
      : options.body;

    // Open the session. The object's content type and metadata travel with
    // it, so the finished object needs no separate `patch`.
    const resource: Record<string, unknown> = {};
    if (contentType !== undefined) resource.contentType = contentType;
    if (metadata && Object.keys(metadata).length > 0) {
      resource.metadata = metadata;
    }
    const opened = await this._makeRequest({
      baseURL: GCS_UPLOAD_BASE_URL,
      path: `/b/${encodeURIComponent(bucket)}/o`,
      method: 'POST',
      contentType: 'JSON',
      payload: resource,
      query: { uploadType: 'resumable', name: key },
      headers: {
        'X-Upload-Content-Type': contentType ?? 'application/octet-stream',
      },
    });
    const location = opened.headers?.['location'];
    if (!location) {
      throw new GCSError('RESPONSE_ERROR', {
        bucket,
        key,
        reason: 'resumable session response carried no Location header',
      });
    }
    // The session URI is absolute and opaque — split it into the pieces
    // RESTler's endpoint model wants rather than guessing at its shape.
    const session = new URL(location);
    const target = {
      baseURL: session.origin,
      path: session.pathname,
      query: Object.fromEntries(session.searchParams),
    };

    const putChunk = async (
      bytes: Uint8Array,
      contentRange: string,
    ): Promise<RESTlerResponse<unknown>> =>
      await this._makeRequest<unknown>({
        ...target,
        method: 'PUT',
        contentType: 'BLOB',
        payload: new Blob([bytes as BlobPart]),
        headers: { 'Content-Range': contentRange },
      });

    try {
      // One chunk of look-ahead: the last chunk is only known to be last
      // once the source ends, and it alone must declare the total size.
      let offset = 0;
      let held: Uint8Array | undefined;
      for await (const chunk of chunked(source, chunkSize)) {
        if (held) {
          const end = offset + held.byteLength - 1;
          const resp = await putChunk(held, `bytes ${offset}-${end}/*`);
          if (resp.status !== 308) {
            throw new GCSError('RESPONSE_ERROR', {
              bucket,
              key,
              status: resp.status,
              reason: 'expected 308 Resume Incomplete for a non-final chunk',
            });
          }
          const persisted = /^bytes=0-(\d+)$/.exec(
            resp.headers?.['range'] ?? '',
          )
            ?.[1];
          if (persisted !== undefined && Number(persisted) !== end) {
            throw new GCSError('RESPONSE_ERROR', {
              bucket,
              key,
              reason:
                `server persisted bytes 0-${persisted} but 0-${end} were sent — cannot replay a consumed stream`,
            });
          }
          offset += held.byteLength;
        }
        held = chunk;
      }
      const last = held ?? new Uint8Array(0);
      const total = offset + last.byteLength;
      const contentRange = last.byteLength === 0
        ? `bytes */${total}`
        : `bytes ${offset}-${total - 1}/${total}`;
      return await this.__requestAndValidate(
        {
          ...target,
          method: 'PUT',
          contentType: 'BLOB',
          payload: new Blob([last as BlobPart]),
          headers: { 'Content-Range': contentRange },
        },
        ObjectSchemaObject,
      );
    } catch (error) {
      // Best-effort cancel so GCS drops the partial session now rather than
      // holding it for a week. GCS acknowledges a cancel with `499`, which
      // `__toError` (correctly, for every other request) treats as a
      // failure — so that one status is the success case here. The
      // caller's signal must stay the original failure: a genuinely failed
      // cancel is attached to it, never thrown in its place.
      try {
        await this._makeRequest({ ...target, method: 'DELETE' });
      } catch (cleanupError) {
        const cancelled = cleanupError instanceof GCSError &&
          cleanupError.getContextValue('status') === 499;
        if (!cancelled && error instanceof GCSError) {
          (error.context as Record<string, unknown>).cleanupError =
            cleanupError;
        }
      }
      throw error;
    }
  }

  /**
   * Download an object as an unread `ReadableStream<Uint8Array>` plus its
   * metadata.
   *
   * Fetches the metadata first (the same request {@link headObject}
   * makes) — so a missing/forbidden object surfaces the vendor-mapped
   * {@link GCSError} from the JSON envelope before any stream is opened —
   * and only then issues `GET ...?alt=media`, whose body is handed back
   * unread. Unlike {@link getObject}, the two requests run serially: a
   * stream opened concurrently would have to be cancelled whenever the
   * metadata request lost the race, for no latency gain worth that
   * complexity on a transfer that is, by definition, large.
   *
   * Nothing is buffered: the vendor-wide `timeout` bounds only the wait
   * for headers, after which an idle timer that resets on every chunk
   * governs the transfer. **The caller owns the stream** — consume it or
   * `cancel()` it, or the connection stays open.
   *
   * @param options - See {@link GetObjectStreamOptions}.
   * @returns Promise resolving to `{ body, metadata }` — see
   * {@link GetObjectStreamResult}.
   * @throws {GCSError} `INVALID_BUCKET`/`INVALID_KEY`/`INVALID_OBJECT_KEY`
   * for a bad target; `NOT_FOUND` when the object doesn't exist;
   * `RESPONSE_ERROR` when the media response settled with no body stream
   * at all; otherwise a vendor-mapped code (see {@link __toError}).
   *
   * @example
   * ```typescript
   * const { body, metadata } = await client.getObjectStream({
   *   bucket: 'backups',
   *   key: 'backup.tar',
   * });
   * console.log(metadata.size);
   * await body.pipeTo((await Deno.create('backup.tar')).writable);
   * ```
   */
  public async getObjectStream(
    options: GetObjectStreamOptions,
  ): Promise<GetObjectStreamResult> {
    const { bucket, key, idleTimeout } = options;
    this.__requireSafePathSegment(bucket, 'bucket');
    this.__requireSafePathSegment(key, 'key');

    const metadata = await this.__getObjectMetadata(bucket, key);
    const resp = await this._makeStreamRequest({
      path: this.__objectPath(bucket, key),
      method: 'GET',
      query: { alt: 'media' },
    }, { idleTimeout });
    if (!resp.body) {
      // A streamed GET that settled without a body is malformed, not empty
      // — an empty object still yields a stream that closes immediately.
      throw new GCSError('RESPONSE_ERROR', { bucket, key });
    }
    return { body: resp.body, metadata };
  }

  /**
   * Injects a service-account access token for `CUSTOM` auth.
   *
   * `BEARER` auth needs no override — the base {@link _authInjector}
   * already emits `Authorization: Bearer <token>` for it — so this chains
   * to `super()` first (preserving that handling and the base class's
   * auth-config validation) and only acts when the resolved auth is
   * `CUSTOM`: it resolves a cached-or-freshly-exchanged access token via
   * {@link __getAccessToken} and sets it as the request's `Authorization`
   * header.
   *
   * @param endpoint - The per-request endpoint copy to mutate with auth headers.
   * @throws {GCSError} `JWT_SIGNING_FAILED` or `TOKEN_EXCHANGE_FAILED` when
   * a service-account token can't be obtained.
   * @protected
   */
  protected override async _authInjector(
    endpoint: RESTlerEndpoint,
  ): Promise<void> {
    await super._authInjector(endpoint);
    const auth = (endpoint.auth ?? this._getOption('auth')) as
      | GCSAuth
      | undefined;
    if (!auth || auth.type !== 'CUSTOM') return;

    const token = await this.__getAccessToken(auth);
    endpoint.headers = endpoint.headers ?? {};
    endpoint.headers['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Validates the `auth` option's shape at configuration time.
   *
   * `BEARER`'s `token` is already validated by the base class; this adds
   * the GCS-specific checks: `auth.type` must be `BEARER` or `CUSTOM`, and
   * a `CUSTOM` (service-account) auth must carry non-empty
   * `clientEmail`/`privateKey`.
   *
   * @param key - The option key to process.
   * @param value - The option value to process.
   * @returns The processed option value.
   * @throws {GCSError} `CONFIG_INVALID_AUTH_TYPE` or
   * `CONFIG_INVALID_SERVICE_ACCOUNT`.
   * @protected
   */
  protected override _processOption<K extends keyof GCSOptions>(
    key: K,
    value: GCSOptions[K],
  ): GCSOptions[K] {
    if (key === 'auth' && value !== undefined && value !== null) {
      const auth = value as unknown as GCSAuth;
      if (auth.type === 'CUSTOM') {
        if (
          typeof auth.clientEmail !== 'string' || auth.clientEmail.trim() === ''
        ) {
          throw new GCSError('CONFIG_INVALID_SERVICE_ACCOUNT', {
            field: 'clientEmail',
          });
        }
        if (
          typeof auth.privateKey !== 'string' || auth.privateKey.trim() === ''
        ) {
          throw new GCSError('CONFIG_INVALID_SERVICE_ACCOUNT', {
            field: 'privateKey',
          });
        }
      } else if (auth.type !== 'BEARER') {
        throw new GCSError('CONFIG_INVALID_AUTH_TYPE', {
          authType: (auth as { type?: unknown }).type,
        });
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Resolve a valid service-account access token, exchanging a freshly
   * signed JWT only when no cached token exists for `auth`'s identity (see
   * {@link __authIdentity}) or the cached one is within
   * {@link TOKEN_REFRESH_SKEW_SECONDS} of its documented expiry.
   *
   * Single-flighted per identity: when a cold/expired cache is hit, the
   * exchange is registered on {@link __tokenExchangeInFlight} *before*
   * either `await` below runs, so any other call for the same identity that
   * arrives while it's pending finds that entry and awaits the same
   * `Promise` rather than starting its own PEM-import/RSA-sign/network
   * round trip. This works even when several calls happen back-to-back with
   * no `await` between them, because a synchronous function body always
   * runs up to its first genuine suspension point before any later call can
   * observe the map — so the registration is guaranteed to land before the
   * next concurrent caller's lookup. The in-flight entry is cleared once
   * the exchange settles either way: on success the resolved token is also
   * written to {@link __tokenCache} (once, from inside the exchange itself,
   * not by each awaiting caller) so a later non-concurrent call hits the
   * cache; on failure the entry is dropped so the next call retries cleanly
   * instead of a transient failure being cached forever.
   *
   * @throws {GCSError} `JWT_SIGNING_FAILED` or `TOKEN_EXCHANGE_FAILED`.
   * @private
   */
  private async __getAccessToken(
    auth: GCSServiceAccountAuth,
  ): Promise<string> {
    const identity = this.__authIdentity(auth);
    const now = Math.floor(Date.now() / 1000);
    const cached = this.__tokenCache.get(identity);
    if (cached && cached.expiresAt - now > TOKEN_REFRESH_SKEW_SECONDS) {
      return cached.accessToken;
    }

    let exchange = this.__tokenExchangeInFlight.get(identity);
    if (!exchange) {
      exchange = (async () => {
        const assertion = await this.__signServiceAccountJWT(auth);
        const token = await this.__exchangeServiceAccountToken(assertion);
        const entry = {
          accessToken: token.access_token,
          expiresAt: now + token.expires_in,
        };
        this.__tokenCache.set(identity, entry);
        return entry;
      })();
      this.__tokenExchangeInFlight.set(identity, exchange);
      // Detached from the `await exchange` below on purpose: this only
      // clears bookkeeping and must run exactly once regardless of how many
      // callers are awaiting `exchange`, whereas every one of those callers
      // still observes the real resolution/rejection independently through
      // its own `await`. The `.catch(() => {})` exists solely to keep this
      // detached chain from surfacing as an unhandled rejection — it does
      // not swallow the error for anyone else.
      exchange.catch(() => {}).finally(() => {
        if (this.__tokenExchangeInFlight.get(identity) === exchange) {
          this.__tokenExchangeInFlight.delete(identity);
        }
      });
    }

    return (await exchange).accessToken;
  }

  /**
   * Derive a {@link __tokenCache} key identifying which credentials (and
   * requested scope) a token was exchanged for, so a token cached for one
   * `CUSTOM` auth is never handed to a caller resolving a different one.
   *
   * `scope` is included because it changes what the exchanged token is
   * actually authorised to do — the same `clientEmail`/`privateKey` used
   * with two different scopes must not share a cached token either.
   *
   * Encoded with `JSON.stringify` (not simple concatenation) so a
   * `clientEmail`/`privateKey`/`scope` value that happens to contain
   * whatever separator was chosen can't collide two distinct identities
   * onto the same key. This is a plain in-memory `Map` key — held only for
   * this client instance's lifetime, never logged or serialised — not a
   * cryptographic fingerprint, so no hashing is needed for that purpose.
   *
   * @private
   */
  private __authIdentity(auth: GCSServiceAccountAuth): string {
    return JSON.stringify([
      auth.clientEmail,
      auth.privateKey,
      auth.scope ?? DEFAULT_SCOPE,
    ]);
  }

  /**
   * Sign an RS256 JWT assertion for `auth`, entirely via Web Crypto
   * (`crypto.subtle`) — no `node:crypto` — per this repository's
   * runtime-neutrality requirement.
   *
   * @throws {GCSError} `JWT_SIGNING_FAILED` when `privateKey` can't be
   * imported as a PKCS8 RSA key, or signing itself fails.
   * @private
   */
  private async __signServiceAccountJWT(
    auth: GCSServiceAccountAuth,
  ): Promise<string> {
    const iat = Math.floor(Date.now() / 1000);
    const claims = {
      iss: auth.clientEmail,
      scope: auth.scope ?? DEFAULT_SCOPE,
      aud: GCS_TOKEN_URL,
      iat,
      exp: iat + JWT_LIFETIME_SECONDS,
    };
    // `@tundralibs/crypt` builds and signs the RS256 JWT from the PEM
    // directly — header, base64url encoding, PKCS#8 import and
    // RSASSA-PKCS1-v1_5 signing all live there now.
    try {
      return await issueJWT('RS256', claims, auth.privateKey, { typ: 'JWT' });
    } catch (cause) {
      throw new GCSError('JWT_SIGNING_FAILED', {
        clientEmail: auth.clientEmail,
        stage: 'sign',
      }, cause as Error);
    }
  }

  /**
   * Exchange a signed JWT assertion for an OAuth2 access token.
   *
   * Goes through `this._makeRequest` like every other request this client
   * makes, via `options.skipAuth: true` — the one thing a `CUSTOM` auth's
   * own token-fetch needs, since calling `_makeRequest` from inside
   * {@link _authInjector} without it would recurse back into
   * `_authInjector` again before the token exists. RESTler's `'FORM'`
   * content type now branches on payload SHAPE: a `URLSearchParams`
   * payload (below) produces genuine `application/x-www-form-urlencoded`
   * — exactly what the token endpoint requires — rather than the
   * `multipart/form-data` a `FormData` payload would send. This also
   * means the timeout/abort protection, response-body parsing, and error
   * normalisation every other request gets from `_makeRequest` now apply
   * here too, so none of that needs hand-building.
   *
   * The vendor-wide {@link _responseHandler} (`__toError`, set in the
   * constructor) is deliberately NOT used for this call — it maps GCS's
   * object-storage `{ error: { code, message, errors } }` envelope, but
   * the OAuth2 token endpoint sends its own, differently-shaped error body
   * (`{ error: 'invalid_grant', error_description }`) and this method's
   * contract is to always throw `TOKEN_EXCHANGE_FAILED` regardless. A
   * per-call `responseHandler` below overrides the default for this one
   * request and does that status check itself; `responseSchema` validates
   * the token shape on a successful response.
   *
   * @throws {GCSError} `TOKEN_EXCHANGE_FAILED` when the request fails
   * (including timing out), the endpoint responds with a non-2xx status,
   * or the response body doesn't match the documented token shape.
   * @private
   */
  private async __exchangeServiceAccountToken(
    assertion: string,
  ): Promise<{ access_token: string; expires_in: number }> {
    const payload = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });
    // oauth2.googleapis.com, not this client's configured storage-API
    // baseURL — split from the single `GCS_TOKEN_URL` constant (also used
    // for the JWT `aud` claim above) rather than duplicating the host.
    const { origin: baseURL, pathname: path } = new URL(GCS_TOKEN_URL);

    // Captured by `responseHandler` below so a `responseSchema` validation
    // failure can still report the status/body that failed to validate —
    // `RESTlerResponseValidationError`'s own metadata carries only the
    // request, not the response.
    let status: number | null = null;
    let body: unknown;

    try {
      const response = await this._makeRequest(
        {
          baseURL,
          path,
          method: 'POST',
          contentType: 'FORM',
          payload,
        },
        {
          skipAuth: true,
          responseHandler: (resp) => {
            status = resp.status;
            body = resp.body;
            if (status === null || status < 200 || status >= 300) {
              throw new GCSError('TOKEN_EXCHANGE_FAILED', { status, body });
            }
            return resp.body;
          },
          responseSchema: (data) => TokenResponseSchemaObject.parse(data),
        },
      );
      // `RESTlerResponse.body` is typed optional (`body?: T`) generically —
      // `responseSchema` above already guarantees it's set and matches
      // `TokenResponseSchemaObject`'s shape whenever this line is reached.
      return response.body as { access_token: string; expires_in: number };
    } catch (cause) {
      // Already shaped by `responseHandler` above — surface unchanged.
      if (cause instanceof GCSError) {
        throw cause;
      }
      if (cause instanceof RESTlerTimeoutError) {
        throw new GCSError('TOKEN_EXCHANGE_FAILED', {
          status,
          reason: 'timeout',
        }, cause);
      }
      if (cause instanceof RESTlerResponseValidationError) {
        throw new GCSError('TOKEN_EXCHANGE_FAILED', {
          status,
          body,
          responseError: cause.cause instanceof GuardianError
            ? cause.cause.toJSON()
            : undefined,
        }, cause);
      }
      throw new GCSError('TOKEN_EXCHANGE_FAILED', {
        status,
        reason: 'request failed',
      }, cause instanceof Error ? cause : undefined);
    }
  }

  /**
   * Shared metadata-only `GET`, used by both {@link headObject} and
   * {@link getObject} (see the latter's JSDoc for why `getObject` issues
   * this as a separate request rather than reconstructing metadata from
   * the media response's headers).
   *
   * @throws {GCSError} A vendor-mapped code (see {@link __toError}), or
   * `RESPONSE_ERROR` for a malformed success body.
   * @private
   */
  private async __getObjectMetadata(
    bucket: string,
    key: string,
  ): Promise<ObjectSchema> {
    return await this.__requestAndValidate(
      { path: this.__objectPath(bucket, key), method: 'GET' },
      ObjectSchemaObject,
    );
  }

  /** Builds `/b/{bucket}/o/{key}`, percent-encoding both segments. */
  private __objectPath(bucket: string, key: string): string {
    return `${this.__bucketPath(bucket)}/${encodeURIComponent(key)}`;
  }

  /** Builds `/b/{bucket}/o`, percent-encoding the bucket segment. */
  private __bucketPath(bucket: string): string {
    return `/b/${encodeURIComponent(bucket)}/o`;
  }

  /**
   * Guards a required string parameter (`bucket`/`key`) before it's used to
   * build a request path — rejects `undefined`/non-string values, an empty
   * string, and a whitespace-only string (e.g. `'   '`), which `.length`
   * alone would let through.
   *
   * @throws {GCSError} `INVALID_BUCKET` when `field` is `'bucket'` and
   * `value` is missing/blank/whitespace-only; `INVALID_KEY` for the same
   * when `field` is `'key'`.
   * @private
   */
  private __requireNonEmpty(value: string, field: 'bucket' | 'key'): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new GCSError(
        field === 'bucket' ? 'INVALID_BUCKET' : 'INVALID_KEY',
        {
          field,
          value,
        },
      );
    }
  }

  /**
   * Guards a `bucket`/`key` value before it's used to build a request path
   * — required (see {@link __requireNonEmpty}) *and* free of any `.`/`..`
   * path segment.
   *
   * {@link __objectPath}/{@link __bucketPath} percent-encode `bucket`/`key`
   * with `encodeURIComponent`, which leaves a literal `.` or `..` *segment*
   * unchanged — dots aren't URI-reserved. That segment then reaches
   * RESTler's `_processEndpoint`, which resolves the final path with
   * `path.join(url.pathname, endpoint.path)` — the same collapsing a
   * filesystem path does. So an unvalidated `key: '..'` on
   * `DELETE /b/{bucket}/o/{key}` builds `/storage/v1/b/{bucket}/o/..`,
   * which `path.join` collapses to `/storage/v1/b/{bucket}` — GCS's
   * *Delete Bucket* endpoint, not Delete Object — confirmed by direct
   * reproduction against `path.join`. A caller-supplied `key`/`bucket`
   * therefore can reroute the request to a completely different GCS
   * endpoint, and with this connect's default
   * `devstorage.full_control` OAuth scope, that can delete the whole
   * (empty) bucket instead of one object.
   *
   * Rejecting only the literal whole-string `.`/`..` would still leave
   * `foo/../bar` unblocked, so every segment of `value.split('/')` is
   * checked, not just the whole value.
   *
   * @throws {GCSError} `INVALID_BUCKET`/`INVALID_KEY` when `value` is
   * missing/blank/whitespace-only (see {@link __requireNonEmpty});
   * `INVALID_OBJECT_KEY` when any `/`-delimited segment of `value` is `.`
   * or `..`.
   * @private
   */
  private __requireSafePathSegment(
    value: string,
    field: 'bucket' | 'key',
  ): void {
    this.__requireNonEmpty(value, field);
    const segments = value.split('/');
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      throw new GCSError('INVALID_OBJECT_KEY', {
        vendorMessage: `${field} must not contain a "." or ".." path segment`,
        field,
        value,
      });
    }
  }

  /**
   * Single choke point for turning RESTler's `RESTlerRateLimitError` (thrown
   * when `maxRetryWait` is set and the retry was exhausted, or the vendor's
   * hint exceeded the cap) into this connect's own `RATE_LIMIT_EXCEEDED`. Every request
   * path goes through here — including methods whose result comes from
   * response headers and so call `_makeRequest` directly instead of
   * {@link __requestAndValidate}. Rewrapping only inside that helper
   * leaked the raw RESTler error from those methods.
   *
   * `_makeStreamRequest` needs no counterpart: as of
   * `@tundralibs/restler@1.3.0` the stream path never consults
   * `maxRetryWait` — a 429 there goes straight to {@link __toError}, which
   * maps it by status.
   */
  protected override async _makeRequest<H = ResponseBody, B = H>(
    endpoint: RESTlerEndpoint,
    options: RESTlerRequestOptions<H, B> = {},
  ): Promise<RESTlerResponse<B>> {
    try {
      return await super._makeRequest<H, B>(endpoint, options);
    } catch (err) {
      throw this.__rateLimitError(err);
    }
  }

  /**
   * `err` rewrapped as `RATE_LIMIT_EXCEEDED` when it is a `RESTlerRateLimitError` — with
   * the vendor's hint and whether RESTler already waited once — or returned
   * unchanged otherwise.
   */
  private __rateLimitError(err: unknown): unknown {
    if (!(err instanceof RESTlerRateLimitError)) return err;
    return new GCSError('RATE_LIMIT_EXCEEDED', {
      status: 429,
      retryAfterSeconds: err.getContextValue('retryAfter'),
      retried: err.getContextValue('retried'),
    }, err);
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link GCSError} — so `GCSError` stays the only thing a public
   * method throws for "the vendor responded, but the body doesn't match
   * what was expected." `B` is inferred from `guard`, so callers no longer
   * separately write out a `_makeRequest<B>()` type argument.
   *
   * By the time a method calls this, {@link _responseHandler} has already
   * run and thrown for any documented vendor error — this only has to
   * handle a response whose status looked fine but whose body doesn't
   * match what was expected.
   *
   * @template B - The expected response body type.
   * @param endpoint - The endpoint to request.
   * @param guard - Guardian schema object for validating the response.
   * @returns The validated response data.
   * @throws {GCSError} `RESPONSE_ERROR` when the body fails validation.
   * @private
   */

  private async __requestAndValidate<B>(
    endpoint: RESTlerEndpoint,
    guard: BaseGuardian<B>,
  ): Promise<B> {
    try {
      const resp = await this._makeRequest(endpoint, {
        responseSchema: (data) => guard.parse(data),
      });
      return resp.body as B;
    } catch (err) {
      if (err instanceof RESTlerResponseValidationError) {
        throw new GCSError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates GCS's
   * documented `{ error: { code, message, errors: [...] } }` envelope into
   * a {@link GCSError}. Runs on every response (registered on
   * `_responseHandler` in the constructor).
   *
   * Keys the mapping off `error.errors[0].reason`
   * ({@link VENDOR_REASON_TO_ERROR_CODE}), falling back to a status-code
   * mapping ({@link __statusToErrorCode}) when the body isn't the
   * documented JSON envelope — which is expected for an error surfaced by
   * {@link getObject}'s binary (`alt=media`, `responseType: 'BLOB'`)
   * request, whose body is a `Blob` rather than parsed JSON.
   *
   * @param response - The parsed response, before any schema validation.
   * @throws {GCSError} A vendor-mapped or status-mapped code.
   * @private
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status !== null && status < 400) return response.body;

    const body = response.body;
    const canParseEnvelope = body !== undefined && body !== null &&
      typeof body === 'object' && !(body instanceof Blob);

    if (canParseEnvelope) {
      const [err, envelope] = ErrorEnvelopeSchemaObject.safeParse(body);
      if (!err && envelope) {
        const reason = envelope.error.errors?.[0]?.reason;
        const mapped = reason ? VENDOR_REASON_TO_ERROR_CODE[reason] : undefined;
        throw new GCSError(mapped ?? this.__statusToErrorCode(status), {
          status,
          retryAfterSeconds: this._parseRetryAfter(response.headers),
          vendorCode: envelope.error.code,
          vendorMessage: envelope.error.message,
          reason,
        });
      }
    }

    throw new GCSError(this.__statusToErrorCode(status), {
      status,
      retryAfterSeconds: this._parseRetryAfter(response.headers),
      body: body instanceof Blob ? '[binary body]' : body,
      // Status-mapped codes such as INVALID_REQUEST interpolate
      // ${vendorMessage}, which the non-JSON error body cannot supply.
      vendorMessage:
        'no vendor error detail was available (non-JSON error body)',
    });
  }

  /** Fallback status-code-only mapping, used when no vendor envelope is available. */
  private __statusToErrorCode(status: number | null): GCSErrorCode {
    switch (status) {
      case 400:
        return 'INVALID_REQUEST';
      case 401:
        return 'AUTH_ERROR';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 429:
        return 'RATE_LIMIT_EXCEEDED';
      case 500:
      case 502:
      case 503:
      case 504:
        return 'BACKEND_ERROR';
      default:
        return 'SERVICE_UNAVAILABLE';
    }
  }
}
