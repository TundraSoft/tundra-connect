import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { type BaseGuardian, GuardianError } from '@guardian';
import {
  type CreateReleaseRequestSchema,
  CreateReleaseRequestSchemaObject,
  ErrorSchemaObject,
  type IssueSchema,
  IssueSchemaObject,
  type ListIssueEventsRequestSchema,
  ListIssueEventsRequestSchemaObject,
  type ListIssueEventsResponseSchema,
  ListIssueEventsResponseSchemaObject,
  type ListIssuesRequestSchema,
  ListIssuesRequestSchemaObject,
  type ListIssuesResponseSchema,
  ListIssuesResponseSchemaObject,
  type ListProjectsRequestSchema,
  ListProjectsRequestSchemaObject,
  type ListProjectsResponseSchema,
  ListProjectsResponseSchemaObject,
  type ReleaseSchema,
  ReleaseSchemaObject,
  type UpdateIssueRequestSchema,
  UpdateIssueRequestSchemaObject,
} from './schema/mod.ts';
import { SentryError, type SentryErrorCode } from './errors/mod.ts';

/**
 * Sentry authentication — a Bearer token sent on every request. Both an
 * organization auth token (prefix `sntrys_`) and a legacy personal token
 * work identically as a Bearer token; `RESTlerAuth`'s `BEARER` variant
 * already matches this exactly, so this narrows it to the one shape Sentry
 * actually accepts (Sentry's REST API has no Basic/custom-header auth mode
 * to admit here — that's distinct from the separate, semi-binary DSN-based
 * event-ingestion protocol, which this connect does not implement).
 */
export type SentryAuth = {
  type: 'BEARER';
  /** Sentry auth token (an organization token, prefix `sntrys_`, or a legacy personal token). */
  token: string;
  /** Authorization header scheme prefix. Sentry documents `Bearer`. */
  prefix?: string;
};

/** Options for configuring a {@link Sentry} client. */
export type SentryOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link SentryAuth}. */
  auth: SentryAuth;
  /**
   * Organization slug (or numeric ID) every endpoint on this client is
   * scoped to — every method here operates on `GET|POST|PUT
   * /organizations/{organization}/...`, so it's modelled as a required
   * constructor option (like Twilio's `accountSid`) rather than repeated on
   * every call. Read back via the {@link Sentry.organization} getter.
   */
  organization: string;
};

/**
 * Sentry client for the organization/project REST API
 * (`https://sentry.io/api/0/`) — see https://docs.sentry.io/api/.
 *
 * Covers reading and triaging issues (list/get/update, plus an issue's raw
 * events), listing projects, and publishing releases. Scoped to the
 * DSN-based event-ingestion protocol's REST counterpart, not the protocol
 * itself: sending a new error/exception into Sentry uses a separate,
 * semi-binary envelope format sent to a per-project DSN, architecturally
 * foreign to this connect's request/response client pattern, and is out of
 * scope here.
 *
 * Self-hosted/region Sentry instances are supported through the normal
 * `baseURL` override every connect exposes — no dedicated option beyond
 * that.
 *
 * @example
 * ```typescript
 * import { Sentry } from '@tundraconnect/sentry';
 *
 * const client = new Sentry({
 *   auth: { type: 'BEARER', token: 'sntrys_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
 *   organization: 'my-org',
 * });
 *
 * const { issues } = await client.listIssues({ query: 'is:unresolved' });
 * for (const issue of issues) console.log(issue.shortId, issue.title);
 * ```
 */
export class Sentry extends RESTler<SentryOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'Sentry';

  /** The organization slug/ID every endpoint on this client is scoped to. */
  get organization(): string {
    return this._getOption('organization');
  }

  /**
   * Creates a new Sentry client instance.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - `{ type: 'BEARER', token, prefix? }` — see
   * {@link SentryAuth}. RESTler's base `_authInjector` already emits
   * `Authorization: <prefix> <token>` for `type: 'BEARER'`, so no auth
   * override is needed here.
   * @param options.organization - Organization slug (or numeric ID) — see
   * {@link SentryOptions.organization}.
   * @throws {SentryError} `CONFIG_INVALID_TOKEN` if `auth` is missing, isn't
   * `type: 'BEARER'`, or its `token` is blank or not a string.
   * @throws {SentryError} `CONFIG_INVALID_ORGANIZATION` if `organization` is
   * missing, blank, or not a string.
   */
  constructor(options: EventOptionKeys<SentryOptions, RESTlerEvents>) {
    super(options, {
      baseURL: 'https://sentry.io/api/0',
      timeout: 30,
      contentType: 'JSON',
    });
    // `auth`/`organization` are required by the type, but a caller that
    // bypasses the type checker (or builds options dynamically) can omit
    // either entirely. `_setOptions` only routes keys actually PRESENT on
    // the constructor argument through `_processOption`, so an absent
    // required option slips past the switch-based validation in
    // `_processOption` below and would otherwise only surface as a raw
    // auth failure or a literal `undefined` in a request path on the first
    // call. Fail fast here instead — mirrors RESTler's own `baseURL` guard
    // in its constructor, and SendGrid's `auth` guard.
    if (!this.hasOption('auth')) {
      throw new SentryError('CONFIG_INVALID_TOKEN', {});
    }
    if (!this.hasOption('organization')) {
      throw new SentryError('CONFIG_INVALID_ORGANIZATION', {});
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * List the projects visible to the configured organization, via
   * `GET /organizations/{organization}/projects/`.
   *
   * @param options - Filter/pagination options; see
   * {@link ListProjectsRequestSchema}. All fields are optional.
   * @returns Promise resolving to {@link ListProjectsResponseSchema} — one
   * page of projects plus a convenience `nextCursor` (Sentry's cursor,
   * extracted from the response's `Link` header). Pass it back as
   * `options.cursor` to fetch the following page; it's `undefined` on the
   * last page.
   * @throws {SentryError} `INVALID_REQUEST` if `options` fails local
   * validation, `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const page = await client.listProjects();
   * for (const project of page.projects) console.log(project.slug);
   * ```
   */
  public async listProjects(
    options: ListProjectsRequestSchema = {},
  ): Promise<ListProjectsResponseSchema> {
    const parsed = this.__parseRequest(
      ListProjectsRequestSchemaObject,
      options,
    );
    const qs = this.__query({
      cursor: parsed.cursor,
      per_page: parsed.perPage !== undefined
        ? String(parsed.perPage)
        : undefined,
      query: parsed.query,
    });

    return await this.__requestAndValidatePaginated(
      {
        path: `/organizations/${this.organization}/projects/`,
        method: 'GET',
        baseURL: this.__endpointBaseURL(qs),
      },
      ListProjectsResponseSchemaObject,
      'projects',
    );
  }

  /**
   * List issues across the configured organization, via
   * `GET /organizations/{organization}/issues/`.
   *
   * @param options - Filter/pagination options; see
   * {@link ListIssuesRequestSchema}. All fields are optional; `query`
   * defaults to `is:unresolved` on the vendor side when omitted.
   * @returns Promise resolving to {@link ListIssuesResponseSchema} — one
   * page of issues plus a convenience `nextCursor`. Pass it back as
   * `options.cursor` to fetch the following page; it's `undefined` on the
   * last page.
   * @throws {SentryError} `INVALID_REQUEST` if `options` fails local
   * validation, `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const page = await client.listIssues({ query: 'is:unresolved', sort: 'freq' });
   * for (const issue of page.issues) console.log(issue.shortId, issue.title);
   * ```
   */
  public async listIssues(
    options: ListIssuesRequestSchema = {},
  ): Promise<ListIssuesResponseSchema> {
    const parsed = this.__parseRequest(ListIssuesRequestSchemaObject, options);
    const qs = this.__query({
      project: parsed.project,
      query: parsed.query,
      environment: parsed.environment,
      statsPeriod: parsed.statsPeriod,
      sort: parsed.sort,
      cursor: parsed.cursor,
      limit: parsed.limit !== undefined ? String(parsed.limit) : undefined,
    });

    return await this.__requestAndValidatePaginated(
      {
        path: `/organizations/${this.organization}/issues/`,
        method: 'GET',
        baseURL: this.__endpointBaseURL(qs),
      },
      ListIssuesResponseSchemaObject,
      'issues',
    );
  }

  /**
   * Retrieve a single issue, via
   * `GET /organizations/{organization}/issues/{issue_id}/`.
   *
   * @param issueId - The issue's ID or short ID (e.g. `PUMP-STATION-1`).
   * @returns Promise resolving to {@link IssueSchema}.
   * @throws {SentryError} `INVALID_REQUEST` if `issueId` is blank,
   * `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const issue = await client.getIssue('PUMP-STATION-1');
   * console.log(issue.status);
   * ```
   */
  public async getIssue(issueId: string): Promise<IssueSchema> {
    const id = this.__requireNonEmpty(issueId, 'issueId');

    return await this.__requestAndValidate(
      {
        path: `/organizations/${this.organization}/issues/${
          encodeURIComponent(id)
        }/`,
        method: 'GET',
      },
      IssueSchemaObject,
    );
  }

  /**
   * Update an issue's status, priority, assignment, or visibility, via
   * `PUT /organizations/{organization}/issues/{issue_id}/`.
   *
   * @param issueId - The issue's ID or short ID.
   * @param options - Fields to update; see {@link UpdateIssueRequestSchema}.
   * At least one field is required.
   * @returns Promise resolving to the updated {@link IssueSchema}.
   * @throws {SentryError} `INVALID_REQUEST` if `issueId` is blank or
   * `options` fails local validation (including supplying no fields at
   * all), `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const issue = await client.updateIssue('PUMP-STATION-1', {
   *   status: 'resolved',
   * });
   * ```
   */
  public async updateIssue(
    issueId: string,
    options: UpdateIssueRequestSchema,
  ): Promise<IssueSchema> {
    const id = this.__requireNonEmpty(issueId, 'issueId');
    const parsed = this.__parseRequest(UpdateIssueRequestSchemaObject, options);

    return await this.__requestAndValidate(
      {
        path: `/organizations/${this.organization}/issues/${
          encodeURIComponent(id)
        }/`,
        method: 'PUT',
        contentType: 'JSON',
        payload: parsed as unknown as Record<string, unknown>,
      },
      IssueSchemaObject,
    );
  }

  /**
   * List the raw events recorded for a single issue, via
   * `GET /organizations/{organization}/issues/{issue_id}/events/`.
   *
   * @param issueId - The issue's ID or short ID.
   * @param options - Filter/pagination options; see
   * {@link ListIssueEventsRequestSchema}. All fields are optional.
   * @returns Promise resolving to {@link ListIssueEventsResponseSchema} —
   * one page of events plus a convenience `nextCursor`. Pass it back as
   * `options.cursor` to fetch the following page; it's `undefined` on the
   * last page.
   * @throws {SentryError} `INVALID_REQUEST` if `issueId` is blank or
   * `options` fails local validation, `AUTH_FAILED`, `FORBIDDEN`,
   * `NOT_FOUND`, `RATE_LIMITED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or
   * `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const page = await client.listIssueEvents('PUMP-STATION-1');
   * for (const event of page.events) console.log(event.id, event.dateCreated);
   * ```
   */
  public async listIssueEvents(
    issueId: string,
    options: ListIssueEventsRequestSchema = {},
  ): Promise<ListIssueEventsResponseSchema> {
    const id = this.__requireNonEmpty(issueId, 'issueId');
    const parsed = this.__parseRequest(
      ListIssueEventsRequestSchemaObject,
      options,
    );
    const qs = this.__query({
      start: parsed.start,
      end: parsed.end,
      statsPeriod: parsed.statsPeriod,
      environment: parsed.environment,
      full: parsed.full !== undefined ? String(parsed.full) : undefined,
      query: parsed.query,
      per_page: parsed.perPage !== undefined
        ? String(parsed.perPage)
        : undefined,
      cursor: parsed.cursor,
    });

    return await this.__requestAndValidatePaginated(
      {
        path: `/organizations/${this.organization}/issues/${
          encodeURIComponent(id)
        }/events/`,
        method: 'GET',
        baseURL: this.__endpointBaseURL(qs),
      },
      ListIssueEventsResponseSchemaObject,
      'events',
    );
  }

  /**
   * Create a new release for the configured organization, via
   * `POST /organizations/{organization}/releases/`.
   *
   * @param options - The release to create; see
   * {@link CreateReleaseRequestSchema}. `version` and `projects` are
   * required.
   * @returns Promise resolving to the created {@link ReleaseSchema}.
   * @throws {SentryError} `INVALID_REQUEST` if `options` fails local
   * validation, `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const release = await client.createRelease({
   *   version: 'frontend@1.0.0',
   *   projects: ['frontend'],
   *   ref: 'abc123',
   * });
   * console.log(release.id);
   * ```
   */
  public async createRelease(
    options: CreateReleaseRequestSchema,
  ): Promise<ReleaseSchema> {
    const parsed = this.__parseRequest(
      CreateReleaseRequestSchemaObject,
      options,
    );

    return await this.__requestAndValidate(
      {
        path: `/organizations/${this.organization}/releases/`,
        method: 'POST',
        contentType: 'JSON',
        payload: parsed as unknown as Record<string, unknown>,
      },
      ReleaseSchemaObject,
    );
  }

  /**
   * Validates `value` against `guard`, translating a failure into a
   * {@link SentryError} `INVALID_REQUEST` instead of letting Guardian's own
   * error escape — every public method's local-validation failures go
   * through this one helper so they all throw the same error class/code.
   *
   * @throws {SentryError} `INVALID_REQUEST` when `value` fails validation.
   */
  private __parseRequest<T>(guard: BaseGuardian<T>, value: unknown): T {
    const [error, parsed] = guard.safeParse(value);
    if (error || !parsed) {
      throw new SentryError('INVALID_REQUEST', {
        status: 'local',
        detail: error?.message ?? 'validation failed',
        responseError: error?.toJSON(),
      }, error ?? undefined);
    }
    return parsed;
  }

  /** Validates that `value` is a non-empty string, trimming it first. */
  private __requireNonEmpty(value: string, field: string): string {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed === '') {
      throw new SentryError('INVALID_REQUEST', {
        status: 'local',
        detail: `'${field}' must be a non-empty string`,
      });
    }
    return trimmed;
  }

  /**
   * Serializes `params` into a `key=value&...` query string, RFC
   * 3986-encoded via `encodeURIComponent` (matching how RESTler itself
   * encodes `RESTlerEndpoint.query` — see `RESTler._processEndpoint`).
   * `undefined` entries are dropped. An array value is encoded as a
   * REPEATED key (`project=1&project=2`) — Sentry's documented convention
   * for multi-value filters — which `RESTlerEndpoint.query` (a plain
   * `Record<string, string>`, one value per key) cannot express; that's why
   * this exists instead of just building `endpoint.query` directly. Pair
   * with {@link __endpointBaseURL} to actually apply the result.
   *
   * @returns The query string (no leading `?`), or `undefined` if `params`
   * had no defined entries.
   */
  private __query(
    params: Record<string, string | string[] | undefined>,
  ): string | undefined {
    const pairs: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      for (const entry of Array.isArray(value) ? value : [value]) {
        pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(entry)}`);
      }
    }
    return pairs.length > 0 ? pairs.join('&') : undefined;
  }

  /**
   * Embeds `queryString` into a per-call `endpoint.baseURL` override, so
   * `RESTler._processEndpoint` parses it as the request's `search` (`new
   * URL(baseURL)` preserves repeated keys in a query string; only
   * `endpoint.query` — applied afterwards via `url.search = ...` — would
   * silently overwrite it). Returns `undefined` (letting the endpoint fall
   * back to the instance's configured `baseURL`, unchanged) when there's no
   * query string to apply.
   *
   * @param queryString - Output of {@link __query}, if any.
   */
  private __endpointBaseURL(
    queryString: string | undefined,
  ): string | undefined {
    if (!queryString) return undefined;
    return `${this._getOption('baseURL')}?${queryString}`;
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link SentryError} — so `SentryError` stays the only thing a
   * public method throws for "the vendor responded, but the body doesn't
   * match what was expected." `B` is inferred from `guard`, so callers no
   * longer separately write out a `_makeRequest<B>()` type argument.
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
   * @throws {SentryError} `RESPONSE_ERROR` when the body fails validation.
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
        throw new SentryError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Like {@link __requestAndValidate}, for the three GET-list endpoints
   * that return a bare JSON array (`listProjects`/`listIssues`/
   * `listIssueEvents`). Wraps the validated array under `itemsKey`
   * alongside a `nextCursor` extracted from the response's `Link` header
   * (see {@link __nextCursor}) before `guard` validates it — a per-call
   * `responseHandler` is used (rather than the connect-wide
   * `_responseHandler`) specifically so this wrapping can see `response`
   * (body AND headers together); `responseSchema` only ever sees a body.
   * Per `RESTlerRequestOptions`'s documented contract, `responseHandler`
   * and `responseSchema` compose in one `_makeRequest` call (the handler's
   * return value feeds the schema next) — only the connect-wide
   * `_responseHandler` default is what a per-call `responseHandler`
   * replaces, not `responseSchema`. Error mapping still goes through
   * {@link __toError} first, so a 4xx/5xx throws exactly as it would for
   * any other endpoint.
   *
   * @template B - The expected (wrapped) response body type.
   * @param endpoint - The endpoint to request.
   * @param guard - Guardian schema object for validating the wrapped body.
   * @param itemsKey - The key the raw array is nested under before `guard`
   * sees it (e.g. `'projects'`).
   * @returns The validated, wrapped response data.
   * @throws {SentryError} `RESPONSE_ERROR` when the body fails validation.
   */
  private async __requestAndValidatePaginated<B>(
    endpoint: RESTlerEndpoint,
    guard: BaseGuardian<B>,
    itemsKey: string,
  ): Promise<B> {
    try {
      const resp = await this._makeRequest(endpoint, {
        responseHandler: (response) =>
          this.__toPaginatedBody(response, itemsKey),
        responseSchema: (data) => guard.parse(data),
      });
      return resp.body as B;
    } catch (err) {
      if (err instanceof RESTlerResponseValidationError) {
        throw new SentryError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Per-call {@link RESTlerResponseHandler} for a paginated list endpoint —
   * see {@link __requestAndValidatePaginated}. Runs {@link __toError} first
   * (throws on 4xx/5xx, same as every other endpoint); on success, nests
   * the raw array body under `itemsKey` and attaches `nextCursor`.
   */
  private __toPaginatedBody(
    response: RESTlerResponse<unknown>,
    itemsKey: string,
  ): Record<string, unknown> {
    const body = this.__toError(response);
    return {
      [itemsKey]: Array.isArray(body) ? body : [],
      nextCursor: this.__nextCursor(response.headers),
    };
  }

  /**
   * Extracts the next-page cursor from an RFC 5988 `Link` response header,
   * e.g. `<url>; rel="previous"; results="false"; cursor="0:0:0",
   * <url>; rel="next"; results="true"; cursor="0:100:0"` (see
   * https://docs.sentry.io/api/pagination/). Matches each `<url>; attr="v"
   * ...` entry directly (rather than splitting the header on `,`, which a
   * comma inside a quoted attribute value could break) and returns the
   * `rel="next"` entry's `cursor`, or `undefined` when that entry is
   * missing, has no `cursor`, or is marked `results="false"` (no next page
   * — Sentry always emits a `rel="next"` link, even on the last page).
   */
  private __nextCursor(headers?: Record<string, string>): string | undefined {
    const link = headers?.['link'];
    if (!link) return undefined;
    const LINK_ENTRY = /<[^>]*>\s*(?:;\s*[a-zA-Z]+="[^"]*")*/g;
    for (const entry of link.match(LINK_ENTRY) ?? []) {
      if (entry.match(/rel="([^"]*)"/)?.[1] !== 'next') continue;
      if (entry.match(/results="([^"]*)"/)?.[1] === 'false') return undefined;
      return entry.match(/cursor="([^"]*)"/)?.[1];
    }
    return undefined;
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates Sentry's
   * HTTP-status/error-envelope conventions into a {@link SentryError}. Runs
   * on every response (registered on `_responseHandler` in the
   * constructor, and reused directly by {@link __toPaginatedBody} for the
   * paginated endpoints' per-call handler); does nothing for a response
   * below 400, leaving success-body validation to
   * {@link __requestAndValidate}/{@link __requestAndValidatePaginated}.
   *
   * A `429` reads Sentry's documented rate-limit headers
   * (`X-Sentry-Rate-Limit-{Limit,Remaining,Reset,ConcurrentLimit,
   * ConcurrentRemaining}` — see https://docs.sentry.io/api/ratelimits/;
   * Sentry documents no `Retry-After`) into the thrown error's context.
   * Every other 4xx parses Sentry's `{ detail, causes? }` error envelope
   * (see https://docs.sentry.io/api/); an unparseable body falls back to
   * the HTTP-status-based code with the raw body attached for diagnostics.
   * Never includes the configured auth token — nothing here reads it.
   *
   * @param response - The parsed response, before any schema validation.
   * @throws {SentryError} `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`,
   * `INVALID_REQUEST`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, or
   * `UNKNOWN_ERROR`, matching the vendor's documented status/message pairs.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body; // let 2xx (and any non-error status) through

    if (status === 429) {
      const headers = response.headers;
      throw new SentryError('RATE_LIMITED', {
        status,
        rateLimitLimit: headers?.['x-sentry-rate-limit-limit'],
        rateLimitRemaining: headers?.['x-sentry-rate-limit-remaining'],
        rateLimitReset: headers?.['x-sentry-rate-limit-reset'],
        rateLimitConcurrentLimit: headers
          ?.['x-sentry-rate-limit-concurrentlimit'],
        rateLimitConcurrentRemaining: headers
          ?.['x-sentry-rate-limit-concurrentremaining'],
      });
    }

    const [err, body] = ErrorSchemaObject.safeParse(response.body);
    const code = this.__errorCodeForStatus(status);
    if (body) {
      throw new SentryError(code, {
        status,
        detail: body.detail,
        causes: body.causes,
      });
    }
    // Body missing or didn't match the documented error envelope — fall
    // back to SERVICE_UNAVAILABLE for 5xx (Sentry's own outage pages rarely
    // follow the JSON contract), otherwise the status-mapped code with the
    // raw body attached for diagnostics.
    throw new SentryError(
      status >= 500 ? 'SERVICE_UNAVAILABLE' : code,
      {
        status,
        body: response.body,
        responseError: err?.toJSON(),
      },
    );
  }

  /** Map an HTTP status code to a stable, connect-specific error code. */
  private __errorCodeForStatus(status: number): SentryErrorCode {
    switch (status) {
      case 400:
        return 'INVALID_REQUEST';
      case 401:
        return 'AUTH_FAILED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 429:
        return 'RATE_LIMITED';
      default:
        if (status >= 500) return 'SERVICE_UNAVAILABLE';
        return 'UNKNOWN_ERROR';
    }
  }

  /**
   * Validates configuration options specific to the Sentry client before
   * passing them to the parent class.
   *
   * @throws {SentryError} `CONFIG_INVALID_TOKEN` when `auth` is present but
   * isn't a `BEARER` auth with a non-empty `token`, or
   * `CONFIG_INVALID_ORGANIZATION` when `organization` is present but isn't
   * a non-empty string.
   */
  protected override _processOption<K extends keyof SentryOptions>(
    key: K,
    value: SentryOptions[K],
  ): SentryOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as SentryAuth;
        if (
          !auth || auth.type !== 'BEARER' ||
          typeof auth.token !== 'string' || auth.token.trim() === ''
        ) {
          // Never echo the raw `token` here (as a message placeholder or
          // as context) — it's a live Sentry auth token, and `context` is
          // stored on the thrown error verbatim (see `BaseError.toJSON`),
          // so anything placed here is just as exposed as the message text.
          throw new SentryError('CONFIG_INVALID_TOKEN', {});
        }
        value = {
          type: 'BEARER',
          token: auth.token.trim(),
          prefix: auth.prefix,
        } as SentryOptions[K];
        break;
      }
      case 'organization': {
        const organization = value as unknown as string;
        if (typeof organization !== 'string' || organization.trim() === '') {
          throw new SentryError('CONFIG_INVALID_ORGANIZATION', {});
        }
        value = organization.trim() as SentryOptions[K];
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }
}
