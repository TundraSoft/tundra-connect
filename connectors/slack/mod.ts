/**
 * Typed, cross-runtime client for the [Slack Web
 * API](https://docs.slack.dev/apis/web-api).
 *
 * Typed Slack Web API client: post, update and delete messages, list channels
 * and read history, look up users, and verify request signatures.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`SlackError` and its code registry).
 *
 * @example
 * ```ts
 * import { Slack } from '@tundraconnect/slack';
 *
 * const client = new Slack({
 *   auth: { type: 'BEARER', token: 'xoxb-your-bot-token' },
 * });
 *
 * const sent = await client.postMessage({
 *   channel: 'C123ABC456',
 *   text: 'Deploy succeeded',
 * });
 * console.log(sent.ts);
 * ```
 *
 * @module
 */

// Export main client class
export { Slack, type SlackOptions } from './Slack.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
