import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for the ntfy API error envelope.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * ErrorSchemaObject>`) so `ErrorSchemaObject` below can carry an explicit
 * `BaseGuardian<ErrorSchema>` annotation directly on its declaration — JSR's
 * "slow types" check flags any unexported intermediate `const` reachable
 * (even via `typeof`) from a public export, so the type has to be pinned
 * here instead of inferred through a builder chain.
 */
export type ErrorSchema = {
  /** Stable ntfy-internal numeric error code (e.g. `40101`). */
  code?: number;
  /** HTTP status code, mirrored from the response itself. */
  http: number;
  /** Short, human-readable error message. */
  error: string;
  /** Optional link to the relevant ntfy documentation page. */
  link?: string;
};

/**
 * Schema for the ntfy API error envelope
 *
 * Validates the `{ code, http, error, link? }` body ntfy returns on 4xx/5xx
 * responses (`http.Code`/`http.HTTPCode`/`http.Message`/`http.Link` in the
 * ntfy server source). `code` is a stable, ntfy-internal numeric error code
 * (e.g. `40101`); `http` mirrors the response's HTTP status; `error` is a
 * short human-readable message; `link` optionally points at the relevant
 * docs page.
 *
 * @example
 * ```typescript
 * import { ErrorSchemaObject } from '@tundraconnect/ntfy/schemas';
 *
 * const [error, envelope] = ErrorSchemaObject.safeParse({
 *   code: 40101,
 *   http: 401,
 *   error: 'unauthorized',
 * });
 * if (!error) {
 *   console.log(envelope.error);
 * }
 * ```
 */
export const ErrorSchemaObject: BaseGuardian<ErrorSchema> = Guardian.object({
  /** Stable ntfy-internal numeric error code (e.g. `40101`). */
  code: Guardian.number().integer().optional(),
  /** HTTP status code, mirrored from the response itself. */
  http: Guardian.number().integer(),
  /** Short, human-readable error message. */
  error: Guardian.string(),
  /** Optional link to the relevant ntfy documentation page. */
  link: Guardian.string().optional(),
}).describe({
  title: 'ntfy error response',
  description: 'Documented error envelope returned on 4xx/5xx ntfy responses.',
});
