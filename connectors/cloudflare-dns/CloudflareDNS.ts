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
  CloudflareDNSError,
  type CloudflareDNSErrorCode,
} from './errors/mod.ts';
import {
  type DnsRecordBatchRequestSchema,
  DnsRecordBatchRequestSchemaObject,
  type DnsRecordBatchResultSchema,
  DnsRecordBatchResultSchemaObject,
  type DnsRecordPageSchema,
  DnsRecordPageSchemaObject,
  type DnsRecordPatchSchema,
  DnsRecordPatchSchemaObject,
  type DnsRecordRequestSchema,
  DnsRecordRequestSchemaObject,
  type DnsRecordSchema,
  DnsRecordSchemaObject,
  ErrorEnvelopeSchemaObject,
  type ErrorItemSchema,
  type ListDnsRecordsQuerySchema,
  ListDnsRecordsQuerySchemaObject,
  type ListZonesQuerySchema,
  ListZonesQuerySchemaObject,
  type ZonePageSchema,
  ZonePageSchemaObject,
  type ZoneSchema,
  ZoneSchemaObject,
} from './schema/mod.ts';

/** Cloudflare's v4 REST API root. */
export const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

/** A Cloudflare identifier (zone id, record id): opaque, URL-safe, bounded. */
const IDENTIFIER = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Cloudflare authenticates the DNS API with a Bearer API token, so
 * `BEARER` is the only shape admitted — RESTler's base `_authInjector`
 * already emits `Authorization: Bearer <token>`, which is why this connect
 * has no `_authInjector` override.
 *
 * The token needs **Zone → DNS → Edit** on the zone(s) you manage (Read is
 * enough for `listRecords` / `getRecord` / `exportRecords`), and
 * **Zone → Zone → Read** for `listZones` / `getZone`. One that
 * authenticates but lacks a permission fails as `FORBIDDEN`, not
 * `AUTH_FAILED`.
 */
export type CloudflareDNSAuth = {
  type: 'BEARER';
  /** Cloudflare API token with DNS permissions on the zone. */
  token: string;
  /** Authorization header scheme prefix. Cloudflare documents `Bearer`. */
  prefix?: string;
};

/** Options for configuring a {@link CloudflareDNS} client. */
export type CloudflareDNSOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link CloudflareDNSAuth}. */
  auth: CloudflareDNSAuth;
  /**
   * The zone every record method targets unless the call names its own
   * `zoneId`. Optional: a client managing many zones can leave it out and
   * pass `zoneId` per call. Find it on the zone's Overview page in the
   * dashboard, or with {@link CloudflareDNS.listZones}.
   */
  zoneId?: string;
};

/** Names the zone a call targets, overriding the client's `zoneId`. */
export type ZoneScoped = {
  /** Zone id for this one call. Required when the client has no `zoneId`. */
  zoneId?: string;
};

/** Arguments to {@link CloudflareDNS.listRecords}. */
export type ListRecordsOptions = ZoneScoped & ListDnsRecordsQuerySchema;

/** Arguments to {@link CloudflareDNS.getRecord} and {@link CloudflareDNS.deleteRecord}. */
export type RecordRefOptions = ZoneScoped & {
  /** The DNS record's id. */
  recordId: string;
};

/** Arguments to {@link CloudflareDNS.createRecord}. */
export type CreateRecordOptions = ZoneScoped & DnsRecordRequestSchema;

/** Arguments to {@link CloudflareDNS.updateRecord}. */
export type UpdateRecordOptions = RecordRefOptions & DnsRecordPatchSchema;

/** Arguments to {@link CloudflareDNS.replaceRecord}. */
export type ReplaceRecordOptions = RecordRefOptions & DnsRecordRequestSchema;

/** Arguments to {@link CloudflareDNS.batch}. */
export type BatchOptions = ZoneScoped & DnsRecordBatchRequestSchema;

/** Arguments to {@link CloudflareDNS.listZones}. */
export type ListZonesOptions = ListZonesQuerySchema;

/** The `result` of a successful `DELETE`: the id that was removed. */
export type DeletedRecord = {
  /** Id of the deleted DNS record. */
  id: string;
};

/**
 * Maps Cloudflare's numeric error codes onto this connect's stable names. A
 * code absent from this table falls back to HTTP-status mapping. Codes in
 * the 9xxx/10000 range are the API gateway's authentication family; 7000 /
 * 7003 are "no such route", which is what an unknown zone id looks like;
 * 1004 is the DNS validation error; 81xxx are the DNS service's own.
 */
const VENDOR_CODE_MAP: Record<number, CloudflareDNSErrorCode> = {
  1004: 'INVALID_REQUEST',
  6111: 'AUTH_FAILED',
  7000: 'NOT_FOUND',
  7003: 'NOT_FOUND',
  9103: 'AUTH_FAILED',
  9106: 'AUTH_FAILED',
  9109: 'AUTH_FAILED',
  10000: 'AUTH_FAILED',
  81044: 'NOT_FOUND',
  81053: 'RECORD_CONFLICT',
  81056: 'RECORD_CONFLICT',
  81057: 'RECORD_CONFLICT',
};

const DeletedRecordSchemaObject: BaseGuardian<DeletedRecord> = Guardian.object({
  id: Guardian.string(),
}).passthrough();

const ExportSchemaObject: BaseGuardian<string> = Guardian.string();

/**
 * Cloudflare DNS client — zone DNS records over the `client/v4` REST API
 * (`/zones/{zone_id}/dns_records`), plus the zone lookups needed to find a
 * zone id from a domain name.
 *
 * Every record method targets the client's `zoneId` unless the call passes
 * its own. Responses are unwrapped from Cloudflare's
 * `{success, errors, messages, result}` envelope, so methods resolve to the
 * record (or page of records) a caller wants; list methods keep the
 * envelope's `result_info` alongside `result` for paging.
 *
 * @example
 * ```typescript
 * import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';
 *
 * const dns = new CloudflareDNS({
 *   auth: { type: 'BEARER', token: 'YOUR_API_TOKEN' },
 *   zoneId: 'YOUR_ZONE_ID',
 * });
 *
 * const record = await dns.createRecord({
 *   type: 'A',
 *   name: 'app.example.com',
 *   content: '203.0.113.10',
 *   proxied: true,
 *   comment: 'created by tundra-connect',
 * });
 * console.log(record.id, record.name);
 * ```
 */
export class CloudflareDNS extends RESTler<CloudflareDNSOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'CloudflareDNS';

  /** The client's default zone id, when one was configured. */
  get zoneId(): string | undefined {
    return this._hasOption('zoneId') ? this._getOption('zoneId') : undefined;
  }

  /**
   * Creates a Cloudflare DNS client.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - `{ type: 'BEARER', token, prefix? }` — a
   * Cloudflare API token with DNS permissions.
   * @param options.zoneId - Default zone for every record method.
   * @throws {CloudflareDNSError} `CONFIG_INVALID_API_TOKEN` when `auth` is
   * missing, isn't `type: 'BEARER'`, or its `token` is blank;
   * `CONFIG_INVALID_ZONE_ID` when a `zoneId` is given but blank or not an
   * identifier.
   */
  constructor(options: EventOptionKeys<CloudflareDNSOptions, RESTlerEvents>) {
    super(options, {
      baseURL: CLOUDFLARE_API,
      timeout: 30,
      contentType: 'JSON',
    });
    // `_setOptions` only routes keys PRESENT on the argument through
    // `_processOption`, so an omitted `auth` would otherwise surface as a
    // vendor 400 on the first call.
    if (!this._hasOption('auth')) {
      throw new CloudflareDNSError('CONFIG_INVALID_API_TOKEN');
    }
    this._responseHandler = (response) => this.__unwrap(response, false);
  }

  //#region Zones

  /**
   * List the zones the token can see — `GET /zones`. Filter by exact
   * `name` to turn a domain into a zone id.
   *
   * @param options - Optional `name`, `status`, paging and ordering.
   * @returns The page of zones with Cloudflare's `result_info`.
   * @throws {CloudflareDNSError} `REQUEST_VALIDATION_ERROR` for an invalid
   * filter; `AUTH_FAILED`, `FORBIDDEN`, `RATE_LIMITED`,
   * `SERVICE_UNAVAILABLE` or `UNKNOWN_ERROR` when Cloudflare rejects it;
   * `RESPONSE_ERROR` when a success body fails validation.
   *
   * @example
   * ```typescript
   * import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';
   *
   * declare const dns: CloudflareDNS;
   *
   * const { result } = await dns.listZones({ name: 'example.com' });
   * const zoneId = result[0]?.id;
   * ```
   */
  public async listZones(
    options: ListZonesOptions = {},
  ): Promise<ZonePageSchema> {
    const query = this.__validate(ListZonesQuerySchemaObject, options);
    return await this.__requestAndValidate(
      { path: '/zones', method: 'GET', query: CloudflareDNS.__query(query) },
      ZonePageSchemaObject,
      true,
    );
  }

  /**
   * Fetch one zone — `GET /zones/{zone_id}`.
   *
   * @param options - The zone, when it differs from the client's `zoneId`.
   * @returns The zone.
   * @throws {CloudflareDNSError} `REQUEST_VALIDATION_ERROR` when no zone id
   * is available; `NOT_FOUND` for an unknown zone; otherwise as
   * {@link CloudflareDNS.listZones}.
   *
   * @example
   * ```typescript
   * import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';
   *
   * declare const dns: CloudflareDNS;
   *
   * const zone = await dns.getZone();
   * console.log(zone.name, zone.status, zone.name_servers);
   * ```
   */
  public async getZone(options: ZoneScoped = {}): Promise<ZoneSchema> {
    const zone = this.__zone(options);
    return await this.__requestAndValidate(
      { path: `/zones/${zone}`, method: 'GET' },
      ZoneSchemaObject,
    );
  }

  //#endregion

  //#region Records

  /**
   * List DNS records in a zone — `GET /zones/{zone_id}/dns_records`.
   *
   * Cloudflare pages the result: `per_page` defaults to 100 (the API's own
   * default) and `result_info.total_count` / `total_pages` tell you whether
   * to ask for the next `page`.
   *
   * @param options - Optional filters (`type`, `name`, `content`, `proxied`,
   * `comment`, `tag`, `search`, `match`, `tag_match`), paging (`page`,
   * `per_page`) and ordering (`order`, `direction`), plus the zone.
   * @returns The page of records with Cloudflare's `result_info`.
   * @throws {CloudflareDNSError} `REQUEST_VALIDATION_ERROR` for an invalid
   * filter or no zone id; `AUTH_FAILED`, `FORBIDDEN`, `NOT_FOUND`,
   * `INVALID_REQUEST`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE` or
   * `UNKNOWN_ERROR` when Cloudflare rejects it; `RESPONSE_ERROR` when a
   * success body fails validation.
   *
   * @example
   * ```typescript
   * import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';
   *
   * declare const dns: CloudflareDNS;
   *
   * const page = await dns.listRecords({ type: 'TXT', name: 'example.com' });
   * for (const record of page.result) console.log(record.content);
   * ```
   */
  public async listRecords(
    options: ListRecordsOptions = {},
  ): Promise<DnsRecordPageSchema> {
    const { zoneId: _zoneId, ...filters } = options;
    const zone = this.__zone(options);
    const query = this.__validate(ListDnsRecordsQuerySchemaObject, filters);
    return await this.__requestAndValidate(
      {
        path: `/zones/${zone}/dns_records`,
        method: 'GET',
        query: CloudflareDNS.__query(query),
      },
      DnsRecordPageSchemaObject,
      true,
    );
  }

  /**
   * Fetch one DNS record — `GET /zones/{zone_id}/dns_records/{id}`.
   *
   * @param options - The record id, and optionally the zone.
   * @returns The record.
   * @throws {CloudflareDNSError} `REQUEST_VALIDATION_ERROR` for a blank or
   * malformed `recordId` or no zone id; `NOT_FOUND` for an unknown record;
   * otherwise as {@link CloudflareDNS.listRecords}.
   *
   * @example
   * ```typescript
   * import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';
   *
   * declare const dns: CloudflareDNS;
   *
   * const record = await dns.getRecord({ recordId: 'RECORD_ID' });
   * ```
   */
  public async getRecord(options: RecordRefOptions): Promise<DnsRecordSchema> {
    const zone = this.__zone(options);
    const record = CloudflareDNS.__identifier('recordId', options?.recordId);
    return await this.__requestAndValidate(
      { path: `/zones/${zone}/dns_records/${record}`, method: 'GET' },
      DnsRecordSchemaObject,
    );
  }

  /**
   * Create a DNS record — `POST /zones/{zone_id}/dns_records`.
   *
   * The record is validated locally first ({@link DnsRecordRequestSchema}):
   * a known `type`, a `name`, and either `content` or the structured `data`
   * the type calls for (SRV, CAA, …). Cloudflare validates the content
   * itself and answers `INVALID_REQUEST` (its code 1004) when it does not
   * parse for the type.
   *
   * @param options - The record, and optionally the zone.
   * @returns The created record, with its `id`.
   * @throws {CloudflareDNSError} `REQUEST_VALIDATION_ERROR` when the record
   * fails local validation; `RECORD_CONFLICT` when an identical or
   * conflicting record exists; otherwise as {@link CloudflareDNS.listRecords}.
   *
   * @example
   * ```typescript
   * import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';
   *
   * declare const dns: CloudflareDNS;
   *
   * const srv = await dns.createRecord({
   *   type: 'SRV',
   *   name: '_sip._tcp.example.com',
   *   data: { priority: 10, weight: 5, port: 5060, target: 'sip.example.com' },
   *   ttl: 3600,
   * });
   * ```
   */
  public async createRecord(
    options: CreateRecordOptions,
  ): Promise<DnsRecordSchema> {
    const { zoneId: _zoneId, ...record } = options ?? {};
    const zone = this.__zone(options);
    const payload = this.__validate(DnsRecordRequestSchemaObject, record);
    CloudflareDNS.__requireContentOrData(payload);
    return await this.__requestAndValidate(
      {
        path: `/zones/${zone}/dns_records`,
        method: 'POST',
        contentType: 'JSON',
        payload: payload as Record<string, unknown>,
      },
      DnsRecordSchemaObject,
    );
  }

  /**
   * Change some fields of a DNS record —
   * `PATCH /zones/{zone_id}/dns_records/{id}`. Fields you leave out keep
   * their current value.
   *
   * @param options - The record id, the fields to change, and optionally
   * the zone.
   * @returns The updated record.
   * @throws {CloudflareDNSError} `REQUEST_VALIDATION_ERROR` for a malformed
   * `recordId`, no zone id, no fields to change, or an invalid field;
   * `NOT_FOUND`, `RECORD_CONFLICT`; otherwise as
   * {@link CloudflareDNS.listRecords}.
   *
   * @example
   * ```typescript
   * import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';
   *
   * declare const dns: CloudflareDNS;
   *
   * await dns.updateRecord({
   *   recordId: 'RECORD_ID',
   *   content: '203.0.113.11',
   *   comment: 'moved to the new box',
   * });
   * ```
   */
  public async updateRecord(
    options: UpdateRecordOptions,
  ): Promise<DnsRecordSchema> {
    const { zoneId: _zoneId, recordId, ...changes } = options ?? {};
    const zone = this.__zone(options);
    const record = CloudflareDNS.__identifier('recordId', recordId);
    const payload = this.__validate(DnsRecordPatchSchemaObject, changes);
    if (Object.keys(payload).length === 0) {
      throw CloudflareDNS.__invalid('at least one field to change is required');
    }
    return await this.__requestAndValidate(
      {
        path: `/zones/${zone}/dns_records/${record}`,
        method: 'PATCH',
        contentType: 'JSON',
        payload: payload as Record<string, unknown>,
      },
      DnsRecordSchemaObject,
    );
  }

  /**
   * Replace a DNS record wholesale —
   * `PUT /zones/{zone_id}/dns_records/{id}`. Unlike
   * {@link CloudflareDNS.updateRecord}, fields you leave out are reset to
   * their defaults.
   *
   * @param options - The record id, the full record, and optionally the
   * zone.
   * @returns The replaced record.
   * @throws {CloudflareDNSError} As {@link CloudflareDNS.createRecord}, plus
   * `NOT_FOUND` for an unknown record.
   *
   * @example
   * ```typescript
   * import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';
   *
   * declare const dns: CloudflareDNS;
   *
   * await dns.replaceRecord({
   *   recordId: 'RECORD_ID',
   *   type: 'A',
   *   name: 'app.example.com',
   *   content: '203.0.113.12',
   *   ttl: 1,
   * });
   * ```
   */
  public async replaceRecord(
    options: ReplaceRecordOptions,
  ): Promise<DnsRecordSchema> {
    const { zoneId: _zoneId, recordId, ...record } = options ?? {};
    const zone = this.__zone(options);
    const id = CloudflareDNS.__identifier('recordId', recordId);
    const payload = this.__validate(DnsRecordRequestSchemaObject, record);
    CloudflareDNS.__requireContentOrData(payload);
    return await this.__requestAndValidate(
      {
        path: `/zones/${zone}/dns_records/${id}`,
        method: 'PUT',
        contentType: 'JSON',
        payload: payload as Record<string, unknown>,
      },
      DnsRecordSchemaObject,
    );
  }

  /**
   * Delete a DNS record — `DELETE /zones/{zone_id}/dns_records/{id}`.
   *
   * @param options - The record id, and optionally the zone.
   * @returns `{ id }` of the deleted record.
   * @throws {CloudflareDNSError} `REQUEST_VALIDATION_ERROR` for a malformed
   * `recordId` or no zone id; `NOT_FOUND` for an unknown record; otherwise
   * as {@link CloudflareDNS.listRecords}.
   *
   * @example
   * ```typescript
   * import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';
   *
   * declare const dns: CloudflareDNS;
   *
   * await dns.deleteRecord({ recordId: 'RECORD_ID' });
   * ```
   */
  public async deleteRecord(options: RecordRefOptions): Promise<DeletedRecord> {
    const zone = this.__zone(options);
    const record = CloudflareDNS.__identifier('recordId', options?.recordId);
    return await this.__requestAndValidate(
      { path: `/zones/${zone}/dns_records/${record}`, method: 'DELETE' },
      DeletedRecordSchemaObject,
    );
  }

  /**
   * Apply several changes atomically —
   * `POST /zones/{zone_id}/dns_records/batch`. Cloudflare applies
   * `deletes`, then `patches`, then `puts`, then `posts`, and rolls the
   * whole batch back if any one fails.
   *
   * @param options - Up to four lists of operations, and optionally the
   * zone. At least one list must be non-empty.
   * @returns The records each list produced, in the same four lists.
   * @throws {CloudflareDNSError} `REQUEST_VALIDATION_ERROR` when every list
   * is empty or an entry is invalid; `RECORD_CONFLICT`, `NOT_FOUND`,
   * `INVALID_REQUEST` when Cloudflare rejects the batch (nothing is
   * applied); otherwise as {@link CloudflareDNS.listRecords}.
   *
   * @example
   * ```typescript
   * import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';
   *
   * declare const dns: CloudflareDNS;
   *
   * const result = await dns.batch({
   *   deletes: [{ id: 'OLD_RECORD_ID' }],
   *   posts: [
   *     { type: 'A', name: 'a.example.com', content: '203.0.113.1' },
   *     { type: 'A', name: 'b.example.com', content: '203.0.113.2' },
   *   ],
   * });
   * console.log(result.posts?.map((r) => r.id));
   * ```
   */
  public async batch(
    options: BatchOptions,
  ): Promise<DnsRecordBatchResultSchema> {
    const { zoneId: _zoneId, ...operations } = options ?? {};
    const zone = this.__zone(options);
    const payload = this.__validate(
      DnsRecordBatchRequestSchemaObject,
      operations,
    );
    const total = (payload.deletes?.length ?? 0) +
      (payload.patches?.length ?? 0) + (payload.puts?.length ?? 0) +
      (payload.posts?.length ?? 0);
    if (total === 0) {
      throw CloudflareDNS.__invalid(
        'at least one of `deletes`, `patches`, `puts` or `posts` must be non-empty',
      );
    }
    for (const entry of [...(payload.puts ?? []), ...(payload.posts ?? [])]) {
      CloudflareDNS.__requireContentOrData(entry);
    }
    return await this.__requestAndValidate(
      {
        path: `/zones/${zone}/dns_records/batch`,
        method: 'POST',
        contentType: 'JSON',
        payload: payload as Record<string, unknown>,
      },
      DnsRecordBatchResultSchemaObject,
    );
  }

  /**
   * Export the zone as a BIND zone file —
   * `GET /zones/{zone_id}/dns_records/export`.
   *
   * @param options - The zone, when it differs from the client's `zoneId`.
   * @returns The zone file text.
   * @throws {CloudflareDNSError} As {@link CloudflareDNS.listRecords}.
   *
   * @example
   * ```typescript
   * import { CloudflareDNS } from '@tundraconnect/cloudflare-dns';
   *
   * declare const dns: CloudflareDNS;
   *
   * const bind = await dns.exportRecords();
   * console.log(bind.split('\n').length, 'lines');
   * ```
   */
  public async exportRecords(options: ZoneScoped = {}): Promise<string> {
    const zone = this.__zone(options);
    return await this.__requestAndValidate(
      { path: `/zones/${zone}/dns_records/export`, method: 'GET' },
      ExportSchemaObject,
    );
  }

  //#endregion

  /**
   * Validates the two options this connect owns beyond `RESTlerOptions`.
   * Runs only for keys actually present on the constructor argument — the
   * constructor's own `hasOption` guard covers an absent `auth`.
   */
  protected override _processOption<K extends keyof CloudflareDNSOptions>(
    key: K,
    value: CloudflareDNSOptions[K],
  ): CloudflareDNSOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as CloudflareDNSAuth;
        if (
          !auth || auth.type !== 'BEARER' || typeof auth.token !== 'string' ||
          auth.token.trim() === ''
        ) {
          throw new CloudflareDNSError('CONFIG_INVALID_API_TOKEN');
        }
        // Cloudflare documents `Authorization: Bearer <token>`; RESTler's own
        // default prefix is the scheme name in upper case, so pin the
        // documented spelling unless the caller chose one.
        value = {
          ...auth,
          prefix: auth.prefix ?? 'Bearer',
        } as CloudflareDNSOptions[K];
        break;
      }
      case 'zoneId': {
        if (typeof value !== 'string' || !IDENTIFIER.test(value.trim())) {
          throw new CloudflareDNSError('CONFIG_INVALID_ZONE_ID');
        }
        value = value.trim() as CloudflareDNSOptions[K];
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
   * `transient`. A {@link CloudflareDNSError} from the response handler passes
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
      return new CloudflareDNSError('RATE_LIMITED', {
        status: 429,
        retryAfterSeconds: err.getContextValue('retryAfter'),
        retried: err.getContextValue('retried'),
      }, err);
    }
    if (err instanceof RESTlerTimeoutError) {
      return new CloudflareDNSError('TIMEOUT', {
        timeoutSeconds: timeout ?? this._getOption('timeout'),
      }, err);
    }
    // RESTlerResponseValidationError (and the two above) extend
    // RESTlerRequestError: only a bare one is a failure before any response.
    if (
      err instanceof RESTlerRequestError &&
      !(err instanceof RESTlerResponseValidationError)
    ) {
      return new CloudflareDNSError('NETWORK_ERROR', {}, err);
    }
    return err;
  }

  /**
   * Makes a request and validates its (already unwrapped) body against
   * `guard`, translating RESTler's generic validation and rate-limit errors
   * into a {@link CloudflareDNSError}. `paged` keeps `result_info` next to
   * `result` for list endpoints.
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
        throw new CloudflareDNSError('RESPONSE_ERROR', {
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
   * rather than the wrapper. A body that isn't an envelope (the BIND export
   * is plain text) passes through untouched.
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
    throw new CloudflareDNSError(CloudflareDNS.__codeFor(status, first), {
      retryAfterSeconds: this._parseRetryAfter(response.headers),
      status,
      detail,
      vendorCode: first?.code,
      body,
    });
  }

  /** Classifies a failure by vendor code (and its chain), then by status. */
  private static __codeFor(
    status: number,
    first: ErrorItemSchema | undefined,
  ): CloudflareDNSErrorCode {
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
    return CloudflareDNS.__statusToCode(status);
  }

  /** HTTP-status fallback for a failure carrying no recognised vendor code. */
  private static __statusToCode(status: number): CloudflareDNSErrorCode {
    if (status === 401) return 'AUTH_FAILED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'RECORD_CONFLICT';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'SERVICE_UNAVAILABLE';
    if (status >= 400) return 'INVALID_REQUEST';
    return 'UNKNOWN_ERROR';
  }

  /** The zone a call targets: its own `zoneId`, else the client's. */
  private __zone(options: ZoneScoped | undefined): string {
    const zone = options?.zoneId ?? this.zoneId;
    if (zone === undefined) {
      throw CloudflareDNS.__invalid(
        'zoneId: required — configure it on the client or pass it per call',
      );
    }
    return CloudflareDNS.__identifier('zoneId', zone);
  }

  /** Checks an id is a URL-safe identifier; returns it ready for a path. */
  private static __identifier(field: string, value: unknown): string {
    if (typeof value !== 'string' || !IDENTIFIER.test(value.trim())) {
      throw CloudflareDNS.__invalid(
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
      throw new CloudflareDNSError(
        'REQUEST_VALIDATION_ERROR',
        {
          reason: CloudflareDNS.__describeInvalid(cause),
          responseError: (cause as GuardianError | undefined)?.toJSON?.(),
        },
        cause instanceof Error ? cause : undefined,
      );
    }
  }

  /** A record needs `content` or `data` — the schema can't express either/or. */
  private static __requireContentOrData(
    record: { content?: unknown; data?: unknown },
  ): void {
    if (record.content === undefined && record.data === undefined) {
      throw CloudflareDNS.__invalid(
        'either `content` or `data` is required for a DNS record',
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
   * field, e.g. `type: …; name: …`. Falls back to the schema's own message
   * for a failure that isn't per-field.
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
  private static __invalid(reason: string): CloudflareDNSError {
    return new CloudflareDNSError('REQUEST_VALIDATION_ERROR', { reason });
  }
}
