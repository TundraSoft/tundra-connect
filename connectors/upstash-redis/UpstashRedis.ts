import {
  RESTler,
  type RESTlerEndpoint,
  type RESTlerEvents,
  type RESTlerOptions,
  RESTlerRateLimitError,
  type RESTlerResponse,
  RESTlerResponseValidationError,
} from '@restler';
import type { EventOptionKeys } from '@utils';
import { type BaseGuardian, GuardianError } from '@guardian';
import {
  AnyResultSchemaObject,
  ArrayResultSchemaObject,
  type CommandSchema,
  CommandSchemaObject,
  ErrorSchemaObject,
  IntegerResultSchemaObject,
  PipelineRequestSchemaObject,
  type PipelineResponseSchema,
  PipelineResponseSchemaObject,
  StatusResultSchemaObject,
  StringResultSchemaObject,
} from './schema/mod.ts';
import { UpstashRedisError } from './errors/mod.ts';

/**
 * UpstashRedis authentication — a Bearer token sent on every request.
 * `RESTlerAuth`'s `BEARER` variant already matches this vendor's scheme
 * exactly (Upstash has no Basic/custom-header auth mode to admit here);
 * this narrows it to the one shape UpstashRedis actually accepts.
 */
export type UpstashRedisAuth = {
  type: 'BEARER';
  /** The database's REST token, from the Upstash console. */
  token: string;
  /** Authorization header scheme prefix. Upstash documents `Bearer`. */
  prefix?: string;
};

/** Options for configuring a {@link UpstashRedis} client. */
export type UpstashRedisOptions = Omit<RESTlerOptions, 'auth'> & {
  /** See {@link UpstashRedisAuth}. */
  auth: UpstashRedisAuth;
};

/** Options accepted by {@link UpstashRedis.set}. */
export type UpstashRedisSetOptions = {
  /** Expire the key after this many seconds. Mutually exclusive with `px`. */
  ex?: number;
  /**
   * Expire the key after this many milliseconds. Mutually exclusive with
   * `ex`.
   */
  px?: number;
  /**
   * Only set the key if it does not already exist. Mutually exclusive with
   * `xx`.
   */
  nx?: boolean;
  /**
   * Only set the key if it already exists. Mutually exclusive with `nx`.
   */
  xx?: boolean;
};

/**
 * UpstashRedis client for the [Upstash Redis REST API](https://upstash.com/docs/redis/features/restapi).
 *
 * Every command is sent as `POST /` (the base URL's root — no path
 * segment) with a JSON array body: `["COMMAND", "arg1", "arg2", ...]`.
 * Upstash documents this array style as the general/preferred request
 * shape over an alternative path-style URL form (`POST /command/arg1/...`)
 * because it has no ambiguity around URL-encoding special characters or
 * binary-looking values — every method on this client uses it exclusively.
 *
 * `baseURL` is per-database (e.g.
 * `https://us1-merry-cat-32748.upstash.io`) — there is no shared default,
 * so it must always be supplied.
 *
 * @example
 * ```typescript
 * import { UpstashRedis } from '@tundraconnect/upstash-redis';
 *
 * const client = new UpstashRedis({
 *   auth: { type: 'BEARER', token: 'AAAAA...', prefix: 'Bearer' },
 *   baseURL: 'https://us1-merry-cat-32748.upstash.io',
 * });
 *
 * await client.set('foo', 'bar', { ex: 60 });
 * console.log(await client.get('foo')); // 'bar'
 * ```
 */
export class UpstashRedis extends RESTler<UpstashRedisOptions> {
  /** Vendor identifier for this API client. */
  public readonly vendor: string = 'UpstashRedis';

  /**
   * Creates a new UpstashRedis client instance.
   *
   * @param options - Configuration options for the client.
   * @param options.auth - `{ type: 'BEARER', token, prefix? }` — the
   * database's REST token as the Bearer token. RESTler's base
   * `_authInjector` already emits `Authorization: <prefix> <token>` for
   * `type: 'BEARER'`, so no auth override is needed here; pass
   * `prefix: 'Bearer'` to match Upstash's documented casing.
   * @param options.baseURL - The database's REST URL, from the Upstash
   * console (e.g. `https://us1-merry-cat-32748.upstash.io`). Required —
   * there is no shared default across databases.
   * @throws {UpstashRedisError} `CONFIG_INVALID_TOKEN` if `auth` is
   * missing, isn't `type: 'BEARER'`, or its `token` is blank or not a
   * string.
   */
  constructor(options: EventOptionKeys<UpstashRedisOptions, RESTlerEvents>) {
    super(options, {
      timeout: 10,
      contentType: 'JSON',
    });
    // `auth` is required by the type, but a caller that bypasses the type
    // checker (or builds options dynamically) can omit it entirely.
    // `_setOptions` only routes keys actually PRESENT on the constructor
    // argument through `_processOption`, so an absent `auth` slips past
    // the switch-based validation below and would otherwise only surface
    // as a raw auth failure on the first request. Fail fast here instead —
    // mirrors RESTler's own `baseURL` guard in its constructor.
    if (!this._hasOption('auth')) {
      throw new UpstashRedisError('CONFIG_INVALID_TOKEN', {});
    }
    this._responseHandler = (response) => this.__toError(response);
  }

  /**
   * Get the string value of `key` via `GET`.
   *
   * @param key - The key to read.
   * @returns The key's value, or `null` if it does not exist.
   * @throws {UpstashRedisError} `AUTH_FAILED`, `COMMAND_ERROR`,
   * `METHOD_NOT_ALLOWED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or
   * `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const value = await client.get('foo'); // 'bar' | null
   * ```
   */
  public async get(key: string): Promise<string | null> {
    const { result } = await this.__send(
      this.__buildCommand(['GET', key]),
      StringResultSchemaObject,
    );
    return result;
  }

  /**
   * Set `key` to `value` via `SET`, with optional expiry/existence
   * conditions.
   *
   * `options.ex` and `options.px` are mutually exclusive (both set the
   * expiry, in different units), as are `options.nx` and `options.xx`
   * (both constrain whether the SET applies based on the key's current
   * existence) — this mirrors real Redis's own `SET` command, which
   * rejects both pairs the same way.
   *
   * @param key - The key to set.
   * @param value - The value to store.
   * @param options - Optional `EX`/`PX`/`NX`/`XX` modifiers.
   * @returns `"OK"` on success, or `null` if a conditional SET (`NX`/`XX`)
   * did not apply because its condition wasn't met.
   * @throws {UpstashRedisError} `INVALID_REQUEST` if `ex`+`px` or `nx`+`xx`
   * are both set, or `AUTH_FAILED`, `COMMAND_ERROR`, `METHOD_NOT_ALLOWED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * await client.set('foo', 'bar', { ex: 60 });
   * const result = await client.set('foo', 'baz', { nx: true }); // null — 'foo' already exists
   * ```
   */
  public async set(
    key: string,
    value: string | number,
    options: UpstashRedisSetOptions = {},
  ): Promise<'OK' | null> {
    if (options.ex !== undefined && options.px !== undefined) {
      throw new UpstashRedisError('INVALID_REQUEST', {
        reason: '`ex` and `px` are mutually exclusive',
      });
    }
    if (options.nx && options.xx) {
      throw new UpstashRedisError('INVALID_REQUEST', {
        reason: '`nx` and `xx` are mutually exclusive',
      });
    }
    const args: CommandSchema = ['SET', key, value];
    if (options.ex !== undefined) args.push('EX', options.ex);
    if (options.px !== undefined) args.push('PX', options.px);
    if (options.nx) args.push('NX');
    if (options.xx) args.push('XX');
    const { result } = await this.__send(
      this.__buildCommand(args),
      StatusResultSchemaObject,
    );
    return result;
  }

  /**
   * Delete one or more keys via `DEL`.
   *
   * @param keys - A single key, or an array of keys.
   * @returns The number of keys that were actually removed.
   * @throws {UpstashRedisError} `INVALID_REQUEST` if `keys` is an empty
   * array, or `AUTH_FAILED`, `COMMAND_ERROR`, `METHOD_NOT_ALLOWED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const removed = await client.del(['foo', 'bar']);
   * ```
   */
  public async del(keys: string | string[]): Promise<number> {
    const keyList = Array.isArray(keys) ? keys : [keys];
    if (keyList.length === 0) {
      throw new UpstashRedisError('INVALID_REQUEST', {
        reason: 'del requires at least one key',
      });
    }
    const { result } = await this.__send(
      this.__buildCommand(['DEL', ...keyList]),
      IntegerResultSchemaObject,
    );
    return result;
  }

  /**
   * Count how many of the given keys exist via `EXISTS`.
   *
   * @param keys - A single key, or an array of keys. A key repeated in the
   * array is counted once per occurrence, matching Redis's own `EXISTS`.
   * @returns The number of keys (of those given) that exist.
   * @throws {UpstashRedisError} `INVALID_REQUEST` if `keys` is an empty
   * array, or `AUTH_FAILED`, `COMMAND_ERROR`, `METHOD_NOT_ALLOWED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const count = await client.exists(['foo', 'missing-key']); // 1
   * ```
   */
  public async exists(keys: string | string[]): Promise<number> {
    const keyList = Array.isArray(keys) ? keys : [keys];
    if (keyList.length === 0) {
      throw new UpstashRedisError('INVALID_REQUEST', {
        reason: 'exists requires at least one key',
      });
    }
    const { result } = await this.__send(
      this.__buildCommand(['EXISTS', ...keyList]),
      IntegerResultSchemaObject,
    );
    return result;
  }

  /**
   * Set a key's time-to-live, in seconds, via `EXPIRE`.
   *
   * @param key - The key to expire.
   * @param seconds - Seconds until expiry.
   * @returns `1` if the timeout was set, `0` if `key` does not exist.
   * @throws {UpstashRedisError} `AUTH_FAILED`, `COMMAND_ERROR`,
   * `METHOD_NOT_ALLOWED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or
   * `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * await client.expire('foo', 60);
   * ```
   */
  public async expire(key: string, seconds: number): Promise<number> {
    const { result } = await this.__send(
      this.__buildCommand(['EXPIRE', key, seconds]),
      IntegerResultSchemaObject,
    );
    return result;
  }

  /**
   * Increment the integer value of `key` by 1 via `INCR`.
   *
   * @param key - The key to increment. Created with value `0` first if it
   * does not exist, matching real Redis.
   * @returns The value after incrementing.
   * @throws {UpstashRedisError} `AUTH_FAILED`, `COMMAND_ERROR`,
   * `METHOD_NOT_ALLOWED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or
   * `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const next = await client.incr('counter');
   * ```
   */
  public async incr(key: string): Promise<number> {
    const { result } = await this.__send(
      this.__buildCommand(['INCR', key]),
      IntegerResultSchemaObject,
    );
    return result;
  }

  /**
   * Increment the integer value of `key` by `amount` via `INCRBY`.
   *
   * @param key - The key to increment.
   * @param amount - Amount to add (may be negative to decrement).
   * @returns The value after incrementing.
   * @throws {UpstashRedisError} `AUTH_FAILED`, `COMMAND_ERROR`,
   * `METHOD_NOT_ALLOWED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or
   * `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const next = await client.incrby('counter', 5);
   * ```
   */
  public async incrby(key: string, amount: number): Promise<number> {
    const { result } = await this.__send(
      this.__buildCommand(['INCRBY', key, amount]),
      IntegerResultSchemaObject,
    );
    return result;
  }

  /**
   * Get the value of a hash field via `HGET`.
   *
   * @param key - The hash key.
   * @param field - The field to read.
   * @returns The field's value, or `null` if the hash/field does not
   * exist.
   * @throws {UpstashRedisError} `AUTH_FAILED`, `COMMAND_ERROR`,
   * `METHOD_NOT_ALLOWED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or
   * `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const salary = await client.hget('employee:23381', 'salary');
   * ```
   */
  public async hget(key: string, field: string): Promise<string | null> {
    const { result } = await this.__send(
      this.__buildCommand(['HGET', key, field]),
      StringResultSchemaObject,
    );
    return result;
  }

  /**
   * Set one or more hash fields via `HSET`.
   *
   * Accepts a field-value record rather than a single field/value pair —
   * real Redis's `HSET` is itself variadic (`HSET key f1 v1 f2 v2 ...`), so
   * this models that directly instead of forcing repeated single-field
   * calls.
   *
   * @param key - The hash key.
   * @param fields - One or more field-value pairs to set.
   * @returns The number of fields that were newly added (fields that only
   * had their value updated are not counted, matching real Redis).
   * @throws {UpstashRedisError} `INVALID_REQUEST` if `fields` is empty, or
   * `AUTH_FAILED`, `COMMAND_ERROR`, `METHOD_NOT_ALLOWED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * await client.hset('employee:23381', { name: 'Ada', salary: 100000 });
   * ```
   */
  public async hset(
    key: string,
    fields: Record<string, string | number>,
  ): Promise<number> {
    const entries = Object.entries(fields);
    if (entries.length === 0) {
      throw new UpstashRedisError('INVALID_REQUEST', {
        reason: 'hset requires at least one field-value pair',
      });
    }
    const args: CommandSchema = ['HSET', key];
    for (const [field, value] of entries) {
      args.push(field, value);
    }
    const { result } = await this.__send(
      this.__buildCommand(args),
      IntegerResultSchemaObject,
    );
    return result;
  }

  /**
   * Prepend one or more values to a list via `LPUSH`.
   *
   * @param key - The list key.
   * @param values - One or more values to prepend.
   * @returns The length of the list after the push.
   * @throws {UpstashRedisError} `INVALID_REQUEST` if no values are given,
   * or `AUTH_FAILED`, `COMMAND_ERROR`, `METHOD_NOT_ALLOWED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const length = await client.lpush('list-key', 'value1', 'value2');
   * ```
   */
  public async lpush(
    key: string,
    ...values: (string | number)[]
  ): Promise<number> {
    if (values.length === 0) {
      throw new UpstashRedisError('INVALID_REQUEST', {
        reason: 'lpush requires at least one value',
      });
    }
    const { result } = await this.__send(
      this.__buildCommand(['LPUSH', key, ...values]),
      IntegerResultSchemaObject,
    );
    return result;
  }

  /**
   * Append one or more values to a list via `RPUSH`.
   *
   * @param key - The list key.
   * @param values - One or more values to append.
   * @returns The length of the list after the push.
   * @throws {UpstashRedisError} `INVALID_REQUEST` if no values are given,
   * or `AUTH_FAILED`, `COMMAND_ERROR`, `METHOD_NOT_ALLOWED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const length = await client.rpush('list-key', 'value1', 'value2');
   * ```
   */
  public async rpush(
    key: string,
    ...values: (string | number)[]
  ): Promise<number> {
    if (values.length === 0) {
      throw new UpstashRedisError('INVALID_REQUEST', {
        reason: 'rpush requires at least one value',
      });
    }
    const { result } = await this.__send(
      this.__buildCommand(['RPUSH', key, ...values]),
      IntegerResultSchemaObject,
    );
    return result;
  }

  /**
   * Read a range of a list's elements via `LRANGE`.
   *
   * @param key - The list key.
   * @param start - Start index (0-based; negative counts from the end,
   * e.g. `-1` is the last element).
   * @param stop - Stop index, inclusive (same indexing rules as `start`).
   * @returns The elements in `[start, stop]`. An empty array if `key`
   * doesn't exist.
   * @throws {UpstashRedisError} `AUTH_FAILED`, `COMMAND_ERROR`,
   * `METHOD_NOT_ALLOWED`, `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or
   * `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const all = await client.lrange('list-key', 0, -1);
   * ```
   */
  public async lrange(
    key: string,
    start: number,
    stop: number,
  ): Promise<(string | null)[]> {
    const { result } = await this.__send(
      this.__buildCommand(['LRANGE', key, start, stop]),
      ArrayResultSchemaObject,
    );
    return result;
  }

  /**
   * Run multiple commands in one round trip via `POST /pipeline`.
   *
   * **Not atomic**: commands run in order, but Upstash explicitly
   * documents that commands from other clients can interleave with a
   * pipeline's own commands — unlike a real Redis `MULTI`/`EXEC`
   * transaction, nothing here prevents another request from being
   * processed between two pipelined commands. Use this purely to batch
   * round trips, not for atomicity.
   *
   * Each entry of the returned array independently succeeded or failed —
   * one command's `{"error": ...}` does not abort the rest of the
   * pipeline — and the response array is in the same order as `commands`.
   *
   * @param commands - The command arrays to run, in order.
   * @returns One result per command, in the same order, each independently
   * a `{ result }` or `{ error }`.
   * @throws {UpstashRedisError} `REQUEST_VALIDATION_ERROR` if `commands`
   * fails local schema validation (empty, or a malformed command array),
   * or `AUTH_FAILED`, `COMMAND_ERROR`, `METHOD_NOT_ALLOWED`,
   * `RESPONSE_ERROR`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const results = await client.pipeline([
   *   ['SET', 'foo', 'bar'],
   *   ['GET', 'foo'],
   * ]);
   * ```
   */
  public async pipeline(
    commands: CommandSchema[],
  ): Promise<PipelineResponseSchema> {
    let payload: CommandSchema[];
    try {
      payload = PipelineRequestSchemaObject.parse(commands);
    } catch (cause) {
      throw new UpstashRedisError(
        'REQUEST_VALIDATION_ERROR',
        {},
        cause instanceof GuardianError ? cause : undefined,
      );
    }
    return await this.__requestAndValidate(
      {
        path: '/pipeline',
        method: 'POST',
        contentType: 'JSON',
        payload: payload as unknown as Record<string, unknown>,
      },
      PipelineResponseSchemaObject,
    );
  }

  /**
   * Low-level escape hatch: run an arbitrary Redis command not exposed as
   * a typed method above, via `POST /`.
   *
   * Prefer the typed methods where one exists — this returns the raw,
   * unvalidated `result` value with no per-command response modelling.
   *
   * @param command - The command array, e.g. `['DBSIZE']` or
   * `['ZADD', 'key', 1, 'member']`.
   * @returns The command's raw `result` value.
   * @throws {UpstashRedisError} `REQUEST_VALIDATION_ERROR` if `command` is
   * empty or its first element isn't a non-empty string, or `AUTH_FAILED`,
   * `COMMAND_ERROR`, `METHOD_NOT_ALLOWED`, `RESPONSE_ERROR`,
   * `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`.
   *
   * @example
   * ```typescript
   * const size = await client.execute(['DBSIZE']);
   * ```
   */
  public async execute(command: CommandSchema): Promise<unknown> {
    const { result } = await this.__send(
      this.__buildCommand(command),
      AnyResultSchemaObject,
    );
    return result;
  }

  /**
   * Validates a caller- or internally-assembled command array against
   * {@link CommandSchemaObject} before it is sent — every public method
   * routes its constructed array through here, so the wire format is
   * always exercised against the schema that documents it, not just
   * assumed correct by construction.
   *
   * @throws {UpstashRedisError} `REQUEST_VALIDATION_ERROR` when `command`
   * fails validation (empty array, or a first element that isn't a
   * non-empty string).
   */
  private __buildCommand(command: CommandSchema): CommandSchema {
    try {
      return CommandSchemaObject.parse(command);
    } catch (cause) {
      throw new UpstashRedisError(
        'REQUEST_VALIDATION_ERROR',
        {},
        cause instanceof GuardianError ? cause : undefined,
      );
    }
  }

  /** Sends `command` to `POST /` and validates the response against `guard`. */
  private __send<B>(
    command: CommandSchema,
    guard: BaseGuardian<B>,
  ): Promise<B> {
    return this.__requestAndValidate(
      {
        path: '/',
        method: 'POST',
        contentType: 'JSON',
        payload: command as unknown as Record<string, unknown>,
      },
      guard,
    );
  }

  /**
   * Makes a request and validates its response body against `guard`,
   * unwrapping RESTler's generic {@link RESTlerResponseValidationError}
   * into a {@link UpstashRedisError} — so `UpstashRedisError` stays the
   * only thing a public method throws for "the vendor responded, but the
   * body doesn't match what was expected." `B` is inferred from `guard`,
   * so callers no longer separately write out a `_makeRequest<B>()` type
   * argument.
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
   * @throws {UpstashRedisError} `RESPONSE_ERROR` when the body fails
   * validation.
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
        throw new UpstashRedisError('RESPONSE_ERROR', {
          responseError: (err.cause as GuardianError | undefined)?.toJSON(),
        }, err);
      }
      if (err instanceof RESTlerRateLimitError) {
        // RESTler retried once (maxRetryWait) and was throttled again, or the
        // vendor's hint exceeded the cap — surface it as this connect's own
        // error, with the hint and whether a wait already happened.
        throw new UpstashRedisError('RATE_LIMITED', {
          status: 429,
          retryAfterSeconds: err.getContextValue('retryAfter'),
          retried: err.getContextValue('retried'),
        }, err);
      }
      throw err;
    }
  }

  /**
   * Vendor-wide {@link RESTlerResponseHandler} — translates UpstashRedis's
   * HTTP-status/error-envelope conventions into a {@link UpstashRedisError}.
   * Runs on every response (registered on `_responseHandler` in the
   * constructor); does nothing for a response below 400, leaving
   * success-body validation to {@link __requestAndValidate}.
   *
   * Upstash documents `400` for BOTH a malformed request and a failed
   * Redis command (verified directly against the vendor's docs — there is
   * no separate status for "well-formed request, command failed"), so
   * both map to the same `COMMAND_ERROR` code here, carrying the vendor's
   * raw `{"error": "..."}` message via `reason`.
   *
   * @param response - The parsed response, before any schema validation.
   * @throws {UpstashRedisError} `AUTH_FAILED`, `COMMAND_ERROR`,
   * `METHOD_NOT_ALLOWED`, `SERVICE_UNAVAILABLE`, or `UNKNOWN_ERROR`,
   * matching the vendor's documented status/message pairs.
   */
  private __toError(response: RESTlerResponse<unknown>): unknown {
    const status = response.status;
    if (status === null || status < 400) return response.body; // let 2xx (and any non-error status) through

    if (status === 401) {
      throw new UpstashRedisError('AUTH_FAILED', {
        status,
        body: response.body,
      });
    }
    if (status === 405) {
      throw new UpstashRedisError('METHOD_NOT_ALLOWED', {
        status,
        body: response.body,
      });
    }
    if (status === 400) {
      const [err, body] = ErrorSchemaObject.safeParse(response.body);
      if (body) {
        throw new UpstashRedisError('COMMAND_ERROR', {
          status,
          reason: body.error,
        });
      }
      // Body missing or didn't match the documented error envelope —
      // still a COMMAND_ERROR (that's what 400 means for this vendor),
      // with the raw body attached for diagnostics instead of a parsed
      // `reason`.
      throw new UpstashRedisError('COMMAND_ERROR', {
        status,
        reason: 'unrecognized error body',
        body: response.body,
        responseError: err?.toJSON(),
      });
    }
    if (status === 429) {
      throw new UpstashRedisError('RATE_LIMITED', {
        status,
        retryAfterSeconds: this._parseRetryAfter(response.headers),
        body: response.body,
      });
    }
    if (status >= 500) {
      throw new UpstashRedisError('SERVICE_UNAVAILABLE', {
        status,
        body: response.body,
      });
    }
    throw new UpstashRedisError('UNKNOWN_ERROR', {
      status,
      body: response.body,
    });
  }

  /**
   * Processes and validates configuration options specific to the
   * UpstashRedis client before passing them to the parent class.
   *
   * @throws {UpstashRedisError} `CONFIG_INVALID_TOKEN` when `auth` is
   * present but isn't a `BEARER` auth with a non-empty `token`.
   */
  protected override _processOption<K extends keyof UpstashRedisOptions>(
    key: K,
    value: UpstashRedisOptions[K],
  ): UpstashRedisOptions[K] {
    switch (key) {
      case 'auth': {
        const auth = value as unknown as UpstashRedisAuth;
        if (
          !auth || auth.type !== 'BEARER' ||
          typeof auth.token !== 'string' || auth.token.trim() === ''
        ) {
          // Never echo the raw `token` here (as a message placeholder or
          // as context) — it's a live UpstashRedis Bearer token, and
          // `context` is stored on the thrown error verbatim (see
          // `BaseError.toJSON`), so anything placed here is just as
          // exposed as the message text.
          throw new UpstashRedisError('CONFIG_INVALID_TOKEN', {});
        }
        value = {
          type: 'BEARER',
          token: auth.token.trim(),
          prefix: auth.prefix,
        } as UpstashRedisOptions[K];
        break;
      }
    }
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }
}
