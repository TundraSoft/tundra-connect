/**
 * Guardian schemas behind `@tundraconnect/cloudflare-turnstile`: the
 * siteverify request and verdict shapes, each exported as a schema object
 * with its TypeScript type. Use them to validate a verdict you stored or
 * forwarded, or to type your own code against the client's shapes.
 *
 * @example
 * ```ts
 * import { VerificationSchemaObject } from '@tundraconnect/cloudflare-turnstile/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded verdict
 * const [error, verdict] = VerificationSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(verdict.success, verdict['error-codes']);
 * ```
 *
 * @module
 */

export {
  TURNSTILE_ERROR_CODES,
  type TurnstileErrorCode,
  type VerificationSchema,
  VerificationSchemaObject,
} from './Verification.ts';
export {
  MAX_TOKEN_LENGTH,
  type VerifyRequestSchema,
  VerifyRequestSchemaObject,
} from './VerifyRequest.ts';
