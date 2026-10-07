/**
 * Typed, cross-runtime client for the [Telegram Bot
 * API](https://core.telegram.org/bots/api) — the simple bot HTTPS API only, not
 * Telegram's much heavier MTProto client protocol.
 *
 * Typed Telegram Bot API client for webhook bots: send, edit and delete
 * messages with inline keyboards, answer callback queries, manage the
 * webhook and the command menu, verify webhook requests and parse
 * updates and commands.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`TelegramError` and its code registry).
 *
 * @example
 * ```ts
 * import { Telegram } from '@tundraconnect/telegram';
 *
 * const client = new Telegram({ botToken: '123456789:AAExampleToken' });
 *
 * const me = await client.getMe();
 * console.log(me.username);
 *
 * const message = await client.sendMessage({
 *   chat_id: '@examplechannel',
 *   text: 'Deployment finished successfully.',
 * });
 *
 * console.log(message.message_id);
 * ```
 *
 * @module
 */

// Export main client class
export {
  type CommandSource,
  type ParsedCommand,
  Telegram,
  type TelegramOptions,
  type TelegramWebhookHeaders,
  type UpdateKind,
  type VerifyWebhookRequestOptions,
  WEBHOOK_SECRET_HEADER,
} from './Telegram.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
