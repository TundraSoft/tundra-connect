import {
  type ResponseBody,
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  RESTlerRateLimitError,
  RESTlerRequestError,
  type RESTlerRequestOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
  RESTlerTimeoutError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { type BaseGuardian, Guardian, GuardianError } from '@guardian';
import {
  CloudflareKVError,
  type CloudflareKVErrorCode,
  CloudflareKVRateLimitError,
} from './errors/mod.ts';
import {
  type BulkGetResultSchema,
  type BulkGetValueWithMetadataSchema,
  type BulkResultSchema,
  BulkResultSchemaObject,
  ErrorEnvelopeSchemaObject,
  type ErrorItemSchema,
  type KeyPageSchema,
  KeyPageSchemaObject,
  type KeySchema,
  type ListKeysQuerySchema,
  ListKeysQuerySchemaObject,
  type ListNamespacesQuerySchema,
  ListNamespacesQuerySchemaObject,
  MAX_NAMESPACE_TITLE_LENGTH,
  type NamespacePageSchema,
  NamespacePageSchemaObject,
  type NamespaceSchema,
  NamespaceSchemaObject,
} from './schema/mod.ts';

/** Cloudflare's v4 REST API root. */
export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

/** Longest key name Workers KV accepts, in UTF-8 bytes. */
export const MAX_KEY_BYTES = 512;
/** Largest value Workers KV stores, in bytes (25 MiB). */
export const MAX_VALUE_BYTES = 26_214_400;
/** Largest metadata Workers KV stores, in bytes of serialized JSON. */
export const MAX_METADATA_BYTES = 1024;
/** Shortest `expiration_ttl` Workers KV accepts, in seconds. */
export const MIN_EXPIRATION_TTL = 60;
/** Most pairs one `PUT /bulk` request may carry. */
export const MAX_BULK_WRITE_KEYS = 10_000;
/** Largest `PUT /bulk` request body, in bytes (100 MB). */
export const MAX_BULK_WRITE_BYTES = 100_000_000;
/** Most keys one `POST /bulk/delete` request may carry. */
export const MAX_BULK_DELETE_KEYS = 10_000;
/** Most keys one `POST /bulk/get` request may carry. */
export const MAX_BULK_GET_KEYS = 100;

/** An account or namespace id: opaque, URL-safe, at most 32 characters. */
const IDENTIFIER = /^[A-Za-z0-9_-]{1,32}$/;

/** RESTler's own per-request timeout bounds, in seconds. */
const MIN_TIMEOUT = 1;
const MAX_TIMEOUT = 120;

/**
 * Credentials for the Workers KV API.
 *
 * - `BEARER` — an API token (`Authorization: Bearer <token>`), the
 *   recommended path. It needs **Account → Workers KV Storage → Edit** to
 *   write, or **Read** for the read-only methods. A token that
 *   authenticates but lacks the permission fails as `FORBIDDEN`, not
 *   `AUTH_FAILED`.
 * - `CUSTOM` — the legacy account email plus Global API Key, sent as
 *   `X-Auth-Email` / `X-Auth-Key`. It can do anything the user can, so
 *   prefer a scoped token.
 */
export type CloudflareKVAuth =
  | {
    type: 'BEARER';
    /** Cloudflare API token with Workers KV Storage permission. */
    token: string;
    /** Authorization header scheme prefix. Cloudflare documents `Bearer`. */
    prefix?: string;
  }
  | {
    type: 'CUSTOM';
    /** The Cloudflare account's login email. */
    email: string;
    /** The Global API Key from the dashboard's API Tokens page. */
    key: string;
  };

/**
 * How the client retries a transient failure. Every field is optional;
 * the defaults retry up to 3 times with exponential back-off from 500 ms,
 * and honour a `Retry-After` of up to 60 s.
 */
export type CloudflareKVRetryOptions = {
  /** Retries after the first attempt, 0–10. `0` disables retrying. @default 3 */
  retries?: number;
  /** First back-off delay in milliseconds; doubles every retry. @default 500 */
  baseDelayMs?: number;
  /** Cap for one back-off delay in milliseconds. @default 30000 */
  maxDelayMs?: number;
  /**
   * Longest `Retry-After` (seconds) the client will wait out. A longer hint
   * ends the retries and the error reaches the caller, carrying the hint.
   * @default 60
   */
  maxRetryAfterSeconds?: number;
};

/** Options for configuring a {@link CloudflareKV} client. */
export type CloudflareKVOptions =
  & Omit<RESTlerOptions, 'auth'>
  & {
    /** See {@link CloudflareKVAuth}. */
    auth: CloudflareKVAuth;
    /**
     * The account that owns the namespaces — the id on the dashboard's
     * account home page, or in the URL `dash.cloudflare.com/<account_id>`.
     */
    accountId: string;
    /**
     * The namespace every key and value method targets unless the call
     * names its own `namespaceId`. Optional: a client working across
     * namespaces can pass `namespaceId` per call instead.
     */
    namespaceId?: string;
    /**
     * Retry policy for transient failures (429, 5xx, network errors and
     * timeouts), or `false` to never retry. It replaces RESTler's own
     * single-retry `maxRetryWait` / `defaultRetryWait`, which this client
     * rejects. See
     * {@link CloudflareKVRetryOptions}. A call can override it with its own
     * `retry`.
     */
    retry?: CloudflareKVRetryOptions | false;
  };

/** Per-call request options every method accepts. */
export type RequestOptions = {
  /** Timeout for this call, in seconds (1–120). Defaults to the client's. */
  timeout?: number;
  /** Retry policy for this call, overriding the client's; `false` disables. */
  retry?: CloudflareKVRetryOptions | false;
};

/** Names the namespace a call targets, overriding the client's `namespaceId`. */
export type NamespaceScoped = RequestOptions & {
  /** Namespace id for this one call. Required when the client has none. */
  namespaceId?: string;
};

/** Arguments to {@link CloudflareKV.listNamespaces}. */
export type ListNamespacesOptions = RequestOptions & ListNamespacesQuerySchema;

/** Arguments to {@link CloudflareKV.listKeys} and {@link CloudflareKV.iterateKeys}. */
export type ListKeysOptions = NamespaceScoped & ListKeysQuerySchema;

/** How {@link CloudflareKV.get} returns a value. */
export type KvValueType = 'text' | 'json' | 'bytes';

/** Arguments to {@link CloudflareKV.get}. */
export type GetOptions = NamespaceScoped & {
  /** `text` (default) decodes UTF-8; `json` parses it; `bytes` is raw. */
  type?: KvValueType;
};

/** A value {@link CloudflareKV.put} can store: text or binary. */
export type KvValue = string | ArrayBuffer | ArrayBufferView | Blob;

/**
 * When a written key expires. Give at most one: `expiration` is an
 * absolute time, `expiration_ttl` a lifetime. Neither means never.
 */
export type KvExpiration = {
  /** Expiry as seconds since the UNIX epoch. */
  expiration?: number;
  /** Seconds until expiry, at least 60. */
  expiration_ttl?: number;
};

/** Arguments to {@link CloudflareKV.put} and {@link CloudflareKV.putJson}. */
export type PutOptions = NamespaceScoped & KvExpiration & {
  /** JSON-serializable metadata stored with the key, at most 1024 bytes. */
  metadata?: unknown;
};

/** One pair for {@link CloudflareKV.bulkPut}. */
export type BulkPutEntry = KvExpiration & {
  /** The key name, at most 512 bytes. */
  key: string;
  /**
   * The value. A string is stored as given (or base64-decoded first when
   * `base64` is `true`); binary is base64-encoded for you.
   */
  value: string | ArrayBuffer | ArrayBufferView;
  /** `true` when a string `value` is base64 that Cloudflare should decode. */
  base64?: boolean;
  /** JSON-serializable metadata stored with the key, at most 1024 bytes. */
  metadata?: unknown;
};

/** Arguments to {@link CloudflareKV.bulkGet}. */
export type BulkGetOptions = NamespaceScoped & {
  /** `text` (default) returns strings; `json` parses each value. */
  type?: 'text' | 'json';
  /** Include each key's metadata and expiration. @default false */
  withMetadata?: boolean;
};

/** A value read together with its metadata and expiration. */
export type KvValueWithMetadata<T> = {
  /** The value. */
  value: T;
  /** The key's metadata, or `null` when it has none. */
  metadata: unknown;
  /** Expiry in seconds since the UNIX epoch, when the key expires. */
  expiration?: number;
};

/** What {@link CloudflareKV.getMetadata} returns for a key that exists. */
export type KvKeyMetadata = {
  /** The key's metadata, or `null` when it was written without any. */
  metadata: unknown;
};

/** A retry policy with every default filled in. */
type RetryPolicy = Required<CloudflareKVRetryOptions>;

const DEFAULT_RETRY: RetryPolicy = {
  retries: 3,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  maxRetryAfterSeconds: 60,
};

/** Something with a `parse` — a Guardian schema, finished or not. */
type Parser<B> = { parse(data: unknown): B };

/**
 * The `result` of a bulk read, checked by hand rather than with
 * `BulkGetResultSchemaObject`: Guardian's record validator rebuilds the
 * map by assignment, which silently drops a key named `__proto__` — a
 * legal Workers KV key. Only the shape is checked; the original object,
 * every own key intact, is passed on.
 */
const BulkGetResultParser: Parser<BulkGetResultSchema> = {
  parse(data: unknown): BulkGetResultSchema {
    const values = (data as { values?: unknown } | null | undefined)?.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new TypeError('bulk read result has no `values` object');
    }
    return data as BulkGetResultSchema;
  },
};

/** Stands in for "no such key" between a response handler and its caller. */
const MISSING: unique symbol = Symbol('missing');

/**
 * Maps Cloudflare's numeric error codes onto this connect's stable names. A
 * code absent from this table falls back to HTTP-status mapping. Codes in
 * the 9xxx/10000 range are the API gateway's authentication family; 7000 /
 * 7003 are "no such route", which is what an unknown account id looks
 * like; 10009 is Workers KV's own "not found" (an unknown key or namespace).
 */
const VENDOR_CODE_MAP: Record<number, CloudflareKVErrorCode> = {
  6111: 'AUTH_FAILED',
  7000: 'NOT_FOUND',
  7003: 'NOT_FOUND',
  9103: 'AUTH_FAILED',
  9106: 'AUTH_FAILED',
  9109: 'AUTH_FAILED',
  10000: 'AUTH_FAILED',
  10009: 'NOT_FOUND',
};

/** Accepts any `result`, `null` included (a write or delete answers `{}` or `null`). */
const AnyResultSchemaObject: Parser<unknown> = Guardian.unknown().nullable()
  .optional();

/**
 * Cloudflare Workers KV client over the `client/v4` REST API
 * (`/accounts/{account_id}/storage/kv/namespaces`) — for code that runs
 * OUTSIDE a Worker and so has no KV binding: a backend on another cloud, a
 * CLI, a CI job.
 *
 * Covers namespaces (list, create, get, rename, delete), key listings
 * (paged, or walked with an async iterator), single values (read as text,
 * JSON or bytes, write with metadata and expiry, delete, read metadata)
 * and the bulk endpoints (write, delete, read), which it splits into as
 * many requests as Cloudflare's per-request limits need.
 *
 * Every documented Workers KV limit is checked before a request is sent
 * and reported as its own error code. Transient failures (429, 5xx,
 * network errors, timeouts) are retried with exponential back-off,
 * honouring `Retry-After`; see {@link CloudflareKVRetryOptions}.
 *
 * Writes through this API are eventually consistent with reads at the
 * edge, exactly as writes from a Worker are: allow up to 60 seconds for a
 * change to be visible everywhere.
 *
 * @example
 * ```typescript
 * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
 *
 * const kv = new CloudflareKV({
 *   auth: { type: 'BEARER', token: 'YOUR_API_TOKEN' },
 *   accountId: 'YOUR_ACCOUNT_ID',
 *   namespaceId: 'YOUR_NAMESPACE_ID',
 * });
 *
 * await kv.put('r:acme', 'https://acme.example', {
 *   metadata: { owner: 'acme' },
 *   expiration_ttl: 86_400,
 * });
 * const target = await kv.get('r:acme'); // 'https://acme.example', or null
 * ```
 */
export class CloudflareKV extends RESTler<CloudflareKVOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'CloudflareKV';

  /** The account the client works in. */
  get accountId(): string {
    return this._getOption('accountId');
  }

  /** The client's default namespace id, when one was configured. */
  get namespaceId(): string | undefined {
    return this._hasOption('namespaceId')
      ? this._getOption('namespaceId')
      : undefined;
  }

  /**
   * Creates a Cloudflare Workers KV client.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - An API token, or the legacy email + Global API Key.
   * @param options.accountId - The account that owns the namespaces.
   * @param options.namespaceId - Default namespace for key and value methods.
   * @param options.retry - Retry policy, or `false` to never retry.
   * @throws {CloudflareKVError} `CONFIG_INVALID_AUTH` when `auth` is missing
   * or incomplete; `CONFIG_INVALID_ACCOUNT_ID` / `CONFIG_INVALID_NAMESPACE_ID`
   * for a missing, blank or malformed id; `CONFIG_INVALID_RETRY` for a bad
   * retry policy.
   */
  constructor(options: EventOptionKeys<CloudflareKVOptions, RESTlerEvents>) {
    super(options, {
      baseURL: CLOUDFLARE_API,
      timeout: 30,
      contentType: 'JSON',
    });
    // `_setOptions` only routes keys PRESENT on the argument through
    // `_processOption`, so an omitted option would otherwise surface as a
    // vendor error on the first call.
    if (!this._hasOption('auth')) {
      throw new CloudflareKVError('CONFIG_INVALID_AUTH');
    }
    if (!this._hasOption('accountId')) {
      throw new CloudflareKVError('CONFIG_INVALID_ACCOUNT_ID');
    }
    this._responseHandler = (response) => this.__unwrap(response, false);
  }

  //#region Namespaces

  /**
   * List the account's namespaces — `GET /storage/kv/namespaces`.
   *
   * @param options - Optional paging (`page`, `per_page`) and ordering
   * (`order`, `direction`).
   * @returns The page of namespaces with Cloudflare's `result_info`.
   * @throws {CloudflareKVError} `REQUEST_VALIDATION_ERROR` for an invalid
   * query; `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`,
   * `SERVICE_UNAVAILABLE`, `TIMEOUT`, `NETWORK_ERROR` or `UNKNOWN_ERROR`
   * when the call fails; `RESPONSE_ERROR` when a success body fails
   * validation.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * const { result } = await kv.listNamespaces({ per_page: 100, order: 'title' });
   * const redirects = result.find((ns) => ns.title === 'redirects');
   * ```
   */
  public async listNamespaces(
    options: ListNamespacesOptions = {},
  ): Promise<NamespacePageSchema> {
    const { timeout, retry, ...filters } = options ?? {};
    const query = this.__validate(ListNamespacesQuerySchemaObject, filters);
    return await this.__call(
      {
        path: this.__namespacesPath(),
        method: 'GET',
        query: CloudflareKV.__query(query),
      },
      NamespacePageSchemaObject,
      { timeout, retry, paged: true },
    );
  }

  /**
   * Walk every namespace in the account, requesting page after page as the
   * loop consumes them.
   *
   * @param options - Optional page size and ordering; `page` sets where to
   * start.
   * @returns An async iterator over every namespace.
   * @throws {CloudflareKVError} As {@link CloudflareKV.listNamespaces}, from
   * the iteration step that made the failing request.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * for await (const ns of kv.iterateNamespaces({ per_page: 100 })) {
   *   console.log(ns.id, ns.title);
   * }
   * ```
   */
  public async *iterateNamespaces(
    options: ListNamespacesOptions = {},
  ): AsyncGenerator<NamespaceSchema, void, undefined> {
    let page = options?.page ?? 1;
    let seen = 0;
    while (true) {
      const { result, result_info: info } = await this.listNamespaces({
        ...options,
        page,
      });
      for (const namespace of result) yield namespace;
      seen += result.length;
      const perPage = info?.per_page ?? options?.per_page;
      if (
        result.length === 0 ||
        (perPage !== undefined && result.length < perPage) ||
        (info?.total_pages !== undefined && page >= info.total_pages) ||
        (info?.total_count !== undefined && seen >= info.total_count)
      ) {
        return;
      }
      page++;
    }
  }

  /**
   * Create a namespace — `POST /storage/kv/namespaces`.
   *
   * Not retried on a timeout, network error or 5xx — Cloudflare may have
   * created the namespace before the failure, and a second attempt would
   * then fail on the duplicate title. A 429 is still retried: Cloudflare
   * did nothing.
   *
   * @param title - The namespace's title, unique within the account.
   * @param options - Per-call timeout and retry policy.
   * @returns The created namespace, with its `id`.
   * @throws {CloudflareKVError} `REQUEST_VALIDATION_ERROR` for a blank or
   * over-long title; `INVALID_REQUEST` when Cloudflare refuses it (a title
   * already in use, the namespace limit reached); otherwise as
   * {@link CloudflareKV.listNamespaces}.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * const ns = await kv.createNamespace('redirects-staging');
   * console.log(ns.id);
   * ```
   */
  public async createNamespace(
    title: string,
    options: RequestOptions = {},
  ): Promise<NamespaceSchema> {
    return await this.__call(
      {
        path: this.__namespacesPath(),
        method: 'POST',
        contentType: 'JSON',
        payload: { title: CloudflareKV.__title(title) },
      },
      NamespaceSchemaObject,
      { ...options, idempotent: false },
    );
  }

  /**
   * Fetch one namespace — `GET /storage/kv/namespaces/{namespace_id}`.
   *
   * @param options - The namespace, when it differs from the client's.
   * @returns The namespace.
   * @throws {CloudflareKVError} `REQUEST_VALIDATION_ERROR` when no namespace
   * id is available; `NOT_FOUND` for an unknown namespace; otherwise as
   * {@link CloudflareKV.listNamespaces}.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * const ns = await kv.getNamespace();
   * console.log(ns.title);
   * ```
   */
  public async getNamespace(
    options: NamespaceScoped = {},
  ): Promise<NamespaceSchema> {
    return await this.__call(
      { path: this.__namespacePath(options), method: 'GET' },
      NamespaceSchemaObject,
      options,
    );
  }

  /**
   * Rename a namespace — `PUT /storage/kv/namespaces/{namespace_id}`.
   * Its id, keys and values are unchanged.
   *
   * @param title - The new title, unique within the account.
   * @param options - The namespace, when it differs from the client's.
   * @throws {CloudflareKVError} As {@link CloudflareKV.createNamespace},
   * plus `NOT_FOUND` for an unknown namespace.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * await kv.renameNamespace('redirects-v2');
   * ```
   */
  public async renameNamespace(
    title: string,
    options: NamespaceScoped = {},
  ): Promise<void> {
    await this.__call(
      {
        path: this.__namespacePath(options),
        method: 'PUT',
        contentType: 'JSON',
        payload: { title: CloudflareKV.__title(title) },
      },
      AnyResultSchemaObject,
      options,
    );
  }

  /**
   * Delete a namespace and every key in it —
   * `DELETE /storage/kv/namespaces/{namespace_id}`. This cannot be undone.
   *
   * @param options - The namespace, when it differs from the client's.
   * @throws {CloudflareKVError} `NOT_FOUND` for an unknown namespace;
   * otherwise as {@link CloudflareKV.listNamespaces}.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * await kv.deleteNamespace({ namespaceId: 'OLD_NAMESPACE_ID' });
   * ```
   */
  public async deleteNamespace(options: NamespaceScoped = {}): Promise<void> {
    await this.__call(
      { path: this.__namespacePath(options), method: 'DELETE' },
      AnyResultSchemaObject,
      options,
    );
  }

  //#endregion

  //#region Keys

  /**
   * List one page of key names — `GET .../namespaces/{namespace_id}/keys`.
   * Keys come back in lexicographic order with their expiration and
   * metadata; values are not included.
   *
   * Pass the page's `result_info.cursor` as the next call's `cursor`; an
   * empty or absent cursor means this was the last page. Or let
   * {@link CloudflareKV.iterateKeys} do that for you.
   *
   * @param options - Optional `prefix`, `limit` (10–1000) and `cursor`, plus
   * the namespace.
   * @returns The page of keys with `result_info` (`count`, `cursor`).
   * @throws {CloudflareKVError} `REQUEST_VALIDATION_ERROR` for an invalid
   * query or no namespace id; `NOT_FOUND` for an unknown namespace;
   * otherwise as {@link CloudflareKV.listNamespaces}.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * const page = await kv.listKeys({ prefix: 'r:', limit: 100 });
   * for (const key of page.result) console.log(key.name, key.expiration);
   * const next = page.result_info?.cursor || undefined;
   * ```
   */
  public async listKeys(options: ListKeysOptions = {}): Promise<KeyPageSchema> {
    const { namespaceId: _ns, timeout, retry, ...filters } = options ?? {};
    const path = `${this.__namespacePath(options)}/keys`;
    const query = this.__validate(ListKeysQuerySchemaObject, filters);
    return await this.__call(
      { path, method: 'GET', query: CloudflareKV.__query(query) },
      KeyPageSchemaObject,
      { timeout, retry, paged: true },
    );
  }

  /**
   * Walk every key (under an optional prefix), following the cursor from
   * page to page as the loop consumes them.
   *
   * @param options - Optional `prefix`, page size `limit` and a starting
   * `cursor`, plus the namespace.
   * @returns An async iterator over every matching key.
   * @throws {CloudflareKVError} As {@link CloudflareKV.listKeys}, from the
   * iteration step that made the failing request; `RESPONSE_ERROR` if
   * Cloudflare hands back the cursor it was just given.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * const stale: string[] = [];
   * for await (const key of kv.iterateKeys({ prefix: 'r:' })) {
   *   if ((key.metadata as { owner?: string } | undefined)?.owner === 'gone') {
   *     stale.push(key.name);
   *   }
   * }
   * await kv.bulkDelete(stale);
   * ```
   */
  public async *iterateKeys(
    options: ListKeysOptions = {},
  ): AsyncGenerator<KeySchema, void, undefined> {
    let cursor = options?.cursor;
    while (true) {
      const page = await this.listKeys({ ...options, cursor });
      for (const key of page.result) yield key;
      const next = page.result_info?.cursor;
      if (!next) return;
      if (next === cursor) {
        throw new CloudflareKVError('RESPONSE_ERROR', {
          reason: 'Cloudflare returned the same cursor it was given',
        });
      }
      cursor = next;
    }
  }

  //#endregion

  //#region Values

  /**
   * Read a value — `GET .../values/{key_name}`.
   *
   * A key that does not exist (or has expired) resolves to `null`, not an
   * error. Reads go to Cloudflare's central store, so a write is visible
   * here at once, even before it reaches every edge.
   *
   * @param key - The key name.
   * @param options - `type` — `text` (default), `json` or `bytes` — and the
   * namespace.
   * @returns The value as a string, parsed JSON or a `Uint8Array`; `null`
   * when the key does not exist.
   * @throws {CloudflareKVError} `KEY_INVALID` / `KEY_TOO_LONG` for a bad key;
   * `RESPONSE_ERROR` when `type: 'json'` meets a value that is not JSON;
   * `NOT_FOUND` for an unknown namespace; otherwise as
   * {@link CloudflareKV.listNamespaces}.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * const text = await kv.get('r:acme');
   * const config = await kv.get<{ target: string }>('cfg:acme', { type: 'json' });
   * const image = await kv.get('img:logo', { type: 'bytes' });
   * ```
   */
  public get(
    key: string,
    options?: NamespaceScoped & { type?: 'text' },
  ): Promise<string | null>;
  public get<T = unknown>(
    key: string,
    options: NamespaceScoped & { type: 'json' },
  ): Promise<T | null>;
  public get(
    key: string,
    options: NamespaceScoped & { type: 'bytes' },
  ): Promise<Uint8Array | null>;
  public async get(
    key: string,
    options: GetOptions = {},
  ): Promise<unknown> {
    const type = options?.type ?? 'text';
    if (type !== 'text' && type !== 'json' && type !== 'bytes') {
      throw CloudflareKV.__invalid("type: must be 'text', 'json' or 'bytes'");
    }
    const path = `${this.__namespacePath(options)}/values/${
      CloudflareKV.__key(key)
    }`;
    const bytes = await this.__retrying(
      () => this.__getRaw(path, options?.timeout),
      options?.retry,
      true,
    );
    if (bytes === MISSING) return null;
    if (type === 'bytes') return bytes;
    const text = new TextDecoder().decode(bytes);
    if (type === 'text') return text;
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new CloudflareKVError(
        'RESPONSE_ERROR',
        { reason: `the value of "${key}" is not valid JSON` },
        cause instanceof Error ? cause : undefined,
      );
    }
  }

  /**
   * Read a key's metadata without its value —
   * `GET .../metadata/{key_name}`.
   *
   * @param key - The key name.
   * @param options - The namespace, when it differs from the client's.
   * @returns `{ metadata }` — `metadata` is `null` for a key written without
   * any — or `null` when the key does not exist.
   * @throws {CloudflareKVError} As {@link CloudflareKV.get}.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * const found = await kv.getMetadata('r:acme');
   * if (found) console.log(found.metadata);
   * ```
   */
  public async getMetadata(
    key: string,
    options: NamespaceScoped = {},
  ): Promise<KvKeyMetadata | null> {
    const path = `${this.__namespacePath(options)}/metadata/${
      CloudflareKV.__key(key)
    }`;
    const metadata = await this.__call(
      { path, method: 'GET' },
      AnyResultSchemaObject,
      {
        ...options,
        handler: (response) =>
          CloudflareKV.__isMissingKey(response)
            ? MISSING
            : this.__unwrap(response, false),
      },
    );
    if (metadata === MISSING) return null;
    return { metadata: metadata ?? null };
  }

  /**
   * Write a value — `PUT .../values/{key_name}`. Creates the key or
   * replaces its value, metadata and expiration.
   *
   * With `metadata` the value goes as `multipart/form-data` (`value` and
   * `metadata` parts); without it, as a raw `application/octet-stream`
   * body. Strings are stored as UTF-8. Workers KV accepts at most one write
   * per second to the same key; a faster writer gets `RATE_LIMITED`.
   *
   * @param key - The key name, at most 512 bytes.
   * @param value - Text or binary, at most 25 MiB.
   * @param options - `metadata`, `expiration` or `expiration_ttl`, and the
   * namespace.
   * @throws {CloudflareKVError} `KEY_INVALID`, `KEY_TOO_LONG`,
   * `VALUE_TOO_LARGE`, `METADATA_INVALID`, `METADATA_TOO_LARGE` or
   * `EXPIRATION_INVALID` before anything is sent; otherwise as
   * {@link CloudflareKV.listNamespaces}.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * await kv.put('r:acme', 'https://acme.example');
   * await kv.put('img:logo', new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
   *   metadata: { contentType: 'image/png' },
   *   expiration: Math.floor(Date.now() / 1000) + 3600,
   * });
   * ```
   */
  public async put(
    key: string,
    value: KvValue,
    options: PutOptions = {},
  ): Promise<void> {
    const path = `${this.__namespacePath(options)}/values/${
      CloudflareKV.__key(key)
    }`;
    const body = CloudflareKV.__body(key, value);
    const metadata = CloudflareKV.__metadata(key, options?.metadata);
    const expiry = CloudflareKV.__expiry(key, options);
    const endpoint: RESTlerEndpoint = metadata === undefined
      ? {
        path,
        method: 'PUT',
        contentType: 'BLOB',
        headers: { 'Content-Type': 'application/octet-stream' },
        payload: body,
      }
      : {
        path,
        method: 'PUT',
        contentType: 'FORM',
        payload: CloudflareKV.__form(value, body, metadata),
      };
    if (expiry) endpoint.query = expiry;
    await this.__call(endpoint, AnyResultSchemaObject, options);
  }

  /**
   * Write a value as JSON — {@link CloudflareKV.put} with
   * `JSON.stringify(value)`. Read it back with
   * `get(key, { type: 'json' })`.
   *
   * @param key - The key name, at most 512 bytes.
   * @param value - Any JSON-serializable value.
   * @param options - As {@link CloudflareKV.put}.
   * @throws {CloudflareKVError} `REQUEST_VALIDATION_ERROR` when `value` is
   * not JSON-serializable; otherwise as {@link CloudflareKV.put}.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * await kv.putJson('cfg:acme', { target: 'https://acme.example', code: 301 });
   * ```
   */
  public async putJson(
    key: string,
    value: unknown,
    options: PutOptions = {},
  ): Promise<void> {
    let text: string | undefined;
    try {
      text = JSON.stringify(value);
    } catch (cause) {
      throw new CloudflareKVError(
        'REQUEST_VALIDATION_ERROR',
        { reason: `value: not JSON-serializable (${String(cause)})` },
        cause instanceof Error ? cause : undefined,
      );
    }
    if (text === undefined) {
      throw CloudflareKV.__invalid('value: not JSON-serializable');
    }
    await this.put(key, text, options);
  }

  /**
   * Delete a key — `DELETE .../values/{key_name}`. Deleting a key that does
   * not exist succeeds.
   *
   * @param key - The key name.
   * @param options - The namespace, when it differs from the client's.
   * @throws {CloudflareKVError} `KEY_INVALID` / `KEY_TOO_LONG` for a bad key;
   * otherwise as {@link CloudflareKV.listNamespaces}.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * await kv.delete('r:acme');
   * ```
   */
  public async delete(
    key: string,
    options: NamespaceScoped = {},
  ): Promise<void> {
    const path = `${this.__namespacePath(options)}/values/${
      CloudflareKV.__key(key)
    }`;
    await this.__call(
      { path, method: 'DELETE' },
      AnyResultSchemaObject,
      options,
    );
  }

  //#endregion

  //#region Bulk

  /**
   * Write many pairs — `PUT .../bulk`. Each pair may carry its own
   * metadata and expiration; an existing key is overwritten.
   *
   * Cloudflare takes at most 10,000 pairs and 100 MB per request, so a
   * larger array is split into as many requests as needed, sent one after
   * another; the counts in the result are summed across them. Every pair is
   * checked against the Workers KV limits before the first request, so a
   * bad pair fails the call before anything is written.
   *
   * If a request fails after earlier ones succeeded, the error's `bulk`
   * context says how far it got (`requestsCompleted`, `requestsTotal`,
   * `keysCompleted`); those keys were written.
   *
   * @param entries - The pairs to write.
   * @param options - The namespace, timeout (per request) and retry policy.
   * @returns `successful_key_count` and the `unsuccessful_keys` to retry.
   * @throws {CloudflareKVError} `KEY_INVALID`, `KEY_TOO_LONG`,
   * `VALUE_TOO_LARGE`, `METADATA_INVALID`, `METADATA_TOO_LARGE` or
   * `EXPIRATION_INVALID` before anything is sent; otherwise as
   * {@link CloudflareKV.listNamespaces}.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * const result = await kv.bulkPut([
   *   { key: 'r:acme', value: 'https://acme.example', metadata: { owner: 'acme' } },
   *   { key: 'r:beta', value: 'https://beta.example', expiration_ttl: 3600 },
   * ]);
   * if (result.unsuccessful_keys.length > 0) {
   *   console.warn('retry these:', result.unsuccessful_keys);
   * }
   * ```
   */
  public async bulkPut(
    entries: BulkPutEntry[],
    options: NamespaceScoped = {},
  ): Promise<BulkResultSchema> {
    if (!Array.isArray(entries)) {
      throw CloudflareKV.__invalid('entries: must be an array');
    }
    const path = `${this.__namespacePath(options)}/bulk`;
    const chunks = CloudflareKV.__bulkPutChunks(entries);
    return await this.__bulk(chunks, options, (chunk) => ({
      path,
      method: 'PUT',
      contentType: 'TEXT',
      headers: { 'Content-Type': 'application/json' },
      payload: `[${chunk.join(',')}]`,
    }));
  }

  /**
   * Delete many keys — `POST .../bulk/delete`. Keys that do not exist are
   * ignored.
   *
   * Cloudflare takes at most 10,000 keys per request, so a longer list is
   * split into as many requests as needed, sent one after another; the
   * counts in the result are summed across them. A failure part-way carries
   * the same `bulk` progress context as {@link CloudflareKV.bulkPut}.
   *
   * @param keys - The key names.
   * @param options - The namespace, timeout (per request) and retry policy.
   * @returns `successful_key_count` and the `unsuccessful_keys` to retry.
   * @throws {CloudflareKVError} `KEY_INVALID` / `KEY_TOO_LONG` before anything
   * is sent; otherwise as {@link CloudflareKV.listNamespaces}.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * const { successful_key_count } = await kv.bulkDelete(['r:acme', 'r:beta']);
   * ```
   */
  public async bulkDelete(
    keys: string[],
    options: NamespaceScoped = {},
  ): Promise<BulkResultSchema> {
    if (!Array.isArray(keys)) {
      throw CloudflareKV.__invalid('keys: must be an array');
    }
    const path = `${this.__namespacePath(options)}/bulk/delete`;
    for (const key of keys) CloudflareKV.__key(key);
    const chunks = CloudflareKV.__chunk(keys, MAX_BULK_DELETE_KEYS);
    return await this.__bulk(chunks, options, (chunk) => ({
      path,
      method: 'POST',
      contentType: 'TEXT',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(chunk),
    }));
  }

  /**
   * Read many values — `POST .../bulk/get`. Text and JSON only: Cloudflare
   * does not return binary values in bulk (use {@link CloudflareKV.get}
   * with `type: 'bytes'`).
   *
   * Cloudflare takes at most 100 keys per request, so a longer list is split
   * into as many requests as needed, sent one after another, and the
   * answers are merged. Every requested key is in the result; one that does
   * not exist maps to `null`.
   *
   * @param keys - The key names.
   * @param options - `type` (`text` or `json`), `withMetadata`, and the
   * namespace.
   * @returns Values by key name — or, with `withMetadata: true`,
   * `{ value, metadata, expiration? }` by key name.
   * @throws {CloudflareKVError} `KEY_INVALID` / `KEY_TOO_LONG` before anything
   * is sent; `INVALID_REQUEST` when Cloudflare refuses the read (for
   * example a `type: 'json'` read that meets a value which is not JSON);
   * otherwise as {@link CloudflareKV.listNamespaces}.
   *
   * @example
   * ```typescript
   * import { CloudflareKV } from '@tundraconnect/cloudflare-kv';
   *
   * declare const kv: CloudflareKV;
   *
   * const targets = await kv.bulkGet(['r:acme', 'r:beta']);
   * console.log(targets['r:acme']); // 'https://acme.example' or null
   *
   * const withMeta = await kv.bulkGet(['r:acme'], { withMetadata: true });
   * console.log(withMeta['r:acme']?.metadata);
   * ```
   */
  public bulkGet(
    keys: string[],
    options?: NamespaceScoped & { type?: 'text'; withMetadata?: false },
  ): Promise<Record<string, string | null>>;
  public bulkGet<T = unknown>(
    keys: string[],
    options: NamespaceScoped & { type: 'json'; withMetadata?: false },
  ): Promise<Record<string, T | null>>;
  public bulkGet(
    keys: string[],
    options: NamespaceScoped & { type?: 'text'; withMetadata: true },
  ): Promise<Record<string, KvValueWithMetadata<string> | null>>;
  public bulkGet<T = unknown>(
    keys: string[],
    options: NamespaceScoped & { type: 'json'; withMetadata: true },
  ): Promise<Record<string, KvValueWithMetadata<T> | null>>;
  public async bulkGet(
    keys: string[],
    options: BulkGetOptions = {},
  ): Promise<Record<string, unknown>> {
    if (!Array.isArray(keys)) {
      throw CloudflareKV.__invalid('keys: must be an array');
    }
    const type = options?.type ?? 'text';
    if (type !== 'text' && type !== 'json') {
      throw CloudflareKV.__invalid("type: must be 'text' or 'json'");
    }
    const withMetadata = options?.withMetadata ?? false;
    if (typeof withMetadata !== 'boolean') {
      throw CloudflareKV.__invalid('withMetadata: must be a boolean');
    }
    const path = `${this.__namespacePath(options)}/bulk/get`;
    for (const key of keys) CloudflareKV.__key(key);
    const values: Record<string, unknown> = {};
    for (const chunk of CloudflareKV.__chunk(keys, MAX_BULK_GET_KEYS)) {
      const result = await this.__call(
        {
          path,
          method: 'POST',
          contentType: 'JSON',
          payload: { keys: chunk, type, withMetadata },
        },
        BulkGetResultParser,
        options,
      );
      for (const [key, value] of Object.entries(result.values)) {
        if (withMetadata && value !== null) {
          CloudflareKV.__checkWithMetadata(key, value);
        }
        // defineProperty, not assignment: a key named `__proto__` must land
        // as an own property, not reset the object's prototype.
        Object.defineProperty(values, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    return values;
  }

  //#endregion

  //#region RESTler overrides

  /**
   * Validates the options this connect owns beyond `RESTlerOptions`. Runs
   * only for keys actually present on the constructor argument — the
   * constructor's own `hasOption` guards cover absent ones.
   */
  protected override _processOption<K extends keyof CloudflareKVOptions>(
    key: K,
    value: CloudflareKVOptions[K],
  ): CloudflareKVOptions[K] {
    switch (key) {
      case 'auth': {
        value = CloudflareKV.__auth(value) as CloudflareKVOptions[K];
        break;
      }
      case 'accountId': {
        if (typeof value !== 'string' || !IDENTIFIER.test(value.trim())) {
          throw new CloudflareKVError('CONFIG_INVALID_ACCOUNT_ID');
        }
        value = value.trim() as CloudflareKVOptions[K];
        break;
      }
      case 'namespaceId': {
        if (typeof value !== 'string' || !IDENTIFIER.test(value.trim())) {
          throw new CloudflareKVError('CONFIG_INVALID_NAMESPACE_ID');
        }
        value = value.trim() as CloudflareKVOptions[K];
        break;
      }
      case 'retry': {
        value = CloudflareKV.__retryPolicy(
          value as CloudflareKVRetryOptions | false,
        ) as CloudflareKVOptions[K];
        break;
      }
      case 'maxRetryWait':
      case 'defaultRetryWait': {
        // Two retry layers would multiply waits; `retry` is the one knob.
        if (value !== undefined) {
          throw new CloudflareKVError('CONFIG_INVALID_RETRY', {
            reason: `\`${String(key)}\` is not supported — use \`retry\``,
          });
        }
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Sends the legacy `X-Auth-Email` / `X-Auth-Key` pair for a `CUSTOM`
   * client; RESTler's own injector handles `BEARER`.
   */
  protected override _authInjector(endpoint: RESTlerEndpoint): void {
    const auth = this._getOption('auth') as unknown as {
      type: string;
      email?: string;
      key?: string;
    };
    if (auth?.type === 'CUSTOM') {
      endpoint.headers = endpoint.headers ?? {};
      endpoint.headers['X-Auth-Email'] = auth.email!;
      endpoint.headers['X-Auth-Key'] = auth.key!;
      return;
    }
    super._authInjector(endpoint);
  }

  /** Redacts the legacy credential headers along with RESTler's defaults. */
  protected override _isSensitiveHeader(name: string): boolean {
    const lower = name.toLowerCase();
    return lower === 'x-auth-key' || lower === 'x-auth-email' ||
      super._isSensitiveHeader(name);
  }

  /**
   * Every request funnels through here, so a transport failure surfaces as
   * this connect's own error on every path: a timeout as `TIMEOUT`, a
   * failure before any response as `NETWORK_ERROR` — both `transient`. A
   * {@link CloudflareKVError} from a response handler passes through
   * unchanged.
   */
  protected override async _makeRequest<H = ResponseBody, B = H>(
    endpoint: RESTlerEndpoint,
    options: RESTlerRequestOptions<H, B> = {},
  ): Promise<RESTlerResponse<B>> {
    try {
      return await super._makeRequest<H, B>(endpoint, options);
    } catch (err) {
      throw this.__transportError(err, endpoint.timeout);
    }
  }

  //#endregion

  //#region Request plumbing

  /** `err` rewrapped as this connect's transient code, or returned unchanged. */
  private __transportError(err: unknown, timeout: number | undefined): unknown {
    if (err instanceof RESTlerRateLimitError) {
      // Only reachable if RESTler's own single retry is ever enabled; this
      // connect leaves it off and retries itself.
      return new CloudflareKVRateLimitError({
        retryAfterSeconds: err.getContextValue('retryAfter'),
      }, err);
    }
    if (err instanceof RESTlerTimeoutError) {
      return new CloudflareKVError('TIMEOUT', {
        timeoutSeconds: timeout ?? this._getOption('timeout'),
      }, err);
    }
    // RESTlerResponseValidationError (and the two above) extend
    // RESTlerRequestError: only a bare one is a failure before any response.
    if (
      err instanceof RESTlerRequestError &&
      !(err instanceof RESTlerResponseValidationError)
    ) {
      return new CloudflareKVError('NETWORK_ERROR', {}, err);
    }
    return err;
  }

  /**
   * Makes one request — retried per the call's policy — and validates its
   * (already unwrapped) body against `guard`, translating RESTler's generic
   * validation error into `RESPONSE_ERROR`. `paged` keeps `result_info`
   * next to `result`; `handler` replaces the envelope unwrapping;
   * `idempotent: false` limits retries to 429s.
   */
  private async __call<B>(
    endpoint: RESTlerEndpoint,
    guard: Parser<B>,
    options: RequestOptions & {
      paged?: boolean;
      idempotent?: boolean;
      handler?: (response: RESTlerResponse<unknown>) => unknown;
    } = {},
  ): Promise<B> {
    const timeout = CloudflareKV.__timeout(options.timeout);
    if (timeout !== undefined) endpoint = { ...endpoint, timeout };
    const handler = options.handler ??
      (options.paged
        ? (response: RESTlerResponse<unknown>) => this.__unwrap(response, true)
        : undefined);
    return await this.__retrying(
      async () => {
        try {
          const resp = await this._makeRequest(endpoint, {
            responseHandler: handler,
            responseSchema: (data) =>
              data === MISSING ? MISSING : guard.parse(data),
          });
          return resp.body as B;
        } catch (err) {
          if (err instanceof RESTlerResponseValidationError) {
            throw new CloudflareKVError('RESPONSE_ERROR', {
              responseError: (err.cause as GuardianError | undefined)
                ?.toJSON?.(),
            }, err);
          }
          throw err;
        }
      },
      options.retry,
      options.idempotent ?? true,
    );
  }

  /**
   * `GET values/{key}` as raw bytes. The body is read as an `ArrayBuffer` so
   * a binary value survives; a failure body is decoded and parsed as the
   * usual envelope. A missing key resolves to {@link MISSING}.
   */
  private async __getRaw(
    path: string,
    timeoutOption: number | undefined,
  ): Promise<Uint8Array | typeof MISSING> {
    const timeout = CloudflareKV.__timeout(timeoutOption);
    const resp = await this._makeRequest<Uint8Array | typeof MISSING>({
      path,
      method: 'GET',
      responseType: 'ARRAY_BUFFER',
      ...(timeout !== undefined ? { timeout } : {}),
    }, {
      responseHandler: (response) => {
        const status = response.status ?? 0;
        const raw = response.body instanceof ArrayBuffer
          ? new Uint8Array(response.body)
          : new Uint8Array(0);
        if (status >= 200 && status < 300) return raw;
        const text = new TextDecoder().decode(raw);
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
          // not an envelope — classified by status alone
        }
        const decoded = { ...response, body };
        if (CloudflareKV.__isMissingKey(decoded)) return MISSING;
        return this.__unwrap(decoded, false) as never;
      },
    });
    return resp.body as Uint8Array | typeof MISSING;
  }

  /**
   * Runs `attempt`, retrying a transient {@link CloudflareKVError} per the
   * resolved policy: a `Retry-After` hint is waited out exactly (or, when
   * longer than `maxRetryAfterSeconds`, ends the retries); otherwise the
   * wait is exponential back-off with jitter. A non-idempotent call is only
   * retried after a 429.
   */
  private async __retrying<T>(
    attempt: () => Promise<T>,
    override: CloudflareKVRetryOptions | false | undefined,
    idempotent: boolean,
  ): Promise<T> {
    const policy = override === undefined
      ? this.__clientRetry()
      : CloudflareKV.__retryPolicy(override);
    for (let retry = 0;; retry++) {
      try {
        return await attempt();
      } catch (err) {
        if (
          policy === false || retry >= policy.retries ||
          !(err instanceof CloudflareKVError) || !err.transient ||
          (!idempotent && err.code !== 'RATE_LIMITED')
        ) {
          throw err;
        }
        const hint = err.getContextValue('retryAfterSeconds');
        let waitMs: number;
        if (typeof hint === 'number') {
          if (hint > policy.maxRetryAfterSeconds) throw err;
          waitMs = hint * 1000;
        } else {
          const ceiling = Math.min(
            policy.maxDelayMs,
            policy.baseDelayMs * 2 ** retry,
          );
          waitMs = ceiling / 2 + Math.random() * (ceiling / 2);
        }
        await this._sleep(waitMs);
      }
    }
  }

  /**
   * Sends one request per chunk, in order, summing the bulk results. A
   * failure part-way is rethrown with `bulk` progress in its context.
   */
  private async __bulk<C>(
    chunks: C[],
    options: NamespaceScoped,
    endpoint: (chunk: C) => RESTlerEndpoint,
  ): Promise<BulkResultSchema> {
    const total: BulkResultSchema = {
      successful_key_count: 0,
      unsuccessful_keys: [],
    };
    let keysCompleted = 0;
    for (const [index, chunk] of chunks.entries()) {
      let result;
      try {
        result = await this.__call(
          endpoint(chunk),
          BulkResultSchemaObject,
          options,
        ) as { successful_key_count?: number; unsuccessful_keys?: string[] };
      } catch (err) {
        throw CloudflareKV.__withBulkProgress(err, {
          requestsCompleted: index,
          requestsTotal: chunks.length,
          keysCompleted,
        });
      }
      const size = (chunk as unknown[]).length;
      const failed = result?.unsuccessful_keys ?? [];
      total.successful_key_count += result?.successful_key_count ??
        size - failed.length;
      total.unsuccessful_keys.push(...failed);
      keysCompleted += size;
    }
    return total;
  }

  /**
   * Vendor-wide response handler.
   *
   * Cloudflare wraps every `client/v4` response in
   * `{success, errors, messages, result, result_info?}`. On success this
   * returns `result` — or, for a paged endpoint, `{ result, result_info }`
   * — so each method's schema validates what a caller wants rather than
   * the wrapper.
   *
   * A failure is classified by Cloudflare's own numeric code where one is
   * recognised ({@link VENDOR_CODE_MAP}, consulting `error_chain` too),
   * falling back to HTTP status. `success: false` on a 2xx counts as a
   * failure: the envelope's own flag is authoritative.
   */
  private __unwrap(
    response: RESTlerResponse<unknown>,
    paged: boolean,
  ): unknown {
    const status = response.status ?? 0;
    const body = response.body;
    const [, envelope] = ErrorEnvelopeSchemaObject.safeParse(body);
    const failed = status >= 400 || envelope?.success === false;

    if (!failed) {
      if (body && typeof body === 'object' && 'result' in body) {
        const wrapped = body as { result: unknown; result_info?: unknown };
        return paged
          ? { result: wrapped.result, result_info: wrapped.result_info }
          : wrapped.result;
      }
      return body;
    }

    const first = envelope?.errors?.[0];
    const detail = first
      ? `${first.message} (code ${first.code})`
      : 'no detail';
    const meta = {
      retryAfterSeconds: this._parseRetryAfter(response.headers),
      status,
      detail,
      vendorCode: first?.code,
      errors: envelope?.errors,
    };
    const code = CloudflareKV.__codeFor(status, first);
    if (code === 'RATE_LIMITED') throw new CloudflareKVRateLimitError(meta);
    throw new CloudflareKVError(code, meta);
  }

  /** Classifies a failure by vendor code (and its chain), then by status. */
  private static __codeFor(
    status: number,
    first: ErrorItemSchema | undefined,
  ): CloudflareKVErrorCode {
    if (status === 429) return 'RATE_LIMITED';
    const codes = first
      ? [first.code, ...(first.error_chain ?? []).map((e) => e.code)]
      : [];
    for (const code of codes) {
      const mapped = VENDOR_CODE_MAP[code];
      if (!mapped) continue;
      // 10000 "Authentication error" is also what a token that is valid but
      // lacks the permission gets, as a 403 — report that as FORBIDDEN.
      if (mapped === 'AUTH_FAILED' && status === 403) return 'FORBIDDEN';
      return mapped;
    }
    return CloudflareKV.__statusToCode(status);
  }

  /** HTTP-status fallback for a failure carrying no recognised vendor code. */
  private static __statusToCode(status: number): CloudflareKVErrorCode {
    if (status === 401) return 'AUTH_FAILED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'SERVICE_UNAVAILABLE';
    if (status >= 400) return 'INVALID_REQUEST';
    return 'UNKNOWN_ERROR';
  }

  /**
   * A 404 for a key that does not exist, as opposed to one for an unknown
   * namespace or account. Workers KV uses code 10009 for both a missing key
   * and a missing namespace, so the message tells them apart: only a
   * "namespace" message is a real `NOT_FOUND`.
   */
  private static __isMissingKey(response: RESTlerResponse<unknown>): boolean {
    if (response.status !== 404) return false;
    const [, envelope] = ErrorEnvelopeSchemaObject.safeParse(response.body);
    const first = envelope?.errors?.[0];
    if (!first) return true;
    if (first.code === 7000 || first.code === 7003) return false;
    return !/namespace/i.test(first.message);
  }

  /** The client's retry policy, or the default when none was configured. */
  private __clientRetry(): RetryPolicy | false {
    return this._hasOption('retry')
      ? this._getOption('retry') as RetryPolicy | false
      : DEFAULT_RETRY;
  }

  /** `/accounts/{account_id}/storage/kv/namespaces`. */
  private __namespacesPath(): string {
    return `/accounts/${this.accountId}/storage/kv/namespaces`;
  }

  /** The path of the namespace a call targets: its own, else the client's. */
  private __namespacePath(options: NamespaceScoped | undefined): string {
    const namespace = options?.namespaceId ?? this.namespaceId;
    if (namespace === undefined) {
      throw CloudflareKV.__invalid(
        'namespaceId: required — configure it on the client or pass it per call',
      );
    }
    if (typeof namespace !== 'string' || !IDENTIFIER.test(namespace.trim())) {
      throw CloudflareKV.__invalid(
        'namespaceId: must be a Cloudflare identifier (letters, digits, - or _, at most 32)',
      );
    }
    return `${this.__namespacesPath()}/${namespace.trim()}`;
  }

  /** Validates `value` with `guard`, or throws `REQUEST_VALIDATION_ERROR`. */
  private __validate<T>(guard: BaseGuardian<T>, value: unknown): T {
    try {
      return guard.parse(value);
    } catch (cause) {
      throw new CloudflareKVError(
        'REQUEST_VALIDATION_ERROR',
        {
          reason: CloudflareKV.__describeInvalid(cause),
          responseError: (cause as GuardianError | undefined)?.toJSON?.(),
        },
        cause instanceof Error ? cause : undefined,
      );
    }
  }

  //#endregion

  //#region Local validation

  /** Validates `auth` and converts it to the shape RESTler stores. */
  private static __auth(value: unknown): unknown {
    const auth = value as Record<string, unknown> | undefined;
    const filled = (v: unknown): v is string =>
      typeof v === 'string' && v.trim() !== '';
    if (auth?.type === 'BEARER' && filled(auth.token)) {
      // Cloudflare documents `Authorization: Bearer <token>`; RESTler's own
      // default prefix is the scheme name in upper case, so pin the
      // documented spelling unless the caller chose one.
      return { ...auth, prefix: auth.prefix ?? 'Bearer' };
    }
    if (auth?.type === 'CUSTOM' && filled(auth.email) && filled(auth.key)) {
      // `_authInjector` turns this into the two X-Auth-* headers.
      return { type: 'CUSTOM', email: auth.email, key: auth.key };
    }
    throw new CloudflareKVError('CONFIG_INVALID_AUTH');
  }

  /** Fills a retry policy's defaults and checks its bounds. */
  private static __retryPolicy(
    value: CloudflareKVRetryOptions | false,
  ): RetryPolicy | false {
    if (value === false) return false;
    if (!value || typeof value !== 'object') {
      throw new CloudflareKVError('CONFIG_INVALID_RETRY', {
        reason: 'must be an object or `false`',
      });
    }
    const policy = { ...DEFAULT_RETRY, ...value };
    const check = (ok: boolean, reason: string) => {
      if (!ok) throw new CloudflareKVError('CONFIG_INVALID_RETRY', { reason });
    };
    check(
      Number.isInteger(policy.retries) && policy.retries >= 0 &&
        policy.retries <= 10,
      '`retries` must be an integer from 0 to 10',
    );
    check(
      Number.isFinite(policy.baseDelayMs) && policy.baseDelayMs >= 0,
      '`baseDelayMs` must be a number of milliseconds, 0 or more',
    );
    check(
      Number.isFinite(policy.maxDelayMs) &&
        policy.maxDelayMs >= policy.baseDelayMs,
      '`maxDelayMs` must be a number of milliseconds, at least `baseDelayMs`',
    );
    check(
      Number.isFinite(policy.maxRetryAfterSeconds) &&
        policy.maxRetryAfterSeconds >= 0,
      '`maxRetryAfterSeconds` must be a number of seconds, 0 or more',
    );
    return policy;
  }

  /** Checks a per-call timeout against RESTler's 1–120 s range. */
  private static __timeout(timeout: unknown): number | undefined {
    if (timeout === undefined) return undefined;
    if (
      typeof timeout !== 'number' || !Number.isFinite(timeout) ||
      timeout < MIN_TIMEOUT || timeout > MAX_TIMEOUT
    ) {
      throw CloudflareKV.__invalid(
        `timeout: must be a number of seconds from ${MIN_TIMEOUT} to ${MAX_TIMEOUT}`,
      );
    }
    return timeout;
  }

  /** Checks a namespace title; returns it trimmed. */
  private static __title(title: unknown): string {
    if (typeof title !== 'string' || title.trim() === '') {
      throw CloudflareKV.__invalid('title: must be a non-empty string');
    }
    if (title.length > MAX_NAMESPACE_TITLE_LENGTH) {
      throw CloudflareKV.__invalid(
        `title: at most ${MAX_NAMESPACE_TITLE_LENGTH} characters`,
      );
    }
    return title.trim();
  }

  /**
   * Checks a key name against the Workers KV rules and returns it
   * percent-encoded for a URL path. `encodeURIComponent` also encodes `/`,
   * so a key containing `../` cannot reach another endpoint.
   */
  private static __key(key: unknown): string {
    if (typeof key !== 'string' || key === '') {
      throw new CloudflareKVError('KEY_INVALID', {
        reason: 'must be a non-empty string',
      });
    }
    if (key === '.' || key === '..') {
      throw new CloudflareKVError('KEY_INVALID', {
        key,
        reason: 'cannot be "." or ".."',
      });
    }
    const bytes = CloudflareKV.__utf8Length(key);
    if (bytes > MAX_KEY_BYTES) {
      throw new CloudflareKVError('KEY_TOO_LONG', {
        key,
        bytes,
        limit: MAX_KEY_BYTES,
      });
    }
    return encodeURIComponent(key);
  }

  /** Normalises a value to a body and checks its size. */
  private static __body(key: string, value: unknown): Blob {
    let blob: Blob;
    if (typeof value === 'string') {
      blob = new Blob([new TextEncoder().encode(value)]);
    } else if (value instanceof Blob) {
      blob = value;
    } else if (value instanceof ArrayBuffer) {
      blob = new Blob([new Uint8Array(value)]);
    } else if (ArrayBuffer.isView(value)) {
      blob = new Blob([CloudflareKV.__copy(value)]);
    } else {
      throw CloudflareKV.__invalid(
        'value: must be a string, ArrayBuffer, typed array or Blob',
      );
    }
    if (blob.size > MAX_VALUE_BYTES) {
      throw new CloudflareKVError('VALUE_TOO_LARGE', {
        key,
        bytes: blob.size,
        limit: MAX_VALUE_BYTES,
      });
    }
    return blob;
  }

  /** The multipart body for a write with metadata. */
  private static __form(
    value: KvValue,
    body: Blob,
    metadata: string,
  ): FormData {
    const form = new FormData();
    // A string goes as a plain field, exactly as Wrangler sends it; binary
    // goes as a file part so it is not re-encoded as text.
    if (typeof value === 'string') form.set('value', value);
    else form.set('value', body);
    form.set('metadata', metadata);
    return form;
  }

  /** Serializes and size-checks metadata; `undefined` when there is none. */
  private static __metadata(
    key: string,
    metadata: unknown,
  ): string | undefined {
    if (metadata === undefined) return undefined;
    let json: string | undefined;
    try {
      json = JSON.stringify(metadata);
    } catch (cause) {
      throw new CloudflareKVError('METADATA_INVALID', {
        key,
        reason: String(cause),
      }, cause instanceof Error ? cause : undefined);
    }
    if (json === undefined) {
      throw new CloudflareKVError('METADATA_INVALID', {
        key,
        reason: 'JSON.stringify produced nothing (a function or symbol?)',
      });
    }
    const bytes = CloudflareKV.__utf8Length(json);
    if (bytes > MAX_METADATA_BYTES) {
      throw new CloudflareKVError('METADATA_TOO_LARGE', {
        key,
        bytes,
        limit: MAX_METADATA_BYTES,
      });
    }
    return json;
  }

  /** Checks an expiration; returns it as query parameters, if any. */
  private static __expiry(
    key: string,
    options: KvExpiration | undefined,
  ): Record<string, string> | undefined {
    const { expiration, expiration_ttl: ttl } = options ?? {};
    const fail = (reason: string) =>
      new CloudflareKVError('EXPIRATION_INVALID', { key, reason });
    if (expiration !== undefined && ttl !== undefined) {
      throw fail('give `expiration` or `expiration_ttl`, not both');
    }
    if (expiration !== undefined) {
      if (!Number.isSafeInteger(expiration) || expiration <= 0) {
        throw fail('`expiration` must be whole seconds since the UNIX epoch');
      }
      return { expiration: String(expiration) };
    }
    if (ttl !== undefined) {
      if (!Number.isSafeInteger(ttl) || ttl < MIN_EXPIRATION_TTL) {
        throw fail(
          `\`expiration_ttl\` must be whole seconds, at least ${MIN_EXPIRATION_TTL}`,
        );
      }
      return { expiration_ttl: String(ttl) };
    }
    return undefined;
  }

  /**
   * Validates every pair, serializes each once, and groups them into
   * request bodies under both the 10,000-pair and the 100 MB limits.
   */
  private static __bulkPutChunks(entries: BulkPutEntry[]): string[][] {
    const chunks: string[][] = [];
    let current: string[] = [];
    // `[` + `]`, plus one comma before every pair after the first.
    let currentBytes = 2;
    for (const [index, entry] of entries.entries()) {
      if (!entry || typeof entry !== 'object') {
        throw CloudflareKV.__invalid(`entries[${index}]: must be an object`);
      }
      const json = JSON.stringify(CloudflareKV.__bulkPutPair(entry));
      const bytes = CloudflareKV.__utf8Length(json);
      if (
        current.length > 0 &&
        (current.length >= MAX_BULK_WRITE_KEYS ||
          currentBytes + 1 + bytes > MAX_BULK_WRITE_BYTES)
      ) {
        chunks.push(current);
        current = [];
        currentBytes = 2;
      }
      currentBytes += bytes + (current.length > 0 ? 1 : 0);
      current.push(json);
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
  }

  /** One validated pair in the shape `PUT /bulk` expects. */
  private static __bulkPutPair(entry: BulkPutEntry): Record<string, unknown> {
    const { key, value, base64, metadata } = entry;
    CloudflareKV.__key(key);
    if (base64 !== undefined && typeof base64 !== 'boolean') {
      throw CloudflareKV.__invalid(`base64 for "${key}": must be a boolean`);
    }
    const pair: Record<string, unknown> = { key };
    let bytes: number;
    if (typeof value === 'string') {
      pair.value = value;
      if (base64) pair.base64 = true;
      bytes = base64
        ? CloudflareKV.__base64DecodedLength(value)
        : CloudflareKV.__utf8Length(value);
    } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const raw = value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : CloudflareKV.__copy(value);
      pair.value = CloudflareKV.__base64(raw);
      pair.base64 = true;
      bytes = raw.byteLength;
    } else {
      throw CloudflareKV.__invalid(
        `value for "${key}": must be a string, ArrayBuffer or typed array`,
      );
    }
    if (bytes > MAX_VALUE_BYTES) {
      throw new CloudflareKVError('VALUE_TOO_LARGE', {
        key,
        bytes,
        limit: MAX_VALUE_BYTES,
      });
    }
    const expiry = CloudflareKV.__expiry(key, entry);
    if (expiry?.expiration) pair.expiration = entry.expiration;
    if (expiry?.expiration_ttl) pair.expiration_ttl = entry.expiration_ttl;
    const json = CloudflareKV.__metadata(key, metadata);
    if (json !== undefined) pair.metadata = JSON.parse(json);
    return pair;
  }

  /** A `withMetadata` bulk value must be `{ value, metadata, … }`. */
  private static __checkWithMetadata(key: string, value: unknown): void {
    if (!value || typeof value !== 'object' || !('value' in value)) {
      throw new CloudflareKVError('RESPONSE_ERROR', {
        reason: `bulk value for "${key}" is not { value, metadata }`,
      });
    }
    // Normalise an absent `metadata` to `null`, as the type promises.
    const entry = value as Partial<BulkGetValueWithMetadataSchema>;
    if (!('metadata' in entry)) entry.metadata = null;
  }

  //#endregion

  //#region Helpers

  /** Rethrows a bulk failure with how far the bulk call got. */
  private static __withBulkProgress(
    err: unknown,
    bulk: {
      requestsCompleted: number;
      requestsTotal: number;
      keysCompleted: number;
    },
  ): unknown {
    if (!(err instanceof CloudflareKVError)) return err;
    const { vendor: _vendor, ...context } = err.context;
    const meta = { ...context, bulk };
    return err instanceof CloudflareKVRateLimitError
      ? new CloudflareKVRateLimitError(meta, err)
      : new CloudflareKVError(err.code, meta, err);
  }

  /** Splits `items` into arrays of at most `size`. */
  private static __chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  /** A copy of a view's bytes, detached from the rest of its buffer. */
  private static __copy(view: ArrayBufferView): Uint8Array<ArrayBuffer> {
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
      .slice();
  }

  /** Bytes `value` takes as UTF-8. */
  private static __utf8Length(value: string): number {
    return new TextEncoder().encode(value).byteLength;
  }

  /** Standard base64 of `bytes`, chunked so a large value can't overflow the stack. */
  private static __base64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  /** Bytes a base64 string decodes to. */
  private static __base64DecodedLength(value: string): number {
    const trimmed = value.replace(/\s/g, '');
    const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor(trimmed.length * 3 / 4) - padding);
  }

  /** Drops undefined values and stringifies the rest for a query string. */
  private static __query(
    values: Record<string, unknown>,
  ): Record<string, string> | undefined {
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) query[key] = String(value);
    }
    return Object.keys(query).length > 0 ? query : undefined;
  }

  /**
   * Turns a request-schema failure into a `reason` that names each failing
   * field, e.g. `limit: …`. Falls back to the schema's own message for a
   * failure that isn't per-field.
   */
  private static __describeInvalid(cause: unknown): string {
    if (!(cause instanceof Error)) return 'validation failed';
    const fields = cause instanceof GuardianError
      ? cause.getContextValue('cause')
      : undefined;
    if (!fields || typeof fields !== 'object') return cause.message;
    const lines = Object.entries(fields as Record<string, unknown>)
      .filter((entry): entry is [string, Error] => entry[1] instanceof Error)
      .map(([field, error]) => `${field}: ${error.message}`);
    return lines.length > 0 ? lines.join('; ') : cause.message;
  }

  /** A `REQUEST_VALIDATION_ERROR` carrying `reason`. */
  private static __invalid(reason: string): CloudflareKVError {
    return new CloudflareKVError('REQUEST_VALIDATION_ERROR', { reason });
  }

  //#endregion
}
