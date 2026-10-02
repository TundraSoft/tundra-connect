import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  RESTlerRateLimitError,
  type RESTlerRequest,
  RESTlerRequestError,
  type RESTlerResponse,
  RESTlerResponseValidationError,
  RESTlerTimeoutError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { type BaseGuardian, GuardianError } from '@guardian';
import {
  GoogleWebRiskError,
  type GoogleWebRiskErrorCode,
} from './errors/mod.ts';
import {
  DEFAULT_THREAT_TYPES,
  GoogleErrorEnvelopeSchemaObject,
  type SearchUrisRequestSchema,
  SearchUrisRequestSchemaObject,
  SearchUrisResponseSchemaObject,
  type ThreatTypeSchema,
} from './schema/mod.ts';

/** Web Risk's REST root; `{version}` is filled from the `version` option. */
export const GOOGLE_WEB_RISK_API = 'https://webrisk.googleapis.com/{version}';

/**
 * The header the API key travels in. Google Cloud APIs accept the key
 * either as a `key` query parameter or in this header; the header keeps it
 * out of every URL — and so out of access logs, proxies and anything that
 * records a request line.
 */
const API_KEY_HEADER = 'X-Goog-Api-Key';

/** RESTler's own bounds on a timeout, in seconds. */
const MIN_TIMEOUT = 1;
const MAX_TIMEOUT = 120;

/**
 * Web Risk credentials — one of:
 *
 * - `{ type: 'CUSTOM', apiKey }`: an API key from a Google Cloud project
 *   with the Web Risk API enabled. Sent in the `X-Goog-Api-Key` header,
 *   never in the URL.
 * - `{ type: 'BEARER', token, prefix? }`: an OAuth 2.0 access token with
 *   the `cloud-platform` scope. This client does not mint or refresh it.
 */
export type GoogleWebRiskAuth =
  | {
    type: 'CUSTOM';
    /** Google Cloud API key. Secret — redacted from events and errors. */
    apiKey: string;
  }
  | {
    type: 'BEARER';
    /** OAuth 2.0 access token. */
    token: string;
    /** Authorization scheme prefix. @default 'Bearer' */
    prefix?: string;
  };

/** Options for configuring a {@link GoogleWebRisk} client. */
export type GoogleWebRiskOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link GoogleWebRiskAuth}. */
  auth: GoogleWebRiskAuth;
};

/** Arguments to {@link GoogleWebRisk.search}. */
export type SearchOptions = {
  /** The URI to check. Needn't be canonicalized; Web Risk does that. */
  uri: string;
  /**
   * Threat lists to check. Defaults to {@link DEFAULT_THREAT_TYPES} —
   * `MALWARE`, `SOCIAL_ENGINEERING` and `UNWANTED_SOFTWARE`.
   */
  threatTypes?: ThreatTypeSchema[];
  /**
   * Deadline for this one call, in seconds — fractional values such as
   * `1.5` are fine, between 1 and 120. It bounds the WHOLE call, body read
   * included, not just an idle gap. Defaults to the client's `timeout`.
   * Missing it throws `TIMEOUT`.
   */
  timeout?: number;
};

/**
 * The verdict of {@link GoogleWebRisk.search}.
 *
 * `listed: false` is a definite answer: Web Risk checked the URI and it is
 * on none of the requested lists. Anything that prevents an answer throws
 * a {@link GoogleWebRiskError} instead — it never comes back as
 * `listed: false`.
 */
export type SearchResult =
  | { listed: false }
  | {
    listed: true;
    /** The lists the URI is on — a subset of those requested. */
    threatTypes: ThreatTypeSchema[];
    /**
     * When this verdict expires and the URI should be looked up again.
     * `null` when Web Risk sent no expiry, or one that didn't parse.
     */
    expiresOn: Date | null;
  };

/**
 * An endpoint carrying query parameters that repeat. RESTler's `query` is a
 * `Record<string, string>` and so can hold each key once, but Web Risk takes
 * one `threatTypes` parameter PER list. {@link GoogleWebRisk._processEndpoint}
 * appends these after RESTler has built the URL.
 */
type RepeatedQueryEndpoint = RESTlerEndpoint & {
  repeatedQuery?: ReadonlyArray<readonly [string, string]>;
};

/**
 * Google Web Risk client — the Lookup API's `uris:search`, which checks one
 * URI against Google's malware, social-engineering and unwanted-software
 * lists.
 *
 * Only `uris:search` is wrapped, deliberately. `hashes.search` (the Update
 * API's confirmation call) is billed at $50 per 1,000 calls against
 * `uris:search`'s 100,000 free per month then $0.50 per 1,000 — and
 * calling the Update API's `threatLists.computeDiff` at all reprices every
 * `uris:search` call on the account to that $50 rate. See the README's
 * "Pricing" section before adding either.
 *
 * Runs anywhere `fetch` does, Cloudflare Workers included. To route
 * requests through your own transport (a test double, a tracing wrapper),
 * subclass and reassign the protected `_fetch`.
 *
 * @example
 * ```typescript
 * import { GoogleWebRisk } from '@tundraconnect/google-web-risk';
 *
 * const webRisk = new GoogleWebRisk({
 *   auth: { type: 'CUSTOM', apiKey: 'YOUR_API_KEY' },
 *   timeout: 1.5, // every call answers within 1.5 s or throws TIMEOUT
 * });
 *
 * const verdict = await webRisk.search({ uri: 'https://example.com/' });
 * if (verdict.listed) console.log(verdict.threatTypes, verdict.expiresOn);
 * ```
 */
export class GoogleWebRisk extends RESTler<GoogleWebRiskOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'GoogleWebRisk';

  /**
   * Creates a Google Web Risk client.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - See {@link GoogleWebRiskAuth}.
   * @param options.timeout - Default per-call deadline in seconds (1–120,
   * fractional allowed). @default 10
   * @throws {GoogleWebRiskError} `CONFIG_INVALID_AUTH` when `auth` is
   * missing, of another type, or carries a blank key/token.
   */
  constructor(options: EventOptionKeys<GoogleWebRiskOptions, RESTlerEvents>) {
    super(options, {
      baseURL: GOOGLE_WEB_RISK_API,
      version: 'v1',
      timeout: 10,
      contentType: 'JSON',
    });
    // `_setOptions` only routes keys PRESENT on the argument through
    // `_processOption`, so an omitted `auth` would otherwise surface as a
    // vendor 403 on the first call.
    if (!this._hasOption('auth')) {
      throw new GoogleWebRiskError('CONFIG_INVALID_AUTH');
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Check one URI against Web Risk's threat lists —
   * `GET /v1/uris:search?uri=…&threatTypes=…` (one `threatTypes`
   * parameter per list).
   *
   * @param options - The URI, the lists to check, and an optional deadline.
   * @returns `{ listed: false }` when the URI is on none of the lists;
   * otherwise `{ listed: true, threatTypes, expiresOn }`.
   * @throws {GoogleWebRiskError} `REQUEST_VALIDATION_ERROR` for a blank
   * `uri`, an unknown threat type or an out-of-range `timeout` (nothing is
   * sent); `TIMEOUT`, `NETWORK_ERROR`, `SERVICE_UNAVAILABLE` or
   * `RATE_LIMITED` when no verdict could be had — all `transient`;
   * `AUTH_FAILED`, `FORBIDDEN` or `INVALID_REQUEST` when Google rejects the
   * call; `RESPONSE_ERROR` for a body that isn't a `uris:search` response.
   *
   * @example
   * ```typescript
   * import { GoogleWebRisk } from '@tundraconnect/google-web-risk';
   *
   * declare const webRisk: GoogleWebRisk;
   *
   * const verdict = await webRisk.search({
   *   uri: 'http://testsafebrowsing.appspot.com/s/malware.html',
   *   threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING'],
   *   timeout: 1.5,
   * });
   * ```
   */
  public async search(options: SearchOptions): Promise<SearchResult> {
    const timeout = GoogleWebRisk.__checkTimeout(options?.timeout);
    let request: SearchUrisRequestSchema;
    try {
      request = SearchUrisRequestSchemaObject.parse({
        uri: options?.uri,
        // De-duplicated: a repeated list costs nothing but bloats the URL.
        threatTypes: [
          ...new Set(options?.threatTypes ?? DEFAULT_THREAT_TYPES),
        ],
      });
    } catch (cause) {
      throw new GoogleWebRiskError(
        'REQUEST_VALIDATION_ERROR',
        {
          reason: GoogleWebRisk.__describeInvalid(cause),
          responseError: (cause as GuardianError | undefined)?.toJSON?.(),
        },
        cause instanceof Error ? cause : undefined,
      );
    }

    const endpoint: RepeatedQueryEndpoint = {
      path: '/uris:search',
      method: 'GET',
      query: { uri: request.uri },
      repeatedQuery: request.threatTypes.map((t) => ['threatTypes', t]),
      timeout,
    };
    const body = await this.__requestAndValidate(
      endpoint,
      SearchUrisResponseSchemaObject,
      timeout,
    );

    const threatTypes = body.threat?.threatTypes ?? [];
    if (threatTypes.length === 0) return { listed: false };
    return {
      listed: true,
      threatTypes,
      expiresOn: GoogleWebRisk.__parseExpireTime(body.threat?.expireTime),
    };
  }

  /**
   * Adds the API key header for `CUSTOM` auth. `BEARER` needs nothing
   * here — RESTler's base injector already emits `Authorization`.
   */
  protected override _authInjector(
    endpoint: RESTlerEndpoint,
  ): void | Promise<void> {
    super._authInjector(endpoint);
    const auth = (endpoint.auth ?? this._getOption('auth')) as
      | GoogleWebRiskAuth
      | undefined;
    if (auth?.type !== 'CUSTOM') return;
    endpoint.headers ??= {};
    endpoint.headers[API_KEY_HEADER] = auth.apiKey;
  }

  /**
   * Marks `X-Goog-Api-Key` as a credential, so RESTler redacts it from
   * `call`/`authFailure` event payloads and thrown-error request contexts.
   */
  protected override _isSensitiveHeader(name: string): boolean {
    return name.toLowerCase() === API_KEY_HEADER.toLowerCase() ||
      super._isSensitiveHeader(name);
  }

  /**
   * Appends the endpoint's repeated query parameters (see
   * {@link RepeatedQueryEndpoint}) to the URL RESTler built, encoded the
   * way RESTler encodes its own query (`encodeURIComponent`).
   */
  protected override async _processEndpoint(
    endpoint: RESTlerEndpoint,
    options: { skipAuth?: boolean } = {},
  ): Promise<RESTlerRequest> {
    const request = await super._processEndpoint(endpoint, options);
    const repeated = (endpoint as RepeatedQueryEndpoint).repeatedQuery;
    if (repeated && repeated.length > 0) {
      const extra = repeated
        .map(([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        )
        .join('&');
      request.url += (request.url.includes('?') ? '&' : '?') + extra;
    }
    return request;
  }

  /**
   * Validates `auth`, and defaults a `BEARER` prefix to `Bearer` (RESTler's
   * own default is upper-case `BEARER`).
   */
  protected override _processOption<K extends keyof GoogleWebRiskOptions>(
    key: K,
    value: GoogleWebRiskOptions[K],
  ): GoogleWebRiskOptions[K] {
    if (key === 'auth') {
      const auth = value as unknown as GoogleWebRiskAuth | undefined;
      if (!auth || !GoogleWebRisk.__isUsableAuth(auth)) {
        throw new GoogleWebRiskError('CONFIG_INVALID_AUTH');
      }
      if (auth.type === 'BEARER' && auth.prefix === undefined) {
        value = { ...auth, prefix: 'Bearer' } as GoogleWebRiskOptions[K];
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Makes a request and validates its body against `guard`, translating
   * every RESTler transport failure into a {@link GoogleWebRiskError} so a
   * caller only ever needs one `instanceof`.
   */
  private async __requestAndValidate<B>(
    endpoint: RESTlerEndpoint,
    guard: BaseGuardian<B>,
    timeout: number | undefined,
  ): Promise<B> {
    try {
      const resp = await this._makeRequest(endpoint, {
        responseSchema: (data) => guard.parse(data),
      });
      return resp.body as B;
    } catch (err) {
      if (err instanceof GoogleWebRiskError) throw err;
      if (err instanceof RESTlerResponseValidationError) {
        throw new GoogleWebRiskError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      if (err instanceof RESTlerRateLimitError) {
        // Only reachable with `maxRetryWait` configured — otherwise a 429
        // reaches `__toError`. Leave `maxRetryWait` unset to keep `timeout`
        // a true total deadline: a retry wait sits outside it.
        throw new GoogleWebRiskError('RATE_LIMITED', {
          status: 429,
          retryAfterSeconds: err.getContextValue('retryAfter'),
          retried: err.getContextValue('retried'),
        }, err);
      }
      if (err instanceof RESTlerTimeoutError) {
        throw new GoogleWebRiskError('TIMEOUT', {
          timeoutSeconds: timeout ?? this._getOption('timeout'),
        }, err);
      }
      if (err instanceof RESTlerRequestError) {
        throw new GoogleWebRiskError('NETWORK_ERROR', {}, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler: passes a success body through, and
   * classifies a failure from Google's error envelope — the `ErrorInfo`
   * `reason` first (a bad API key is a 400 `API_KEY_INVALID`, which is an
   * auth failure, not a malformed request), then the HTTP status.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status ?? 0;
    if (status < 400) return response.body;

    const [, envelope] = GoogleErrorEnvelopeSchemaObject.safeParse(
      response.body,
    );
    const error = envelope?.error;
    const vendorReason = error?.details?.find((d) => d.reason)?.reason;

    throw new GoogleWebRiskError(
      GoogleWebRisk.__codeFor(status, vendorReason),
      {
        status,
        detail: error?.message ?? 'no detail',
        vendorStatus: error?.status,
        vendorReason,
        retryAfterSeconds: this._parseRetryAfter(response.headers),
        body: response.body,
      },
    );
  }

  /** Classifies a failed response by Google's `reason`, then HTTP status. */
  private static __codeFor(
    status: number,
    vendorReason: string | undefined,
  ): GoogleWebRiskErrorCode {
    if (vendorReason === 'API_KEY_INVALID' || status === 401) {
      return 'AUTH_FAILED';
    }
    if (status === 403) return 'FORBIDDEN';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'SERVICE_UNAVAILABLE';
    if (status >= 400) return 'INVALID_REQUEST';
    return 'UNKNOWN_ERROR';
  }

  /** `true` when `auth` is a supported type carrying a non-blank secret. */
  private static __isUsableAuth(auth: GoogleWebRiskAuth): boolean {
    let secret: unknown;
    if (auth.type === 'CUSTOM') secret = auth.apiKey;
    else if (auth.type === 'BEARER') secret = auth.token;
    return typeof secret === 'string' && secret.trim() !== '';
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
      throw new GoogleWebRiskError('REQUEST_VALIDATION_ERROR', {
        reason:
          `timeout: must be a number of seconds between ${MIN_TIMEOUT} and ${MAX_TIMEOUT}`,
      });
    }
    return timeout;
  }

  /**
   * Parses Web Risk's RFC 3339 `expireTime`. Its fractional seconds carry
   * NANOSECOND precision (`…23.045123456Z`); trimmed to milliseconds first,
   * since not every engine's `Date` parser accepts more than three digits.
   */
  private static __parseExpireTime(value: string | undefined): Date | null {
    if (!value) return null;
    const date = new Date(value.replace(/(\.\d{3})\d+/, '$1'));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /**
   * Turns a request-schema failure into a `reason` naming each failing
   * field (`uri: …; threatTypes: …`), falling back to the schema's own
   * message for a failure that isn't per-field.
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
}
