import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  RESTlerRateLimitError,
  RESTlerRequestError,
  type RESTlerResponse,
  RESTlerTimeoutError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import type { BaseGuardian, GuardianError } from '@guardian';
import { URLhausError, type URLhausErrorCode } from './errors/mod.ts';
import {
  type HostEntrySchema,
  HostEntrySchemaObject,
  type PayloadEntrySchema,
  PayloadEntrySchemaObject,
  QueryStatusEnvelopeSchemaObject,
  RecentPayloadsSchemaObject,
  type RecentUrlSchema,
  RecentUrlsSchemaObject,
  type SignatureEntrySchema,
  SignatureEntrySchemaObject,
  type TagEntrySchema,
  TagEntrySchemaObject,
  type UrlEntrySchema,
  UrlEntrySchemaObject,
} from './schema/mod.ts';

/** URLhaus's API root; `{version}` is filled from the `version` option. */
export const URLHAUS_API = 'https://urlhaus-api.abuse.ch/{version}';

/** The header URLhaus reads the Auth-Key from. */
const AUTH_HEADER = 'Auth-Key';

/** RESTler's own bounds on a timeout, in seconds. */
const MIN_TIMEOUT = 1;
const MAX_TIMEOUT = 120;

/** The recent feeds' documented ceiling. */
const MAX_RECENT_LIMIT = 1000;

const MD5 = /^[a-f0-9]{32}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;

/** `query_status` values that are definite refusals, with their codes. */
const QUERY_STATUS_CODES: Record<string, URLhausErrorCode> = {
  invalid_url: 'INVALID_URL',
  invalid_host: 'INVALID_HOST',
  invalid_md5: 'INVALID_HASH',
  invalid_sha256: 'INVALID_HASH',
  unknown_auth_key: 'AUTH_FAILED',
  http_post_expected: 'INVALID_REQUEST',
  http_get_expected: 'INVALID_REQUEST',
};

/**
 * URLhaus credentials: `{ type: 'CUSTOM', authKey }`. The Auth-Key is free
 * from the abuse.ch Authentication Portal (https://auth.abuse.ch/) and is
 * sent as the `Auth-Key` header on every request.
 */
export type URLhausAuth = {
  type: 'CUSTOM';
  /** abuse.ch Auth-Key. Secret — redacted from events and errors. */
  authKey: string;
};

/** Options for configuring a {@link URLhaus} client. */
export type URLhausOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link URLhausAuth}. */
  auth: URLhausAuth;
};

/** Options every URLhaus call accepts. */
export type URLhausCallOptions = {
  /**
   * Deadline for this one call, in seconds — fractional values such as
   * `1.5` are fine, between 1 and 120. It bounds the WHOLE call, body read
   * included. Defaults to the client's `timeout`. Missing it throws
   * `TIMEOUT`.
   */
  timeout?: number;
};

/** Arguments to {@link URLhaus.lookupUrl}. */
export type LookupUrlOptions = URLhausCallOptions & {
  /** The URL to look up, exactly as it would be visited. */
  url: string;
};

/** Arguments to {@link URLhaus.lookupUrlId}. */
export type LookupUrlIdOptions = URLhausCallOptions & {
  /** A URLhaus database id (the number in `urlhaus.abuse.ch/url/<id>/`). */
  id: number | string;
};

/** Arguments to {@link URLhaus.lookupHost}. */
export type LookupHostOptions = URLhausCallOptions & {
  /** An IPv4 address, hostname or domain name (case-insensitive). */
  host: string;
};

/** Arguments to {@link URLhaus.lookupPayload}: exactly one hash. */
export type LookupPayloadOptions =
  & URLhausCallOptions
  & (
    | { md5_hash: string; sha256_hash?: never }
    | { sha256_hash: string; md5_hash?: never }
  );

/** Arguments to {@link URLhaus.lookupTag}. */
export type LookupTagOptions = URLhausCallOptions & {
  /** The tag, e.g. `Retefe` (case-insensitive). */
  tag: string;
};

/** Arguments to {@link URLhaus.lookupSignature}. */
export type LookupSignatureOptions = URLhausCallOptions & {
  /** The malware family, e.g. `Heodo` (case-insensitive). */
  signature: string;
};

/** Arguments to {@link URLhaus.recentUrls} and {@link URLhaus.recentPayloads}. */
export type RecentOptions = URLhausCallOptions & {
  /** At most this many entries, 1–1000. URLhaus's own default is 1,000. */
  limit?: number;
};

/**
 * The verdict of a URL or host lookup.
 *
 * `listed: false` is a definite answer — URLhaus answered `no_results`.
 * Anything that prevents an answer throws a {@link URLhausError} instead;
 * it never comes back as `listed: false`.
 */
export type ListedResult<T> =
  | { listed: false }
  | {
    listed: true;
    /** Everything URLhaus knows about the URL or host. */
    entry: T;
  };

/**
 * The result of a payload, tag, signature or URL-id lookup: `found: false`
 * when URLhaus answered `no_results`.
 */
export type FoundResult<T> =
  | { found: false }
  | {
    found: true;
    /** The record URLhaus returned. */
    entry: T;
  };

/**
 * URLhaus client — abuse.ch's database of URLs distributing malware,
 * queried through the URLhaus API (`https://urlhaus-api.abuse.ch/v1/`).
 *
 * Lookups (`POST`, form-encoded) resolve to a typed result rather than raw
 * JSON: URLhaus's `no_results` becomes `{ listed: false }` /
 * `{ found: false }`, and every other non-`ok` `query_status` becomes a
 * {@link URLhausError} with a stable code. The recent-URL and
 * recent-payload feeds (`GET`) resolve to arrays.
 *
 * URLhaus is free to use with an Auth-Key; abuse.ch's terms note that
 * commercial use may require their paid API — see the README.
 *
 * Runs anywhere `fetch` does, Cloudflare Workers included. To route
 * requests through your own transport, subclass and reassign the protected
 * `_fetch`.
 *
 * @example
 * ```typescript
 * import { URLhaus } from '@tundraconnect/urlhaus';
 *
 * const urlhaus = new URLhaus({
 *   auth: { type: 'CUSTOM', authKey: 'YOUR_AUTH_KEY' },
 *   timeout: 1.5, // every call answers within 1.5 s or throws TIMEOUT
 * });
 *
 * const verdict = await urlhaus.lookupUrl({ url: 'http://example.com/x.exe' });
 * if (verdict.listed) console.log(verdict.entry.url_status, verdict.entry.tags);
 * ```
 */
export class URLhaus extends RESTler<URLhausOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'URLhaus';

  /**
   * Creates a URLhaus client.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - See {@link URLhausAuth}.
   * @param options.timeout - Default per-call deadline in seconds (1–120,
   * fractional allowed). @default 10
   * @throws {URLhausError} `CONFIG_INVALID_AUTH` when `auth` is missing,
   * isn't `CUSTOM`, or carries a blank `authKey`.
   */
  constructor(options: EventOptionKeys<URLhausOptions, RESTlerEvents>) {
    super(options, {
      baseURL: URLHAUS_API,
      version: 'v1',
      timeout: 10,
      contentType: 'FORM',
    });
    // `_setOptions` only routes keys PRESENT on the argument through
    // `_processOption`, so an omitted `auth` would otherwise surface as a
    // vendor 401 on the first call.
    if (!this._hasOption('auth')) {
      throw new URLhausError('CONFIG_INVALID_AUTH');
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Look up one URL — `POST /v1/url/` with `url=<url>`.
   *
   * @param options - The URL, and an optional deadline.
   * @returns `{ listed: false }` when URLhaus has no record of the URL;
   * otherwise `{ listed: true, entry }`.
   * @throws {URLhausError} `REQUEST_VALIDATION_ERROR` for a blank `url` or
   * an out-of-range `timeout` (nothing is sent); `INVALID_URL` when
   * URLhaus refuses the URL; `TIMEOUT`, `NETWORK_ERROR`,
   * `SERVICE_UNAVAILABLE` or `RATE_LIMITED` when no verdict could be had —
   * all `transient`; `AUTH_FAILED`, `FORBIDDEN` or `INVALID_REQUEST` when
   * URLhaus rejects the call; `RESPONSE_ERROR` for a malformed body.
   *
   * @example
   * ```typescript
   * import { URLhaus } from '@tundraconnect/urlhaus';
   *
   * declare const urlhaus: URLhaus;
   *
   * const verdict = await urlhaus.lookupUrl({
   *   url: 'http://sskymedia.com/VMYB-ht_JAQo-gi/',
   *   timeout: 1.5,
   * });
   * if (verdict.listed && verdict.entry.url_status === 'online') {
   *   // actively serving malware
   * }
   * ```
   */
  public async lookupUrl(
    options: LookupUrlOptions,
  ): Promise<ListedResult<UrlEntrySchema>> {
    const timeout = URLhaus.__checkTimeout(options?.timeout);
    const url = URLhaus.__requireText('url', options?.url);
    const entry = await this.__lookup(
      '/url/',
      { url },
      UrlEntrySchemaObject,
      timeout,
    );
    return entry === null ? { listed: false } : { listed: true, entry };
  }

  /**
   * Look up a URL by its URLhaus id — `POST /v1/urlid/`.
   *
   * URLhaus's own documentation names this form field both `id` (its
   * parameter table) and `urlid` (its example request); both are sent, with
   * the same value, so the request works whichever the server reads.
   *
   * @param options - The id, and an optional deadline.
   * @returns `{ found: false }` for an unknown id; otherwise
   * `{ found: true, entry }`.
   * @throws {URLhausError} As {@link URLhaus.lookupUrl}; `id` must be a
   * positive integer.
   *
   * @example
   * ```typescript
   * import { URLhaus } from '@tundraconnect/urlhaus';
   *
   * declare const urlhaus: URLhaus;
   *
   * const result = await urlhaus.lookupUrlId({ id: 105821 });
   * ```
   */
  public async lookupUrlId(
    options: LookupUrlIdOptions,
  ): Promise<FoundResult<UrlEntrySchema>> {
    const timeout = URLhaus.__checkTimeout(options?.timeout);
    const id = String(options?.id ?? '').trim();
    if (!/^[1-9]\d*$/.test(id)) {
      throw URLhaus.__invalid('id: must be a positive integer');
    }
    const entry = await this.__lookup(
      '/urlid/',
      { urlid: id, id },
      UrlEntrySchemaObject,
      timeout,
    );
    return entry === null ? { found: false } : { found: true, entry };
  }

  /**
   * Look up a host — `POST /v1/host/` with `host=<host>`.
   *
   * @param options - An IPv4 address, hostname or domain, and an optional
   * deadline.
   * @returns `{ listed: false }` when URLhaus has no malware URLs on the
   * host; otherwise `{ listed: true, entry }`.
   * @throws {URLhausError} As {@link URLhaus.lookupUrl}, with
   * `INVALID_HOST` in place of `INVALID_URL`.
   *
   * @example
   * ```typescript
   * import { URLhaus } from '@tundraconnect/urlhaus';
   *
   * declare const urlhaus: URLhaus;
   *
   * const verdict = await urlhaus.lookupHost({ host: 'vektorex.com' });
   * if (verdict.listed) console.log(verdict.entry.url_count);
   * ```
   */
  public async lookupHost(
    options: LookupHostOptions,
  ): Promise<ListedResult<HostEntrySchema>> {
    const timeout = URLhaus.__checkTimeout(options?.timeout);
    const host = URLhaus.__requireText('host', options?.host);
    const entry = await this.__lookup(
      '/host/',
      { host },
      HostEntrySchemaObject,
      timeout,
    );
    return entry === null ? { listed: false } : { listed: true, entry };
  }

  /**
   * Look up a payload by hash — `POST /v1/payload/` with `md5_hash` or
   * `sha256_hash`.
   *
   * @param options - Exactly one of `md5_hash` / `sha256_hash`, and an
   * optional deadline.
   * @returns `{ found: false }` for an unknown hash; otherwise
   * `{ found: true, entry }`.
   * @throws {URLhausError} `REQUEST_VALIDATION_ERROR` unless exactly one
   * well-formed hex hash is given; `INVALID_HASH` when URLhaus refuses it;
   * otherwise as {@link URLhaus.lookupUrl}.
   *
   * @example
   * ```typescript
   * import { URLhaus } from '@tundraconnect/urlhaus';
   *
   * declare const urlhaus: URLhaus;
   *
   * const result = await urlhaus.lookupPayload({
   *   md5_hash: '12c8aec5766ac3e6f26f2505e2f4a8f2',
   * });
   * ```
   */
  public async lookupPayload(
    options: LookupPayloadOptions,
  ): Promise<FoundResult<PayloadEntrySchema>> {
    const timeout = URLhaus.__checkTimeout(options?.timeout);
    const md5 = options?.md5_hash;
    const sha256 = options?.sha256_hash;
    let form: Record<string, string>;
    if (md5 !== undefined && sha256 === undefined) {
      if (typeof md5 !== 'string' || !MD5.test(md5)) {
        throw URLhaus.__invalid('md5_hash: must be 32 hex characters');
      }
      form = { md5_hash: md5 };
    } else if (sha256 !== undefined && md5 === undefined) {
      if (typeof sha256 !== 'string' || !SHA256.test(sha256)) {
        throw URLhaus.__invalid('sha256_hash: must be 64 hex characters');
      }
      form = { sha256_hash: sha256 };
    } else {
      throw URLhaus.__invalid(
        'exactly one of `md5_hash` or `sha256_hash` is required',
      );
    }
    const entry = await this.__lookup(
      '/payload/',
      form,
      PayloadEntrySchemaObject,
      timeout,
    );
    return entry === null ? { found: false } : { found: true, entry };
  }

  /**
   * Look up the malware URLs carrying a tag — `POST /v1/tag/`.
   *
   * @param options - The tag, and an optional deadline.
   * @returns `{ found: false }` for an unknown tag; otherwise
   * `{ found: true, entry }` (up to 1,000 URLs).
   * @throws {URLhausError} As {@link URLhaus.lookupUrl}.
   *
   * @example
   * ```typescript
   * import { URLhaus } from '@tundraconnect/urlhaus';
   *
   * declare const urlhaus: URLhaus;
   *
   * const result = await urlhaus.lookupTag({ tag: 'Retefe' });
   * ```
   */
  public async lookupTag(
    options: LookupTagOptions,
  ): Promise<FoundResult<TagEntrySchema>> {
    const timeout = URLhaus.__checkTimeout(options?.timeout);
    const tag = URLhaus.__requireText('tag', options?.tag);
    const entry = await this.__lookup(
      '/tag/',
      { tag },
      TagEntrySchemaObject,
      timeout,
    );
    return entry === null ? { found: false } : { found: true, entry };
  }

  /**
   * Look up the URLs serving a malware family — `POST /v1/signature/`.
   *
   * @param options - The signature (malware family), and an optional
   * deadline.
   * @returns `{ found: false }` for an unknown signature; otherwise
   * `{ found: true, entry }` (up to 1,000 URLs).
   * @throws {URLhausError} As {@link URLhaus.lookupUrl}.
   *
   * @example
   * ```typescript
   * import { URLhaus } from '@tundraconnect/urlhaus';
   *
   * declare const urlhaus: URLhaus;
   *
   * const result = await urlhaus.lookupSignature({ signature: 'Heodo' });
   * ```
   */
  public async lookupSignature(
    options: LookupSignatureOptions,
  ): Promise<FoundResult<SignatureEntrySchema>> {
    const timeout = URLhaus.__checkTimeout(options?.timeout);
    const signature = URLhaus.__requireText('signature', options?.signature);
    const entry = await this.__lookup(
      '/signature/',
      { signature },
      SignatureEntrySchemaObject,
      timeout,
    );
    return entry === null ? { found: false } : { found: true, entry };
  }

  /**
   * URLs added to URLhaus in the past three days — `GET /v1/urls/recent/`,
   * or `GET /v1/urls/recent/limit/<n>/` with a `limit`.
   *
   * @param options - An optional `limit` (1–1000) and deadline.
   * @returns The URLs, newest first; `[]` when there are none.
   * @throws {URLhausError} `REQUEST_VALIDATION_ERROR` for an out-of-range
   * `limit` or `timeout`; otherwise as {@link URLhaus.lookupUrl}.
   *
   * @example
   * ```typescript
   * import { URLhaus } from '@tundraconnect/urlhaus';
   *
   * declare const urlhaus: URLhaus;
   *
   * const latest = await urlhaus.recentUrls({ limit: 10 });
   * ```
   */
  public async recentUrls(
    options: RecentOptions = {},
  ): Promise<RecentUrlSchema[]> {
    const timeout = URLhaus.__checkTimeout(options?.timeout);
    const path = URLhaus.__recentPath('/urls/recent/', options?.limit);
    const feed = await this.__query(
      { path, method: 'GET', timeout },
      RecentUrlsSchemaObject,
      timeout,
    );
    return feed?.urls ?? [];
  }

  /**
   * Payloads URLhaus saw in the past three days —
   * `GET /v1/payloads/recent/`, or `GET /v1/payloads/recent/limit/<n>/`
   * with a `limit`.
   *
   * @param options - An optional `limit` (1–1000) and deadline.
   * @returns The payloads, newest first; `[]` when there are none.
   * @throws {URLhausError} As {@link URLhaus.recentUrls}.
   *
   * @example
   * ```typescript
   * import { URLhaus } from '@tundraconnect/urlhaus';
   *
   * declare const urlhaus: URLhaus;
   *
   * const latest = await urlhaus.recentPayloads({ limit: 10 });
   * ```
   */
  public async recentPayloads(
    options: RecentOptions = {},
  ): Promise<PayloadEntrySchema[]> {
    const timeout = URLhaus.__checkTimeout(options?.timeout);
    const path = URLhaus.__recentPath('/payloads/recent/', options?.limit);
    const feed = await this.__query(
      { path, method: 'GET', timeout },
      RecentPayloadsSchemaObject,
      timeout,
    );
    return feed?.payloads ?? [];
  }

  /** Adds the `Auth-Key` header. */
  protected override _authInjector(
    endpoint: RESTlerEndpoint,
  ): void | Promise<void> {
    super._authInjector(endpoint);
    const auth = (endpoint.auth ?? this._getOption('auth')) as
      | URLhausAuth
      | undefined;
    if (auth?.type !== 'CUSTOM') return;
    endpoint.headers ??= {};
    endpoint.headers[AUTH_HEADER] = auth.authKey;
  }

  /**
   * Marks `Auth-Key` as a credential, so RESTler redacts it from
   * `call`/`authFailure` event payloads and thrown-error request contexts.
   */
  protected override _isSensitiveHeader(name: string): boolean {
    return name.toLowerCase() === AUTH_HEADER.toLowerCase() ||
      super._isSensitiveHeader(name);
  }

  /** Validates `auth`. */
  protected override _processOption<K extends keyof URLhausOptions>(
    key: K,
    value: URLhausOptions[K],
  ): URLhausOptions[K] {
    if (key === 'auth') {
      const auth = value as unknown as URLhausAuth | undefined;
      if (
        auth?.type !== 'CUSTOM' || typeof auth.authKey !== 'string' ||
        auth.authKey.trim() === ''
      ) {
        throw new URLhausError('CONFIG_INVALID_AUTH');
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /** A form-encoded `POST` lookup, interpreted by {@link __query}. */
  private async __lookup<B>(
    path: string,
    form: Record<string, string>,
    guard: BaseGuardian<B>,
    timeout: number | undefined,
  ): Promise<B | null> {
    return await this.__query(
      { path, method: 'POST', contentType: 'FORM', payload: form, timeout },
      guard,
      timeout,
    );
  }

  /**
   * Makes a request and interprets URLhaus's `query_status`: `ok` → the
   * body validated against `guard`; `no_results` → `null`; anything else →
   * a {@link URLhausError}. Transport failures are translated too, so a
   * caller only ever needs one `instanceof`.
   */
  private async __query<B>(
    endpoint: RESTlerEndpoint,
    guard: BaseGuardian<B>,
    timeout: number | undefined,
  ): Promise<B | null> {
    let body: unknown;
    try {
      body = (await this._makeRequest(endpoint)).body;
    } catch (err) {
      throw this.__fromTransport(err, timeout);
    }

    // RESTler parses by content type; URLhaus has been seen labelling JSON
    // `application/octet-stream`, which arrives here as a string.
    if (typeof body === 'string') body = URLhaus.__tryJson(body);
    const [envelopeError, envelope] = QueryStatusEnvelopeSchemaObject
      .safeParse(body);
    if (envelopeError || !envelope) {
      throw new URLhausError('RESPONSE_ERROR', {
        responseError: envelopeError?.toJSON(),
      }, envelopeError ?? undefined);
    }
    if (envelope.query_status === 'no_results') return null;
    if (envelope.query_status !== 'ok') {
      throw URLhaus.__statusError(200, envelope.query_status, body);
    }

    const [error, value] = guard.safeParse(body);
    if (error) {
      throw new URLhausError('RESPONSE_ERROR', {
        responseError: (error as GuardianError).toJSON(),
      }, error);
    }
    return value as B;
  }

  /** Translates a RESTler transport failure into a {@link URLhausError}. */
  private __fromTransport(err: unknown, timeout: number | undefined): unknown {
    if (err instanceof URLhausError) return err;
    if (err instanceof RESTlerRateLimitError) {
      // Only reachable with `maxRetryWait` configured — otherwise a 429
      // reaches `__toError`. Leave `maxRetryWait` unset to keep `timeout`
      // a true total deadline: a retry wait sits outside it.
      return new URLhausError('RATE_LIMITED', {
        status: 429,
        retryAfterSeconds: err.getContextValue('retryAfter'),
        retried: err.getContextValue('retried'),
      }, err);
    }
    if (err instanceof RESTlerTimeoutError) {
      return new URLhausError('TIMEOUT', {
        timeoutSeconds: timeout ?? this._getOption('timeout'),
      }, err);
    }
    if (err instanceof RESTlerRequestError) {
      return new URLhausError('NETWORK_ERROR', {}, err);
    }
    return err;
  }

  /**
   * Vendor-wide response handler: passes any response below 400 through
   * (its `query_status` is interpreted by {@link __query}), and classifies
   * an HTTP failure — by URLhaus's `query_status` when the body carries
   * one (a bad key is a 403 `unknown_auth_key`), else by status (a missing
   * key is a 401 `{"error":"Unauthorized"}`).
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status ?? 0;
    if (status < 400) return response.body;
    const body = typeof response.body === 'string'
      ? URLhaus.__tryJson(response.body)
      : response.body;
    const [, envelope] = QueryStatusEnvelopeSchemaObject.safeParse(body);
    throw URLhaus.__statusError(
      status,
      envelope?.query_status,
      body,
      this._parseRetryAfter(response.headers),
    );
  }

  /** Builds the error for a refusal, by `query_status` first, then status. */
  private static __statusError(
    status: number,
    queryStatus: string | undefined,
    body: unknown,
    retryAfterSeconds?: number,
  ): URLhausError {
    return new URLhausError(URLhaus.__codeFor(status, queryStatus), {
      status,
      vendorStatus: queryStatus ?? 'none',
      retryAfterSeconds,
      body,
    });
  }

  /** Classifies a refusal by URLhaus's `query_status`, then HTTP status. */
  private static __codeFor(
    status: number,
    queryStatus: string | undefined,
  ): URLhausErrorCode {
    const byQueryStatus = queryStatus && QUERY_STATUS_CODES[queryStatus];
    if (byQueryStatus) return byQueryStatus;
    if (status === 401) return 'AUTH_FAILED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'SERVICE_UNAVAILABLE';
    if (status >= 400) return 'INVALID_REQUEST';
    return 'UNKNOWN_ERROR';
  }

  /** `/urls/recent/` or `/urls/recent/limit/<n>/`, validating `limit`. */
  private static __recentPath(base: string, limit: unknown): string {
    if (limit === undefined) return base;
    if (
      typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 ||
      limit > MAX_RECENT_LIMIT
    ) {
      throw URLhaus.__invalid(
        `limit: must be an integer between 1 and ${MAX_RECENT_LIMIT}`,
      );
    }
    return `${base}limit/${limit}/`;
  }

  /** Returns `value` when it is a non-blank string, else throws. */
  private static __requireText(field: string, value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw URLhaus.__invalid(`${field}: cannot be empty`);
    }
    return value;
  }

  /**
   * Validates a per-call `timeout` up front, so an out-of-range value is a
   * `REQUEST_VALIDATION_ERROR` rather than RESTler's generic config error.
   */
  private static __checkTimeout(timeout: unknown): number | undefined {
    if (timeout === undefined) return undefined;
    if (
      typeof timeout !== 'number' || !Number.isFinite(timeout) ||
      timeout < MIN_TIMEOUT || timeout > MAX_TIMEOUT
    ) {
      throw URLhaus.__invalid(
        `timeout: must be a number of seconds between ${MIN_TIMEOUT} and ${MAX_TIMEOUT}`,
      );
    }
    return timeout;
  }

  /** `JSON.parse(text)`, or `text` itself when it isn't JSON. */
  private static __tryJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /** A `REQUEST_VALIDATION_ERROR` carrying `reason`. */
  private static __invalid(reason: string): URLhausError {
    return new URLhausError('REQUEST_VALIDATION_ERROR', { reason });
  }
}
