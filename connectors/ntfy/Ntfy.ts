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
  ErrorSchemaObject,
  type PublishRequestSchema,
  PublishRequestSchemaObject,
  type PublishResponseSchema,
  PublishResponseSchemaObject,
} from './schema/mod.ts';
import { NtfyError, type NtfyErrorCode } from './errors/mod.ts';

/**
 * Options for configuring an {@link Ntfy} client.
 *
 * Identical to {@link RESTlerOptions} — ntfy needs no vendor-specific
 * options. `auth` stays fully optional: a public topic on the hosted
 * `https://ntfy.sh` instance needs no credentials at all, so `new Ntfy()`
 * (no arguments) is a valid, working client. Set `auth: { type: 'BASIC',
 * username, password }` or `auth: { type: 'BEARER', token }` for a
 * protected topic, or self-host by overriding `baseURL` — RESTler's base
 * `_authInjector` and `baseURL` option already cover both, so this connect
 * needs no auth/config overrides of its own.
 */
export type NtfyOptions = RESTlerOptions;

/**
 * ntfy client for the [ntfy.sh pub-sub push-notification service](https://ntfy.sh).
 *
 * Publishes messages via `POST /` (the JSON publish form — a strict
 * superset of the plain-text `POST /<topic>` form, so it's the only shape
 * this connect models). Works keyless against any public topic on the
 * hosted `https://ntfy.sh` instance, or with `auth` against a protected
 * topic / self-hosted instance.
 *
 * @example
 * ```typescript
 * import { Ntfy } from '@tundraconnect/ntfy';
 *
 * // Zero-config: publish to a public topic, no account or credentials needed.
 * const client = new Ntfy();
 * await client.publish({ topic: 'mytopic', message: 'Hello from ntfy!' });
 *
 * // Protected topic / self-hosted instance
 * const authed = new Ntfy({
 *   baseURL: 'https://ntfy.example.com',
 *   auth: { type: 'BEARER', token: 'tk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
 * });
 * await authed.publish({ topic: 'alerts', message: 'Disk usage above 90%' });
 * ```
 */
export class Ntfy extends RESTler<NtfyOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'ntfy';

  /**
   * Creates a new ntfy client instance.
   *
   * @param options - Configuration options for the client. All fields are
   * optional — omit entirely to talk to public topics on `https://ntfy.sh`.
   * @param options.baseURL - Override for a self-hosted ntfy instance.
   * Defaults to `https://ntfy.sh`.
   * @param options.auth - `{ type: 'BASIC', username, password }` or
   * `{ type: 'BEARER', token }` for a protected topic. Omit for public
   * topics.
   */
  constructor(options: EventOptionKeys<NtfyOptions, RESTlerEvents> = {}) {
    super(options, {
      baseURL: 'https://ntfy.sh',
      timeout: 15,
      contentType: 'JSON',
    });
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Publish a message via `POST /` (the JSON publish form).
   *
   * `request` is validated against {@link PublishRequestSchema} before
   * anything is sent.
   *
   * @param request - The message to publish.
   * @returns Promise resolving to {@link PublishResponseSchema}.
   * @throws {NtfyError} `REQUEST_VALIDATION_ERROR` if `request` fails local
   * schema validation, or `BAD_REQUEST`, `AUTH_REQUIRED`, `FORBIDDEN`,
   * `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const message = await client.publish({
   *   topic: 'mytopic',
   *   title: 'Disk space alert',
   *   message: 'Disk usage on server1 is at 90%',
   *   priority: 4,
   *   tags: ['warning', 'floppy_disk'],
   * });
   * console.log(message.id);
   * ```
   */
  public async publish(
    request: PublishRequestSchema,
  ): Promise<PublishResponseSchema> {
    let payload: PublishRequestSchema;
    try {
      payload = PublishRequestSchemaObject.parse(request);
    } catch (cause) {
      throw new NtfyError(
        'REQUEST_VALIDATION_ERROR',
        {},
        cause instanceof GuardianError ? cause : undefined,
      );
    }
    return await this.__requestAndValidate(
      {
        path: '/',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      PublishResponseSchemaObject,
    );
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link NtfyError} — so `NtfyError` stays the only thing a public
   * method throws for "the vendor responded, but the body doesn't match
   * what was expected." `B` is inferred from `guard`, so callers no longer
   * separately write out a `_makeRequest<B>()` type argument.
   *
   * By the time a method calls this, {@link _responseHandler} has already
   * run and thrown for any documented vendor error — this only has to
   * handle a response whose status looked fine but whose body doesn't match
   * what was expected.
   *
   * @template B - The expected response body type.
   * @param endpoint - The endpoint to request.
   * @param guard - Guardian schema object for validating the response.
   * @returns The validated response data.
   * @throws {NtfyError} `RESPONSE_ERROR` when the body fails validation.
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
        throw new NtfyError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates ntfy's
   * HTTP-status/error-envelope conventions into a {@link NtfyError}. Runs
   * on every response (registered on `_responseHandler` in the
   * constructor); does nothing for a response below 400, leaving
   * success-body validation to {@link __requestAndValidate}.
   *
   * @param response - The parsed response, before any schema validation.
   * @throws {NtfyError} `BAD_REQUEST`, `AUTH_REQUIRED`, `FORBIDDEN`,
   * `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`, matching the vendor's
   * documented status/message pairs.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body; // let 2xx (and any non-error status) through

    const [err, body] = ErrorSchemaObject.safeParse(response.body);
    const code = this.__errorCodeForStatus(status);
    if (body) {
      throw new NtfyError(code, {
        status,
        vendorCode: body.code,
        link: body.link,
      });
    }
    // Body missing or didn't match the documented error envelope — fall
    // back to SERVICE_UNAVAILABLE for 5xx (an upstream proxy's own
    // error page rarely follows the JSON contract), otherwise the
    // status-mapped code with the raw body attached for diagnostics.
    throw new NtfyError(
      status >= 500 ? 'SERVICE_UNAVAILABLE' : code,
      {
        status,
        body: response.body,
        responseError: err?.toJSON(),
      },
    );
  }

  /** Map an HTTP status code to a stable, connect-specific error code. */
  private __errorCodeForStatus(status: number | null): NtfyErrorCode {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'AUTH_REQUIRED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 413:
        return 'PAYLOAD_TOO_LARGE';
      case 429:
        return 'RATE_LIMITED';
      default:
        if (status !== null && status >= 500) return 'SERVICE_UNAVAILABLE';
        return 'UNKNOWN_ERROR';
    }
  }
}
