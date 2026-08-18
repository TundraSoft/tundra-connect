import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerRequest,
  type RESTlerRequestOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { type BaseGuardian, GuardianError } from '@guardian';
import { S3Error, type S3ErrorCode } from './errors/mod.ts';
import {
  type DeleteObjectResponseSchema,
  DeleteObjectResponseSchemaObject,
  type GetObjectResponseSchema,
  type HeadObjectResponseSchema,
  type ListObjectsResponseSchema,
  ListObjectsResponseSchemaObject,
  ObjectMetadataSchemaObject,
  type PutObjectResponseSchema,
  PutObjectResponseSchemaObject,
  S3ErrorEnvelopeSchemaObject,
} from './schema/mod.ts';
import {
  canonicalQueryString,
  EMPTY_PAYLOAD_SHA256,
  formatAmzDate,
  sha256Hex,
  signV4,
  uriEncode,
} from './SigV4.ts';

/**
 * S3 authentication — a SigV4 access key pair signed per-request. `type`
 * is fixed to `'CUSTOM'` (per this repo's `RESTlerAuth` convention:
 * vendors that don't use HTTP Basic/Bearer auth carry their own fields
 * under the `CUSTOM` variant) since SigV4 signs a computed
 * `Authorization` header rather than emitting a static one.
 */
export type S3Auth = {
  type: 'CUSTOM';
  /** AWS (or S3-compatible) access key id. */
  accessKeyId: string;
  /** AWS (or S3-compatible) secret access key. */
  secretAccessKey: string;
  /** Signing region — e.g. `us-east-1` for AWS, `auto` for Cloudflare R2. */
  region: string;
  /** Temporary-credential session token (STS `AssumeRole`, IAM roles for EC2/Lambda, ...), when applicable. */
  sessionToken?: string;
};

/** Options for configuring an {@link S3} client. */
export type S3Options = Omit<RESTlerOptions, 'auth'> & {
  /** SigV4 credentials, supplied as `{ type: 'CUSTOM', accessKeyId, secretAccessKey, region }`. */
  auth: S3Auth;
  /**
   * Force path-style addressing (`https://s3.region.amazonaws.com/{bucket}/{key}`)
   * instead of virtual-hosted-style (`https://{bucket}.s3.region.amazonaws.com/{key}`).
   *
   * Defaults to `false` against the standard AWS `baseURL` (virtual-hosted,
   * matching AWS's own default), but defaults to `true` whenever a custom
   * `baseURL` is supplied — a bucket subdomain won't resolve against most
   * self-hosted or third-party S3-compatible endpoints (MinIO, on-prem
   * gateways). Cloudflare R2 (`https://{account}.r2.cloudflarestorage.com`)
   * needs this same path-style default, which the heuristic already
   * produces since R2 always requires a custom `baseURL`. Set explicitly to
   * override the heuristic either way.
   *
   * DigitalOcean Spaces is the opposite case: it is virtual-hosted-style
   * (`https://{bucket}.{region}.digitaloceanspaces.com`) despite also
   * requiring a custom `baseURL`
   * (`https://{region}.digitaloceanspaces.com`), so the "custom `baseURL`
   * implies path-style" heuristic guesses wrong for it — pass
   * `forcePathStyle: false` explicitly (see the Spaces example on this
   * class).
   */
  forcePathStyle?: boolean;
};

/** Vendor `<Error><Code>` values mapped to this connect's {@link S3ErrorCode} registry. */
const VENDOR_CODE_MAP: Record<string, S3ErrorCode> = {
  NoSuchKey: 'NO_SUCH_KEY',
  NoSuchBucket: 'NO_SUCH_BUCKET',
  AccessDenied: 'ACCESS_DENIED',
  InvalidAccessKeyId: 'INVALID_ACCESS_KEY_ID',
  SignatureDoesNotMatch: 'SIGNATURE_DOES_NOT_MATCH',
  RequestTimeTooSkewed: 'REQUEST_TIME_TOO_SKEWED',
  PreconditionFailed: 'PRECONDITION_FAILED',
  InvalidRange: 'INVALID_RANGE',
  EntityTooLarge: 'ENTITY_TOO_LARGE',
  MethodNotAllowed: 'METHOD_NOT_ALLOWED',
  InternalError: 'INTERNAL_ERROR',
  SlowDown: 'SLOW_DOWN',
  ServiceUnavailable: 'SERVICE_UNAVAILABLE',
};

/**
 * HTTP-status fallback used when no `<Error>` body is available to map —
 * this only happens for `HEAD` requests, where S3 sends no body on error
 * at all (see `headObject`).
 */
const STATUS_FALLBACK: Record<number, S3ErrorCode> = {
  403: 'ACCESS_DENIED',
  404: 'NO_SUCH_KEY',
  405: 'METHOD_NOT_ALLOWED',
  412: 'PRECONDITION_FAILED',
  416: 'INVALID_RANGE',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * S3 client for AWS S3 and S3-compatible object storage (Cloudflare R2,
 * MinIO, DigitalOcean Spaces, ...), signing every request with AWS
 * Signature Version 4.
 *
 * Implements the object-storage interface this repo's storage connects
 * share: `putObject` / `getObject` / `deleteObject` / `listObjects` /
 * `headObject`, each taking a single options bag.
 *
 * @example
 * ```typescript
 * const client = new S3({
 *   auth: {
 *     type: 'CUSTOM',
 *     accessKeyId: 'AKIA...',
 *     secretAccessKey: '...',
 *     region: 'us-east-1',
 *   },
 * });
 *
 * await client.putObject({ bucket: 'my-bucket', key: 'hello.txt', body: 'Hello!' });
 * const obj = await client.getObject({ bucket: 'my-bucket', key: 'hello.txt' });
 * console.log(await obj.body.text());
 * ```
 *
 * @example Cloudflare R2 (path-style, `auto` region)
 * ```typescript
 * const r2 = new S3({
 *   baseURL: 'https://<account-id>.r2.cloudflarestorage.com',
 *   auth: { type: 'CUSTOM', accessKeyId: '...', secretAccessKey: '...', region: 'auto' },
 * });
 * ```
 *
 * @example DigitalOcean Spaces (virtual-hosted-style, literal region code)
 * ```typescript
 * const spaces = new S3({
 *   baseURL: 'https://nyc3.digitaloceanspaces.com',
 *   // Spaces addresses buckets by subdomain, same as AWS — the "custom
 *   // baseURL implies path-style" heuristic guesses wrong here, so this
 *   // must be set explicitly.
 *   forcePathStyle: false,
 *   auth: {
 *     type: 'CUSTOM',
 *     accessKeyId: '...', // Spaces access key
 *     secretAccessKey: '...', // Spaces secret key
 *     region: 'nyc3', // the literal Spaces region code, not an AWS region
 *   },
 * });
 * ```
 */
export class S3 extends RESTler<S3Options> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'S3';

  /** Signing region configured for this client. */
  get region(): string {
    return this._getOption('auth').region;
  }

  /** Whether requests address a bucket via a path segment rather than a hostname subdomain. See {@link S3Options.forcePathStyle}. */
  get forcePathStyle(): boolean {
    return this._getOption('forcePathStyle') ?? false;
  }

  /**
   * Creates a new S3 client instance.
   *
   * @param options - Configuration options for the client
   * @param options.auth - `{ type: 'CUSTOM', accessKeyId, secretAccessKey, region, sessionToken? }`
   * @param options.baseURL - Defaults to `https://s3.{region}.amazonaws.com`; supply a custom
   *   endpoint for R2/MinIO/DigitalOcean Spaces/self-hosted S3-compatible storage.
   * @param options.forcePathStyle - See {@link S3Options.forcePathStyle}.
   * @throws {S3Error} `CONFIG_INVALID_AUTH` when `auth` is missing, or its
   * `accessKeyId` / `secretAccessKey` / `region` are not non-empty strings.
   */
  constructor(options: EventOptionKeys<S3Options, RESTlerEvents>) {
    // Read straight off the raw constructor argument — before `super()`,
    // `this` isn't available yet, and both values are needed to compute
    // the `defaults` handed to `super()` itself.
    const rawAuth = (options as { auth?: Partial<S3Auth> } | undefined)?.auth;
    const rawRegion = typeof rawAuth?.region === 'string'
      ? rawAuth.region.trim()
      : '';
    // Only used to pick a placeholder default baseURL when the caller
    // relies on the standard AWS endpoint — an invalid/missing region is
    // still rejected below by `_processOption`'s `auth` validation.
    const endpointRegion = rawRegion === '' || rawRegion === 'auto'
      ? 'us-east-1'
      : rawRegion;
    const hasCustomBaseURL =
      typeof (options as { baseURL?: string } | undefined)?.baseURL ===
        'string';

    super(options, {
      baseURL: `https://s3.${endpointRegion}.amazonaws.com`,
      timeout: 30,
      // See S3Options.forcePathStyle's doc for the heuristic this encodes.
      forcePathStyle: hasCustomBaseURL,
    } as Partial<S3Options>);

    if (!this.hasOption('auth')) {
      throw new S3Error('CONFIG_INVALID_AUTH', { accessKeyId: undefined });
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Uploads an object.
   *
   * @param options.bucket - Target bucket name.
   * @param options.key - Object key.
   * @param options.body - Object content. Non-`Blob` inputs are wrapped in
   * one, so the payload hash and the bytes actually sent are always
   * computed from the same buffered content.
   * @param options.contentType - `Content-Type` header to send and sign.
   * Defaults to the body's own MIME type (for a `Blob` that carries one)
   * or `application/octet-stream`.
   * @param options.metadata - Emitted as one `x-amz-meta-{key}` header per
   * entry.
   * @returns Promise resolving to {@link PutObjectResponseSchema} — `etag`
   * and, when versioning is enabled, `versionId`.
   * @throws {S3Error} `NO_SUCH_BUCKET`, `ACCESS_DENIED`, `ENTITY_TOO_LARGE`,
   * `SIGNATURE_DOES_NOT_MATCH`, or another mapped/`RESPONSE_ERROR` code.
   *
   * @example
   * ```typescript
   * await client.putObject({
   *   bucket: 'my-bucket',
   *   key: 'reports/q1.json',
   *   body: JSON.stringify({ total: 42 }),
   *   contentType: 'application/json',
   *   metadata: { owner: 'ada' },
   * });
   * ```
   */
  public async putObject(options: {
    bucket: string;
    key: string;
    body: Blob | Uint8Array | ArrayBuffer | string;
    contentType?: string;
    metadata?: Record<string, string>;
  }): Promise<PutObjectResponseSchema> {
    this.__assertBucket(options.bucket);
    this.__assertKey(options.key);
    const blob = this.__toBlob(options.body, options.contentType);
    const { baseURL, path } = this._target(options.bucket, options.key);

    const headers: Record<string, string> = {
      'Content-Type': options.contentType ??
        (blob.type || 'application/octet-stream'),
    };
    if (options.metadata) {
      for (const [metaKey, value] of Object.entries(options.metadata)) {
        headers[`x-amz-meta-${metaKey.toLowerCase()}`] = value;
      }
    }

    const resp = await this._makeRequest({
      path,
      baseURL,
      method: 'PUT',
      contentType: 'BLOB',
      payload: blob,
      headers,
    }, this.__ctx({ bucket: options.bucket, key: options.key }));

    const respHeaders = resp.headers ?? {};
    return this.__parse(PutObjectResponseSchemaObject, {
      etag: respHeaders['etag'],
      versionId: respHeaders['x-amz-version-id'],
    });
  }

  /**
   * Downloads an object's content and metadata.
   *
   * @param options.bucket - Bucket name.
   * @param options.key - Object key.
   * @returns Promise resolving to {@link GetObjectResponseSchema} — the raw
   * `body` (a `Blob`, read via `responseType: 'BLOB'`) plus `contentType`,
   * `contentLength`, `etag`, `lastModified`, and `metadata`.
   * @throws {S3Error} `NO_SUCH_KEY`, `NO_SUCH_BUCKET`, `ACCESS_DENIED`, or
   * another mapped/`RESPONSE_ERROR` code.
   *
   * @example
   * ```typescript
   * const obj = await client.getObject({ bucket: 'my-bucket', key: 'hello.txt' });
   * console.log(obj.contentType, await obj.body.text());
   * ```
   */
  public async getObject(
    options: { bucket: string; key: string },
  ): Promise<GetObjectResponseSchema> {
    this.__assertBucket(options.bucket);
    this.__assertKey(options.key);
    const { baseURL, path } = this._target(options.bucket, options.key);

    const resp = await this._makeRequest({
      path,
      baseURL,
      method: 'GET',
      responseType: 'BLOB',
    }, this.__ctx({ bucket: options.bucket, key: options.key }));

    const headers = resp.headers ?? {};
    const meta = this.__parse(ObjectMetadataSchemaObject, {
      contentType: headers['content-type'],
      contentLength: headers['content-length'],
      etag: headers['etag'],
      lastModified: headers['last-modified'],
      versionId: headers['x-amz-version-id'],
      metadata: this.__extractMetadata(headers),
    });

    return { ...meta, body: resp.body as Blob };
  }

  /**
   * Deletes an object.
   *
   * @param options.bucket - Bucket name.
   * @param options.key - Object key.
   * @returns Promise resolving to {@link DeleteObjectResponseSchema} —
   * empty on a plain delete; `versionId` / `deleteMarker` when versioning
   * is enabled. S3 responds `204 No Content`, so there is no body to
   * validate beyond these two headers.
   * @throws {S3Error} `NO_SUCH_BUCKET`, `ACCESS_DENIED`, or another
   * mapped/`RESPONSE_ERROR` code. Deleting an already-absent key is not an
   * error (S3's delete is idempotent).
   *
   * @example
   * ```typescript
   * await client.deleteObject({ bucket: 'my-bucket', key: 'hello.txt' });
   * ```
   */
  public async deleteObject(
    options: { bucket: string; key: string },
  ): Promise<DeleteObjectResponseSchema> {
    this.__assertBucket(options.bucket);
    this.__assertKey(options.key);
    const { baseURL, path } = this._target(options.bucket, options.key);

    const resp = await this._makeRequest({
      path,
      baseURL,
      method: 'DELETE',
    }, this.__ctx({ bucket: options.bucket, key: options.key }));

    const headers = resp.headers ?? {};
    return this.__parse(DeleteObjectResponseSchemaObject, {
      versionId: headers['x-amz-version-id'],
      deleteMarker: headers['x-amz-delete-marker'],
    });
  }

  /**
   * Lists objects in a bucket via ListObjectsV2.
   *
   * @param options.bucket - Bucket name.
   * @param options.prefix - Only return keys starting with this prefix.
   * @param options.maxKeys - Maximum number of keys to return (S3 caps at 1000).
   * @param options.continuationToken - Resume a previous listing —
   * pass the `nextContinuationToken` from a truncated result.
   * @returns Promise resolving to {@link ListObjectsResponseSchema}.
   * @throws {S3Error} `NO_SUCH_BUCKET`, `ACCESS_DENIED`, or another
   * mapped/`RESPONSE_ERROR` code.
   *
   * @example
   * ```typescript
   * let token: string | undefined;
   * do {
   *   const page = await client.listObjects({ bucket: 'my-bucket', prefix: 'logs/', continuationToken: token });
   *   for (const object of page.contents) console.log(object.key, object.size);
   *   token = page.nextContinuationToken;
   * } while (token);
   * ```
   */
  public async listObjects(options: {
    bucket: string;
    prefix?: string;
    maxKeys?: number;
    continuationToken?: string;
  }): Promise<ListObjectsResponseSchema> {
    this.__assertBucket(options.bucket);
    const { baseURL, path } = this._target(options.bucket);

    const query: Record<string, string> = { 'list-type': '2' };
    if (options.prefix !== undefined) query['prefix'] = options.prefix;
    if (options.maxKeys !== undefined) {
      query['max-keys'] = String(options.maxKeys);
    }
    if (options.continuationToken !== undefined) {
      query['continuation-token'] = options.continuationToken;
    }

    // No `contentType` here: GET carries no request body (RESTler's
    // per-method payload type doesn't even allow the field), and the
    // *response* being XML is detected from S3's actual `Content-Type`
    // response header by RESTler's bundled parser — not from anything set
    // on the request.
    return await this.__requestAndValidate(
      { path, baseURL, method: 'GET', query },
      ListObjectsResponseSchemaObject,
      // S3's parsed XML body wraps the listing in a `ListBucketResult`
      // envelope — unwrap it before validating against the flat schema.
      (data) =>
        (data as { ListBucketResult?: unknown } | undefined)
          ?.ListBucketResult,
      { bucket: options.bucket },
    );
  }

  /**
   * Fetches an object's metadata without downloading its content.
   *
   * @param options.bucket - Bucket name.
   * @param options.key - Object key.
   * @returns Promise resolving to {@link HeadObjectResponseSchema}.
   * @throws {S3Error} `NO_SUCH_KEY`, `NO_SUCH_BUCKET`, `ACCESS_DENIED`, or
   * another status-mapped code. S3 sends **no body** on a `HEAD` error
   * response, so error mapping here can only ever go by HTTP status —
   * unlike the other four methods, a documented `<Error>` body is never
   * available to disambiguate (e.g. a 404 is reported as `NO_SUCH_KEY`
   * even when the bucket itself is what's missing).
   *
   * @example
   * ```typescript
   * const meta = await client.headObject({ bucket: 'my-bucket', key: 'hello.txt' });
   * console.log(meta.contentLength);
   * ```
   */
  public async headObject(
    options: { bucket: string; key: string },
  ): Promise<HeadObjectResponseSchema> {
    this.__assertBucket(options.bucket);
    this.__assertKey(options.key);
    const { baseURL, path } = this._target(options.bucket, options.key);

    const resp = await this._makeRequest({
      path,
      baseURL,
      method: 'HEAD',
    }, this.__ctx({ bucket: options.bucket, key: options.key }));

    const headers = resp.headers ?? {};
    return this.__parse(ObjectMetadataSchemaObject, {
      contentType: headers['content-type'],
      contentLength: headers['content-length'],
      etag: headers['etag'],
      lastModified: headers['last-modified'],
      versionId: headers['x-amz-version-id'],
      metadata: this.__extractMetadata(headers),
    });
  }

  /**
   * Signs the outgoing request with AWS Signature Version 4.
   *
   * Runs **before** `endpoint.headers` is merged with the instance's
   * default headers and before the final request URL is built (see
   * `RESTler._processEndpoint`) — so the `Host` this computes must, and
   * does, derive from the exact same `endpoint.baseURL ?? this._getOption('baseURL')`
   * **plus** the same `endpoint.port ?? this._getOption('port')` override
   * that `_processEndpoint` resolves afterward, and the canonical path
   * signed here must be exactly what {@link _target} already wrote onto
   * `endpoint.path` (both pre-encoded, nothing left for the URL builder to
   * alter). Every header the endpoint already carries (`Content-Type`,
   * `x-amz-meta-*`, ...) is signed too — SigV4 signs whatever headers are
   * present, not a fixed subset — so callers must set every header they
   * want signed before calling `_makeRequest`.
   *
   * @param endpoint - Per-request endpoint copy to mutate with the
   * `x-amz-date` / `x-amz-content-sha256` / `x-amz-security-token` /
   * `Authorization` headers.
   * @throws {S3Error} `CONFIG_INVALID_AUTH` when the resolved auth isn't a
   * `CUSTOM` S3 credential (should be unreachable once construction has
   * validated it, but guards a per-call `auth` override).
   */
  protected override async _authInjector(
    endpoint: RESTlerEndpoint,
  ): Promise<void> {
    await super._authInjector(endpoint);
    const auth = (endpoint.auth ?? this._getOption('auth')) as S3Auth;
    if (!auth || auth.type !== 'CUSTOM') {
      throw new S3Error('CONFIG_INVALID_AUTH', {
        accessKeyId: (auth as { accessKeyId?: unknown })?.accessKeyId,
      });
    }

    const baseURL = endpoint.baseURL ?? this._getOption('baseURL');
    // RESTler applies the separate `port` option (endpoint override first,
    // then the instance option — the same precedence `_processEndpoint`
    // uses) onto the final URL AFTER this injector has run, so the signed
    // `Host` must incorporate it here too — otherwise the signature covers
    // `minio.internal` while the wire request carries
    // `Host: minio.internal:9000`. Setting `url.port` before reading
    // `url.host` also handles the default-port nuance for free: `URL.host`
    // omits a port equal to the scheme default (80/443), which is exactly
    // what `fetch` sends for it.
    const url = new URL(baseURL);
    const port = endpoint.port ?? this._getOption('port');
    if (port) {
      url.port = String(port);
    }
    const host = url.host;

    const now = new Date();
    const amzDate = formatAmzDate(now);
    const payload = 'payload' in endpoint
      ? (endpoint as { payload?: unknown }).payload
      : undefined;
    const payloadHash = await this.__hashPayload(payload);

    endpoint.headers ??= {};
    endpoint.headers['host'] = host;
    endpoint.headers['x-amz-date'] = amzDate;
    endpoint.headers['x-amz-content-sha256'] = payloadHash;
    if (auth.sessionToken) {
      endpoint.headers['x-amz-security-token'] = auth.sessionToken;
    }

    const { authorization } = await signV4({
      method: endpoint.method,
      canonicalUri: endpoint.path,
      query: endpoint.query,
      headers: endpoint.headers,
      payloadHash,
      date: now,
      credentials: auth,
    });

    endpoint.headers['Authorization'] = authorization;
  }

  /**
   * Rewrites the resolved request's query string to the exact
   * SigV4-canonical encoding {@link _authInjector} signed.
   *
   * As of `@tundralibs/restler@1.1.3`, `RESTler._processEndpoint` builds
   * the query string with RFC 3986 percent-encoding (`encodeURIComponent`,
   * space -> `%20`), so the escaping mismatch this override originally
   * existed for (space -> `+`, breaking SigV4's canonical-query-string
   * re-derivation) no longer applies. This override still has to stay,
   * for two things RESTler's builder still doesn't do: (1) SigV4 requires
   * query keys sorted alphabetically in the canonical string, which
   * `RESTler._processEndpoint` does not do (it preserves `endpoint.query`'s
   * insertion order); (2) SigV4's `uriEncode` is stricter than
   * `encodeURIComponent` (uppercase hex, more characters escaped) — see
   * {@link canonicalQueryString}. Rewriting `url.search` directly (rather
   * than through `searchParams`) preserves an already-percent-encoded
   * string byte-for-byte, so this reproduces {@link canonicalQueryString}'s
   * output exactly — the same function `_authInjector` used to sign.
   *
   * `options` is forwarded to `super._processEndpoint` verbatim — this
   * override only post-processes the resolved request's query string, so
   * it must not silently drop the base's `skipAuth` (or any future option
   * added there).
   */
  protected override async _processEndpoint(
    endpoint: RESTlerEndpoint,
    options: { skipAuth?: boolean } = {},
  ): Promise<RESTlerRequest> {
    const request = await super._processEndpoint(endpoint, options);
    if (endpoint.query && Object.keys(endpoint.query).length > 0) {
      const url = new URL(request.url);
      url.search = canonicalQueryString(endpoint.query);
      request.url = url.toString();
    }
    return request;
  }

  /**
   * Resolves the addressing target for a bucket/key pair: the already
   * SigV4-encoded `path` to send (and sign, byte-for-byte identical —
   * see {@link _authInjector}) plus, for virtual-hosted-style addressing,
   * the per-request `baseURL` override carrying the bucket subdomain.
   *
   * The key is treated as a single opaque path segment — `uriEncode`
   * percent-encodes every character in it, including any literal `/`, as
   * `%2F` — rather than split on `/` and re-joined with literal
   * separators. S3 decodes `%2F` back to `/` when resolving the target
   * object either way, but only the opaque form is immune to
   * `RESTler._processEndpoint`'s `path.join`, which collapses a literal
   * `//` (and resolves `.`/`..` segments) — corrupting a key that
   * contains one and, worse, silently diverging from the CanonicalURI
   * this class already signed. Percent-encoding away every internal `/`
   * removes the hazard entirely rather than special-casing it.
   *
   * @param bucket - Bucket name.
   * @param key - Object key; omitted (or `''`) for a bucket-root request (`listObjects`).
   */
  private _target(
    bucket: string,
    key?: string,
  ): { baseURL?: string; path: string } {
    const encodedKeySegment = key !== undefined && key !== ''
      ? '/' + uriEncode(key)
      : '';
    if (this.forcePathStyle) {
      return { path: `/${uriEncode(bucket)}${encodedKeySegment}` };
    }
    const configured = new URL(this._getOption('baseURL'));
    return {
      baseURL: `${configured.protocol}//${bucket}.${configured.host}`,
      path: encodedKeySegment || '/',
    };
  }

  /** Coerces a `putObject` body into a `Blob`, so the payload hash and the bytes sent are always computed from the same buffered content. */
  private __toBlob(
    body: Blob | Uint8Array | ArrayBuffer | string,
    contentType?: string,
  ): Blob {
    if (body instanceof Blob) return body;
    const type = contentType ?? 'application/octet-stream';
    if (typeof body === 'string') return new Blob([body], { type });
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      return new Blob([body as BlobPart], { type });
    }
    throw new S3Error('CONFIG_INVALID_BODY', { bodyType: typeof body });
  }

  /** SHA-256-hashes a request payload for `x-amz-content-sha256`, reading a `Blob` payload's bytes first (Web Crypto needs a `BufferSource`, not a `Blob`). */
  private async __hashPayload(payload: unknown): Promise<string> {
    if (payload === undefined) return EMPTY_PAYLOAD_SHA256;
    if (payload instanceof Blob) {
      return await sha256Hex(await payload.arrayBuffer());
    }
    if (payload instanceof ArrayBuffer) {
      return await sha256Hex(payload);
    }
    if (ArrayBuffer.isView(payload)) {
      return await sha256Hex(payload as unknown as BufferSource);
    }
    if (typeof payload === 'string') {
      return await sha256Hex(payload);
    }
    // Not used by any endpoint today (every body-bearing request sends a
    // Blob), but handled defensively rather than silently hashing nothing.
    return await sha256Hex(JSON.stringify(payload));
  }

  /** Collects `x-amz-meta-*` response headers into a plain metadata record, or `undefined` when there are none. */
  private __extractMetadata(
    headers: Record<string, string>,
  ): Record<string, string> | undefined {
    let metadata: Record<string, string> | undefined;
    for (const [name, value] of Object.entries(headers)) {
      if (name.startsWith('x-amz-meta-')) {
        metadata ??= {};
        metadata[name.slice('x-amz-meta-'.length)] = value;
      }
    }
    return metadata;
  }

  private __assertBucket(bucket: unknown): asserts bucket is string {
    if (typeof bucket !== 'string' || bucket.trim() === '') {
      throw new S3Error('CONFIG_INVALID_BUCKET', { bucket });
    }
    this.__assertSafePathSegment(bucket, 'bucket');
  }

  private __assertKey(key: unknown): asserts key is string {
    if (typeof key !== 'string' || key.trim() === '') {
      throw new S3Error('CONFIG_INVALID_KEY', { key });
    }
    this.__assertSafePathSegment(key, 'key');
  }

  /**
   * Guards a `bucket`/`key` value (already known non-empty — see
   * {@link __assertBucket}/{@link __assertKey}) against a `.`/`..`
   * path-traversal segment before it ever reaches {@link _target}.
   *
   * {@link _target} builds the request path by percent-encoding `bucket`/
   * `key` with {@link uriEncode} — which, like `encodeURIComponent`, leaves
   * a literal `.` or `..` *segment* unchanged (dots aren't URI-reserved) —
   * and {@link _authInjector} signs that exact (pre-`path.join`) string as
   * the SigV4 `CanonicalUri`. RESTler's `_processEndpoint` then resolves
   * the actual outgoing URL with `path.join(url.pathname, endpoint.path)`,
   * which collapses `.`/`..` segments the same way a filesystem path does.
   * For this connect's default virtual-hosted-style addressing, the
   * bucket lives in the hostname and `url.pathname` starts at `/`, so an
   * unvalidated `key: '..'` builds and signs `CanonicalUri: '/..'`, which
   * `path.join('/', '/..')` collapses to `/` — the bucket-root request,
   * not the intended object — while the `Authorization` header still
   * carries a signature computed over `/..`. The signed path and the sent
   * path have diverged, and the request may resolve against the bucket
   * root (e.g. a `DELETE` there is Delete Bucket's own endpoint) instead
   * of the one object it was meant to target.
   *
   * Rejecting only the literal whole-string `.`/`..` would still leave
   * `foo/../bar` unblocked, so every `/`-delimited segment of `value` is
   * checked, not just the whole value.
   *
   * @throws {S3Error} `INVALID_OBJECT_KEY` when any `/`-delimited segment
   * of `value` is `.` or `..`.
   * @private
   */
  private __assertSafePathSegment(
    value: string,
    field: 'bucket' | 'key',
  ): void {
    const segments = value.split('/');
    if (segments.some((segment) => segment === '.' || segment === '..')) {
      throw new S3Error('INVALID_OBJECT_KEY', { field, value });
    }
  }

  /**
   * Parses and validates a successful response body/header-derived object
   * against a Guardian schema. By the time a method calls this,
   * {@link _responseHandler} has already run and thrown for any documented
   * vendor error — this only has to handle a well-formed successful
   * response whose shape doesn't match what was expected.
   *
   * @throws {S3Error} `RESPONSE_ERROR` when validation fails.
   */
  private __parse<B extends Record<string, unknown> = Record<string, unknown>>(
    guard: BaseGuardian<B>,
    raw: unknown,
  ): B {
    const [err, data] = guard.safeParse(raw);
    if (err || !data) {
      throw new S3Error('RESPONSE_ERROR', {
        body: raw,
        responseError: err?.toJSON(),
      });
    }
    return data;
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
   * into an {@link S3Error} — so `S3Error` stays the only thing a public
   * method throws for "the vendor responded, but the body doesn't match
   * what was expected." `B` is inferred from `guard`.
   *
   * `unwrap` extracts the value `guard` should actually validate from the
   * raw parsed body — S3's XML responses wrap their real payload in a
   * root envelope element (e.g. `ListBucketResult`), so the schema itself
   * only ever describes the unwrapped shape. Defaults to identity.
   *
   * Only for endpoints validated purely from `response.body` (currently
   * just {@link listObjects}) — `responseSchema` never sees response
   * headers, so the header-derived endpoints
   * ({@link putObject}/{@link getObject}/{@link deleteObject}/{@link headObject})
   * keep using {@link __parse} directly instead.
   *
   * @template B - The expected response body type.
   * @param endpoint - The endpoint to request.
   * @param guard - Guardian schema object for validating the (optionally
   * unwrapped) response.
   * @param unwrap - Extracts the value to validate from the raw parsed
   * body. Defaults to the body itself.
   * @param context - The calling method's `bucket`/`key`, when known —
   * forwarded to {@link __toError} (as the request's `responseHandler`,
   * overriding the constructor's context-less default) so a vendor error
   * mapped here also gets `NO_SUCH_KEY`/`NO_SUCH_BUCKET`'s placeholders
   * populated. See {@link __toError}.
   * @returns The validated response data.
   * @throws {S3Error} `RESPONSE_ERROR` when the body fails validation.
   * @private
   */
  private async __requestAndValidate<B>(
    endpoint: RESTlerEndpoint,
    guard: BaseGuardian<B>,
    unwrap: (data: unknown) => unknown = (data) => data,
    context: { bucket?: string; key?: string } = {},
  ): Promise<B> {
    try {
      const resp = await this._makeRequest(endpoint, {
        ...this.__ctx(context),
        responseSchema: (data) => guard.parse(unwrap(data)),
      });
      return resp.body as B;
    } catch (err) {
      if (err instanceof RESTlerResponseValidationError) {
        throw new S3Error('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates S3's documented
   * `<Error>` XML envelope into an {@link S3Error}. Runs on every response
   * (registered on `_responseHandler` in the constructor); does nothing
   * for a non-error status, leaving success-body validation to
   * {@link __parse}.
   *
   * `getObject` reads its response as a `Blob` (`responseType: 'BLOB'`)
   * regardless of status, so an error response there arrives as an
   * unparsed `Blob` rather than the pre-parsed XML object every other
   * method gets — handled by reading and pattern-matching its text
   * directly rather than through the shared Guardian envelope schema
   * (which expects an already-decoded object). A `HEAD` error response
   * carries no body at all on either path, falling through to the
   * HTTP-status fallback.
   *
   * @param context - The calling method's `bucket`/`key`, when known —
   * threaded through by each public method's `_makeRequest` call (see e.g.
   * {@link getObject}) so `NO_SUCH_KEY`/`NO_SUCH_BUCKET`'s `${key}`/
   * `${bucket}` message placeholders (see {@link S3ErrorCodes}) render the
   * actual values instead of being left as literal un-substituted text.
   * @throws {S3Error} A vendor-mapped code (`NO_SUCH_KEY`, `ACCESS_DENIED`,
   * ...), `UNKNOWN_ERROR` for an undocumented vendor code, or
   * `SERVICE_UNAVAILABLE` when no error body is available and the status
   * isn't one of the mapped fallbacks.
   */
  private async __toError(
    response: RESTlerResponse<unknown>,
    context: { bucket?: string; key?: string } = {},
  ): Promise<unknown> {
    const status = response.status ?? 0;
    if (status < 400) return response.body;

    const envelope = response.body instanceof Blob
      ? await this.__readErrorBlob(response.body)
      : (response.body as { Error?: Record<string, unknown> } | undefined)
        ?.Error;

    if (envelope) {
      const [err, parsed] = S3ErrorEnvelopeSchemaObject.safeParse(envelope);
      if (!err && parsed) {
        const code = VENDOR_CODE_MAP[parsed.Code] ??
          (parsed.Code as S3ErrorCode);
        throw new S3Error(code, {
          status,
          message: parsed.Message,
          resource: parsed.Resource,
          requestId: parsed.RequestId,
          ...context,
        });
      }
    }

    const fallback = STATUS_FALLBACK[status];
    throw new S3Error(fallback ?? 'SERVICE_UNAVAILABLE', {
      status,
      body: response.body instanceof Blob ? undefined : response.body,
      ...context,
    });
  }

  /**
   * Best-effort extraction of the `<Error>` envelope's `Code` / `Message` /
   * `Resource` / `RequestId` fields from a `Blob` response body. Only
   * `getObject` ever reaches this — every other method's error response
   * is already parsed as XML by RESTler's bundled parser, since only
   * `getObject` sets `responseType: 'BLOB'` (needed for its success case's
   * raw bytes, which also forces an *error* body to arrive unparsed). A
   * small regex extraction is used instead of pulling in a second XML
   * parser dependency for what is, structurally, always this same
   * four-field envelope.
   */
  private async __readErrorBlob(
    blob: Blob,
  ): Promise<Record<string, string> | undefined> {
    const text = await blob.text();
    const extract = (tag: string) =>
      new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(text)?.[1];
    const code = extract('Code');
    if (!code) return undefined;
    const envelope: Record<string, string> = { Code: code };
    const message = extract('Message');
    if (message !== undefined) envelope['Message'] = message;
    const resource = extract('Resource');
    if (resource !== undefined) envelope['Resource'] = resource;
    const requestId = extract('RequestId');
    if (requestId !== undefined) envelope['RequestId'] = requestId;
    return envelope;
  }

  /**
   * Processes and validates configuration options specific to the S3
   * client before passing them to the parent class.
   *
   * @throws {S3Error} `CONFIG_INVALID_AUTH` when `auth` isn't a `CUSTOM`
   * credential with non-empty `accessKeyId` / `secretAccessKey` / `region`.
   */
  protected override _processOption<K extends keyof S3Options>(
    key: K,
    value: S3Options[K],
  ): S3Options[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as S3Auth;
        if (
          !auth || auth.type !== 'CUSTOM' ||
          typeof auth.accessKeyId !== 'string' ||
          auth.accessKeyId.trim() === '' ||
          typeof auth.secretAccessKey !== 'string' ||
          auth.secretAccessKey === '' ||
          typeof auth.region !== 'string' || auth.region.trim() === '' ||
          (auth.sessionToken !== undefined &&
            (typeof auth.sessionToken !== 'string' || auth.sessionToken === ''))
        ) {
          throw new S3Error('CONFIG_INVALID_AUTH', {
            accessKeyId: auth?.accessKeyId,
          });
        }
        value = {
          type: 'CUSTOM',
          accessKeyId: auth.accessKeyId.trim(),
          secretAccessKey: auth.secretAccessKey,
          region: auth.region.trim(),
          ...(auth.sessionToken ? { sessionToken: auth.sessionToken } : {}),
        } as S3Options[K];
        break;
      }
      case 'forcePathStyle':
        if (value !== undefined && typeof value !== 'boolean') {
          throw new S3Error('CONFIG_INVALID_FORCE_PATH_STYLE', {
            value,
          });
        }
        break;
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }
}
