/**
 * The error model of `@tundraconnect/cloudflare-turnstile`. Every failure
 * the client throws — invalid configuration, a rejected request, a bad
 * secret key, a transport failure, a malformed response — is a
 * `CloudflareTurnstileError`. Its readonly `code` is a key of
 * `CloudflareTurnstileErrorCodes`, so you can branch on the failure without
 * matching message text, and `transient` tells you whether trying again
 * can help. A failed challenge is not an error at all: `verify` resolves it
 * as `success: false`. The secret key never appears in an error's message
 * or context.
 *
 * @example
 * ```ts
 * import { CloudflareTurnstileError } from '@tundraconnect/cloudflare-turnstile/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof CloudflareTurnstileError && err.transient) {
 *     // TIMEOUT / NETWORK_ERROR / SERVICE_UNAVAILABLE / RATE_LIMITED: try again
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export {
  CloudflareTurnstileError,
  type CloudflareTurnstileErrorMetadata,
} from './Base.ts';
export {
  CLOUDFLARE_TURNSTILE_TRANSIENT_CODES,
  type CloudflareTurnstileErrorCode,
  CloudflareTurnstileErrorCodes,
} from './CloudflareTurnstileErrorCodes.ts';
