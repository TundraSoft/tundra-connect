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
  CloudflareSaaSError,
  type CloudflareSaaSErrorCode,
} from './errors/mod.ts';
import {
  type CreateCustomHostnameRequestSchema,
  CreateCustomHostnameRequestSchemaObject,
  type CustomHostnamePageSchema,
  CustomHostnamePageSchemaObject,
  type CustomHostnameQuotaSchema,
  CustomHostnameQuotaSchemaObject,
  type CustomHostnameSchema,
  CustomHostnameSchemaObject,
  ErrorEnvelopeSchemaObject,
  type ErrorItemSchema,
  type FallbackOriginRequestSchema,
  FallbackOriginRequestSchemaObject,
  type FallbackOriginSchema,
  FallbackOriginSchemaObject,
  type ListCustomHostnamesQuerySchema,
  ListCustomHostnamesQuerySchemaObject,
  type SslRequestSchema,
  type UpdateCustomHostnameRequestSchema,
  UpdateCustomHostnameRequestSchemaObject,
} from './schema/mod.ts';

/** Cloudflare's v4 REST API root. */
export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

/** The `ssl` block sent when a create request names none — what the dashboard does. */
export const DEFAULT_SSL: Readonly<SslRequestSchema> = {
  method: 'http',
  type: 'dv',
};

/** A Cloudflare identifier (zone id, custom hostname id): opaque, URL-safe, bounded. */
const IDENTIFIER = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Cloudflare authenticates the custom hostnames API with a Bearer API
 * token, so `BEARER` is the only shape admitted — RESTler's base
 * `_authInjector` already emits `Authorization: Bearer <token>`, which is
 * why this connect has no `_authInjector` override.
 *
 * The token needs **Zone → SSL and Certificates → Edit** on the SaaS zone
 * (Read is enough for the list/get methods). One that authenticates but
 * lacks the permission fails as `FORBIDDEN`, not `AUTH_FAILED`.
 */
export type CloudflareSaaSAuth = {
  type: 'BEARER';
  /** Cloudflare API token with SSL and Certificates permissions on the zone. */
  token: string;
  /** Authorization header scheme prefix. Cloudflare documents `Bearer`. */
  prefix?: string;
};

/** Options for configuring a {@link CloudflareSaaS} client. */
export type CloudflareSaaSOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link CloudflareSaaSAuth}. */
  auth: CloudflareSaaSAuth;
  /**
   * The zone Cloudflare for SaaS is enabled on — the one your fallback
   * origin and SaaS target (`customers.yourapp.com`) live in. Every custom
   * hostname this client manages belongs to it.
   */
  zoneId: string;
};

/** Arguments to {@link CloudflareSaaS.listCustomHostnames}. */
export type ListCustomHostnamesOptions = ListCustomHostnamesQuerySchema;

/** Arguments to {@link CloudflareSaaS.findCustomHostname}. */
export type FindCustomHostnameOptions = {
  /** The hostname to look up, e.g. `app.customer.com`. Case-insensitive. */
  hostname: string;
};

/** Arguments to {@link CloudflareSaaS.createCustomHostname}. */
export type CreateCustomHostnameOptions = CreateCustomHostnameRequestSchema;

/** Arguments to {@link CloudflareSaaS.getCustomHostname} and {@link CloudflareSaaS.deleteCustomHostname}. */
export type CustomHostnameRefOptions = {
  /** The custom hostname's id (not the hostname itself). */
  id: string;
};

/** Arguments to {@link CloudflareSaaS.updateCustomHostname}. */
export type UpdateCustomHostnameOptions =
  & CustomHostnameRefOptions
  & UpdateCustomHostnameRequestSchema;

/** Arguments to {@link CloudflareSaaS.setFallbackOrigin}. */
export type SetFallbackOriginOptions = FallbackOriginRequestSchema;

/** The `result` of a successful hostname `DELETE`: the id that was removed. */
export type DeletedCustomHostname = {
  /** Id of the deleted custom hostname. */
  id: string;
};

/**
 * Maps Cloudflare's numeric error codes onto this connect's stable names.
 * The custom hostnames service documents its codes in the 14xx range; a
 * 14xx code absent from this table is `INVALID_REQUEST`, and anything else
 * falls back to HTTP-status mapping. Codes 1000–1005 are the service's own
 * bearer-token failures (401); 6111 / 9xxx / 10000 the API gateway's
 * authentication family; 7000 / 7003 "no such route", which is what an
 * unknown zone id looks like.
 */
const VENDOR_CODE_MAP: Record<number, CloudflareSaaSErrorCode> = {
  1000: 'AUTH_FAILED',
  1001: 'AUTH_FAILED',
  1002: 'AUTH_FAILED',
  1003: 'AUTH_FAILED',
  1004: 'AUTH_FAILED',
  1005: 'AUTH_FAILED',
  1403: 'AUTH_FAILED',
  1404: 'QUOTA_EXCEEDED',
  1405: 'QUOTA_EXCEEDED',
  1406: 'DUPLICATE_HOSTNAME',
  1407: 'INVALID_HOSTNAME',
  1408: 'INVALID_HOSTNAME',
  1409: 'INVALID_HOSTNAME',
  1410: 'INVALID_HOSTNAME',
  1411: 'INVALID_HOSTNAME',
  1413: 'FORBIDDEN',
  1414: 'FORBIDDEN',
  1415: 'INVALID_HOSTNAME',
  1416: 'INVALID_HOSTNAME',
  1417: 'INVALID_HOSTNAME',
  1418: 'INVALID_HOSTNAME',
  1419: 'INVALID_HOSTNAME',
  1420: 'INVALID_HOSTNAME',
  1421: 'INVALID_HOSTNAME',
  1431: 'NOT_FOUND',
  1436: 'NOT_FOUND',
  1500: 'SERVICE_UNAVAILABLE',
  6111: 'AUTH_FAILED',
  7000: 'NOT_FOUND',
  7003: 'NOT_FOUND',
  9103: 'AUTH_FAILED',
  9106: 'AUTH_FAILED',
  9109: 'AUTH_FAILED',
  10000: 'AUTH_FAILED',
};

const DeletedCustomHostnameSchemaObject: BaseGuardian<DeletedCustomHostname> =
  Guardian.object({ id: Guardian.string() }).passthrough();

/**
 * Cloudflare for SaaS client — custom hostnames over the `client/v4` REST
 * API (`/zones/{zone_id}/custom_hostnames`), plus the zone's fallback
 * origin and custom hostname quota.
 *
 * A SaaS platform lets each customer bring their own domain
 * (`app.customer.com`) and CNAME it at the platform's SaaS target
 * (`customers.yourapp.com`). Each such domain is a *custom hostname* in the
 * platform's zone: Cloudflare verifies the customer owns it, issues a
 * certificate for it, and routes its traffic to the zone's *fallback
 * origin* (or a per-hostname `custom_origin_server`). This client manages
 * that lifecycle. Responses are unwrapped from Cloudflare's
 * `{success, errors, messages, result}` envelope; the list method keeps
 * `result_info` next to `result` for paging.
 *
 * @example
 * ```typescript
 * import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';
 *
 * const saas = new CloudflareSaaS({
 *   auth: { type: 'BEARER', token: 'YOUR_API_TOKEN' },
 *   zoneId: 'YOUR_SAAS_ZONE_ID',
 * });
 *
 * // A customer typed their domain into your onboarding form:
 * const hostname = await saas.createCustomHostname({
 *   hostname: 'app.customer.com',
 *   ssl: { method: 'txt', type: 'dv' },
 * });
 * // Show them the records to publish, then poll getCustomHostname until
 * // status and ssl.status are both 'active'.
 * console.log(hostname.ownership_verification, hostname.ssl?.validation_records);
 * ```
 */
export class CloudflareSaaS extends RESTler<CloudflareSaaSOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'CloudflareSaaS';

  /** The configured SaaS zone id. */
  get zoneId(): string {
    return this._getOption('zoneId');
  }

  /**
   * Creates a Cloudflare for SaaS client.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - `{ type: 'BEARER', token, prefix? }` — a
   * Cloudflare API token with SSL and Certificates permissions.
   * @param options.zoneId - The zone Cloudflare for SaaS is enabled on.
   * @throws {CloudflareSaaSError} `CONFIG_INVALID_API_TOKEN` when `auth` is
   * missing, isn't `type: 'BEARER'`, or its `token` is blank;
   * `CONFIG_INVALID_ZONE_ID` when `zoneId` is missing, blank or not an
   * identifier.
   */
  constructor(options: EventOptionKeys<CloudflareSaaSOptions, RESTlerEvents>) {
    super(options, {
      baseURL: CLOUDFLARE_API,
      timeout: 30,
      contentType: 'JSON',
    });
    // `_setOptions` only routes keys PRESENT on the argument through
    // `_processOption`, so an omitted key would otherwise surface as a
    // vendor 400 or a request to `/zones/undefined/...`.
    if (!this._hasOption('auth')) {
      throw new CloudflareSaaSError('CONFIG_INVALID_API_TOKEN');
    }
    if (!this._hasOption('zoneId')) {
      throw new CloudflareSaaSError('CONFIG_INVALID_ZONE_ID');
    }
    this._responseHandler = (response) => this.__unwrap(response, false);
  }

  //#region Custom hostnames

  /**
   * List the zone's custom hostnames —
   * `GET /zones/{zone_id}/custom_hostnames`. Filter by exact `hostname` to
   * find one customer's domain, or by `hostname_status` / `ssl_status` to
   * find everything still pending.
   *
   * @param options - Optional filters, paging (`page`, `per_page` 5–1000)
   * and ordering.
   * @returns The page of hostnames with Cloudflare's `result_info`.
   * @throws {CloudflareSaaSError} `REQUEST_VALIDATION_ERROR` for an invalid
   * filter; `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND` (unknown zone),
   * `INVALID_REQUEST`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE` or
   * `UNKNOWN_ERROR` when Cloudflare rejects it; `RESPONSE_ERROR` when a
   * success body fails validation.
   *
   * @example
   * ```typescript
   * import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';
   *
   * declare const saas: CloudflareSaaS;
   *
   * const pending = await saas.listCustomHostnames({ hostname_status: 'pending' });
   * for (const h of pending.result) console.log(h.hostname, h.ssl?.status);
   * ```
   */
  public async listCustomHostnames(
    options: ListCustomHostnamesOptions = {},
  ): Promise<CustomHostnamePageSchema> {
    const query = this.__validate(
      ListCustomHostnamesQuerySchemaObject,
      options,
    );
    return await this.__requestAndValidate(
      {
        path: `/zones/${this.zoneId}/custom_hostnames`,
        method: 'GET',
        query: CloudflareSaaS.__query(query),
      },
      CustomHostnamePageSchemaObject,
      true,
    );
  }

  /**
   * Look up one custom hostname by its exact name —
   * `GET /zones/{zone_id}/custom_hostnames?hostname.exact=<hostname>`.
   *
   * The result is re-checked locally with a case-insensitive comparison,
   * so a partial match can never be returned as the customer's hostname.
   *
   * @param options - The hostname.
   * @returns The custom hostname, or `null` when the zone has none by
   * that name.
   * @throws {CloudflareSaaSError} `REQUEST_VALIDATION_ERROR` for a blank
   * hostname; otherwise as
   * {@link CloudflareSaaS.listCustomHostnames}.
   *
   * @example
   * ```typescript
   * import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';
   *
   * declare const saas: CloudflareSaaS;
   *
   * const existing = await saas.findCustomHostname({
   *   hostname: 'app.customer.com',
   * });
   * if (existing === null) {
   *   // not attached yet
   * }
   * ```
   */
  public async findCustomHostname(
    options: FindCustomHostnameOptions,
  ): Promise<CustomHostnameSchema | null> {
    const hostname = options?.hostname;
    if (typeof hostname !== 'string' || hostname.trim() === '') {
      throw CloudflareSaaS.__invalid('hostname: cannot be empty');
    }
    const wanted = hostname.trim().toLowerCase();
    const page = await this.__requestAndValidate(
      {
        path: `/zones/${this.zoneId}/custom_hostnames`,
        method: 'GET',
        query: { 'hostname.exact': wanted },
      },
      CustomHostnamePageSchemaObject,
      true,
    );
    return page.result.find((h) => h.hostname.toLowerCase() === wanted) ??
      null;
  }

  /**
   * Add a customer's domain as a custom hostname —
   * `POST /zones/{zone_id}/custom_hostnames`.
   *
   * The request is validated locally ({@link CreateCustomHostnameRequestSchema});
   * when `ssl` is omitted, {@link DEFAULT_SSL} (`http` DCV) is sent, as the
   * dashboard does. The returned hostname is `pending`: hand its
   * `ownership_verification` / `ownership_verification_http` and
   * `ssl.validation_records` to the customer (or rely on them pointing
   * their CNAME at your SaaS target), then poll
   * {@link CloudflareSaaS.getCustomHostname} until `status` and
   * `ssl.status` are `active`.
   *
   * @param options - The hostname and optional certificate, metadata and
   * origin options.
   * @returns The created custom hostname, with its `id`.
   * @throws {CloudflareSaaSError} `REQUEST_VALIDATION_ERROR` when the
   * request fails local validation; `INVALID_HOSTNAME` when Cloudflare
   * refuses the hostname or origin; `DUPLICATE_HOSTNAME` (Cloudflare code 1406,
   * and only that code) when it already exists in this zone; `QUOTA_EXCEEDED` when the zone has no quota left;
   * `FORBIDDEN` when the token or plan lacks an entitlement (custom
   * metadata, custom origin); otherwise as
   * {@link CloudflareSaaS.listCustomHostnames}.
   *
   * @example
   * ```typescript
   * import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';
   *
   * declare const saas: CloudflareSaaS;
   *
   * const created = await saas.createCustomHostname({
   *   hostname: 'app.customer.com',
   *   ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.2' } },
   *   custom_metadata: { tenant: 'acme' },
   * });
   * console.log(created.id, created.status, created.ssl?.validation_records);
   * ```
   */
  public async createCustomHostname(
    options: CreateCustomHostnameOptions,
  ): Promise<CustomHostnameSchema> {
    const payload = this.__validate(
      CreateCustomHostnameRequestSchemaObject,
      options,
    );
    payload.ssl ??= { ...DEFAULT_SSL };
    return await this.__requestAndValidate(
      {
        path: `/zones/${this.zoneId}/custom_hostnames`,
        method: 'POST',
        contentType: 'JSON',
        payload: payload as Record<string, unknown>,
      },
      CustomHostnameSchemaObject,
    );
  }

  /**
   * Fetch one custom hostname —
   * `GET /zones/{zone_id}/custom_hostnames/{id}`. This is what to poll
   * while a hostname activates.
   *
   * @param options - The custom hostname id.
   * @returns The custom hostname.
   * @throws {CloudflareSaaSError} `REQUEST_VALIDATION_ERROR` for a blank or
   * malformed `id`; `NOT_FOUND` for an unknown one; otherwise as
   * {@link CloudflareSaaS.listCustomHostnames}.
   *
   * @example
   * ```typescript
   * import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';
   *
   * declare const saas: CloudflareSaaS;
   *
   * const h = await saas.getCustomHostname({ id: 'CUSTOM_HOSTNAME_ID' });
   * const live = h.status === 'active' && h.ssl?.status === 'active';
   * ```
   */
  public async getCustomHostname(
    options: CustomHostnameRefOptions,
  ): Promise<CustomHostnameSchema> {
    const id = CloudflareSaaS.__identifier('id', options?.id);
    return await this.__requestAndValidate(
      {
        path: `/zones/${this.zoneId}/custom_hostnames/${id}`,
        method: 'GET',
      },
      CustomHostnameSchemaObject,
    );
  }

  /**
   * Change a custom hostname's certificate options, metadata or origin —
   * `PATCH /zones/{zone_id}/custom_hostnames/{id}`. Re-sending `ssl` with
   * the current `method` and `type` asks Cloudflare to retry a validation
   * that timed out.
   *
   * @param options - The custom hostname id and the fields to change (at
   * least one).
   * @returns The updated custom hostname (Cloudflare answers `202`; the
   * change applies asynchronously).
   * @throws {CloudflareSaaSError} `REQUEST_VALIDATION_ERROR` for a malformed
   * `id`, no fields, or an invalid field; `NOT_FOUND`; `INVALID_REQUEST`
   * (code 1439) when the hostname cannot be modified in its current state;
   * `FORBIDDEN` for an entitlement the plan lacks; otherwise as
   * {@link CloudflareSaaS.createCustomHostname}.
   *
   * @example
   * ```typescript
   * import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';
   *
   * declare const saas: CloudflareSaaS;
   *
   * // Retry a validation that timed out, switching to TXT.
   * await saas.updateCustomHostname({
   *   id: 'CUSTOM_HOSTNAME_ID',
   *   ssl: { method: 'txt', type: 'dv' },
   * });
   * ```
   */
  public async updateCustomHostname(
    options: UpdateCustomHostnameOptions,
  ): Promise<CustomHostnameSchema> {
    const { id: rawId, ...changes } = options ?? {};
    const id = CloudflareSaaS.__identifier('id', rawId);
    const payload = this.__validate(
      UpdateCustomHostnameRequestSchemaObject,
      changes,
    );
    if (Object.keys(payload).length === 0) {
      throw CloudflareSaaS.__invalid(
        'at least one field to change is required',
      );
    }
    return await this.__requestAndValidate(
      {
        path: `/zones/${this.zoneId}/custom_hostnames/${id}`,
        method: 'PATCH',
        contentType: 'JSON',
        payload: payload as Record<string, unknown>,
      },
      CustomHostnameSchemaObject,
    );
  }

  /**
   * Remove a custom hostname and any certificate issued for it —
   * `DELETE /zones/{zone_id}/custom_hostnames/{id}`.
   *
   * @param options - The custom hostname id.
   * @returns `{ id }` of the deleted hostname.
   * @throws {CloudflareSaaSError} `REQUEST_VALIDATION_ERROR` for a malformed
   * `id`; `NOT_FOUND` for an unknown one; otherwise as
   * {@link CloudflareSaaS.listCustomHostnames}.
   *
   * @example
   * ```typescript
   * import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';
   *
   * declare const saas: CloudflareSaaS;
   *
   * await saas.deleteCustomHostname({ id: 'CUSTOM_HOSTNAME_ID' });
   * ```
   */
  public async deleteCustomHostname(
    options: CustomHostnameRefOptions,
  ): Promise<DeletedCustomHostname> {
    const id = CloudflareSaaS.__identifier('id', options?.id);
    return await this.__requestAndValidate(
      {
        path: `/zones/${this.zoneId}/custom_hostnames/${id}`,
        method: 'DELETE',
      },
      DeletedCustomHostnameSchemaObject,
    );
  }

  //#endregion

  //#region Fallback origin and quota

  /**
   * Read the zone's fallback origin —
   * `GET /zones/{zone_id}/custom_hostnames/fallback_origin`.
   *
   * @returns The fallback origin and its deployment status.
   * @throws {CloudflareSaaSError} `NOT_FOUND` when none is configured;
   * otherwise as {@link CloudflareSaaS.listCustomHostnames}.
   *
   * @example
   * ```typescript
   * import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';
   *
   * declare const saas: CloudflareSaaS;
   *
   * const origin = await saas.getFallbackOrigin();
   * console.log(origin.origin, origin.status);
   * ```
   */
  public async getFallbackOrigin(): Promise<FallbackOriginSchema> {
    return await this.__requestAndValidate(
      {
        path: `/zones/${this.zoneId}/custom_hostnames/fallback_origin`,
        method: 'GET',
      },
      FallbackOriginSchemaObject,
    );
  }

  /**
   * Set the zone's fallback origin —
   * `PUT /zones/{zone_id}/custom_hostnames/fallback_origin`. The origin
   * must already exist as a DNS record in this zone.
   *
   * @param options - The origin hostname.
   * @returns The fallback origin, typically `pending_deployment` at first.
   * @throws {CloudflareSaaSError} `REQUEST_VALIDATION_ERROR` for a malformed
   * `origin`; `INVALID_HOSTNAME` / `INVALID_REQUEST` when Cloudflare
   * refuses it; otherwise as {@link CloudflareSaaS.listCustomHostnames}.
   *
   * @example
   * ```typescript
   * import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';
   *
   * declare const saas: CloudflareSaaS;
   *
   * await saas.setFallbackOrigin({ origin: 'fallback.yourapp.com' });
   * ```
   */
  public async setFallbackOrigin(
    options: SetFallbackOriginOptions,
  ): Promise<FallbackOriginSchema> {
    const payload = this.__validate(FallbackOriginRequestSchemaObject, options);
    return await this.__requestAndValidate(
      {
        path: `/zones/${this.zoneId}/custom_hostnames/fallback_origin`,
        method: 'PUT',
        contentType: 'JSON',
        payload: payload as Record<string, unknown>,
      },
      FallbackOriginSchemaObject,
    );
  }

  /**
   * Remove the zone's fallback origin —
   * `DELETE /zones/{zone_id}/custom_hostnames/fallback_origin`.
   *
   * @returns The fallback origin, now `pending_deletion`.
   * @throws {CloudflareSaaSError} `NOT_FOUND` when none is configured;
   * otherwise as {@link CloudflareSaaS.listCustomHostnames}.
   *
   * @example
   * ```typescript
   * import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';
   *
   * declare const saas: CloudflareSaaS;
   *
   * await saas.deleteFallbackOrigin();
   * ```
   */
  public async deleteFallbackOrigin(): Promise<FallbackOriginSchema> {
    return await this.__requestAndValidate(
      {
        path: `/zones/${this.zoneId}/custom_hostnames/fallback_origin`,
        method: 'DELETE',
      },
      FallbackOriginSchemaObject,
    );
  }

  /**
   * Read the zone's custom hostname quota —
   * `GET /zones/{zone_id}/custom_hostnames/quota`.
   *
   * @returns Allocated, used and hard-cap counts.
   * @throws {CloudflareSaaSError} As {@link CloudflareSaaS.listCustomHostnames}.
   *
   * @example
   * ```typescript
   * import { CloudflareSaaS } from '@tundraconnect/cloudflare-saas';
   *
   * declare const saas: CloudflareSaaS;
   *
   * const quota = await saas.getQuota();
   * if (quota.exceeded) console.warn('out of custom hostnames');
   * ```
   */
  public async getQuota(): Promise<CustomHostnameQuotaSchema> {
    return await this.__requestAndValidate(
      {
        path: `/zones/${this.zoneId}/custom_hostnames/quota`,
        method: 'GET',
      },
      CustomHostnameQuotaSchemaObject,
    );
  }

  //#endregion

  /**
   * Validates the two options this connect owns beyond `RESTlerOptions`.
   * Runs only for keys actually present on the constructor argument — the
   * constructor's own `hasOption` guards cover the absent case.
   */
  protected override _processOption<K extends keyof CloudflareSaaSOptions>(
    key: K,
    value: CloudflareSaaSOptions[K],
  ): CloudflareSaaSOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as CloudflareSaaSAuth;
        if (
          !auth || auth.type !== 'BEARER' || typeof auth.token !== 'string' ||
          auth.token.trim() === ''
        ) {
          throw new CloudflareSaaSError('CONFIG_INVALID_API_TOKEN');
        }
        // Cloudflare documents `Authorization: Bearer <token>`; RESTler's own
        // default prefix is the scheme name in upper case, so pin the
        // documented spelling unless the caller chose one.
        value = {
          ...auth,
          prefix: auth.prefix ?? 'Bearer',
        } as CloudflareSaaSOptions[K];
        break;
      }
      case 'zoneId': {
        if (typeof value !== 'string' || !IDENTIFIER.test(value.trim())) {
          throw new CloudflareSaaSError('CONFIG_INVALID_ZONE_ID');
        }
        value = value.trim() as CloudflareSaaSOptions[K];
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Every request funnels through here, so a transport failure surfaces as
   * this connect's own error on every path: a timeout as `TIMEOUT`, a
   * failure before any response as `NETWORK_ERROR`, and an exhausted
   * RESTler rate-limit retry (`maxRetryWait`) as `RATE_LIMITED` — all
   * `transient`. A {@link CloudflareSaaSError} from the response handler passes
   * through unchanged.
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

  /** `err` rewrapped as this connect's transient code, or returned unchanged. */
  private __transportError(err: unknown, timeout: number | undefined): unknown {
    if (err instanceof RESTlerRateLimitError) {
      // RESTler retried once (maxRetryWait) and was throttled again, or the
      // vendor's hint exceeded the cap.
      return new CloudflareSaaSError('RATE_LIMITED', {
        status: 429,
        retryAfterSeconds: err.getContextValue('retryAfter'),
        retried: err.getContextValue('retried'),
      }, err);
    }
    if (err instanceof RESTlerTimeoutError) {
      return new CloudflareSaaSError('TIMEOUT', {
        timeoutSeconds: timeout ?? this._getOption('timeout'),
      }, err);
    }
    // RESTlerResponseValidationError (and the two above) extend
    // RESTlerRequestError: only a bare one is a failure before any response.
    if (
      err instanceof RESTlerRequestError &&
      !(err instanceof RESTlerResponseValidationError)
    ) {
      return new CloudflareSaaSError('NETWORK_ERROR', {}, err);
    }
    return err;
  }

  /**
   * Makes a request and validates its (already unwrapped) body against
   * `guard`, translating RESTler's generic validation and rate-limit errors
   * into a {@link CloudflareSaaSError}. `paged` keeps `result_info` next to
   * `result` for the list endpoint.
   */
  private async __requestAndValidate<B>(
    endpoint: RESTlerEndpoint,
    guard: BaseGuardian<B>,
    paged = false,
  ): Promise<B> {
    try {
      const resp = await this._makeRequest(endpoint, {
        responseHandler: paged
          ? (response) => this.__unwrap(response, true)
          : undefined,
        responseSchema: (data) => guard.parse(data),
      });
      return resp.body as B;
    } catch (err) {
      if (err instanceof RESTlerResponseValidationError) {
        throw new CloudflareSaaSError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler.
   *
   * Cloudflare wraps every `client/v4` response in
   * `{success, errors, messages, result, result_info?}`. On success this
   * returns `result` — or, for a paged endpoint, `{ result, result_info }`
   * — so each method's `responseSchema` validates what a caller wants
   * rather than the wrapper. A body that isn't an envelope passes through
   * untouched so `responseSchema` can report what actually arrived.
   *
   * A failure is classified by Cloudflare's own numeric code where one is
   * recognised ({@link VENDOR_CODE_MAP}, consulting `error_chain` too), by
   * the 14xx range the custom hostnames service owns, then by HTTP status.
   * `success: false` on a 2xx counts as a failure: the envelope's own flag
   * is authoritative.
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
    throw new CloudflareSaaSError(CloudflareSaaS.__codeFor(status, first), {
      retryAfterSeconds: this._parseRetryAfter(response.headers),
      status,
      detail,
      vendorCode: first?.code,
      body,
    });
  }

  /** Classifies a failure by vendor code (and its chain), range, then status. */
  private static __codeFor(
    status: number,
    first: ErrorItemSchema | undefined,
  ): CloudflareSaaSErrorCode {
    const codes = first
      ? [first.code, ...(first.error_chain ?? []).map((e) => e.code)]
      : [];
    for (const code of codes) {
      const mapped = VENDOR_CODE_MAP[code];
      if (mapped) {
        // 10000 "Authentication error" is also what a token that is valid
        // but lacks the permission gets, as a 403 — report that as FORBIDDEN.
        if (mapped === 'AUTH_FAILED' && status === 403) return 'FORBIDDEN';
        return mapped;
      }
      // The rest of the service's own 14xx range is a malformed request.
      if (code >= 1400 && code < 1500) return 'INVALID_REQUEST';
    }
    return CloudflareSaaS.__statusToCode(status);
  }

  /** HTTP-status fallback for a failure carrying no recognised vendor code. */
  private static __statusToCode(status: number): CloudflareSaaSErrorCode {
    if (status === 401) return 'AUTH_FAILED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'SERVICE_UNAVAILABLE';
    if (status >= 400) return 'INVALID_REQUEST';
    return 'UNKNOWN_ERROR';
  }

  /** Checks an id is a URL-safe identifier; returns it ready for a path. */
  private static __identifier(field: string, value: unknown): string {
    if (typeof value !== 'string' || !IDENTIFIER.test(value.trim())) {
      throw CloudflareSaaS.__invalid(
        `${field}: must be a Cloudflare identifier (letters, digits, - or _)`,
      );
    }
    return value.trim();
  }

  /** Validates `value` with `guard`, or throws `REQUEST_VALIDATION_ERROR`. */
  private __validate<T>(guard: BaseGuardian<T>, value: unknown): T {
    try {
      return guard.parse(value);
    } catch (cause) {
      throw new CloudflareSaaSError(
        'REQUEST_VALIDATION_ERROR',
        {
          reason: CloudflareSaaS.__describeInvalid(cause),
          responseError: (cause as GuardianError | undefined)?.toJSON?.(),
        },
        cause instanceof Error ? cause : undefined,
      );
    }
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
   * field, e.g. `hostname: …`. Falls back to the schema's own message for a
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
  private static __invalid(reason: string): CloudflareSaaSError {
    return new CloudflareSaaSError('REQUEST_VALIDATION_ERROR', { reason });
  }
}
