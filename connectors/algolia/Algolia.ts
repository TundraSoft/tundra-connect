import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import { RESTlerRateLimitError } from '@restler/errors';
import type { EventOptionKeys } from '@utils';
import { type BaseGuardian, GuardianError } from '@guardian';
import {
  AlgoliaObjectPayloadSchemaObject,
  type AlgoliaObjectSchema,
  AlgoliaObjectSchemaObject,
  type BrowseRequestSchema,
  BrowseRequestSchemaObject,
  type BrowseResponseSchema,
  BrowseResponseSchemaObject,
  type DeleteObjectResponseSchema,
  DeleteObjectResponseSchemaObject,
  ErrorEnvelopeSchemaObject,
  type SaveObjectResponseSchema,
  SaveObjectResponseSchemaObject,
  type SearchRequestSchema,
  SearchRequestSchemaObject,
  type SearchResponseSchema,
  SearchResponseSchemaObject,
  type TaskStatusSchema,
  TaskStatusSchemaObject,
} from './schema/mod.ts';
import { AlgoliaError } from './errors/mod.ts';

/** Default polling interval for {@link Algolia.waitTask}, in milliseconds. */
const DEFAULT_WAIT_TASK_INTERVAL_MS = 1_000;

/** Default polling budget for {@link Algolia.waitTask}, in milliseconds. */
const DEFAULT_WAIT_TASK_TIMEOUT_MS = 10_000;

/**
 * Algolia authentication — two plain headers on every request:
 * `x-algolia-application-id` (identifies the account/app, not secret) and
 * `x-algolia-api-key` (the credential, secret). `RESTlerAuth`'s `CUSTOM`
 * variant exists exactly for vendors like this one that don't use HTTP
 * Basic/Bearer auth.
 *
 * `applicationId` additionally determines both base URLs this client talks
 * to — see the {@link Algolia} class doc's "Dual base URL" section.
 */
export type AlgoliaAuth = {
  type: 'CUSTOM';
  /**
   * Algolia Application ID. Not a secret — it's routinely visible in
   * client-side search widgets — but it IS load-bearing: both the write
   * host (`{applicationId}.algolia.net`) and the search/read host
   * (`{applicationId}-dsn.algolia.net`) are derived from it at
   * construction time.
   */
  applicationId: string;
  /**
   * Algolia API key (Admin or Search, depending on which operations this
   * client will call). Secret — redacted from `call`/`authFailure` event
   * payloads and thrown-error contexts by {@link Algolia._isSensitiveHeader};
   * `applicationId` is deliberately never redacted, since it isn't a
   * credential.
   */
  apiKey: string;
};

/** Options for configuring a {@link Algolia} client. */
export type AlgoliaOptions = Omit<RESTlerOptions, 'auth'> & {
  /** Algolia credentials — see {@link AlgoliaAuth}. */
  auth: AlgoliaAuth;
};

/** Options for {@link Algolia.waitTask}. */
export type WaitTaskOptions = {
  /** Delay between polls, in milliseconds. @default 1000 */
  intervalMs?: number;
  /** Total time budget before giving up, in milliseconds. @default 10000 */
  timeoutMs?: number;
};

/**
 * Algolia client for the [Algolia Search REST API](https://www.algolia.com/doc/rest-api/search/).
 *
 * Provides {@link search}, {@link saveObject}, {@link getObject},
 * {@link deleteObject}, {@link browseObjects}, and {@link waitTask} against
 * a single index at a time (pass `indexName` per call).
 *
 * ## Dual base URL
 *
 * Algolia genuinely uses two different hostnames depending on the
 * operation, both derived from `auth.applicationId`:
 *
 * - **Write host** — `https://{applicationId}.algolia.net` — indexing
 *   operations ({@link saveObject}, {@link deleteObject}) and task-status
 *   polling ({@link waitTask}).
 * - **Search/read host** — `https://{applicationId}-dsn.algolia.net` — a
 *   globally-distributed, latency-optimized cluster used for
 *   {@link search}, {@link getObject}, and {@link browseObjects}.
 *
 * RESTler's `RESTlerOptions.baseURL` is a single fixed value set at
 * construction — every other connect in this repo needs exactly one, so
 * that's all RESTler exposes at that level. But `RESTlerEndpoint` (the
 * per-request shape passed to `_makeRequest`) independently carries its own
 * optional `baseURL`, which `_processEndpoint` prefers over the instance
 * option when present (`endpoint.baseURL ?? this._getOption('baseURL')` —
 * see `RESTler.ts`'s `_processEndpoint`). That per-request override is the
 * mechanism this client relies on: the write host is set as the instance's
 * default `baseURL` in the constructor (so every endpoint method gets it
 * for free), and each read-operation method explicitly passes
 * `baseURL: this.__searchBaseURL` on its own endpoint object to redirect
 * just that one call to the search/read host — no other connect needs this
 * because no other vendor genuinely splits reads and writes across two
 * hosts the way Algolia does.
 *
 * @example
 * ```typescript
 * import { Algolia } from '@tundraconnect/algolia';
 *
 * const client = new Algolia({
 *   auth: {
 *     type: 'CUSTOM',
 *     applicationId: 'YOUR_APP_ID',
 *     apiKey: 'YOUR_ADMIN_API_KEY',
 *   },
 * });
 *
 * const results = await client.search('products', { query: 'red shoes' });
 * console.log(results.hits[0]?.objectID);
 *
 * const saved = await client.saveObject('products', { name: 'Blue socks' });
 * await client.waitTask('products', saved.taskID);
 * ```
 */
export class Algolia extends RESTler<AlgoliaOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'Algolia';

  /** Algolia Application ID configured for this client. Not a secret. */
  get applicationId(): string {
    return this._getOption('auth').applicationId;
  }

  /**
   * Search/read host, derived from `auth.applicationId` — see the class
   * doc's "Dual base URL" section for the full mechanism. Passed as
   * `baseURL` on the per-request `RESTlerEndpoint` for read operations
   * ({@link search}, {@link getObject}, {@link browseObjects}); every other
   * method relies on the instance's default `baseURL` (the write host) set
   * in the constructor.
   */
  private get __searchBaseURL(): string {
    return `https://${this.applicationId}-dsn.algolia.net`;
  }

  /**
   * Creates a new Algolia client instance.
   *
   * Validates `auth` immediately and derives the default `baseURL` (the
   * write host, `https://{applicationId}.algolia.net`) from
   * `auth.applicationId` — pass an explicit `baseURL` to override it (e.g.
   * to target a proxy). The search/read host is derived the same way, on
   * demand, by {@link __searchBaseURL}.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - `{ type: 'CUSTOM', applicationId, apiKey }` — see
   * {@link AlgoliaAuth}.
   * @throws {AlgoliaError} `CONFIG_INVALID_AUTH` when `auth` is missing or
   * not `{ type: 'CUSTOM', ... }`, `CONFIG_INVALID_APPLICATION_ID` when
   * `auth.applicationId` is missing/empty, or `CONFIG_INVALID_API_KEY` when
   * `auth.apiKey` is missing/empty.
   */
  constructor(options: EventOptionKeys<AlgoliaOptions, RESTlerEvents>) {
    // `baseURL` is derived from `auth.applicationId`, so it must be read off
    // the raw constructor argument here — before `super()` — rather than
    // through `_processOption`, which only runs once `super()` has started
    // building the option store (see AzureBlob.ts's constructor for the
    // same technique against `auth.account`).
    const auth = options?.auth as Partial<AlgoliaAuth> | undefined;
    const applicationId = typeof auth?.applicationId === 'string'
      ? auth.applicationId.trim()
      : '';
    if (!applicationId) {
      throw new AlgoliaError('CONFIG_INVALID_APPLICATION_ID', {
        applicationId: auth?.applicationId,
      });
    }
    super(options, {
      baseURL: `https://${applicationId}.algolia.net`,
      timeout: 10,
      contentType: 'JSON',
    });
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Search an index (`POST {searchHost}/1/indexes/{indexName}/query`).
   *
   * A read operation — sent to the search/read host, not the write host
   * (see the class doc's "Dual base URL" section).
   *
   * @param indexName - Name of the index to search.
   * @param request - Query and paging options — see {@link SearchRequestSchema}.
   * @returns Promise resolving to {@link SearchResponseSchema}.
   * @throws {AlgoliaError} `INVALID_REQUEST` for a malformed `indexName`/
   * `request`, `AUTH_FAILED`, `NOT_FOUND`, `RATE_LIMITED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const results = await client.search('products', { query: 'red shoes', hitsPerPage: 20 });
   * console.log(results.nbHits, results.hits.map((h) => h.objectID));
   * ```
   */
  public async search(
    indexName: string,
    request: SearchRequestSchema,
  ): Promise<SearchResponseSchema> {
    this.__requireNonEmpty(indexName, 'indexName');
    const [error, payload] = SearchRequestSchemaObject.safeParse(request);
    if (error || !payload) {
      throw new AlgoliaError('INVALID_REQUEST', {
        message: error?.message ?? 'request failed local validation',
        responseError: (error as GuardianError | null)?.toJSON(),
      });
    }

    return await this.__requestAndValidate(
      {
        baseURL: this.__searchBaseURL,
        path: `/1/indexes/${this.__encodeSegment(indexName)}/query`,
        method: 'POST',
        contentType: 'JSON',
        payload,
      },
      SearchResponseSchemaObject,
    );
  }

  /**
   * Save (create or fully replace) an object
   * (`POST {writeHost}/1/indexes/{indexName}`).
   *
   * A write operation — uses the instance's default `baseURL` (the write
   * host; no per-call override needed). Indexing is asynchronous: the
   * response confirms Algolia accepted the write, not that it's live yet —
   * pass the returned `taskID` to {@link waitTask} to confirm.
   *
   * @param indexName - Name of the index to write to.
   * @param object - Arbitrary JSON object to save. An `objectID` field is
   * honored if present; Algolia generates one otherwise.
   * @returns Promise resolving to {@link SaveObjectResponseSchema}.
   * @throws {AlgoliaError} `INVALID_REQUEST` for a malformed `indexName`/
   * `object`, `AUTH_FAILED`, `RATE_LIMITED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const saved = await client.saveObject('products', { name: 'Blue socks', price: 4.5 });
   * console.log(saved.objectID, saved.taskID);
   * ```
   */
  public async saveObject(
    indexName: string,
    object: Record<string, unknown>,
  ): Promise<SaveObjectResponseSchema> {
    this.__requireNonEmpty(indexName, 'indexName');
    const [error, payload] = AlgoliaObjectPayloadSchemaObject.safeParse(
      object,
    );
    if (error || !payload) {
      throw new AlgoliaError('INVALID_REQUEST', {
        message: error?.message ?? 'object must be a plain JSON object',
        responseError: (error as GuardianError | null)?.toJSON(),
      });
    }

    return await this.__requestAndValidate(
      {
        path: `/1/indexes/${this.__encodeSegment(indexName)}`,
        method: 'POST',
        contentType: 'JSON',
        payload,
      },
      SaveObjectResponseSchemaObject,
    );
  }

  /**
   * Retrieve a single object by id
   * (`GET {searchHost}/1/indexes/{indexName}/{objectID}`).
   *
   * A read operation — sent to the search/read host, matching Algolia's own
   * API clients (single-object GETs are categorized as reads).
   *
   * @param indexName - Name of the index to read from.
   * @param objectID - Id of the object to retrieve.
   * @returns Promise resolving to {@link AlgoliaObjectSchema}.
   * @throws {AlgoliaError} `INVALID_REQUEST` for a malformed `indexName`/
   * `objectID`, `AUTH_FAILED`, `NOT_FOUND`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const object = await client.getObject('products', 'abc123');
   * console.log(object.name);
   * ```
   */
  public async getObject(
    indexName: string,
    objectID: string,
  ): Promise<AlgoliaObjectSchema> {
    this.__requireNonEmpty(indexName, 'indexName');
    this.__requireNonEmpty(objectID, 'objectID');

    return await this.__requestAndValidate(
      {
        baseURL: this.__searchBaseURL,
        path: `/1/indexes/${this.__encodeSegment(indexName)}/${
          this.__encodeSegment(objectID)
        }`,
        method: 'GET',
      },
      AlgoliaObjectSchemaObject,
    );
  }

  /**
   * Delete a single object by id
   * (`DELETE {writeHost}/1/indexes/{indexName}/{objectID}`).
   *
   * A write operation — uses the instance's default `baseURL` (the write
   * host). Like {@link saveObject}, the deletion is queued asynchronously —
   * pass the returned `taskID` to {@link waitTask} to confirm it's live.
   *
   * @param indexName - Name of the index to delete from.
   * @param objectID - Id of the object to delete.
   * @returns Promise resolving to {@link DeleteObjectResponseSchema}.
   * @throws {AlgoliaError} `INVALID_REQUEST` for a malformed `indexName`/
   * `objectID`, `AUTH_FAILED`, `NOT_FOUND`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const deleted = await client.deleteObject('products', 'abc123');
   * await client.waitTask('products', deleted.taskID);
   * ```
   */
  public async deleteObject(
    indexName: string,
    objectID: string,
  ): Promise<DeleteObjectResponseSchema> {
    this.__requireNonEmpty(indexName, 'indexName');
    this.__requireNonEmpty(objectID, 'objectID');

    return await this.__requestAndValidate(
      {
        path: `/1/indexes/${this.__encodeSegment(indexName)}/${
          this.__encodeSegment(objectID)
        }`,
        method: 'DELETE',
      },
      DeleteObjectResponseSchemaObject,
    );
  }

  /**
   * Scan every object in an index, one page at a time
   * (`POST {searchHost}/1/indexes/{indexName}/browse`).
   *
   * A read operation — sent to the search/read host. Distinct from
   * {@link search}: browse is a cursor-based full scan intended to export
   * or iterate an entire index (unranked, unaffected by relevance), not a
   * relevance-ranked, `page`-based query. Call it repeatedly, each time
   * passing the previous response's `cursor` back in `request.cursor`,
   * until a response omits `cursor` — that page is the last one.
   *
   * @param indexName - Name of the index to scan.
   * @param request - Paging/cursor options — see {@link BrowseRequestSchema}.
   * @returns Promise resolving to {@link BrowseResponseSchema}.
   * @throws {AlgoliaError} `INVALID_REQUEST` for a malformed `indexName`/
   * `request`, `AUTH_FAILED`, `NOT_FOUND`, `RATE_LIMITED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * let cursor: string | undefined;
   * do {
   *   const page = await client.browseObjects('products', { cursor, hitsPerPage: 1000 });
   *   for (const hit of page.hits) console.log(hit.objectID);
   *   cursor = page.cursor;
   * } while (cursor);
   * ```
   */
  public async browseObjects(
    indexName: string,
    request: BrowseRequestSchema = {},
  ): Promise<BrowseResponseSchema> {
    this.__requireNonEmpty(indexName, 'indexName');
    const [error, payload] = BrowseRequestSchemaObject.safeParse(request);
    if (error || !payload) {
      throw new AlgoliaError('INVALID_REQUEST', {
        message: error?.message ?? 'request failed local validation',
        responseError: (error as GuardianError | null)?.toJSON(),
      });
    }

    return await this.__requestAndValidate(
      {
        baseURL: this.__searchBaseURL,
        path: `/1/indexes/${this.__encodeSegment(indexName)}/browse`,
        method: 'POST',
        contentType: 'JSON',
        payload,
      },
      BrowseResponseSchemaObject,
    );
  }

  /**
   * Poll an indexing task's status until it publishes
   * (`GET {writeHost}/1/indexes/{indexName}/task/{taskID}`).
   *
   * A write-side operation (task status tracks an indexing write) — uses
   * the instance's default `baseURL` (the write host). Polls on a fixed
   * interval up to a bounded total time budget; this is a finite,
   * time-boxed loop (not an unbounded `while (true)`) — it always either
   * resolves once Algolia reports `status: 'published'` or throws
   * `TASK_TIMEOUT` once `timeoutMs` elapses.
   *
   * @param indexName - Name of the index the task belongs to.
   * @param taskID - Id of the task to poll, as returned by
   * {@link saveObject}/{@link deleteObject}.
   * @param options - Polling configuration — see {@link WaitTaskOptions}.
   * @returns Promise resolving to {@link TaskStatusSchema} once `status` is
   * `'published'`.
   * @throws {AlgoliaError} `INVALID_REQUEST` for a malformed `indexName`/
   * `taskID`/`options`, `TASK_TIMEOUT` if the budget elapses first,
   * `AUTH_FAILED`, `NOT_FOUND`, `RATE_LIMITED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const saved = await client.saveObject('products', { name: 'Blue socks' });
   * await client.waitTask('products', saved.taskID, { timeoutMs: 30_000 });
   * // The index is now guaranteed to reflect the save.
   * ```
   */
  public async waitTask(
    indexName: string,
    taskID: number,
    options: WaitTaskOptions = {},
  ): Promise<TaskStatusSchema> {
    this.__requireNonEmpty(indexName, 'indexName');
    if (!Number.isFinite(taskID) || taskID < 0) {
      throw new AlgoliaError('INVALID_REQUEST', {
        message: `taskID must be a non-negative number, got ${taskID}`,
      });
    }
    const intervalMs = options.intervalMs ?? DEFAULT_WAIT_TASK_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TASK_TIMEOUT_MS;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new AlgoliaError('INVALID_REQUEST', {
        message: `intervalMs must be a positive number, got ${intervalMs}`,
      });
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new AlgoliaError('INVALID_REQUEST', {
        message: `timeoutMs must be a positive number, got ${timeoutMs}`,
      });
    }

    const path = `/1/indexes/${this.__encodeSegment(indexName)}/task/${taskID}`;
    const deadline = Date.now() + timeoutMs;
    let last: TaskStatusSchema;
    while (true) {
      last = await this.__requestAndValidate(
        { path, method: 'GET' },
        TaskStatusSchemaObject,
      );
      if (last.status === 'published') {
        return last;
      }
      if (Date.now() >= deadline) {
        throw new AlgoliaError('TASK_TIMEOUT', {
          indexName,
          taskID,
          timeoutMs,
          lastStatus: last.status,
        });
      }
      await this.__sleep(intervalMs);
    }
  }

  /**
   * Injects Algolia's two credential headers into outgoing requests.
   *
   * Chaining to `super()` first preserves the base class's auth-config
   * validation (a no-op for `CUSTOM` auth, but keeps the contract). Both
   * headers are set from the resolved auth: `x-algolia-application-id`
   * (not secret) and `x-algolia-api-key` (secret — redacted by
   * {@link _isSensitiveHeader} below).
   *
   * @param endpoint - The request object to modify.
   * @protected
   */
  protected override _authInjector(
    endpoint: RESTlerEndpoint,
  ): void | Promise<void> {
    super._authInjector(endpoint);
    const auth = (endpoint.auth ?? this._getOption('auth')) as
      | AlgoliaAuth
      | undefined;
    if (!auth || auth.type !== 'CUSTOM') return;
    endpoint.headers ??= {};
    endpoint.headers['x-algolia-application-id'] = auth.applicationId;
    endpoint.headers['x-algolia-api-key'] = auth.apiKey;
  }

  /**
   * Marks Algolia's API-key header as sensitive.
   *
   * RESTler's default sensitive set covers the standard credential headers
   * (`Authorization`, `X-Api-Key`, ...) but not Algolia's vendor-specific
   * `x-algolia-api-key`, so without this override the raw key would surface
   * in `call`/`authFailure` event payloads and thrown-error request
   * contexts — the exact bug class this repo's adversarial review already
   * found and fixed once, in CoinGecko's `x-cg-*-api-key` headers.
   * `x-algolia-application-id` is deliberately NOT redacted — it isn't a
   * credential (see {@link AlgoliaAuth.applicationId}). Chaining to
   * `super()` keeps the base credential headers redacted too.
   *
   * @param name - The header name (as it appears on the request).
   * @returns `true` if the header's value should be redacted.
   * @protected
   */
  protected override _isSensitiveHeader(name: string): boolean {
    return name.toLowerCase() === 'x-algolia-api-key' ||
      super._isSensitiveHeader(name);
  }

  /**
   * Processes and validates configuration options.
   *
   * @param key - The option key to process.
   * @param value - The option value to process.
   * @returns The processed and validated option value.
   * @throws {AlgoliaError} `CONFIG_INVALID_AUTH`, `CONFIG_INVALID_APPLICATION_ID`,
   * or `CONFIG_INVALID_API_KEY` when `auth` is invalid.
   * @protected
   */
  protected override _processOption<
    K extends keyof AlgoliaOptions,
  >(
    key: K,
    value: AlgoliaOptions[K],
  ): AlgoliaOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as Partial<AlgoliaAuth> | undefined;
        if (!auth || auth.type !== 'CUSTOM') {
          throw new AlgoliaError('CONFIG_INVALID_AUTH', {
            authType: (auth as { type?: unknown } | undefined)?.type,
          });
        }
        const applicationId = typeof auth.applicationId === 'string'
          ? auth.applicationId.trim()
          : '';
        if (!applicationId) {
          throw new AlgoliaError('CONFIG_INVALID_APPLICATION_ID', {
            applicationId: auth.applicationId,
          });
        }
        // Validated but deliberately never placed in an error's context —
        // not even the malformed value — per this connect's rule that
        // `apiKey` must never be echoed anywhere a log/event could surface
        // it (see `_isSensitiveHeader` above for the equivalent header-side
        // rule).
        if (typeof auth.apiKey !== 'string' || auth.apiKey.trim() === '') {
          throw new AlgoliaError('CONFIG_INVALID_API_KEY', {});
        }
        value = {
          type: 'CUSTOM',
          applicationId,
          apiKey: auth.apiKey.trim(),
        } as AlgoliaOptions[K];
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Percent-encodes a caller-controlled path segment (`indexName`/
   * `objectID`/`taskID`) before it's interpolated into an endpoint `path`.
   *
   * `RESTlerEndpoint.path` is joined onto the base URL via `path.join`,
   * which normalizes `.`/`..` segments and collapses `//` — see that
   * field's doc. `encodeURIComponent` alone escapes `/` (as `%2F`) but
   * leaves `.` untouched (it's an RFC 3986 "unreserved" character), so a
   * segment that is exactly `.`/`..`, or contains a `/`, would otherwise
   * silently resolve `path.join` to a different endpoint instead of
   * erroring. Escaping `.` too closes that gap.
   *
   * @param segment - The raw, caller-supplied path segment.
   * @returns The segment, safe to interpolate into an endpoint `path`.
   */
  private __encodeSegment(segment: string): string {
    return encodeURIComponent(segment).replace(/\./g, '%2E');
  }

  /** Throws `INVALID_REQUEST` when `value` is not a non-empty (post-trim) string. */
  private __requireNonEmpty(value: string, field: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new AlgoliaError('INVALID_REQUEST', {
        message: `${field} must be a non-empty string`,
      });
    }
  }

  /** Resolves after `ms` milliseconds — the poll delay used by {@link waitTask}. */
  private __sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link AlgoliaError} — so `AlgoliaError` stays the only thing a
   * public method throws for "the vendor responded, but the body doesn't
   * match what was expected."
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
   * @throws {AlgoliaError} `RESPONSE_ERROR` when the body fails validation.
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
        throw new AlgoliaError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      if (err instanceof RESTlerRateLimitError) {
        // RESTler retried once (maxRetryWait) and was throttled again, or the
        // vendor's hint exceeded the cap — surface it as this connect's own
        // error, with the hint and whether a wait already happened.
        throw new AlgoliaError('RATE_LIMITED', {
          status: 429,
          retryAfterSeconds: err.getContextValue('retryAfter'),
          retried: err.getContextValue('retried'),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates Algolia's
   * `{ message, status }` error envelope into a {@link AlgoliaError}. Runs
   * on every response (registered on `_responseHandler` in the
   * constructor); does nothing for a response below 400, leaving
   * success-body validation to {@link __requestAndValidate}.
   *
   * Dispatches purely on HTTP status — Algolia's envelope carries no
   * separate vendor error code to key off (see `errors/AlgoliaErrorCodes.ts`).
   *
   * @param response - The parsed response, before any schema validation.
   * @throws {AlgoliaError} `AUTH_FAILED`, `NOT_FOUND`, `RATE_LIMITED`,
   * `INVALID_REQUEST`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   * @private
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body; // let 2xx (and any non-error status) through

    const [envelopeErr, envelope] = ErrorEnvelopeSchemaObject.safeParse(
      response.body,
    );
    const message = !envelopeErr && envelope ? envelope.message : undefined;

    const context: Record<string, unknown> = { status, body: response.body };
    if (message !== undefined) context.message = message;

    if (status === 401 || status === 403) {
      throw new AlgoliaError('AUTH_FAILED', context);
    }
    if (status === 404) {
      throw new AlgoliaError('NOT_FOUND', context);
    }
    if (status === 429) {
      throw new AlgoliaError('RATE_LIMITED', {
        ...context,
        retryAfterSeconds: this._parseRetryAfter(response.headers),
      });
    }
    if (status === 400 || status === 422) {
      throw new AlgoliaError('INVALID_REQUEST', context);
    }
    if (status >= 500) {
      throw new AlgoliaError('SERVICE_UNAVAILABLE', context);
    }
    throw new AlgoliaError('UNKNOWN_ERROR', context);
  }
}
