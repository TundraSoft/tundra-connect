import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerRequestOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import { RESTlerRateLimitError } from '@restler/errors';
import type { EventOptionKeys } from '@utils';
import { encodeBase64 } from '@encoding';
import { type BaseGuardian, GuardianError } from '@guardian';
import {
  type BlobItemSchema,
  ErrorSchemaObject,
  type GetObjectResultSchema,
  GetObjectResultSchemaObject,
  type HeadObjectResultSchema,
  HeadObjectResultSchemaObject,
  ListBlobsResponseSchemaObject,
  type PutObjectResultSchema,
  PutObjectResultSchemaObject,
} from './schema/mod.ts';
import { AzureBlobError, type AzureBlobErrorCode } from './errors/mod.ts';
import { payloadByteLength, signSharedKey } from './AzureBlobSigner.ts';

/** A long-stable, zero-regional-rollout-risk default — see `apiVersion`. */
const DEFAULT_API_VERSION = '2021-08-06';

/**
 * Maps Azure's documented `Code` values (from the XML `<Error>` envelope,
 * or the cheaper `x-ms-error-code` response header) to this connect's
 * error codes. Codes not present here fall back to `RESPONSE_ERROR`. See
 * https://learn.microsoft.com/en-us/rest/api/storageservices/blob-service-error-codes.
 */
const VENDOR_ERROR_CODE_MAP: Record<string, AzureBlobErrorCode> = {
  BlobNotFound: 'BLOB_NOT_FOUND',
  ContainerNotFound: 'CONTAINER_NOT_FOUND',
  BlobAlreadyExists: 'BLOB_ALREADY_EXISTS',
  ContainerAlreadyExists: 'CONTAINER_ALREADY_EXISTS',
  InvalidBlobType: 'INVALID_BLOB_TYPE',
  AuthenticationFailed: 'AUTHENTICATION_FAILED',
  InvalidAuthenticationInfo: 'INVALID_AUTHENTICATION_INFO',
  NoAuthenticationInformation: 'NO_AUTHENTICATION_INFORMATION',
  AccountIsDisabled: 'ACCOUNT_IS_DISABLED',
  MissingRequiredHeader: 'MISSING_REQUIRED_HEADER',
  InvalidHeaderValue: 'INVALID_HEADER_VALUE',
  RequestBodyTooLarge: 'REQUEST_BODY_TOO_LARGE',
  ServerBusy: 'SERVER_BUSY',
  InternalError: 'INTERNAL_ERROR',
};

/**
 * AzureBlob authentication — Shared Key (primary) or a pre-generated SAS
 * token (secondary, pass-through only). `RESTlerAuth`'s `CUSTOM` variant
 * exists exactly for vendors like this one that don't use HTTP Basic/Bearer
 * auth.
 *
 * Exactly one credential is used at request time: when `sasToken` is set it
 * always wins (Shared Key signing is skipped entirely, even if
 * `accountKey` is also present) — `accountKey` is the primary credential,
 * `sasToken` an override for callers who already have one. Supplying
 * neither throws `CONFIG_MISSING_CREDENTIALS`.
 *
 * `sasToken` is a pre-generated SAS **query string**, with or without a
 * leading `?` (either is accepted; the leading `?`, if present, is
 * stripped). This connect only accepts an existing SAS token — it does not
 * generate one.
 */
export type AzureBlobAuth = {
  type: 'CUSTOM';
  /** Azure Storage account name (also used to derive the default `baseURL`). */
  account: string;
  /** Base64-encoded Shared Key. Required unless `sasToken` is supplied. */
  accountKey?: string;
  /** Pre-generated SAS query string (leading `?` optional). Overrides `accountKey` when present. */
  sasToken?: string;
};

/** Options for configuring an {@link AzureBlob} client. */
export type AzureBlobOptions = Omit<RESTlerOptions, 'auth'> & {
  /** Storage account credentials — see {@link AzureBlobAuth}. */
  auth: AzureBlobAuth;
  /**
   * `x-ms-version` sent with every Shared Key request. Defaults to
   * `2021-08-06` — a long-stable version sufficient for all five MVP
   * operations, chosen instead of hard-coding "latest" since Azure's
   * version rollout is region-dependent and continuously advancing.
   */
  apiVersion?: string;
};

/** Options for {@link AzureBlob.putObject}. */
export type PutObjectOptions = {
  /** Container name (Azure's own term is "container"; kept as `bucket` for cross-connect consistency). */
  bucket: string;
  /** Blob name (Azure's own term is "blob"; kept as `key` for cross-connect consistency). May contain `/`. */
  key: string;
  /** Blob content. Non-`Blob` values are wrapped in one before sending. */
  body: Uint8Array | ArrayBuffer | Blob | string;
  /** `Content-Type` to set on the blob. Defaults to a typed `Blob` body's own `.type`; omitted entirely when neither exists (Azure then applies its own default). */
  contentType?: string;
  /** User-defined metadata, sent as one `x-ms-meta-{name}` header per entry. */
  metadata?: Record<string, string>;
};

/** Options for {@link AzureBlob.getObject}. */
export type GetObjectOptions = {
  bucket: string;
  key: string;
};

/** Options for {@link AzureBlob.deleteObject}. */
export type DeleteObjectOptions = {
  bucket: string;
  key: string;
};

/** Options for {@link AzureBlob.headObject}. */
export type HeadObjectOptions = {
  bucket: string;
  key: string;
};

/** Options for {@link AzureBlob.listObjects}. */
export type ListObjectsOptions = {
  bucket: string;
  /** Only return blobs whose name starts with this prefix. */
  prefix?: string;
  /** Maximum number of blobs to return in this page (Azure's `maxresults`). */
  maxKeys?: number;
  /** Opaque continuation token from a previous page's `continuationToken` (Azure's `marker`). */
  continuationToken?: string;
};

/** One entry in a {@link ListObjectsResult}. */
export type ListedObject = {
  key: string;
  lastModified: Date;
  etag: string;
  size: number;
  contentType?: string;
};

/** Result of {@link AzureBlob.listObjects}. */
export type ListObjectsResult = {
  objects: ListedObject[];
  /** Opaque token to pass as `continuationToken` for the next page. Absent when the listing is complete. */
  continuationToken?: string;
  /** Convenience flag — `true` exactly when `continuationToken` is present. */
  isTruncated: boolean;
};

/**
 * AzureBlob client for Azure Blob Storage's REST API
 *
 * Talks to the classic Blob endpoint (`https://{account}.blob.core.windows.net`
 * — not the Data Lake Storage Gen2 `.dfs.core.windows.net` host) and
 * authenticates every request with Shared Key HMAC-SHA256 signing (see
 * {@link AzureBlobAuth}), or passes through a pre-generated SAS token.
 * Exposes the repo's canonical object-storage surface —
 * {@link putObject}, {@link getObject}, {@link deleteObject},
 * {@link listObjects}, {@link headObject} — mapping the public `bucket`/
 * `key` parameter names onto Azure's own "container"/"blob" terms
 * internally.
 *
 * @example
 * ```typescript
 * import { AzureBlob } from '@tundraconnect/azure-blob';
 *
 * const client = new AzureBlob({
 *   auth: {
 *     type: 'CUSTOM',
 *     account: 'myaccount',
 *     accountKey: 'base64-shared-key',
 *   },
 * });
 *
 * await client.putObject({ bucket: 'my-container', key: 'hello.txt', body: 'hello world' });
 * const { body } = await client.getObject({ bucket: 'my-container', key: 'hello.txt' });
 * const { objects } = await client.listObjects({ bucket: 'my-container' });
 * await client.deleteObject({ bucket: 'my-container', key: 'hello.txt' });
 * ```
 */
/** Default Put Block size for {@link AzureBlob.putObjectStream}: 4 MiB. */
export const DEFAULT_BLOCK_SIZE = 4 * 1024 * 1024;
/** Azure's hard cap on blocks per blob. */
const MAX_BLOCKS = 50_000;

/** Arguments to {@link AzureBlob.putObjectStream}. */
export type PutObjectStreamOptions = {
  bucket: string;
  key: string;
  /** The data — a `ReadableStream` of bytes (the point of this method) or a `Blob`. */
  body: ReadableStream<Uint8Array> | Blob;
  contentType?: string;
  metadata?: Record<string, string>;
  /** Bytes per block. @default DEFAULT_BLOCK_SIZE (4 MiB); Azure allows up to 4000 MiB. */
  blockSize?: number;
};

/** Result of {@link AzureBlob.getObjectStream}. */
export type GetObjectStreamResult = {
  /** The blob's bytes, unread. You OWN this stream: consume or `cancel()` it. */
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: string;
};

/**
 * Reads `source` and yields it in `size`-byte pieces (the last may be
 * shorter). Only one piece is held in memory at a time, which is what
 * makes a multi-gigabyte upload possible without buffering the file.
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

export class AzureBlob extends RESTler<AzureBlobOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'AzureBlob';

  /** Azure Storage account name configured for this client. */
  get account(): string {
    return this._getOption('auth').account;
  }

  /** `x-ms-version` sent with every Shared Key request. */
  get apiVersion(): string {
    return this._getOption('apiVersion') ?? DEFAULT_API_VERSION;
  }

  /**
   * Creates a new AzureBlob client instance
   *
   * Validates `auth` immediately and derives the default `baseURL`
   * (`https://{account}.blob.core.windows.net`) from `auth.account` — pass
   * an explicit `baseURL` to target a local emulator (e.g. Azurite) instead.
   *
   * @param options - Configuration options for the client
   * @param options.auth - `{ type: 'CUSTOM', account, accountKey }` or
   * `{ type: 'CUSTOM', account, sasToken }` — see {@link AzureBlobAuth}
   * @param options.apiVersion - `x-ms-version` override (defaults to `2021-08-06`)
   * @throws {AzureBlobError} `CONFIG_INVALID_ACCOUNT` when `auth` is absent
   * or `auth.account` is missing/empty, or `CONFIG_MISSING_CREDENTIALS`
   * when neither `accountKey` nor `sasToken` is supplied.
   */
  constructor(options: EventOptionKeys<AzureBlobOptions, RESTlerEvents>) {
    // `baseURL` is derived from `auth.account`, so `account` must be read
    // off the raw constructor argument here — before `super()` — rather
    // than through `_processOption`, which only runs once `super()` has
    // started building the option store.
    const auth = options?.auth as Partial<AzureBlobAuth> | undefined;
    const account = typeof auth?.account === 'string'
      ? auth.account.trim()
      : '';
    if (!account) {
      throw new AzureBlobError('CONFIG_INVALID_ACCOUNT', {
        account: auth?.account,
      });
    }
    super(options, {
      baseURL: `https://${account}.blob.core.windows.net`,
      timeout: 30,
      apiVersion: DEFAULT_API_VERSION,
      contentType: 'XML',
    });
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Uploads a blob (Put Blob), always as a `BlockBlob`
   *
   * `Content-Type` and every `x-ms-meta-{name}` header are set directly on
   * the request before it is signed/sent, since they must be part of the
   * Shared Key signature.
   *
   * @param options - See {@link PutObjectOptions}.
   * @returns Promise resolving to the new blob's `etag`/`lastModified`.
   * @throws {AzureBlobError} `INVALID_BUCKET`/`INVALID_KEY` for malformed
   * input; `CONTAINER_NOT_FOUND`, `BLOB_ALREADY_EXISTS`,
   * `AUTHENTICATION_FAILED`, `REQUEST_BODY_TOO_LARGE`, `RESPONSE_ERROR`, or
   * another documented vendor code on failure.
   *
   * @example
   * ```typescript
   * const result = await client.putObject({
   *   bucket: 'my-container',
   *   key: 'photos/cat.png',
   *   body: pngBytes,
   *   contentType: 'image/png',
   *   metadata: { uploadedBy: 'ada' },
   * });
   * console.log(result.etag);
   * ```
   */
  public async putObject(
    options: PutObjectOptions,
  ): Promise<PutObjectResultSchema> {
    const { bucket, key, body, contentType, metadata } = options;
    this.__requireBucketAndKey(bucket, key);

    const headers: Record<string, string> = {
      'x-ms-blob-type': 'BlockBlob',
    };
    if (metadata) {
      for (const [name, value] of Object.entries(metadata)) {
        headers[`x-ms-meta-${name}`] = value;
      }
    }
    // `contentType: 'BLOB'` makes RESTler pass `payload` verbatim to
    // `fetch` with no default `Content-Type` injection of its own (see
    // `_buildBody`'s `BLOB` case) — but `fetch` itself auto-appends a
    // `Content-Type` from a typed `Blob`'s `.type` at `Request`
    // construction, AFTER the signature below is computed. The signed
    // header set must therefore match that wire behavior exactly: an
    // explicit `contentType` always wins (an explicit header suppresses
    // fetch's auto-append); otherwise a typed `Blob` body's own `.type` is
    // promoted to an explicit header, so it is both signed and sent; when
    // neither exists no header is signed — and none is sent either, since
    // an untyped `Blob` (`.type === ''`, which is also what the non-`Blob`
    // wrap below produces) triggers no auto-append.
    const effectiveContentType: string | undefined = contentType ??
      (body instanceof Blob && body.type !== '' ? body.type : undefined);
    if (effectiveContentType) headers['Content-Type'] = effectiveContentType;
    const payload: Blob = body instanceof Blob
      ? body
      : new Blob([body as BlobPart]);

    const resp = await this._makeRequest<unknown>({
      path: this.__blobPath(bucket, key),
      method: 'PUT',
      headers,
      contentType: 'BLOB',
      payload,
    }, this.__ctx({ bucket, key }));

    return this.__parse(resp, PutObjectResultSchemaObject, {
      etag: resp.headers?.['etag'],
      lastModified: resp.headers?.['last-modified'],
    });
  }

  /**
   * Downloads a blob's content and properties (Get Blob)
   *
   * @param options - See {@link GetObjectOptions}.
   * @returns Promise resolving to the blob content plus its properties.
   * @throws {AzureBlobError} `INVALID_BUCKET`/`INVALID_KEY` for malformed
   * input; `BLOB_NOT_FOUND`, `CONTAINER_NOT_FOUND`,
   * `AUTHENTICATION_FAILED`, `RESPONSE_ERROR`, or another documented vendor
   * code on failure.
   *
   * @example
   * ```typescript
   * const { body, contentType } = await client.getObject({ bucket: 'my-container', key: 'hello.txt' });
   * console.log(await body.text(), contentType);
   * ```
   */
  public async getObject(
    options: GetObjectOptions,
  ): Promise<GetObjectResultSchema> {
    const { bucket, key } = options;
    this.__requireBucketAndKey(bucket, key);

    const resp = await this._makeRequest({
      path: this.__blobPath(bucket, key),
      method: 'GET',
      responseType: 'BLOB',
    }, this.__ctx({ bucket, key }));

    const headers = resp.headers ?? {};
    return this.__parse(resp, GetObjectResultSchemaObject, {
      body: resp.body,
      contentType: headers['content-type'],
      contentLength: headers['content-length'],
      etag: headers['etag'],
      lastModified: headers['last-modified'],
      metadata: this.__extractMetadata(headers),
    });
  }

  /**
   * Reads a blob's properties without downloading its content (Get Blob
   * Properties)
   *
   * @param options - See {@link HeadObjectOptions}.
   * @returns Promise resolving to the blob's properties.
   * @throws {AzureBlobError} `INVALID_BUCKET`/`INVALID_KEY` for malformed
   * input; `BLOB_NOT_FOUND`, `CONTAINER_NOT_FOUND`,
   * `AUTHENTICATION_FAILED`, `RESPONSE_ERROR`, or another documented vendor
   * code on failure.
   *
   * @example
   * ```typescript
   * const { contentLength, etag } = await client.headObject({ bucket: 'my-container', key: 'hello.txt' });
   * ```
   */
  public async headObject(
    options: HeadObjectOptions,
  ): Promise<HeadObjectResultSchema> {
    const { bucket, key } = options;
    this.__requireBucketAndKey(bucket, key);

    const resp = await this._makeRequest<unknown>({
      path: this.__blobPath(bucket, key),
      method: 'HEAD',
    }, this.__ctx({ bucket, key }));

    const headers = resp.headers ?? {};
    return this.__parse(resp, HeadObjectResultSchemaObject, {
      contentType: headers['content-type'],
      contentLength: headers['content-length'],
      etag: headers['etag'],
      lastModified: headers['last-modified'],
      metadata: this.__extractMetadata(headers),
    });
  }

  /**
   * Deletes a blob (Delete Blob)
   *
   * Azure responds `202 Accepted` (not `200`/`204`) with no body on
   * success — `_responseHandler` already treats any status below `400` as
   * success, so no extra handling is needed here.
   *
   * @param options - See {@link DeleteObjectOptions}.
   * @throws {AzureBlobError} `INVALID_BUCKET`/`INVALID_KEY` for malformed
   * input; `BLOB_NOT_FOUND`, `CONTAINER_NOT_FOUND`,
   * `AUTHENTICATION_FAILED`, or another documented vendor code on failure.
   *
   * @example
   * ```typescript
   * await client.deleteObject({ bucket: 'my-container', key: 'hello.txt' });
   * ```
   */
  public async deleteObject(options: DeleteObjectOptions): Promise<void> {
    const { bucket, key } = options;
    this.__requireBucketAndKey(bucket, key);

    await this._makeRequest<unknown>({
      path: this.__blobPath(bucket, key),
      method: 'DELETE',
    }, this.__ctx({ bucket, key }));
  }

  /**
   * Lists blobs in a container, one page at a time (List Blobs)
   *
   * `nextMarker` from the vendor response is treated as an opaque token —
   * pass it straight back as `continuationToken` to fetch the next page.
   * An absent `continuationToken` on the result means the listing is
   * complete.
   *
   * @param options - See {@link ListObjectsOptions}.
   * @returns Promise resolving to a page of {@link ListObjectsResult}.
   * @throws {AzureBlobError} `INVALID_BUCKET` for malformed input;
   * `CONTAINER_NOT_FOUND`, `AUTHENTICATION_FAILED`, `RESPONSE_ERROR`, or
   * another documented vendor code on failure.
   *
   * @example
   * ```typescript
   * let token: string | undefined;
   * do {
   *   const page = await client.listObjects({ bucket: 'my-container', continuationToken: token });
   *   for (const obj of page.objects) console.log(obj.key);
   *   token = page.continuationToken;
   * } while (token);
   * ```
   */
  public async listObjects(
    options: ListObjectsOptions,
  ): Promise<ListObjectsResult> {
    const { bucket, prefix, maxKeys, continuationToken } = options;
    this.__requireBucket(bucket);

    const query: Record<string, string> = {
      restype: 'container',
      comp: 'list',
    };
    if (prefix) query.prefix = prefix;
    if (maxKeys !== undefined) query.maxresults = String(maxKeys);
    if (continuationToken) query.marker = continuationToken;

    const parsed = await this.__requestAndValidate(
      { path: `/${encodeURIComponent(bucket)}`, method: 'GET', query },
      ListBlobsResponseSchemaObject,
      { bucket },
    );
    return {
      objects: parsed.blobs.map((blob: BlobItemSchema) => ({
        key: blob.name,
        lastModified: blob.lastModified,
        etag: blob.etag,
        size: blob.contentLength,
        contentType: blob.contentType,
      })),
      continuationToken: parsed.nextMarker,
      isTruncated: parsed.nextMarker !== undefined,
    };
  }

  /**
   * Authenticates every outgoing request
   *
   * Chains to `super()` first (base-class contract for `CUSTOM` auth — see
   * `CONVENTIONS.md`). When `auth.sasToken` is configured, appends its
   * query parameters onto `endpoint.query` and returns — no signing, no
   * `Authorization` header. Otherwise signs with Shared Key: sets
   * `x-ms-date`/`x-ms-version` on `endpoint.headers` (so
   * {@link https://learn.microsoft.com/en-us/rest/api/storageservices/authorize-with-shared-key | CanonicalizedHeaders}
   * picks them up), then signs whatever is already on `endpoint.headers` —
   * which is why every endpoint method above sets `Content-Type`/
   * `x-ms-blob-type`/`x-ms-meta-*` itself before calling `_makeRequest`,
   * rather than relying on RESTler's `contentType` option (that default is
   * injected later, inside `_buildBody`, too late for the signature to
   * cover it).
   *
   * @param endpoint - Per-request endpoint copy to mutate with auth
   * headers/query — see {@link RESTlerEndpoint}.
   */
  protected override async _authInjector(
    endpoint: RESTlerEndpoint,
  ): Promise<void> {
    await super._authInjector(endpoint);
    const auth = (endpoint.auth ?? this._getOption('auth')) as AzureBlobAuth;

    if (auth.sasToken) {
      endpoint.query ??= {};
      const query = endpoint.query;
      for (const [name, value] of new URLSearchParams(auth.sasToken)) {
        query[name] = value;
      }
      return;
    }

    endpoint.headers ??= {};
    const headers = endpoint.headers;
    headers['x-ms-date'] = new Date().toUTCString();
    headers['x-ms-version'] = this.apiVersion;

    const payload = 'payload' in endpoint ? endpoint.payload : undefined;
    const { authorizationHeader } = await signSharedKey({
      method: endpoint.method,
      path: endpoint.path,
      query: endpoint.query,
      headers,
      account: auth.account,
      accountKey: auth.accountKey!,
      contentLength: payloadByteLength(payload),
    });
    headers['Authorization'] = authorizationHeader;
  }

  /**
   * Validates and normalizes configuration options
   *
   * @param key - The option key to process
   * @param value - The option value to process
   * @returns The processed and validated option value
   * @throws {AzureBlobError} `CONFIG_INVALID_ACCOUNT` when `auth.account`
   * is missing/empty, `CONFIG_MISSING_CREDENTIALS` when neither
   * `accountKey` nor `sasToken` is supplied, or `CONFIG_INVALID_API_VERSION`
   * when `apiVersion` is not a non-empty string.
   * @protected
   */
  protected override _processOption<K extends keyof AzureBlobOptions>(
    key: K,
    value: AzureBlobOptions[K],
  ): AzureBlobOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as AzureBlobAuth;
        if (
          !auth || auth.type !== 'CUSTOM' ||
          typeof auth.account !== 'string' || auth.account.trim() === ''
        ) {
          throw new AzureBlobError('CONFIG_INVALID_ACCOUNT', {
            account: auth?.account,
          });
        }
        const account = auth.account.trim();
        const sasToken = typeof auth.sasToken === 'string' &&
            auth.sasToken.trim() !== ''
          ? auth.sasToken.trim().replace(/^\?/, '')
          : undefined;
        const accountKey =
          typeof auth.accountKey === 'string' && auth.accountKey.trim() !== ''
            ? auth.accountKey.trim()
            : undefined;
        if (!sasToken && !accountKey) {
          throw new AzureBlobError('CONFIG_MISSING_CREDENTIALS', { account });
        }
        // `sasToken` wins when both are supplied — see `AzureBlobAuth`'s
        // documented precedence.
        value = {
          type: 'CUSTOM',
          account,
          ...(sasToken ? { sasToken } : { accountKey }),
        } as AzureBlobOptions[K];
        break;
      }
      case 'apiVersion':
        if (typeof value !== 'string' || value.trim() === '') {
          throw new AzureBlobError('CONFIG_INVALID_API_VERSION', {
            apiVersion: value,
          });
        }
        value = value.trim() as AzureBlobOptions[K];
        break;
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Builds the `/{container}/{blob}` path.
   *
   * The blob name is percent-encoded as a single opaque unit — via one
   * `encodeURIComponent` call over the whole key, rather than split on `/`
   * and rejoined with literal separators — so every internal `/` (whether
   * a meaningful virtual-directory delimiter or part of a literal `//`)
   * comes out as `%2F`. Azure decodes `%2F` back to `/` when resolving the
   * target blob either way, but only the opaque form is immune to
   * `RESTler._processEndpoint`'s `path.join`, which collapses a literal
   * `//` (and resolves `.`/`..` segments) — corrupting a key that contains
   * one and, worse, silently diverging from the `CanonicalizedResource`
   * this class already signed in `_authInjector` (which signs this exact
   * same path string, before `path.join` ever runs — see its own
   * `SharedKeySignInput.path` contract: "signature and request must be
   * built from the SAME string"). Percent-encoding away every internal `/`
   * removes the hazard entirely rather than special-casing it — mirrors
   * `s3/S3.ts`'s `_target`, which faces the identical `path.join` hazard.
   */
  private __blobPath(bucket: string, key: string): string {
    return `/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;
  }

  /**
   * @throws {AzureBlobError} `INVALID_BUCKET` when `bucket` is
   * missing/empty; `INVALID_PATH_SEGMENT` when it contains a `.`/`..` path
   * segment — see {@link __requireSafePathSegment}.
   */
  private __requireBucket(bucket: string): void {
    if (typeof bucket !== 'string' || bucket.trim() === '') {
      throw new AzureBlobError('INVALID_BUCKET', { bucket });
    }
    this.__requireSafePathSegment(bucket, 'bucket');
  }

  /**
   * @throws {AzureBlobError} `INVALID_BUCKET`/`INVALID_KEY` when either is
   * missing/empty; `INVALID_PATH_SEGMENT` when either contains a `.`/`..`
   * path segment — see {@link __requireSafePathSegment}.
   */
  private __requireBucketAndKey(bucket: string, key: string): void {
    this.__requireBucket(bucket);
    if (typeof key !== 'string' || key.trim() === '') {
      throw new AzureBlobError('INVALID_KEY', { bucket, key });
    }
    this.__requireSafePathSegment(key, 'key');
  }

  /**
   * Guards a `bucket`/`key` value (already known non-empty — see
   * {@link __requireBucket}/{@link __requireBucketAndKey}) against a
   * `.`/`..` path-traversal segment before it ever reaches
   * {@link __blobPath}.
   *
   * {@link __blobPath} percent-encodes `bucket`/`key` with
   * `encodeURIComponent`, which — like `uriEncode` in `s3/S3.ts` — leaves a
   * literal `.` or `..` *segment* unchanged (dots aren't URI-reserved), and
   * `_authInjector` signs that exact (pre-`path.join`) string as the Shared
   * Key `CanonicalizedResource`. RESTler's `_processEndpoint` then resolves
   * the actual outgoing URL with `path.join(url.pathname, endpoint.path)`,
   * which collapses `.`/`..` segments the same way a filesystem path does.
   * So an unvalidated `key: '..'` on `deleteObject` builds and signs
   * `/{bucket}/..`, which `path.join` collapses to `/{bucket}` — the
   * container itself, not the blob — so the signed resource and the
   * actually-requested resource diverge. This is worse when `auth.sasToken`
   * is configured: {@link _authInjector} then skips Shared Key signing
   * entirely (no client-side signature to catch the divergence at all), so
   * an unvalidated `.`/`..` segment reaches the wire with nothing but this
   * guard standing between it and the vendor.
   *
   * Rejecting only the literal whole-string `.`/`..` would still leave
   * `foo/../bar` unblocked, so every `/`-delimited segment of `value` is
   * checked, not just the whole value.
   *
   * @throws {AzureBlobError} `INVALID_PATH_SEGMENT` when any `/`-delimited
   * segment of `value` is `.` or `..`.
   * @private
   */
  private __requireSafePathSegment(
    value: string,
    field: 'bucket' | 'key',
  ): void {
    const segments = value.split('/');
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      throw new AzureBlobError('INVALID_PATH_SEGMENT', { field, value });
    }
  }

  /** Flattens every `x-ms-meta-*` response header into a plain `{ name: value }` map. */
  private __extractMetadata(
    headers: Record<string, string>,
  ): Record<string, string> {
    const metadata: Record<string, string> = {};
    const prefix = 'x-ms-meta-';
    for (const [name, value] of Object.entries(headers)) {
      if (name.toLowerCase().startsWith(prefix)) {
        metadata[name.slice(prefix.length)] = value;
      }
    }
    return metadata;
  }

  /**
   * Parses and validates a successful response against a Guardian schema
   *
   * By the time a method calls this, {@link _responseHandler} has already
   * run and thrown for any documented vendor error — this only has to
   * handle a response whose status looked fine but whose content (body, or
   * the header-derived object built by the caller) doesn't match what was
   * expected.
   *
   * @template B - The expected result type
   * @param resp - The HTTP response from the API
   * @param guard - Guardian schema object for validating `raw`
   * @param raw - The value to validate; defaults to `resp.body` (used
   * as-is for XML bodies, or overridden with a header-derived object for
   * the header-only endpoints)
   * @returns The validated result
   * @throws {AzureBlobError} `RESPONSE_ERROR` when `raw` fails validation
   * @private
   */
  private __parse<B>(
    resp: RESTlerResponse<unknown>,
    guard: BaseGuardian<B>,
    raw: unknown = resp.body,
  ): B {
    const [err, body] = guard.safeParse(raw);
    if (err || !body) {
      throw new AzureBlobError('RESPONSE_ERROR', {
        status: resp.status,
        body: raw,
        responseError: err?.toJSON(),
      });
    }
    return body;
  }

  /**
   * Builds the `_makeRequest` option that threads a `bucket`/`key` context
   * into {@link __toError}, so a mapped error's `${key}`/`${bucket}`
   * message placeholders render the actual values instead of every call
   * site hand-writing the same `responseHandler: (response) =>
   * this.__toError(response, context)` closure. Spread the result into
   * `_makeRequest`'s options (alongside `responseSchema`, etc.) — see
   * {@link __requestAndValidate} for a call site that does.
   *
   * Callers with no `bucket`/`key` context at all keep relying on the
   * constructor's context-less `_responseHandler` default instead of
   * calling this.
   *
   * @param context - The calling method's `bucket`/`key`, when known.
   */
  /**
   * Upload a large blob from a stream — `Put Block` per chunk, then one
   * `Put Block List` — so only one block is ever in memory.
   *
   * A single `PUT` from a stream is not possible against Azure: `fetch`
   * sends a stream body with chunked transfer encoding and no
   * `Content-Length`, which Blob Storage rejects and which Shared Key
   * cannot sign. Committing blocks is the vendor's own answer, and it
   * doubles as resumability (uncommitted blocks live for seven days).
   *
   * Block ids are the zero-padded block index, base64 — Azure requires
   * every id in one blob to be the same length. An empty stream commits an
   * empty blob.
   *
   * @throws {AzureBlobError} `INVALID_BUCKET`/`INVALID_KEY` for a blank
   * bucket/key, `REQUEST_BODY_TOO_LARGE` for a stream needing more than
   * 50,000 blocks; otherwise the
   * mapped vendor code from whichever block or the final commit failed.
   *
   * @example
   * ```typescript
   * const file = await Deno.open('backup.tar');
   * const { etag } = await client.putObjectStream({
   *   bucket: 'backups',
   *   key: '2026-09/backup.tar',
   *   body: file.readable,
   *   contentType: 'application/x-tar',
   * });
   * ```
   */
  public async putObjectStream(
    options: PutObjectStreamOptions,
  ): Promise<PutObjectResultSchema> {
    const { bucket, key, contentType, metadata } = options;
    const blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE;
    this.__requireBucketAndKey(bucket, key);
    const source = options.body instanceof Blob
      ? options.body.stream()
      : options.body;
    const path = this.__blobPath(bucket, key);
    const ids: string[] = [];
    for await (const block of chunked(source, blockSize)) {
      if (ids.length >= MAX_BLOCKS) {
        throw new AzureBlobError('REQUEST_BODY_TOO_LARGE', {
          reason: `blob needs more than ${MAX_BLOCKS} blocks — raise blockSize`,
        });
      }
      const blockId = encodeBase64(String(ids.length).padStart(6, '0'));
      await this._makeRequest({
        path,
        method: 'PUT',
        query: { comp: 'block', blockid: blockId },
        contentType: 'BLOB',
        payload: new Blob([block as BlobPart]),
      }, this.__ctx({ bucket, key }));
      ids.push(blockId);
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/xml',
    };
    if (contentType) headers['x-ms-blob-content-type'] = contentType;
    if (metadata) {
      for (const [name, value] of Object.entries(metadata)) {
        headers[`x-ms-meta-${name}`] = value;
      }
    }
    const list = `<?xml version="1.0" encoding="utf-8"?><BlockList>${
      ids.map((id) => `<Latest>${id}</Latest>`).join('')
    }</BlockList>`;
    const resp = await this._makeRequest<unknown>({
      path,
      method: 'PUT',
      query: { comp: 'blocklist' },
      headers,
      contentType: 'TEXT',
      payload: list,
    }, this.__ctx({ bucket, key }));
    return this.__parse(resp, PutObjectResultSchemaObject, {
      etag: resp.headers?.['etag'],
      lastModified: resp.headers?.['last-modified'],
    });
  }

  /**
   * Download a blob as a stream — the body is never buffered, and the
   * vendor-wide `timeout` bounds only the wait for headers; after that an
   * idle timer (reset on every chunk) governs, so a large transfer runs as
   * long as it needs while a stalled one still fails.
   *
   * You OWN the returned stream: consume it or `cancel()` it, or the
   * connection stays open.
   *
   * @param options.idleTimeout - Seconds the transfer may stall (no chunk
   * received) before the stream errors; the timer resets on every chunk.
   * Defaults to RESTler's 60 s — raise it for very slow or bursty links.
   * @throws {AzureBlobError} `INVALID_BUCKET`/`INVALID_KEY` for a blank
   * bucket/key; otherwise the mapped vendor code (`BLOB_NOT_FOUND`, …).
   *
   * @example
   * ```typescript
   * const { body, contentLength } = await client.getObjectStream({ bucket: 'backups', key: 'big.bin' });
   * await body.pipeTo((await Deno.create('big.bin')).writable);
   * ```
   */
  public async getObjectStream(
    options: { bucket: string; key: string; idleTimeout?: number },
  ): Promise<GetObjectStreamResult> {
    const { bucket, key, idleTimeout } = options;
    this.__requireBucketAndKey(bucket, key);
    const resp = await this._makeStreamRequest(
      { path: this.__blobPath(bucket, key), method: 'GET' },
      {
        responseHandler: (response) =>
          this.__toError(response, { bucket, key }),
        idleTimeout,
      },
    );
    if (!resp.body) {
      // A streamed GET that settled without a body is malformed, not empty
      // — an empty blob still yields a stream that closes immediately.
      throw new AzureBlobError('RESPONSE_ERROR', { bucket, key });
    }
    const h = resp.headers ?? {};
    const length = h['content-length'] !== undefined
      ? Number(h['content-length'])
      : undefined;
    return {
      body: resp.body,
      contentType: h['content-type'],
      contentLength: Number.isFinite(length) ? length : undefined,
      etag: h['etag'],
      lastModified: h['last-modified'],
    };
  }

  private __ctx(
    context: { bucket?: string; key?: string },
  ): Pick<RESTlerRequestOptions, 'responseHandler'> {
    return {
      responseHandler: (response) => this.__toError(response, context),
    };
  }

  /**
   * Makes a request and validates its response BODY against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into an {@link AzureBlobError} — so `AzureBlobError` stays the only
   * thing a public method throws for "the vendor responded, but the body
   * doesn't match what was expected." `B` is inferred from `guard`.
   *
   * Only for endpoints validated purely from `response.body` (currently
   * just {@link listObjects}'s XML listing) — `responseSchema` never sees
   * response headers, so the header-derived endpoints
   * ({@link putObject}/{@link getObject}/{@link headObject}) keep using
   * {@link __parse} directly instead.
   *
   * @template B - The expected response body type.
   * @param endpoint - The endpoint to request.
   * @param guard - Guardian schema object for validating the response.
   * @param context - The calling method's `bucket`/`key`, when known —
   * forwarded to {@link __toError} (as the request's `responseHandler`,
   * overriding the constructor's context-less default) so a vendor error
   * mapped here also gets `BLOB_NOT_FOUND`/`CONTAINER_NOT_FOUND`'s
   * placeholders populated. See {@link __toError}.
   * @returns The validated response data.
   * @throws {AzureBlobError} `RESPONSE_ERROR` when the body fails validation.
   * @private
   */

  private async __requestAndValidate<B>(
    endpoint: RESTlerEndpoint,
    guard: BaseGuardian<B>,
    context: { bucket?: string; key?: string } = {},
  ): Promise<B> {
    try {
      const resp = await this._makeRequest(endpoint, {
        ...this.__ctx(context),
        responseSchema: (data) => guard.parse(data),
      });
      return resp.body as B;
    } catch (err) {
      if (err instanceof RESTlerResponseValidationError) {
        throw new AzureBlobError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      if (err instanceof RESTlerRateLimitError) {
        // RESTler retried once (maxRetryWait) and was throttled again, or the
        // vendor's hint exceeded the cap — surface it as this connect's own
        // error, with the hint and whether a wait already happened.
        throw new AzureBlobError('SERVER_BUSY', {
          status: 429,
          retryAfterSeconds: err.getContextValue('retryAfter'),
          retried: err.getContextValue('retried'),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates Azure's
   * documented error envelope into an {@link AzureBlobError}. Runs on
   * every response (registered on `_responseHandler` in the constructor).
   * Prefers the `x-ms-error-code` response header (cheaper, present on
   * API versions 2017-07-29+) over parsing the XML `<Error>` body. Does
   * nothing for a successful response, leaving body validation to
   * {@link __parse}.
   *
   * @param response - The parsed response, before any schema validation
   * @param context - The calling method's `bucket`/`key`, when known —
   * threaded through by each public method's `_makeRequest` call (see e.g.
   * {@link getObject}) so `BLOB_NOT_FOUND`/`CONTAINER_NOT_FOUND`'s
   * `${key}`/`${bucket}` message placeholders (see
   * {@link AzureBlobErrorCodes}) render the actual values instead of being
   * left as literal un-substituted text.
   * @throws {AzureBlobError} A vendor-mapped code, or `RESPONSE_ERROR` when
   * the failure doesn't match a documented vendor code.
   * @private
   */
  private async __toError(
    response: RESTlerResponse<unknown>,
    context: { bucket?: string; key?: string } = {},
  ): Promise<unknown> {
    const status = response.status;
    if (status !== null && status < 400) return response.body;

    let vendorCode = response.headers?.['x-ms-error-code'];
    let vendorMessage: string | undefined;
    if (!vendorCode) {
      const envelope = await this.__parseErrorBody(response.body);
      vendorCode = envelope?.code;
      vendorMessage = envelope?.message;
    }

    const mapped = vendorCode ? VENDOR_ERROR_CODE_MAP[vendorCode] : undefined;
    throw new AzureBlobError(mapped ?? 'RESPONSE_ERROR', {
      status,
      retryAfterSeconds: this._parseRetryAfter(response.headers),
      vendorCode,
      vendorMessage,
      body: mapped || response.body instanceof Blob ? undefined : response.body,
      ...context,
    });
  }

  /**
   * Extracts `{ code, message }` from an error response body, whichever
   * shape it arrives in.
   *
   * `getObject`/`headObject` request `responseType: 'BLOB'`/rely on
   * text-based parsing respectively — RESTler applies that unconditionally
   * regardless of status, so a `getObject` error body arrives as an
   * (XML-text-holding) `Blob` rather than the already-parsed object
   * `ErrorSchemaObject` expects. Falls back to a small regex extraction
   * for that case rather than pulling in an XML parsing dependency for a
   * path the `x-ms-error-code` header (present on every API version this
   * connect targets) makes rarely-taken.
   *
   * @private
   */
  private async __parseErrorBody(
    body: unknown,
  ): Promise<{ code?: string; message?: string } | undefined> {
    if (body instanceof Blob) {
      const text = await body.text();
      const code = /<Code>([^<]*)<\/Code>/.exec(text)?.[1];
      const message = /<Message>([\s\S]*?)<\/Message>/.exec(text)?.[1];
      return code ? { code, message } : undefined;
    }
    const [, envelope] = ErrorSchemaObject.safeParse(body);
    return envelope
      ? { code: envelope.Error.Code, message: envelope.Error.Message }
      : undefined;
  }
}
