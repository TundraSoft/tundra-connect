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
import { issueJWT } from '@crypt';
import { type BaseGuardian, Guardian, GuardianError } from '@guardian';
import {
  type CertificateMapEntrySchema,
  CertificateMapEntrySchemaObject,
  type CertificateSchema,
  CertificateSchemaObject,
  type CertificateScope,
  GoogleErrorEnvelopeSchemaObject,
  ListCertificateMapEntriesResponseSchemaObject,
  ListCertificatesResponseSchemaObject,
  type OperationSchema,
  OperationSchemaObject,
} from './schema/mod.ts';
import {
  GoogleCertificateManagerError,
  type GoogleCertificateManagerErrorCode,
} from './errors/mod.ts';
import { RESOURCE_ID_PATTERN } from './resourceId.ts';

/** Certificate Manager REST API v1 base URL. */
const BASE_URL = 'https://certificatemanager.googleapis.com/v1';
/** OAuth2 token endpoint used to exchange a signed JWT for an access token. */
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Default OAuth scope requested for service-account (CUSTOM) auth. */
const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
/** Lifetime of a signed service-account JWT assertion, in seconds. */
const JWT_LIFETIME_SECONDS = 3600;
/**
 * How long before its documented expiry a cached access token is treated as
 * stale and refreshed, so a request never races a token expiring mid-flight.
 */
const TOKEN_REFRESH_SKEW_SECONDS = 60;
/** Default {@link WaitForOperationOptions.timeoutSeconds}. */
const DEFAULT_WAIT_TIMEOUT_SECONDS = 60;
/** Default {@link WaitForOperationOptions.intervalSeconds}. */
const DEFAULT_WAIT_INTERVAL_SECONDS = 2;
/** Most certificates one map entry may reference. */
const MAX_ENTRY_CERTIFICATES = 4;

/**
 * A Google Cloud project id (`my-project`, or the legacy
 * `example.com:my-project` form) or a numeric project number.
 */
const PROJECT_PATTERN =
  /^(?:(?:[a-z][a-z0-9.-]*:)?[a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]+)$/;
/** A location, e.g. `global` or `us-central1`. */
const LOCATION_PATTERN = /^[a-z][a-z0-9-]*$/;
/** A full certificate resource name. */
const CERTIFICATE_NAME_PATTERN =
  /^projects\/[^/?#]+\/locations\/[^/?#]+\/certificates\/[^/?#]+$/;
/** A full operation resource name. */
const OPERATION_NAME_PATTERN =
  /^projects\/[^/?#]+\/locations\/[^/?#]+\/operations\/[^/?#]+$/;
/** A bare operation id, e.g. `operation-1700000000000-5f8f0c1a2b3c4`. */
const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Canonical `google.rpc.Code` names, indexed by their numeric value — a
 * failed operation's `error.code` is the number, an HTTP error envelope's
 * `status` is the name.
 */
const RPC_CODE_NAMES = [
  'OK',
  'CANCELLED',
  'UNKNOWN',
  'INVALID_ARGUMENT',
  'DEADLINE_EXCEEDED',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'PERMISSION_DENIED',
  'RESOURCE_EXHAUSTED',
  'FAILED_PRECONDITION',
  'ABORTED',
  'OUT_OF_RANGE',
  'UNIMPLEMENTED',
  'INTERNAL',
  'UNAVAILABLE',
  'DATA_LOSS',
  'UNAUTHENTICATED',
] as const;

/**
 * Maps a canonical status name to this connect's code. `RESOURCE_EXHAUSTED`
 * is absent on purpose: it is split into `RATE_LIMITED` and
 * `QUOTA_EXCEEDED` by {@link GoogleCertificateManager.__exhaustedCode}.
 */
const STATUS_TO_ERROR_CODE: Record<string, GoogleCertificateManagerErrorCode> =
  {
    INVALID_ARGUMENT: 'INVALID_REQUEST',
    OUT_OF_RANGE: 'INVALID_REQUEST',
    FAILED_PRECONDITION: 'FAILED_PRECONDITION',
    UNAUTHENTICATED: 'AUTH_FAILED',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    NOT_FOUND: 'NOT_FOUND',
    ALREADY_EXISTS: 'ALREADY_EXISTS',
    ABORTED: 'CONFLICT',
    UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    INTERNAL: 'SERVICE_UNAVAILABLE',
    DEADLINE_EXCEEDED: 'SERVICE_UNAVAILABLE',
  };

/**
 * Guardian schema for the OAuth2 token-exchange response. Internal to
 * service-account auth — not part of the public schema surface.
 */
const TokenResponseSchemaObject = Guardian.object({
  access_token: Guardian.string().minLength(1),
  expires_in: Guardian.number().positive(),
  token_type: Guardian.string().optional(),
}).passthrough();

/** HTTP Bearer auth — the caller supplies an already-obtained access token. */
export type GoogleCertificateManagerBearerAuth = {
  type: 'BEARER';
  /** OAuth2 access token with the `cloud-platform` scope. */
  token: string;
  /** Authorization header scheme. Defaults to `Bearer`. */
  prefix?: string;
};

/**
 * Service-account auth — the connect signs an RS256 JWT with Web Crypto,
 * exchanges it at `https://oauth2.googleapis.com/token` for a short-lived
 * access token, and caches that token until shortly before it expires.
 * Take both fields from the service account's downloaded JSON key.
 */
export type GoogleCertificateManagerServiceAccountAuth = {
  type: 'CUSTOM';
  /** The key's `client_email`. */
  clientEmail: string;
  /** The key's `private_key` (PKCS8 PEM). */
  privateKey: string;
  /**
   * Space-delimited OAuth scopes to request.
   * @default 'https://www.googleapis.com/auth/cloud-platform'
   */
  scope?: string;
};

/** See {@link GoogleCertificateManagerBearerAuth} and {@link GoogleCertificateManagerServiceAccountAuth}. */
export type GoogleCertificateManagerAuth =
  | GoogleCertificateManagerBearerAuth
  | GoogleCertificateManagerServiceAccountAuth;

/** Options for configuring a {@link GoogleCertificateManager} client. */
export type GoogleCertificateManagerOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link GoogleCertificateManagerAuth}. */
  auth: GoogleCertificateManagerAuth;
  /** The Google Cloud project id (or number) that owns the resources. */
  projectId: string;
  /**
   * The Certificate Manager location. Certificates served by a global
   * external Application Load Balancer live in `global`.
   * @default 'global'
   */
  location?: string;
  /**
   * Default certificate map for the map-entry methods; each of them also
   * takes a per-call `mapId` that overrides it.
   */
  certificateMapId?: string;
};

/** Options for {@link GoogleCertificateManager.createCertificate}. */
export type CreateCertificateOptions = {
  /** The new certificate's id — see {@link hostnameToResourceId}. */
  certificateId: string;
  /**
   * Domains the Google-managed certificate covers. With load-balancer
   * authorization (no `dnsAuthorizations`) Google validates each domain once
   * its A/AAAA records point at the load balancer.
   */
  domains: string[];
  /**
   * DNS authorization resource names, for DNS-based domain authorization
   * (needed for wildcards). Omit for load-balancer authorization.
   */
  dnsAuthorizations?: string[];
  /** Free-text description. */
  description?: string;
  /** Labels to attach. */
  labels?: Record<string, string>;
  /** Where the certificate can be served. Google defaults to `DEFAULT`. */
  scope?: CertificateScope;
};

/** Options for {@link GoogleCertificateManager.createCertificateMapEntry}. */
export type CreateCertificateMapEntryOptions = {
  /** The new entry's id — see {@link hostnameToResourceId}. */
  entryId: string;
  /** The SNI hostname (or `*.example.com` wildcard) the entry matches. */
  hostname: string;
  /**
   * The certificates to serve for `hostname` (one to four): certificate ids
   * in this client's project and location, or full resource names.
   */
  certificates: string[];
  /** The certificate map. Defaults to the client's `certificateMapId`. */
  mapId?: string;
  /** Free-text description. */
  description?: string;
  /** Labels to attach. */
  labels?: Record<string, string>;
};

/** Per-call map selection for the single-entry map-entry methods. */
export type CertificateMapEntryOptions = {
  /** The certificate map. Defaults to the client's `certificateMapId`. */
  mapId?: string;
};

/** Paging, filtering and ordering for the list methods. */
export type ListOptions = {
  /** Maximum results per page. Google picks a default when omitted. */
  pageSize?: number;
  /** `nextPageToken` from the previous page. */
  pageToken?: string;
  /** A filter expression, e.g. `labels.owner="brevily"`. */
  filter?: string;
  /** Comma-separated field names; append ` desc` for descending. */
  orderBy?: string;
};

/** Options for {@link GoogleCertificateManager.listCertificateMapEntries}. */
export type ListCertificateMapEntriesOptions =
  & ListOptions
  & CertificateMapEntryOptions;

/** One page from {@link GoogleCertificateManager.listCertificates}. */
export type ListCertificatesResult = {
  /** The certificates on this page (empty when there are none). */
  certificates: CertificateSchema[];
  /** Pass as `pageToken` for the next page; absent on the last page. */
  nextPageToken?: string;
  /** Locations that could not be reached. */
  unreachable: string[];
};

/** One page from {@link GoogleCertificateManager.listCertificateMapEntries}. */
export type ListCertificateMapEntriesResult = {
  /** The entries on this page (empty when there are none). */
  certificateMapEntries: CertificateMapEntrySchema[];
  /** Pass as `pageToken` for the next page; absent on the last page. */
  nextPageToken?: string;
  /** Locations that could not be reached. */
  unreachable: string[];
};

/** Options for {@link GoogleCertificateManager.waitForOperation}. */
export type WaitForOperationOptions = {
  /**
   * How long to keep polling before throwing `OPERATION_TIMEOUT`.
   * @default 60
   */
  timeoutSeconds?: number;
  /**
   * Delay between polls.
   * @default 2
   */
  intervalSeconds?: number;
};

/**
 * Typed client for the
 * [Google Cloud Certificate Manager API](https://cloud.google.com/certificate-manager/docs/reference/certificate-manager/rest)
 * (v1): Google-managed certificates, certificate map entries and the
 * long-running operations their creates and deletes return.
 *
 * Built for issuing one certificate per customer domain behind a global
 * external Application Load Balancer: create a managed certificate for the
 * hostname, create a map entry binding the hostname to it in the map on the
 * load balancer's HTTPS proxy, then read the certificate's
 * `managed.state` while Google provisions it.
 *
 * Authenticates with a service-account key (an RS256 JWT signed with Web
 * Crypto and exchanged for an access token, cached until near expiry) or a
 * caller-supplied access token, so it runs unmodified on Deno, Bun, Node
 * and Cloudflare Workers.
 *
 * @example
 * ```typescript
 * import {
 *   GoogleCertificateManager,
 *   hostnameToResourceId,
 * } from '@tundraconnect/google-certificate-manager';
 *
 * const client = new GoogleCertificateManager({
 *   auth: {
 *     type: 'CUSTOM',
 *     clientEmail: 'certs@my-project.iam.gserviceaccount.com',
 *     privateKey: '-----BEGIN PRIVATE KEY-----\n...',
 *   },
 *   projectId: 'my-project',
 *   certificateMapId: 'customer-domains',
 * });
 *
 * const id = hostnameToResourceId('go.example.com');
 * await client.waitForOperation(
 *   await client.createCertificate({ certificateId: id, domains: ['go.example.com'] }),
 * );
 * await client.createCertificateMapEntry({
 *   entryId: id,
 *   hostname: 'go.example.com',
 *   certificates: [id],
 * });
 * const certificate = await client.getCertificate(id);
 * console.log(certificate.managed?.state); // 'PROVISIONING' until the A record points at the LB
 * ```
 */
export class GoogleCertificateManager
  extends RESTler<GoogleCertificateManagerOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'GoogleCertificateManager';

  /**
   * Cached service-account access tokens, keyed by {@link __authIdentity} so
   * a token exchanged for one service account (or scope) is never handed to
   * a request resolving a different one.
   */
  private __tokenCache = new Map<
    string,
    { accessToken: string; expiresAt: number }
  >();

  /**
   * In-flight token exchanges, keyed like {@link __tokenCache}, so
   * concurrent requests that all miss a cold cache share one JWT signing
   * and token round trip instead of each doing their own.
   */
  private __tokenExchangeInFlight = new Map<
    string,
    Promise<{ accessToken: string; expiresAt: number }>
  >();

  /**
   * Creates a new GoogleCertificateManager client instance.
   *
   * @param options - See {@link GoogleCertificateManagerOptions}.
   * @throws {GoogleCertificateManagerError} `CONFIG_INVALID_AUTH` when `auth`
   * is missing or neither `BEARER` nor `CUSTOM`;
   * `CONFIG_INVALID_SERVICE_ACCOUNT` when a `CUSTOM` auth lacks
   * `clientEmail`/`privateKey`; `CONFIG_INVALID_PROJECT` for a missing or
   * malformed `projectId`, `location` or `certificateMapId`.
   */
  constructor(
    options: EventOptionKeys<GoogleCertificateManagerOptions, RESTlerEvents>,
  ) {
    super(options, {
      baseURL: BASE_URL,
      timeout: 30,
      contentType: 'JSON',
      location: 'global',
    });
    // `_processOption` only sees supplied keys, so required ones are
    // checked for presence here.
    if (!this._hasOption('auth')) {
      throw new GoogleCertificateManagerError('CONFIG_INVALID_AUTH', {
        authType: 'none',
      });
    }
    if (!this._hasOption('projectId')) {
      throw new GoogleCertificateManagerError('CONFIG_INVALID_PROJECT', {
        field: 'projectId',
        value: '',
      });
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /** The Google Cloud project the client manages resources in. */
  get projectId(): string {
    return this._getOption('projectId');
  }

  /** The Certificate Manager location (`global` unless configured). */
  get location(): string {
    return this._getOption('location') ?? 'global';
  }

  /** The default certificate map for map-entry calls, if configured. */
  get certificateMapId(): string | undefined {
    return this._getOption('certificateMapId');
  }

  //#region Certificates

  /**
   * Create a Google-managed certificate —
   * `POST /projects/{project}/locations/{location}/certificates?certificateId=…`.
   *
   * Returns the long-running operation, not the certificate: pass it to
   * {@link waitForOperation}, or poll {@link getOperation}. The operation
   * finishing means the resource exists; the certificate itself is issued
   * later, once Google can authorize every domain — follow that through
   * {@link getCertificate}'s `managed.state`.
   *
   * A retry after a lost answer throws `ALREADY_EXISTS`; treat that as
   * success (and {@link getCertificate} if you need the resource).
   *
   * @param options - See {@link CreateCertificateOptions}.
   * @returns The create operation.
   * @throws {GoogleCertificateManagerError} `REQUEST_VALIDATION_ERROR` for an
   * invalid id or empty `domains`; `ALREADY_EXISTS`, `PERMISSION_DENIED`,
   * `QUOTA_EXCEEDED`, `INVALID_REQUEST`, `RATE_LIMITED`,
   * `SERVICE_UNAVAILABLE`, `TIMEOUT` or `NETWORK_ERROR` from Google; auth
   * failures (`AUTH_FAILED`, `JWT_SIGNING_FAILED`, `TOKEN_EXCHANGE_FAILED`);
   * `RESPONSE_ERROR` for a malformed success body.
   *
   * @example
   * ```typescript
   * const operation = await client.createCertificate({
   *   certificateId: 'go-example-com-1a2b3c4d',
   *   domains: ['go.example.com'],
   *   labels: { owner: 'brevily' },
   * });
   * ```
   */
  public async createCertificate(
    options: CreateCertificateOptions,
  ): Promise<OperationSchema> {
    const { certificateId, domains, dnsAuthorizations } = options ?? {};
    this.__requireId(certificateId, 'certificateId');
    this.__requireStrings(domains, 'domains');
    if (dnsAuthorizations !== undefined) {
      this.__requireStrings(dnsAuthorizations, 'dnsAuthorizations');
    }

    const payload: Record<string, unknown> = {
      managed: {
        domains,
        ...(dnsAuthorizations ? { dnsAuthorizations } : {}),
      },
    };
    if (options.description !== undefined) {
      payload.description = options.description;
    }
    if (options.labels !== undefined) payload.labels = options.labels;
    if (options.scope !== undefined) payload.scope = options.scope;

    return await this.__requestAndValidate({
      path: `${this.__parentPath()}/certificates`,
      method: 'POST',
      query: { certificateId },
      payload,
    }, OperationSchemaObject);
  }

  /**
   * Read a certificate —
   * `GET /projects/{project}/locations/{location}/certificates/{id}`.
   *
   * For a managed certificate, `managed.state` is `PROVISIONING` until it is
   * issued, then `ACTIVE`; `FAILED` means Google gave up (delete it and
   * create a new one). While provisioning, `managed.provisioningIssue` and
   * `managed.authorizationAttemptInfo[]` say what is blocking it per domain.
   *
   * @param certificateId - The certificate id.
   * @returns The certificate.
   * @throws {GoogleCertificateManagerError} `REQUEST_VALIDATION_ERROR` for an
   * invalid id; `NOT_FOUND` when it does not exist; otherwise as
   * {@link createCertificate}.
   *
   * @example
   * ```typescript
   * const certificate = await client.getCertificate('go-example-com-1a2b3c4d');
   * for (const attempt of certificate.managed?.authorizationAttemptInfo ?? []) {
   *   console.log(attempt.domain, attempt.state, attempt.failureReason);
   * }
   * ```
   */
  public async getCertificate(
    certificateId: string,
  ): Promise<CertificateSchema> {
    this.__requireId(certificateId, 'certificateId');
    return await this.__requestAndValidate({
      path: this.__certificatePath(certificateId),
      method: 'GET',
    }, CertificateSchemaObject);
  }

  /**
   * List one page of certificates —
   * `GET /projects/{project}/locations/{location}/certificates`. See
   * {@link iterateCertificates} to walk every page.
   *
   * @param options - Paging, filter and ordering.
   * @returns The page; `certificates` and `unreachable` are always arrays.
   * @throws {GoogleCertificateManagerError} `REQUEST_VALIDATION_ERROR` for an
   * invalid `pageSize`; otherwise as {@link createCertificate}.
   *
   * @example
   * ```typescript
   * const { certificates, nextPageToken } = await client.listCertificates({
   *   filter: 'labels.owner="brevily"',
   *   pageSize: 100,
   * });
   * ```
   */
  public async listCertificates(
    options: ListOptions = {},
  ): Promise<ListCertificatesResult> {
    const query = this.__listQuery(options);
    const page = await this.__requestAndValidate({
      path: `${this.__parentPath()}/certificates`,
      method: 'GET',
      query,
    }, ListCertificatesResponseSchemaObject);
    return {
      certificates: page.certificates ?? [],
      ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {}),
      unreachable: page.unreachable ?? [],
    };
  }

  /**
   * Walk every certificate, following `nextPageToken` — handy for a sweep
   * that finds certificates no domain owns any more.
   *
   * @param options - Page size, filter and ordering (no `pageToken`).
   * @returns An async iterator over every matching certificate.
   * @throws {GoogleCertificateManagerError} As {@link listCertificates}, from
   * whichever page fails.
   *
   * @example
   * ```typescript
   * for await (const certificate of client.iterateCertificates()) {
   *   console.log(certificate.name, certificate.managed?.state);
   * }
   * ```
   */
  public async *iterateCertificates(
    options: Omit<ListOptions, 'pageToken'> = {},
  ): AsyncGenerator<CertificateSchema, void, undefined> {
    let pageToken: string | undefined;
    do {
      const page = await this.listCertificates({ ...options, pageToken });
      yield* page.certificates;
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  /**
   * Delete a certificate —
   * `DELETE /projects/{project}/locations/{location}/certificates/{id}`.
   *
   * Delete the map entries that reference it first; Google refuses to
   * delete a certificate that is still in use (`FAILED_PRECONDITION`).
   *
   * @param certificateId - The certificate id.
   * @returns The delete operation.
   * @throws {GoogleCertificateManagerError} `NOT_FOUND` when it does not
   * exist (already deleted, for a retried delete); `FAILED_PRECONDITION`
   * while a map entry still uses it; otherwise as {@link createCertificate}.
   *
   * @example
   * ```typescript
   * await client.waitForOperation(
   *   await client.deleteCertificate('go-example-com-1a2b3c4d'),
   * );
   * ```
   */
  public async deleteCertificate(
    certificateId: string,
  ): Promise<OperationSchema> {
    this.__requireId(certificateId, 'certificateId');
    return await this.__requestAndValidate({
      path: this.__certificatePath(certificateId),
      method: 'DELETE',
    }, OperationSchemaObject);
  }

  //#endregion

  //#region Certificate map entries

  /**
   * Create a certificate map entry binding a hostname to certificates —
   * `POST …/certificateMaps/{map}/certificateMapEntries?certificateMapEntryId=…`.
   *
   * The certificates must already exist (wait for their create operations
   * first). A retry after a lost answer throws `ALREADY_EXISTS`.
   *
   * @param options - See {@link CreateCertificateMapEntryOptions}.
   * @returns The create operation.
   * @throws {GoogleCertificateManagerError} `REQUEST_VALIDATION_ERROR` for an
   * invalid id, hostname, certificate list or a missing map id;
   * `ALREADY_EXISTS`; `NOT_FOUND` for an unknown map or certificate;
   * otherwise as {@link createCertificate}.
   *
   * @example
   * ```typescript
   * await client.createCertificateMapEntry({
   *   entryId: 'go-example-com-1a2b3c4d',
   *   hostname: 'go.example.com',
   *   certificates: ['go-example-com-1a2b3c4d'],
   * });
   * ```
   */
  public async createCertificateMapEntry(
    options: CreateCertificateMapEntryOptions,
  ): Promise<OperationSchema> {
    const { entryId, hostname, certificates } = options ?? {};
    const mapPath = this.__mapPath(options?.mapId);
    this.__requireId(entryId, 'entryId');
    if (typeof hostname !== 'string' || hostname.trim() === '') {
      throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
        reason: 'hostname: must be a non-empty string',
      });
    }
    this.__requireStrings(certificates, 'certificates');
    if (certificates.length > MAX_ENTRY_CERTIFICATES) {
      throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
        reason:
          `certificates: a map entry takes at most ${MAX_ENTRY_CERTIFICATES} certificates`,
      });
    }

    const payload: Record<string, unknown> = {
      hostname: hostname.trim(),
      certificates: certificates.map((c) => this.__certificateName(c)),
    };
    if (options.description !== undefined) {
      payload.description = options.description;
    }
    if (options.labels !== undefined) payload.labels = options.labels;

    return await this.__requestAndValidate({
      path: `${mapPath}/certificateMapEntries`,
      method: 'POST',
      query: { certificateMapEntryId: entryId },
      payload,
    }, OperationSchemaObject);
  }

  /**
   * Read a certificate map entry —
   * `GET …/certificateMaps/{map}/certificateMapEntries/{id}`. Its `state`
   * is `PENDING` while the change propagates and `ACTIVE` once served.
   *
   * @param entryId - The entry id.
   * @param options - Per-call `mapId`.
   * @returns The entry.
   * @throws {GoogleCertificateManagerError} `NOT_FOUND` when it does not
   * exist; otherwise as {@link createCertificateMapEntry}.
   *
   * @example
   * ```typescript
   * const entry = await client.getCertificateMapEntry('go-example-com-1a2b3c4d');
   * console.log(entry.hostname, entry.state);
   * ```
   */
  public async getCertificateMapEntry(
    entryId: string,
    options: CertificateMapEntryOptions = {},
  ): Promise<CertificateMapEntrySchema> {
    const mapPath = this.__mapPath(options.mapId);
    this.__requireId(entryId, 'entryId');
    return await this.__requestAndValidate({
      path: `${mapPath}/certificateMapEntries/${entryId}`,
      method: 'GET',
    }, CertificateMapEntrySchemaObject);
  }

  /**
   * List one page of a map's entries —
   * `GET …/certificateMaps/{map}/certificateMapEntries`. See
   * {@link iterateCertificateMapEntries} to walk every page.
   *
   * @param options - Per-call `mapId`, paging, filter and ordering.
   * @returns The page; `certificateMapEntries` and `unreachable` are always
   * arrays.
   * @throws {GoogleCertificateManagerError} As
   * {@link createCertificateMapEntry}.
   *
   * @example
   * ```typescript
   * const { certificateMapEntries } = await client.listCertificateMapEntries({
   *   pageSize: 100,
   * });
   * ```
   */
  public async listCertificateMapEntries(
    options: ListCertificateMapEntriesOptions = {},
  ): Promise<ListCertificateMapEntriesResult> {
    const mapPath = this.__mapPath(options.mapId);
    const query = this.__listQuery(options);
    const page = await this.__requestAndValidate({
      path: `${mapPath}/certificateMapEntries`,
      method: 'GET',
      query,
    }, ListCertificateMapEntriesResponseSchemaObject);
    return {
      certificateMapEntries: page.certificateMapEntries ?? [],
      ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {}),
      unreachable: page.unreachable ?? [],
    };
  }

  /**
   * Walk every entry of a map, following `nextPageToken`.
   *
   * @param options - Per-call `mapId`, page size, filter and ordering.
   * @returns An async iterator over every matching entry.
   * @throws {GoogleCertificateManagerError} As
   * {@link listCertificateMapEntries}, from whichever page fails.
   *
   * @example
   * ```typescript
   * for await (const entry of client.iterateCertificateMapEntries()) {
   *   console.log(entry.hostname);
   * }
   * ```
   */
  public async *iterateCertificateMapEntries(
    options: Omit<ListCertificateMapEntriesOptions, 'pageToken'> = {},
  ): AsyncGenerator<CertificateMapEntrySchema, void, undefined> {
    let pageToken: string | undefined;
    do {
      const page = await this.listCertificateMapEntries({
        ...options,
        pageToken,
      });
      yield* page.certificateMapEntries;
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  /**
   * Delete a certificate map entry —
   * `DELETE …/certificateMaps/{map}/certificateMapEntries/{id}`. Delete the
   * entry before the certificate it references.
   *
   * @param entryId - The entry id.
   * @param options - Per-call `mapId`.
   * @returns The delete operation.
   * @throws {GoogleCertificateManagerError} `NOT_FOUND` when it does not
   * exist; otherwise as {@link createCertificateMapEntry}.
   *
   * @example
   * ```typescript
   * await client.waitForOperation(
   *   await client.deleteCertificateMapEntry('go-example-com-1a2b3c4d'),
   * );
   * ```
   */
  public async deleteCertificateMapEntry(
    entryId: string,
    options: CertificateMapEntryOptions = {},
  ): Promise<OperationSchema> {
    const mapPath = this.__mapPath(options.mapId);
    this.__requireId(entryId, 'entryId');
    return await this.__requestAndValidate({
      path: `${mapPath}/certificateMapEntries/${entryId}`,
      method: 'DELETE',
    }, OperationSchemaObject);
  }

  //#endregion

  //#region Operations

  /**
   * Read a long-running operation —
   * `GET /projects/{project}/locations/{location}/operations/{id}`.
   *
   * A finished operation has `done: true` and either `response` (the
   * created resource, or empty for a delete) or `error`. This returns the
   * operation as-is, failed or not; {@link waitForOperation} turns a failed
   * one into a typed error.
   *
   * @param name - The operation's full `name` (as returned by a create or
   * delete) or its bare id in this client's project and location.
   * @returns The operation.
   * @throws {GoogleCertificateManagerError} `REQUEST_VALIDATION_ERROR` for a
   * malformed name; `NOT_FOUND` for an unknown operation; otherwise as
   * {@link createCertificate}.
   *
   * @example
   * ```typescript
   * const operation = await client.getOperation(
   *   'projects/my-project/locations/global/operations/operation-1700000000000-abc',
   * );
   * if (operation.done && !operation.error) console.log('created');
   * ```
   */
  public async getOperation(name: string): Promise<OperationSchema> {
    return await this.__requestAndValidate({
      path: this.__operationPath(name),
      method: 'GET',
    }, OperationSchemaObject);
  }

  /**
   * Poll an operation until it finishes or `timeoutSeconds` passes.
   *
   * Resolves with the finished operation when it succeeded. A failed
   * operation throws the same code a synchronous refusal would
   * (`ALREADY_EXISTS`, `NOT_FOUND`, `PERMISSION_DENIED`, ...), with the
   * operation's `name`, numeric `vendorCode` and canonical `vendorStatus` in
   * the error's context. A poll that itself fails throws that failure
   * unchanged.
   *
   * @param operation - An operation (as returned by a create or delete), or
   * its name. An already-finished operation is settled without a request.
   * @param options - See {@link WaitForOperationOptions}.
   * @returns The finished, successful operation.
   * @throws {GoogleCertificateManagerError} `OPERATION_TIMEOUT` (transient)
   * when it is still running at the deadline — poll it again later;
   * `REQUEST_VALIDATION_ERROR` for an invalid option or name; the mapped
   * operation error when it failed; any {@link getOperation} failure.
   *
   * @example
   * ```typescript
   * const done = await client.waitForOperation(
   *   await client.createCertificate({ certificateId: 'example-com-1a2b3c4d', domains: ['example.com'] }),
   *   { timeoutSeconds: 20 },
   * );
   * console.log(done.response?.name);
   * ```
   */
  public async waitForOperation(
    operation: OperationSchema | string,
    options: WaitForOperationOptions = {},
  ): Promise<OperationSchema> {
    const timeoutSeconds = this.__positiveSeconds(
      options.timeoutSeconds ?? DEFAULT_WAIT_TIMEOUT_SECONDS,
      'timeoutSeconds',
    );
    const intervalSeconds = this.__positiveSeconds(
      options.intervalSeconds ?? DEFAULT_WAIT_INTERVAL_SECONDS,
      'intervalSeconds',
    );
    let current = typeof operation === 'string' ? undefined : operation;
    const name = typeof operation === 'string' ? operation : operation?.name;
    if (typeof name !== 'string' || name === '') {
      throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
        reason: 'operation: must be an operation or its name',
      });
    }
    // Validates the name before the first poll, even when `current` is
    // already done and no request is made.
    this.__operationPath(name);

    const deadline = Date.now() + timeoutSeconds * 1000;
    while (true) {
      if (current?.done) return this.__settle(current);
      const remaining = deadline - Date.now();
      if (current && remaining <= 0) {
        throw new GoogleCertificateManagerError('OPERATION_TIMEOUT', {
          operation: name,
          timeoutSeconds,
        });
      }
      if (current) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(intervalSeconds * 1000, remaining))
        );
      }
      current = await this.getOperation(name);
    }
  }

  //#endregion

  //#region Auth

  /**
   * Injects a service-account access token for `CUSTOM` auth. `BEARER` is
   * handled by the base class, so this calls `super()` first and only acts
   * on `CUSTOM`.
   *
   * @param endpoint - The per-request endpoint copy to add headers to.
   * @throws {GoogleCertificateManagerError} `JWT_SIGNING_FAILED` or
   * `TOKEN_EXCHANGE_FAILED` when no token can be obtained; `TIMEOUT`,
   * `NETWORK_ERROR`, `RATE_LIMITED` or `SERVICE_UNAVAILABLE` when the token
   * endpoint did not answer usefully.
   */
  protected override async _authInjector(
    endpoint: RESTlerEndpoint,
  ): Promise<void> {
    await super._authInjector(endpoint);
    const auth = (endpoint.auth ?? this._getOption('auth')) as
      | GoogleCertificateManagerAuth
      | undefined;
    if (!auth || auth.type !== 'CUSTOM') return;

    const token = await this.__getAccessToken(auth);
    endpoint.headers = endpoint.headers ?? {};
    endpoint.headers['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Validates `auth` (defaulting a `BEARER` prefix to `Bearer`),
   * `projectId`, `location` and `certificateMapId` at configuration time.
   *
   * @param key - The option key.
   * @param value - The option value.
   * @returns The processed value.
   * @throws {GoogleCertificateManagerError} `CONFIG_INVALID_AUTH`,
   * `CONFIG_INVALID_SERVICE_ACCOUNT` or `CONFIG_INVALID_PROJECT`.
   */
  protected override _processOption<
    K extends keyof GoogleCertificateManagerOptions,
  >(
    key: K,
    value: GoogleCertificateManagerOptions[K],
  ): GoogleCertificateManagerOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as GoogleCertificateManagerAuth;
        if (auth?.type === 'CUSTOM') {
          for (const field of ['clientEmail', 'privateKey'] as const) {
            const v = auth[field];
            if (typeof v !== 'string' || v.trim() === '') {
              throw new GoogleCertificateManagerError(
                'CONFIG_INVALID_SERVICE_ACCOUNT',
                { field },
              );
            }
          }
        } else if (auth?.type === 'BEARER') {
          if (typeof auth.token !== 'string' || auth.token.trim() === '') {
            throw new GoogleCertificateManagerError('CONFIG_INVALID_AUTH', {
              authType: 'BEARER (empty token)',
            });
          }
          value = {
            ...auth,
            prefix: auth.prefix ?? 'Bearer',
          } as GoogleCertificateManagerOptions[K];
        } else {
          throw new GoogleCertificateManagerError('CONFIG_INVALID_AUTH', {
            authType: String((auth as { type?: unknown } | undefined)?.type),
          });
        }
        break;
      }
      case 'projectId':
        if (typeof value !== 'string' || !PROJECT_PATTERN.test(value)) {
          throw new GoogleCertificateManagerError('CONFIG_INVALID_PROJECT', {
            field: 'projectId',
            value: String(value),
          });
        }
        break;
      case 'location':
        if (typeof value !== 'string' || !LOCATION_PATTERN.test(value)) {
          throw new GoogleCertificateManagerError('CONFIG_INVALID_PROJECT', {
            field: 'location',
            value: String(value),
          });
        }
        break;
      case 'certificateMapId':
        if (
          value !== undefined &&
          (typeof value !== 'string' || !RESOURCE_ID_PATTERN.test(value))
        ) {
          throw new GoogleCertificateManagerError('CONFIG_INVALID_PROJECT', {
            field: 'certificateMapId',
            value: String(value),
          });
        }
        break;
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * A valid access token for `auth`: the cached one unless it is within
   * {@link TOKEN_REFRESH_SKEW_SECONDS} of expiry, otherwise a fresh
   * exchange shared by every concurrent caller for the same identity. A
   * failed exchange is not cached, so the next call retries cleanly.
   */
  private async __getAccessToken(
    auth: GoogleCertificateManagerServiceAccountAuth,
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
      // Bookkeeping only; every caller still sees the real outcome through
      // its own `await exchange`.
      exchange.catch(() => {}).finally(() => {
        if (this.__tokenExchangeInFlight.get(identity) === exchange) {
          this.__tokenExchangeInFlight.delete(identity);
        }
      });
    }

    return (await exchange).accessToken;
  }

  /** In-memory cache key for the credentials and scope a token is for. */
  private __authIdentity(
    auth: GoogleCertificateManagerServiceAccountAuth,
  ): string {
    return JSON.stringify([
      auth.clientEmail,
      auth.privateKey,
      auth.scope ?? DEFAULT_SCOPE,
    ]);
  }

  /**
   * Sign an RS256 JWT assertion for `auth` via `@crypt` (Web Crypto).
   *
   * @throws {GoogleCertificateManagerError} `JWT_SIGNING_FAILED`.
   */
  private async __signServiceAccountJWT(
    auth: GoogleCertificateManagerServiceAccountAuth,
  ): Promise<string> {
    const iat = Math.floor(Date.now() / 1000);
    const claims = {
      iss: auth.clientEmail,
      scope: auth.scope ?? DEFAULT_SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + JWT_LIFETIME_SECONDS,
    };
    try {
      return await issueJWT('RS256', claims, auth.privateKey, { typ: 'JWT' });
    } catch (cause) {
      throw new GoogleCertificateManagerError('JWT_SIGNING_FAILED', {
        clientEmail: auth.clientEmail,
      }, cause as Error);
    }
  }

  /**
   * Exchange a signed JWT for an access token at {@link TOKEN_URL}.
   *
   * Uses `skipAuth` (the token request must not recurse into
   * {@link _authInjector}) and its own `responseHandler`, because the
   * token endpoint's error body (`{ error, error_description }`) is not
   * Google's API envelope. A 5xx or 429 there is transient
   * (`SERVICE_UNAVAILABLE` / `RATE_LIMITED`); any other refusal is
   * `TOKEN_EXCHANGE_FAILED`.
   *
   * @throws {GoogleCertificateManagerError} As described above, or a
   * transport code from the {@link _makeRequest} override.
   */
  private async __exchangeServiceAccountToken(
    assertion: string,
  ): Promise<{ access_token: string; expires_in: number }> {
    const payload = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });
    const { origin: baseURL, pathname: path } = new URL(TOKEN_URL);
    let status: number | null = null;

    try {
      const response = await this._makeRequest(
        { baseURL, path, method: 'POST', contentType: 'FORM', payload },
        {
          skipAuth: true,
          responseHandler: (resp) => {
            status = resp.status;
            if (status !== null && status >= 200 && status < 300) {
              return resp.body;
            }
            const body = resp.body as
              | { error?: unknown; error_description?: unknown }
              | undefined;
            const detail = typeof body?.error_description === 'string'
              ? body.error_description
              : 'token endpoint refused the request';
            const meta = {
              status,
              detail,
              vendorError: typeof body?.error === 'string'
                ? body.error
                : undefined,
              retryAfterSeconds: this._parseRetryAfter(resp.headers),
            };
            if (status === 429) {
              throw new GoogleCertificateManagerError('RATE_LIMITED', meta);
            }
            if (status !== null && status >= 500) {
              throw new GoogleCertificateManagerError(
                'SERVICE_UNAVAILABLE',
                meta,
              );
            }
            throw new GoogleCertificateManagerError(
              'TOKEN_EXCHANGE_FAILED',
              meta,
            );
          },
          responseSchema: (data) => TokenResponseSchemaObject.parse(data),
        },
      );
      return response.body as { access_token: string; expires_in: number };
    } catch (cause) {
      if (cause instanceof GoogleCertificateManagerError) throw cause;
      throw new GoogleCertificateManagerError('TOKEN_EXCHANGE_FAILED', {
        status,
        responseError: cause instanceof RESTlerResponseValidationError &&
            cause.cause instanceof GuardianError
          ? cause.cause.toJSON()
          : undefined,
      }, cause instanceof Error ? cause : undefined);
    }
  }

  //#endregion

  //#region Transport and error mapping

  /**
   * Single choke point turning RESTler's transport errors into this
   * connect's error (see {@link __transportError}).
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

  /**
   * `err` rewrapped, or returned unchanged: `RESTlerRateLimitError` →
   * `RATE_LIMITED`, `RESTlerTimeoutError` → `TIMEOUT`, a bare
   * `RESTlerRequestError` (no response at all) → `NETWORK_ERROR`.
   * `RESTlerResponseValidationError` also extends `RESTlerRequestError` and
   * is deliberately left alone, so a schema failure never looks transient.
   */
  private __transportError(err: unknown, timeout: number | undefined): unknown {
    if (err instanceof RESTlerRateLimitError) {
      return new GoogleCertificateManagerError('RATE_LIMITED', {
        status: 429,
        detail: 'rate limited after the allowed retry',
        retryAfterSeconds: err.getContextValue('retryAfter'),
        retried: err.getContextValue('retried'),
      }, err);
    }
    if (err instanceof RESTlerTimeoutError) {
      return new GoogleCertificateManagerError('TIMEOUT', {
        timeoutSeconds: timeout ?? this._getOption('timeout'),
      }, err);
    }
    if (
      err instanceof RESTlerRequestError &&
      !(err instanceof RESTlerResponseValidationError)
    ) {
      return new GoogleCertificateManagerError('NETWORK_ERROR', {}, err);
    }
    return err;
  }

  /**
   * Makes a request and validates the success body against `guard`,
   * turning a validation failure into `RESPONSE_ERROR`.
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
        throw new GoogleCertificateManagerError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Connect-wide response handler: passes a success body through and maps
   * an error status to a {@link GoogleCertificateManagerError} — by the
   * envelope's canonical `status` first, the HTTP status second.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status ?? 0;
    if (status < 400) return response.body;

    const [, envelope] = GoogleErrorEnvelopeSchemaObject.safeParse(
      response.body,
    );
    const error = envelope?.error;
    const vendorReason = error?.details?.find((d) => d.reason)?.reason;
    const retryAfterSeconds = this._parseRetryAfter(response.headers);

    throw new GoogleCertificateManagerError(
      this.__codeFor(status, error?.status, vendorReason, retryAfterSeconds),
      {
        status,
        detail: error?.message ?? 'no detail',
        vendorStatus: error?.status,
        vendorReason,
        retryAfterSeconds,
        body: response.body,
      },
    );
  }

  /** Classifies an HTTP failure by canonical status, then HTTP status. */
  private __codeFor(
    status: number,
    vendorStatus: string | undefined,
    vendorReason: string | undefined,
    retryAfterSeconds: number | undefined,
  ): GoogleCertificateManagerErrorCode {
    if (vendorStatus === 'RESOURCE_EXHAUSTED') {
      return this.__exhaustedCode(vendorReason, retryAfterSeconds);
    }
    const mapped = vendorStatus
      ? STATUS_TO_ERROR_CODE[vendorStatus]
      : undefined;
    if (mapped) return mapped;
    switch (status) {
      case 400:
        return 'INVALID_REQUEST';
      case 401:
        return 'AUTH_FAILED';
      case 403:
        return 'PERMISSION_DENIED';
      case 404:
        return 'NOT_FOUND';
      case 409:
        // ALREADY_EXISTS and ABORTED both answer 409; without the envelope
        // to tell them apart, the retryable reading is the safe one.
        return 'CONFLICT';
      case 429:
        return 'RATE_LIMITED';
    }
    if (status >= 500) return 'SERVICE_UNAVAILABLE';
    if (status >= 400) return 'INVALID_REQUEST';
    return 'UNKNOWN_ERROR';
  }

  /**
   * `RESOURCE_EXHAUSTED` covers both a per-minute rate limit (Google tags
   * it with the `RATE_LIMIT_EXCEEDED` reason, or sends a retry hint) and a
   * resource-count quota that only clears after deletes or a quota raise.
   */
  private __exhaustedCode(
    vendorReason: string | undefined,
    retryAfterSeconds: number | undefined,
  ): GoogleCertificateManagerErrorCode {
    return vendorReason === 'RATE_LIMIT_EXCEEDED' ||
        retryAfterSeconds !== undefined
      ? 'RATE_LIMITED'
      : 'QUOTA_EXCEEDED';
  }

  /** Returns a finished operation, or throws its mapped error. */
  private __settle(operation: OperationSchema): OperationSchema {
    const error = operation.error;
    if (!error) return operation;
    const vendorStatus = typeof error.code === 'number'
      ? RPC_CODE_NAMES[error.code]
      : undefined;
    let code: GoogleCertificateManagerErrorCode = 'UNKNOWN_ERROR';
    if (vendorStatus === 'RESOURCE_EXHAUSTED') {
      code = this.__exhaustedCode(undefined, undefined);
    } else if (vendorStatus && STATUS_TO_ERROR_CODE[vendorStatus]) {
      code = STATUS_TO_ERROR_CODE[vendorStatus]!;
    }
    throw new GoogleCertificateManagerError(code, {
      status: null,
      operation: operation.name,
      vendorCode: error.code,
      vendorStatus,
      detail: error.message ?? 'no detail',
    });
  }

  //#endregion

  //#region Paths and validation

  /** `/projects/{project}/locations/{location}`. */
  private __parentPath(): string {
    return `/projects/${encodeURIComponent(this.projectId)}/locations/${
      encodeURIComponent(this.location)
    }`;
  }

  /** The certificate's path under {@link __parentPath}. */
  private __certificatePath(certificateId: string): string {
    return `${this.__parentPath()}/certificates/${certificateId}`;
  }

  /**
   * The certificate map's path, from `mapId` or the client default.
   *
   * @throws {GoogleCertificateManagerError} `REQUEST_VALIDATION_ERROR` when
   * neither is set or the id is invalid.
   */
  private __mapPath(mapId: string | undefined): string {
    const id = mapId ?? this.certificateMapId;
    if (id === undefined) {
      throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
        reason:
          'mapId: pass one, or configure the client with certificateMapId',
      });
    }
    this.__requireId(id, 'mapId');
    return `${this.__parentPath()}/certificateMaps/${id}`;
  }

  /**
   * A certificate id expanded to its full name in this project and
   * location; a full name passes through.
   */
  private __certificateName(value: string): string {
    if (RESOURCE_ID_PATTERN.test(value)) {
      return `projects/${this.projectId}/locations/${this.location}/certificates/${value}`;
    }
    if (CERTIFICATE_NAME_PATTERN.test(value) && !this.__hasDotSegment(value)) {
      return value;
    }
    throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
      reason:
        `certificates: "${value}" is neither a certificate id nor a full certificate name`,
    });
  }

  /**
   * The request path for an operation, from its full name or bare id.
   *
   * @throws {GoogleCertificateManagerError} `REQUEST_VALIDATION_ERROR`.
   */
  private __operationPath(name: string): string {
    if (typeof name === 'string') {
      if (OPERATION_ID_PATTERN.test(name)) {
        return `${this.__parentPath()}/operations/${name}`;
      }
      if (OPERATION_NAME_PATTERN.test(name) && !this.__hasDotSegment(name)) {
        return `/${name}`;
      }
    }
    throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
      reason:
        `operation: "${name}" is neither an operation id nor a full operation name`,
    });
  }

  /**
   * `true` when a `/`-separated name has a `.` or `..` segment, which
   * RESTler's `path.join` would collapse into a different resource's path.
   */
  private __hasDotSegment(value: string): boolean {
    return value.split('/').some((s) => s === '.' || s === '..');
  }

  /** @throws {GoogleCertificateManagerError} `REQUEST_VALIDATION_ERROR`. */
  private __requireId(value: unknown, field: string): void {
    if (typeof value !== 'string' || !RESOURCE_ID_PATTERN.test(value)) {
      throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
        reason:
          `${field}: "${value}" must be 1-63 characters of lowercase letters, digits and hyphens, starting with a letter and not ending with a hyphen (see hostnameToResourceId)`,
      });
    }
  }

  /** @throws {GoogleCertificateManagerError} `REQUEST_VALIDATION_ERROR`. */
  private __requireStrings(value: unknown, field: string): void {
    if (
      !Array.isArray(value) || value.length === 0 ||
      value.some((v) => typeof v !== 'string' || v.trim() === '')
    ) {
      throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
        reason: `${field}: must be a non-empty array of non-empty strings`,
      });
    }
  }

  /**
   * The list query string, from validated {@link ListOptions}.
   *
   * @throws {GoogleCertificateManagerError} `REQUEST_VALIDATION_ERROR` for a
   * `pageSize` that is not a positive integer.
   */
  private __listQuery(options: ListOptions): Record<string, string> {
    const query: Record<string, string> = {};
    const { pageSize, pageToken, filter, orderBy } = options;
    if (pageSize !== undefined) {
      if (!Number.isInteger(pageSize) || pageSize < 1) {
        throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
          reason: 'pageSize: must be a positive integer',
        });
      }
      query.pageSize = String(pageSize);
    }
    if (pageToken) query.pageToken = pageToken;
    if (filter) query.filter = filter;
    if (orderBy) query.orderBy = orderBy;
    return query;
  }

  /** @throws {GoogleCertificateManagerError} `REQUEST_VALIDATION_ERROR`. */
  private __positiveSeconds(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
        reason: `${field}: must be a positive number of seconds`,
      });
    }
    return value;
  }

  //#endregion
}
