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
import { GuardianError } from '@guardian';
import {
  GoogleAnalyticsError,
  type GoogleAnalyticsErrorCode,
} from './errors/mod.ts';
import {
  MAX_EVENT_PARAMS,
  MAX_EVENTS,
  MAX_NAME_LENGTH,
  MAX_PARAM_VALUE_LENGTH,
  MAX_PARAM_VALUE_LENGTH_GA360,
  MAX_PAYLOAD_BYTES,
  MAX_USER_PROPERTIES,
  MAX_USER_PROPERTY_NAME_LENGTH,
  MAX_USER_PROPERTY_VALUE_LENGTH,
  NAME_PATTERN,
  type PayloadSchema,
  PayloadSchemaObject,
  RESERVED_EVENT_NAMES,
  RESERVED_PREFIXES,
  RESERVED_USER_PROPERTY_NAMES,
  type ValidationMessageSchema,
  ValidationResponseSchemaObject,
} from './schema/mod.ts';

/** The Measurement Protocol's global endpoint root. */
export const GA4_API = 'https://www.google-analytics.com';

/** The Measurement Protocol's EU endpoint root (data collected in the EU). */
export const GA4_API_EU = 'https://region1.google-analytics.com';

/**
 * Measurement Protocol credentials: `{ type: 'CUSTOM', apiSecret }`. Create
 * the secret in GA4 under Admin > Data Streams > (stream) > Measurement
 * Protocol API secrets. It is sent as the `api_secret` query parameter,
 * which RESTler redacts from every event payload and error context.
 */
export type GoogleAnalyticsAuth = {
  type: 'CUSTOM';
  /** Measurement Protocol API secret. Secret — never read back. */
  apiSecret: string;
};

/** Options for configuring a {@link GoogleAnalytics} client. */
export type GoogleAnalyticsOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link GoogleAnalyticsAuth}. */
  auth: GoogleAnalyticsAuth;
  /**
   * A web data stream's measurement id, `G-XXXXXXXXXX`. Set exactly one of
   * `measurementId` or `firebaseAppId`. Events then need `client_id`.
   */
  measurementId?: string;
  /**
   * An app data stream's Firebase app id. Set exactly one of
   * `measurementId` or `firebaseAppId`. Events then need `app_instance_id`.
   */
  firebaseAppId?: string;
  /**
   * `'eu'` sends to `region1.google-analytics.com`, so collection happens
   * in the EU. Ignored when `baseURL` is set. @default 'global'
   */
  region?: 'global' | 'eu';
  /**
   * `true` for a GA360 property, which allows string parameter values up to
   * 500 characters instead of 100. @default false
   */
  ga360?: boolean;
};

/** What {@link GoogleAnalytics.validate} resolves to. */
export type ValidationResult = {
  /** `true` when Google found nothing wrong. */
  valid: boolean;
  /** Every problem Google found, in its own words. */
  validationMessages: ValidationMessageSchema[];
};

/**
 * GA4 Measurement Protocol client — server-side events for a GA4 property
 * (`POST /mp/collect`), plus validation against the debug endpoint
 * (`POST /debug/mp/collect`).
 *
 * The Measurement Protocol answers `2xx` for any request it received, even
 * one whose events it then drops, so a resolved `send()` is not proof the
 * events were recorded. Two things close that gap: every payload is checked
 * locally against GA4's documented limits and reserved names before it is
 * sent, and `validate()` asks Google's debug endpoint, which reports
 * problems as `validationMessages` without recording anything.
 *
 * @example
 * ```typescript
 * import { GoogleAnalytics } from '@tundraconnect/google-analytics';
 *
 * const ga = new GoogleAnalytics({
 *   auth: { type: 'CUSTOM', apiSecret: 'YOUR_API_SECRET' },
 *   measurementId: 'G-XXXXXXXXXX',
 * });
 *
 * await ga.send({
 *   client_id: '123456789.1700000000',
 *   events: [{
 *     name: 'link_click',
 *     params: { link_id: 'abc', session_id: 1700000000, engagement_time_msec: 1 },
 *   }],
 * });
 * ```
 */
export class GoogleAnalytics extends RESTler<GoogleAnalyticsOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'GoogleAnalytics';

  /** The configured web stream's measurement id, if any. */
  get measurementId(): string | undefined {
    return this._hasOption('measurementId')
      ? this._getOption('measurementId')
      : undefined;
  }

  /** The configured app stream's Firebase app id, if any. */
  get firebaseAppId(): string | undefined {
    return this._hasOption('firebaseAppId')
      ? this._getOption('firebaseAppId')
      : undefined;
  }

  /**
   * Creates a Measurement Protocol client.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - `{ type: 'CUSTOM', apiSecret }`.
   * @param options.measurementId - A web stream's `G-…` id, or…
   * @param options.firebaseAppId - …an app stream's Firebase app id.
   * @param options.region - `'global'` (default) or `'eu'`.
   * @throws {GoogleAnalyticsError} `CONFIG_INVALID_AUTH` when `auth` is
   * missing, isn't `CUSTOM`, or carries a blank `apiSecret`;
   * `CONFIG_INVALID_STREAM` unless exactly one non-blank stream id is set;
   * `CONFIG_INVALID_REGION` for any other `region`.
   */
  constructor(
    options: EventOptionKeys<GoogleAnalyticsOptions, RESTlerEvents>,
  ) {
    const region = (options as { region?: unknown } | undefined)?.region;
    super(options, {
      baseURL: region === 'eu' ? GA4_API_EU : GA4_API,
      timeout: 10,
      contentType: 'JSON',
    });
    // `_setOptions` only routes keys PRESENT on the argument through
    // `_processOption`, so the absent cases are checked here.
    if (!this._hasOption('auth')) {
      throw new GoogleAnalyticsError('CONFIG_INVALID_AUTH');
    }
    if (
      (this.measurementId === undefined) ===
        (this.firebaseAppId === undefined)
    ) {
      throw new GoogleAnalyticsError('CONFIG_INVALID_STREAM');
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Send events — `POST /mp/collect`.
   *
   * The payload is checked locally first (see {@link GoogleAnalytics}).
   * Google answers `2xx` with no body for anything it received; it does not
   * say whether the events were kept. Use {@link GoogleAnalytics.validate}
   * while building a payload.
   *
   * @param payload - Who, when, and 1–25 events.
   * @throws {GoogleAnalyticsError} `REQUEST_VALIDATION_ERROR` (nothing is
   * sent) naming every rule the payload breaks; `AUTH_FAILED`,
   * `INVALID_REQUEST` when Google refuses the request; `TIMEOUT`,
   * `NETWORK_ERROR`, `SERVICE_UNAVAILABLE` or `RATE_LIMITED` — all
   * `transient` — when it could not be delivered.
   *
   * @example
   * ```typescript
   * import { GoogleAnalytics } from '@tundraconnect/google-analytics';
   *
   * declare const ga: GoogleAnalytics;
   *
   * await ga.send({
   *   client_id: '123456789.1700000000',
   *   user_id: 'user-42',
   *   consent: { ad_user_data: 'DENIED', ad_personalization: 'DENIED' },
   *   events: [{ name: 'sign_up', params: { method: 'email' } }],
   * });
   * ```
   */
  public async send(payload: PayloadSchema): Promise<void> {
    const body = this.__check(payload);
    await this._makeRequest({
      path: '/mp/collect',
      method: 'POST',
      contentType: 'JSON',
      payload: body as Record<string, unknown>,
    });
  }

  /**
   * Validate a payload against Google's debug endpoint —
   * `POST /debug/mp/collect`. Nothing is recorded.
   *
   * The same local checks as {@link GoogleAnalytics.send} run first. Then
   * Google's own findings are returned as data rather than thrown. Set
   * `validation_behavior: 'ENFORCE_RECOMMENDATIONS'` on the payload for
   * Google's stricter checks. The debug endpoint does not verify the API
   * secret, so a valid result does not prove the credentials are right.
   *
   * @param payload - The payload you intend to send.
   * @returns `{ valid, validationMessages }`.
   * @throws {GoogleAnalyticsError} As {@link GoogleAnalytics.send}, plus
   * `RESPONSE_ERROR` when the debug response is not the documented shape.
   *
   * @example
   * ```typescript
   * import { GoogleAnalytics } from '@tundraconnect/google-analytics';
   *
   * declare const ga: GoogleAnalytics;
   *
   * const result = await ga.validate({
   *   client_id: '123456789.1700000000',
   *   validation_behavior: 'ENFORCE_RECOMMENDATIONS',
   *   events: [{ name: 'link_click', params: { link_id: 'abc' } }],
   * });
   * for (const m of result.validationMessages) {
   *   console.log(m.validationCode, m.fieldPath, m.description);
   * }
   * ```
   */
  public async validate(payload: PayloadSchema): Promise<ValidationResult> {
    const body = this.__check(payload);
    let parsed;
    try {
      const response = await this._makeRequest(
        {
          path: '/debug/mp/collect',
          method: 'POST',
          contentType: 'JSON',
          payload: body as Record<string, unknown>,
        },
        {
          responseSchema: (data) =>
            ValidationResponseSchemaObject.parse(
              typeof data === 'string' ? GoogleAnalytics.__tryJson(data) : data,
            ),
        },
      );
      parsed = response.body!;
    } catch (err) {
      if (err instanceof RESTlerResponseValidationError) {
        throw new GoogleAnalyticsError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
    return {
      valid: parsed.validationMessages.length === 0,
      validationMessages: parsed.validationMessages,
    };
  }

  /** Adds `api_secret` and the stream id as query parameters. */
  protected override _authInjector(
    endpoint: RESTlerEndpoint,
  ): void | Promise<void> {
    super._authInjector(endpoint);
    const auth = (endpoint.auth ?? this._getOption('auth')) as
      | GoogleAnalyticsAuth
      | undefined;
    if (auth?.type !== 'CUSTOM') return;
    endpoint.query = {
      ...endpoint.query,
      api_secret: auth.apiSecret,
      ...(this.measurementId !== undefined
        ? { measurement_id: this.measurementId }
        : { firebase_app_id: this.firebaseAppId! }),
    };
  }

  /**
   * Every request funnels through here, so a transport failure surfaces as
   * this connect's own error: a timeout as `TIMEOUT`, a failure before any
   * response as `NETWORK_ERROR`, an exhausted RESTler rate-limit retry
   * (`maxRetryWait`) as `RATE_LIMITED` — all `transient`.
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

  /** Validates the options this connect owns beyond `RESTlerOptions`. */
  protected override _processOption<K extends keyof GoogleAnalyticsOptions>(
    key: K,
    value: GoogleAnalyticsOptions[K],
  ): GoogleAnalyticsOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as GoogleAnalyticsAuth | undefined;
        if (
          auth?.type !== 'CUSTOM' || typeof auth.apiSecret !== 'string' ||
          auth.apiSecret.trim() === ''
        ) {
          throw new GoogleAnalyticsError('CONFIG_INVALID_AUTH');
        }
        break;
      }
      case 'measurementId':
      case 'firebaseAppId': {
        if (value === undefined) return value;
        if (typeof value !== 'string' || value.trim() === '') {
          throw new GoogleAnalyticsError('CONFIG_INVALID_STREAM');
        }
        value = value.trim() as GoogleAnalyticsOptions[K];
        break;
      }
      case 'region': {
        if (value !== undefined && value !== 'global' && value !== 'eu') {
          throw new GoogleAnalyticsError('CONFIG_INVALID_REGION');
        }
        break;
      }
      case 'ga360': {
        if (value !== undefined && typeof value !== 'boolean') {
          throw new GoogleAnalyticsError('REQUEST_VALIDATION_ERROR', {
            reason: 'ga360: must be a boolean',
          });
        }
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Parses `payload` and checks every GA4 rule a schema can't express —
   * name formats, reserved names and prefixes, counts, string lengths, the
   * id the stream type needs, and the body size — collecting every
   * violation into one `REQUEST_VALIDATION_ERROR`.
   */
  private __check(payload: PayloadSchema): PayloadSchema {
    let parsed: PayloadSchema;
    try {
      parsed = PayloadSchemaObject.parse(payload);
    } catch (cause) {
      throw new GoogleAnalyticsError(
        'REQUEST_VALIDATION_ERROR',
        {
          reason: GoogleAnalytics.__describeInvalid(cause),
          responseError: (cause as GuardianError | undefined)?.toJSON?.(),
        },
        cause instanceof Error ? cause : undefined,
      );
    }

    const problems: string[] = [];
    if (this.measurementId !== undefined && parsed.client_id === undefined) {
      problems.push('client_id: required for a web stream (`measurementId`)');
    }
    if (
      this.firebaseAppId !== undefined && parsed.app_instance_id === undefined
    ) {
      problems.push(
        'app_instance_id: required for an app stream (`firebaseAppId`)',
      );
    }

    if (parsed.events.length === 0 || parsed.events.length > MAX_EVENTS) {
      problems.push(`events: must hold 1–${MAX_EVENTS} events`);
    }
    const valueLimit = this._hasOption('ga360') && this._getOption('ga360')
      ? MAX_PARAM_VALUE_LENGTH_GA360
      : MAX_PARAM_VALUE_LENGTH;
    parsed.events.forEach((event, i) => {
      const at = `events[${i}]`;
      GoogleAnalytics.__checkName(problems, `${at}.name`, event.name);
      if ((RESERVED_EVENT_NAMES as readonly string[]).includes(event.name)) {
        problems.push(`${at}.name: \`${event.name}\` is reserved by GA4`);
      }
      const params = Object.entries(event.params ?? {});
      if (params.length > MAX_EVENT_PARAMS) {
        problems.push(
          `${at}.params: at most ${MAX_EVENT_PARAMS} parameters per event`,
        );
      }
      for (const [name, value] of params) {
        GoogleAnalytics.__checkName(problems, `${at}.params.${name}`, name);
        if (typeof value === 'string' && value.length > valueLimit) {
          problems.push(
            `${at}.params.${name}: string values are limited to ${valueLimit} characters`,
          );
        }
      }
    });

    const properties = Object.entries(parsed.user_properties ?? {});
    if (properties.length > MAX_USER_PROPERTIES) {
      problems.push(
        `user_properties: at most ${MAX_USER_PROPERTIES} user properties`,
      );
    }
    for (const [name, property] of properties) {
      const at = `user_properties.${name}`;
      GoogleAnalytics.__checkName(
        problems,
        at,
        name,
        MAX_USER_PROPERTY_NAME_LENGTH,
      );
      if (
        (RESERVED_USER_PROPERTY_NAMES as readonly string[]).includes(name)
      ) {
        problems.push(`${at}: \`${name}\` is reserved by GA4`);
      }
      if (property.value === undefined) {
        problems.push(`${at}.value: required`);
      } else if (
        typeof property.value === 'string' &&
        property.value.length > MAX_USER_PROPERTY_VALUE_LENGTH
      ) {
        problems.push(
          `${at}.value: limited to ${MAX_USER_PROPERTY_VALUE_LENGTH} characters`,
        );
      }
    }

    if (problems.length === 0) {
      const bytes = new TextEncoder().encode(JSON.stringify(parsed)).length;
      if (bytes >= MAX_PAYLOAD_BYTES) {
        problems.push(
          `payload: ${bytes} bytes; Google accepts less than ${MAX_PAYLOAD_BYTES}`,
        );
      }
    }

    if (problems.length > 0) {
      throw new GoogleAnalyticsError('REQUEST_VALIDATION_ERROR', {
        reason: problems.join('; '),
      });
    }
    return parsed;
  }

  /** Checks an event, parameter or user property name. */
  private static __checkName(
    problems: string[],
    at: string,
    name: string,
    maxLength = MAX_NAME_LENGTH,
  ): void {
    if (name.length > maxLength) {
      problems.push(`${at}: names are limited to ${maxLength} characters`);
    }
    const prefix = RESERVED_PREFIXES.find((p) =>
      name.toLowerCase().startsWith(p)
    );
    if (prefix !== undefined) {
      problems.push(`${at}: the \`${prefix}\` prefix is reserved by GA4`);
    } else if (!NAME_PATTERN.test(name)) {
      problems.push(
        `${at}: must start with a letter and use only letters, digits and _`,
      );
    }
  }

  /** `err` rewrapped as this connect's transient code, or returned unchanged. */
  private __transportError(
    err: unknown,
    timeout: number | undefined,
  ): unknown {
    if (err instanceof RESTlerRateLimitError) {
      return new GoogleAnalyticsError('RATE_LIMITED', {
        status: 429,
        retryAfterSeconds: err.getContextValue('retryAfter'),
        retried: err.getContextValue('retried'),
      }, err);
    }
    if (err instanceof RESTlerTimeoutError) {
      return new GoogleAnalyticsError('TIMEOUT', {
        timeoutSeconds: timeout ?? this._getOption('timeout'),
      }, err);
    }
    // RESTlerResponseValidationError (and the two above) extend
    // RESTlerRequestError: only a bare one is a failure before any response.
    if (
      err instanceof RESTlerRequestError &&
      !(err instanceof RESTlerResponseValidationError)
    ) {
      return new GoogleAnalyticsError('NETWORK_ERROR', {}, err);
    }
    return err;
  }

  /**
   * Vendor-wide response handler: a status below 400 passes through (the
   * collect endpoint answers with an empty body); a failure is classified
   * by HTTP status.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status ?? 0;
    if (status < 400) return response.body;
    throw new GoogleAnalyticsError(GoogleAnalytics.__statusToCode(status), {
      status,
      retryAfterSeconds: this._parseRetryAfter(response.headers),
    });
  }

  /** HTTP-status classification. */
  private static __statusToCode(status: number): GoogleAnalyticsErrorCode {
    if (status === 401 || status === 403) return 'AUTH_FAILED';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'SERVICE_UNAVAILABLE';
    if (status >= 400) return 'INVALID_REQUEST';
    return 'UNKNOWN_ERROR';
  }

  /** Names each failing field of a schema failure. */
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

  /** `JSON.parse(text)`, or `text` itself when it isn't JSON. */
  private static __tryJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
