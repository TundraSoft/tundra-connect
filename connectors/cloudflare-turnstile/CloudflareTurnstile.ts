import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  RESTlerRateLimitError,
  RESTlerRequestError,
  type RESTlerResponse,
  RESTlerResponseValidationError,
  RESTlerTimeoutError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { type BaseGuardian, GuardianError } from '@guardian';
import {
  CloudflareTurnstileError,
  type CloudflareTurnstileErrorCode,
} from './errors/mod.ts';
import {
  type VerificationSchema,
  VerificationSchemaObject,
  type VerifyRequestSchema,
  VerifyRequestSchemaObject,
} from './schema/mod.ts';

/** Turnstile's siteverify API root. */
export const TURNSTILE_API = 'https://challenges.cloudflare.com/turnstile/v0';

/**
 * Cloudflare's documented dummy secret keys. Each accepts only
 * {@link TURNSTILE_DUMMY_TOKEN} and behaves as named, so a test suite can
 * exercise every verdict without a real widget.
 */
export const TURNSTILE_DUMMY_SECRETS = {
  /** `success: true` for the dummy token. */
  alwaysPasses: '1x0000000000000000000000000000000AA',
  /** `success: false`, `invalid-input-response`. */
  alwaysFails: '2x0000000000000000000000000000000AA',
  /** `success: false`, `timeout-or-duplicate` (a token already spent). */
  alreadySpent: '3x0000000000000000000000000000000AA',
} as const;

/** The token Cloudflare's dummy sitekeys hand the browser. */
export const TURNSTILE_DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

/** RESTler's own bounds on a timeout, in seconds. */
const MIN_TIMEOUT = 1;
const MAX_TIMEOUT = 120;

/**
 * `error-codes` that mean the CALL failed — the secret, the request shape,
 * or Cloudflare itself — rather than the token. Listed in the order they
 * take precedence when a response carries more than one.
 */
const CALL_FAILURE_CODES: [string, CloudflareTurnstileErrorCode][] = [
  ['missing-input-secret', 'AUTH_FAILED'],
  ['invalid-input-secret', 'AUTH_FAILED'],
  ['bad-request', 'INVALID_REQUEST'],
  ['missing-input-response', 'INVALID_REQUEST'],
  ['internal-error', 'SERVICE_UNAVAILABLE'],
];

/**
 * Turnstile credentials: `{ type: 'CUSTOM', secretKey }`. The secret key is
 * shown once per widget in the Cloudflare dashboard (Turnstile → the widget
 * → Settings). It travels in the siteverify request BODY, never in a header
 * or the URL, which is why this is a `CUSTOM` auth rather than `BEARER`.
 */
export type CloudflareTurnstileAuth = {
  type: 'CUSTOM';
  /** The widget's secret key. Secret — never read back, never in an error. */
  secretKey: string;
};

/** Options for configuring a {@link CloudflareTurnstile} client. */
export type CloudflareTurnstileOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link CloudflareTurnstileAuth}. */
  auth: CloudflareTurnstileAuth;
};

/**
 * Arguments to {@link CloudflareTurnstile.verify}: the siteverify fields
 * ({@link VerifyRequestSchema}, Cloudflare's names) plus what this connect
 * checks and bounds on top.
 */
export type VerifyOptions = VerifyRequestSchema & {
  /**
   * The hostname(s) your widget is served on. When set, a token Cloudflare
   * accepted but issued for another hostname resolves as `success: false`
   * with `hostname-mismatch` appended to `error-codes`. Compared
   * case-insensitively.
   */
  expectedHostname?: string | readonly string[];
  /**
   * The widget's `data-action`. When set, a token Cloudflare accepted for a
   * different action resolves as `success: false` with `action-mismatch`.
   */
  expectedAction?: string;
  /**
   * Deadline for this one call, in seconds — fractional values such as
   * `1.5` are fine, between 1 and 120. It bounds the WHOLE call, body read
   * included. Defaults to the client's `timeout`. Missing it throws
   * `TIMEOUT`.
   */
  timeout?: number;
};

/**
 * Cloudflare Turnstile client — server-side verification of a widget token
 * through the siteverify endpoint
 * (`POST https://challenges.cloudflare.com/turnstile/v0/siteverify`).
 *
 * `verify` resolves to Cloudflare's verdict rather than throwing on a
 * failed challenge: an invalid, expired or already-spent token is an answer
 * about the visitor (`success: false` with `error-codes`), not a failure of
 * the call. Only a bad secret key, a malformed request, a Cloudflare-side
 * error or a transport problem throws a {@link CloudflareTurnstileError}.
 *
 * Runs anywhere `fetch` does, Cloudflare Workers included. To route
 * requests through your own transport, subclass and reassign the protected
 * `_fetch`.
 *
 * @example
 * ```typescript
 * import { CloudflareTurnstile } from '@tundraconnect/cloudflare-turnstile';
 *
 * const turnstile = new CloudflareTurnstile({
 *   auth: { type: 'CUSTOM', secretKey: 'YOUR_SECRET_KEY' },
 *   timeout: 5, // every call answers within 5 s or throws TIMEOUT
 * });
 *
 * // In your form handler:
 * const verdict = await turnstile.verify({
 *   response: 'TOKEN_FROM_cf-turnstile-response',
 *   remoteip: '203.0.113.7',
 *   expectedHostname: 'example.com',
 *   expectedAction: 'login',
 * });
 * if (!verdict.success) {
 *   console.log('rejected:', verdict['error-codes']);
 * }
 * ```
 */
export class CloudflareTurnstile extends RESTler<CloudflareTurnstileOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'CloudflareTurnstile';

  /**
   * Creates a Turnstile client.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - See {@link CloudflareTurnstileAuth}.
   * @param options.timeout - Default per-call deadline in seconds (1–120,
   * fractional allowed). @default 10
   * @throws {CloudflareTurnstileError} `CONFIG_INVALID_SECRET_KEY` when
   * `auth` is missing, isn't `CUSTOM`, or carries a blank `secretKey`.
   */
  constructor(
    options: EventOptionKeys<CloudflareTurnstileOptions, RESTlerEvents>,
  ) {
    super(options, {
      baseURL: TURNSTILE_API,
      timeout: 10,
      contentType: 'JSON',
    });
    // `_setOptions` only routes keys PRESENT on the argument through
    // `_processOption`, so an omitted `auth` would otherwise surface as a
    // `missing-input-secret` on the first call.
    if (!this._hasOption('auth')) {
      throw new CloudflareTurnstileError('CONFIG_INVALID_SECRET_KEY');
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Verify a widget token — `POST /siteverify`.
   *
   * The token (`response`) and the optional `remoteip` / `idempotency_key`
   * are validated locally, the secret key is added from `auth`, and the
   * body is sent as JSON. On `success: true`, `expectedHostname` and
   * `expectedAction` are checked against the verdict's `hostname` and
   * `action`; a mismatch turns it into `success: false` with
   * `hostname-mismatch` / `action-mismatch` appended to `error-codes`
   * (codes this connect adds — Cloudflare never emits them).
   *
   * A token Cloudflare already verified once answers
   * `timeout-or-duplicate`; send the same `idempotency_key` with every
   * retry of one verification to make it safe to repeat.
   *
   * @param options - The token, optional visitor IP and idempotency key,
   * the expected hostname/action, and an optional deadline.
   * @returns Cloudflare's verdict. `success: false` is an answer about the
   * token, never a failure of the call.
   * @throws {CloudflareTurnstileError} `REQUEST_VALIDATION_ERROR` for a
   * blank or over-long token, a blank `remoteip` / `idempotency_key`, a
   * malformed expectation, or an out-of-range `timeout` (nothing is
   * sent); `AUTH_FAILED` when Cloudflare rejects the secret key;
   * `INVALID_REQUEST` when it rejects the request; `TIMEOUT`,
   * `NETWORK_ERROR`, `SERVICE_UNAVAILABLE` or `RATE_LIMITED` when no
   * verdict could be had — all `transient`; `RESPONSE_ERROR` for a
   * malformed body.
   *
   * @example
   * ```typescript
   * import { CloudflareTurnstile } from '@tundraconnect/cloudflare-turnstile';
   *
   * declare const turnstile: CloudflareTurnstile;
   * declare const form: FormData;
   *
   * const verdict = await turnstile.verify({
   *   response: String(form.get('cf-turnstile-response')),
   *   expectedHostname: ['example.com', 'www.example.com'],
   *   timeout: 3,
   * });
   * if (verdict.success) {
   *   // proceed
   * }
   * ```
   */
  public async verify(options: VerifyOptions): Promise<VerificationSchema> {
    const timeout = CloudflareTurnstile.__checkTimeout(options?.timeout);
    const {
      expectedHostname,
      expectedAction,
      timeout: _timeout,
      ...fields
    } = (options ?? {}) as VerifyOptions;
    CloudflareTurnstile.__checkExpectations(expectedHostname, expectedAction);

    let request: VerifyRequestSchema;
    try {
      request = VerifyRequestSchemaObject.parse(fields);
    } catch (cause) {
      throw new CloudflareTurnstileError(
        'REQUEST_VALIDATION_ERROR',
        {
          reason: CloudflareTurnstile.__describeInvalid(cause),
          responseError: (cause as GuardianError | undefined)?.toJSON?.(),
        },
        cause instanceof Error ? cause : undefined,
      );
    }

    const auth = this._getOption('auth') as CloudflareTurnstileAuth;
    const verdict = await this.__requestAndValidate(
      {
        path: '/siteverify',
        method: 'POST',
        contentType: 'JSON',
        // The secret rides in the body. RESTler drops the payload from every
        // `call` event and error context, so it never leaks that way.
        payload: { secret: auth.secretKey, ...request },
        timeout,
      },
      VerificationSchemaObject,
      timeout,
    );
    return CloudflareTurnstile.__applyExpectations(
      verdict,
      expectedHostname,
      expectedAction,
    );
  }

  /** Validates `auth`. */
  protected override _processOption<K extends keyof CloudflareTurnstileOptions>(
    key: K,
    value: CloudflareTurnstileOptions[K],
  ): CloudflareTurnstileOptions[K] {
    if (key === 'auth') {
      const auth = value as unknown as CloudflareTurnstileAuth | undefined;
      if (
        auth?.type !== 'CUSTOM' || typeof auth.secretKey !== 'string' ||
        auth.secretKey.trim() === ''
      ) {
        throw new CloudflareTurnstileError('CONFIG_INVALID_SECRET_KEY');
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  /**
   * Makes a request and validates its body against `guard`, translating
   * RESTler's generic validation, rate-limit and transport errors into a
   * {@link CloudflareTurnstileError} so a caller only ever needs one
   * `instanceof`.
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
      if (err instanceof RESTlerResponseValidationError) {
        throw new CloudflareTurnstileError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      if (err instanceof RESTlerRateLimitError) {
        // Only reachable with `maxRetryWait` configured — otherwise a 429
        // reaches `__toError`. Leave `maxRetryWait` unset to keep `timeout`
        // a true total deadline: a retry wait sits outside it.
        throw new CloudflareTurnstileError('RATE_LIMITED', {
          status: 429,
          retryAfterSeconds: err.getContextValue('retryAfter'),
          retried: err.getContextValue('retried'),
        }, err);
      }
      if (err instanceof RESTlerTimeoutError) {
        throw new CloudflareTurnstileError('TIMEOUT', {
          timeoutSeconds: timeout ?? this._getOption('timeout'),
        }, err);
      }
      if (err instanceof RESTlerRequestError) {
        throw new CloudflareTurnstileError('NETWORK_ERROR', {}, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide response handler.
   *
   * siteverify answers almost everything with an HTTP 200 and puts the
   * outcome in the body's `error-codes`. A failure of the CALL — the
   * secret (`missing-input-secret`, `invalid-input-secret`), the request
   * (`bad-request`, `missing-input-response`) or Cloudflare itself
   * (`internal-error`) — is thrown here with a stable code. A failure of
   * the TOKEN (`invalid-input-response`, `timeout-or-duplicate`) is the
   * verdict a caller asked for, and passes through as `success: false`.
   *
   * An HTTP error status is classified by status, with the body's codes
   * attached when it carries any.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status ?? 0;
    const body = typeof response.body === 'string'
      ? CloudflareTurnstile.__tryJson(response.body)
      : response.body;
    const codes = CloudflareTurnstile.__errorCodes(body);

    if (status >= 400) {
      throw new CloudflareTurnstileError(
        CloudflareTurnstile.__statusToCode(status),
        {
          status,
          vendorCodes: codes.length > 0 ? codes.join(',') : 'none',
          retryAfterSeconds: this._parseRetryAfter(response.headers),
          body,
        },
      );
    }

    if (
      body && typeof body === 'object' &&
      (body as { success?: unknown }).success === false
    ) {
      for (const [vendorCode, code] of CALL_FAILURE_CODES) {
        if (codes.includes(vendorCode)) {
          throw new CloudflareTurnstileError(code, {
            status,
            vendorCodes: codes.join(','),
            body,
          });
        }
      }
    }
    return body;
  }

  /**
   * Re-checks a verdict Cloudflare accepted against the caller's expected
   * hostname and action, demoting it to `success: false` on a mismatch.
   * A verdict that already failed is returned untouched — the caller's
   * expectations add nothing to a token Cloudflare rejected.
   */
  private static __applyExpectations(
    verdict: VerificationSchema,
    expectedHostname: string | readonly string[] | undefined,
    expectedAction: string | undefined,
  ): VerificationSchema {
    if (!verdict.success) return verdict;
    const failures: string[] = [];
    if (expectedHostname !== undefined) {
      const allowed = (typeof expectedHostname === 'string'
        ? [expectedHostname]
        : expectedHostname).map((host) =>
          host.trim().toLowerCase()
        );
      const actual = verdict.hostname?.trim().toLowerCase();
      if (actual === undefined || !allowed.includes(actual)) {
        failures.push('hostname-mismatch');
      }
    }
    if (expectedAction !== undefined && verdict.action !== expectedAction) {
      failures.push('action-mismatch');
    }
    if (failures.length === 0) return verdict;
    return {
      ...verdict,
      success: false,
      'error-codes': [...(verdict['error-codes'] ?? []), ...failures],
    };
  }

  /** Validates `expectedHostname` / `expectedAction` before anything is sent. */
  private static __checkExpectations(
    expectedHostname: unknown,
    expectedAction: unknown,
  ): void {
    if (expectedHostname !== undefined) {
      const hosts = Array.isArray(expectedHostname)
        ? expectedHostname
        : [expectedHostname];
      if (
        hosts.length === 0 ||
        hosts.some((h) => typeof h !== 'string' || h.trim() === '')
      ) {
        throw CloudflareTurnstile.__invalid(
          'expectedHostname: must be a non-empty hostname or a non-empty array of them',
        );
      }
    }
    if (
      expectedAction !== undefined &&
      (typeof expectedAction !== 'string' || expectedAction.trim() === '')
    ) {
      throw CloudflareTurnstile.__invalid(
        'expectedAction: must be a non-empty string',
      );
    }
  }

  /** The body's `error-codes`, when it is an array of strings; else `[]`. */
  private static __errorCodes(body: unknown): string[] {
    if (!body || typeof body !== 'object') return [];
    const codes = (body as { 'error-codes'?: unknown })['error-codes'];
    return Array.isArray(codes)
      ? codes.filter((c): c is string => typeof c === 'string')
      : [];
  }

  /** HTTP-status fallback for a failure the body does not explain. */
  private static __statusToCode(status: number): CloudflareTurnstileErrorCode {
    if (status === 401 || status === 403) return 'AUTH_FAILED';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'SERVICE_UNAVAILABLE';
    if (status >= 400) return 'INVALID_REQUEST';
    return 'UNKNOWN_ERROR';
  }

  /**
   * Turns a request-schema failure into a `reason` that names each failing
   * field, e.g. `response: \`response\` cannot be empty`. Falls back to the
   * schema's own message for a failure that isn't per-field.
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
      throw CloudflareTurnstile.__invalid(
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
  private static __invalid(reason: string): CloudflareTurnstileError {
    return new CloudflareTurnstileError('REQUEST_VALIDATION_ERROR', { reason });
  }
}
