/**
 * The error model of `@tundraconnect/twilio`. Every failure the client throws —
 * invalid configuration, a rejected request, a vendor error, a malformed
 * response — is an `TwilioError`. Its readonly `code` is a key of
 * `TwilioErrorCodes`, so you can branch on the failure without matching message
 * text, and `getContextValue()` returns diagnostic context such as the HTTP
 * `status` or a `retryAfterSeconds` hint. Credentials never appear in an
 * error's message or context.
 *
 * @example
 * ```ts
 * import { TwilioError } from '@tundraconnect/twilio/errors';
 *
 * declare function callTheClient(): Promise<unknown>;
 *
 * try {
 *   await callTheClient();
 * } catch (err) {
 *   if (err instanceof TwilioError && err.code === 'RATE_LIMITED') {
 *     console.log('retry after', err.getContextValue('retryAfterSeconds'), 's');
 *   } else {
 *     throw err;
 *   }
 * }
 * ```
 *
 * @module
 */

export { TwilioError, type TwilioErrorMetadata } from './Base.ts';
export { type TwilioErrorCode, TwilioErrorCodes } from './TwilioErrorCodes.ts';
