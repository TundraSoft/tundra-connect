/**
 * Verify Cloudflare Turnstile widget tokens server-side through the
 * siteverify endpoint
 * (`POST https://challenges.cloudflare.com/turnstile/v0/siteverify`), with
 * the token validated locally, the secret key added from `auth`, and the
 * verdict's hostname and action checked against what you expect.
 *
 * Typed Cloudflare Turnstile client: verify a widget token server-side with
 * siteverify, with hostname and action checks, a hard per-call deadline,
 * and failed challenges as answers instead of errors.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`CloudflareTurnstileError` and its code registry).
 *
 * @example
 * ```ts
 * import { CloudflareTurnstile } from '@tundraconnect/cloudflare-turnstile';
 * import { CloudflareTurnstileError } from '@tundraconnect/cloudflare-turnstile/errors';
 *
 * const turnstile = new CloudflareTurnstile({
 *   auth: { type: 'CUSTOM', secretKey: Deno.env.get('TURNSTILE_SECRET_KEY')! },
 *   timeout: 5,
 * });
 *
 * declare const request: Request; // your form submission
 *
 * const form = await request.formData();
 * try {
 *   const verdict = await turnstile.verify({
 *     response: String(form.get('cf-turnstile-response') ?? ''),
 *     remoteip: request.headers.get('CF-Connecting-IP') ?? undefined,
 *     expectedHostname: 'example.com',
 *     expectedAction: 'signup',
 *   });
 *   if (!verdict.success) {
 *     // An answer about the visitor, not a failure: show the form again.
 *     console.log('challenge failed:', verdict['error-codes']);
 *   }
 * } catch (err) {
 *   if (err instanceof CloudflareTurnstileError && err.transient) {
 *     // TIMEOUT / NETWORK_ERROR / SERVICE_UNAVAILABLE / RATE_LIMITED:
 *     // decide whether to fail open or ask the visitor to retry.
 *   } else {
 *     throw err; // AUTH_FAILED (bad secret), INVALID_REQUEST, ...
 *   }
 * }
 * ```
 *
 * @module
 */

// Export main client class
export {
  CloudflareTurnstile,
  type CloudflareTurnstileAuth,
  type CloudflareTurnstileOptions,
  TURNSTILE_API,
  TURNSTILE_DUMMY_SECRETS,
  TURNSTILE_DUMMY_TOKEN,
  type VerifyOptions,
} from './CloudflareTurnstile.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
