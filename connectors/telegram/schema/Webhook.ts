import { type BaseGuardian, Guardian } from '@guardian';
import { UPDATE_TYPES, type UpdateType } from './Update.ts';

/**
 * Webhook configuration: `setWebhook`, `deleteWebhook` and
 * `getWebhookInfo`.
 *
 * @example
 * ```typescript
 * import { SetWebhookRequestSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, request] = SetWebhookRequestSchemaObject.safeParse({
 *   url: 'https://bot.example.com/telegram',
 *   secret_token: 'a-long-random-value',
 *   allowed_updates: ['message', 'callback_query'],
 * });
 * if (!error) {
 *   console.log(request.url);
 * }
 * ```
 */

/**
 * Telegram's `secret_token` alphabet and length: 1-256 characters of
 * `A-Z`, `a-z`, `0-9`, `_` and `-`.
 */
export const WEBHOOK_SECRET_TOKEN_PATTERN: RegExp = /^[A-Za-z0-9_-]{1,256}$/;

/** Ports Telegram delivers webhooks to. */
export const WEBHOOK_PORTS = [443, 80, 88, 8443] as const;

/** `true` for an `https:` URL on a port Telegram delivers webhooks to. */
function isWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  // URL normalises the scheme's default port (443) to ''.
  return url.port === '' ||
    (WEBHOOK_PORTS as readonly number[]).includes(Number(url.port));
}

/**
 * Validates a webhook `secret_token`: 1-256 characters of `A-Z`, `a-z`,
 * `0-9`, `_` and `-`. The error message never repeats the value.
 *
 * @example
 * ```typescript
 * import { webhookSecretTokenGuard } from '@tundraconnect/telegram/schemas';
 *
 * webhookSecretTokenGuard.parse('a-long-random-value');
 * ```
 */
export const webhookSecretTokenGuard: BaseGuardian<string> = Guardian.string()
  .pattern(
    WEBHOOK_SECRET_TOKEN_PATTERN,
    'secret_token must be 1-256 characters of A-Z, a-z, 0-9, _ and -',
  ).describe({
    title: 'Webhook secret token',
    description:
      'Sent back by Telegram in the X-Telegram-Bot-Api-Secret-Token header of every webhook request.',
  });

/**
 * Request schema for `POST /setWebhook`.
 *
 * Telegram treats `secret_token` as optional; this package requires it,
 * because without it anyone who learns the webhook URL can post forged
 * updates to it. Pass the same value to `Telegram.verifyWebhookRequest`.
 *
 * `url` must be `https:` on port 443, 80, 88 or 8443 (Telegram's
 * documented webhook ports). To remove the webhook, call `deleteWebhook`
 * rather than setting an empty URL. Uploading a self-signed `certificate`
 * needs a multipart upload and is not supported.
 */
export type SetWebhookRequestSchema = {
  /** HTTPS URL Telegram posts updates to. */
  url: string;
  /**
   * Sent in the `X-Telegram-Bot-Api-Secret-Token` header of every webhook
   * request; 1-256 characters of `A-Z`, `a-z`, `0-9`, `_` and `-`.
   */
  secret_token: string;
  /**
   * Update types to receive. An empty list means every type except
   * `chat_member`, `message_reaction` and `message_reaction_count`; when
   * omitted, the previous setting is kept.
   */
  allowed_updates?: UpdateType[];
  /** Drop every update still waiting to be delivered. */
  drop_pending_updates?: boolean;
  /** Maximum simultaneous HTTPS connections for delivery, 1-100; Telegram defaults to 40. */
  max_connections?: number;
  /** Fixed IP address to deliver to instead of the one resolved through DNS. */
  ip_address?: string;
};

/**
 * Request body validated before POST /setWebhook.
 *
 * @example
 * ```typescript
 * import { SetWebhookRequestSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * SetWebhookRequestSchemaObject.parse({
 *   url: 'https://bot.example.com/telegram',
 *   secret_token: 'a-long-random-value',
 * });
 * ```
 */
export const SetWebhookRequestSchemaObject: BaseGuardian<
  SetWebhookRequestSchema
> = Guardian.object({
  url: Guardian.string().refine(
    isWebhookUrl,
    'url must be an https:// URL on port 443, 80, 88 or 8443',
  ),
  secret_token: webhookSecretTokenGuard,
  allowed_updates: Guardian.array(Guardian.enum(UPDATE_TYPES)).optional(),
  drop_pending_updates: Guardian.boolean().strict().optional(),
  max_connections: Guardian.number().integer().min(1).max(100).strict()
    .optional(),
  ip_address: Guardian.string().ipAddress().optional(),
}).strict().describe({
  title: 'setWebhook request',
  description: 'Request body validated before POST /setWebhook.',
});

/**
 * Request schema for `POST /deleteWebhook`.
 *
 * @example
 * ```typescript
 * import { DeleteWebhookRequestSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * DeleteWebhookRequestSchemaObject.parse({ drop_pending_updates: true });
 * ```
 */
export type DeleteWebhookRequestSchema = {
  /** Drop every update still waiting to be delivered. */
  drop_pending_updates?: boolean;
};

/** Request body validated before POST /deleteWebhook. */
export const DeleteWebhookRequestSchemaObject: BaseGuardian<
  DeleteWebhookRequestSchema
> = Guardian.object({
  drop_pending_updates: Guardian.boolean().strict().optional(),
}).strict().describe({
  title: 'deleteWebhook request',
  description: 'Request body validated before POST /deleteWebhook.',
});

/**
 * Schema for `WebhookInfo`, the result of `getWebhookInfo`.
 *
 * `url` is empty when no webhook is set. `last_error_date` and
 * `last_error_message` describe the most recent failed delivery, which is
 * the first place to look when updates stop arriving.
 *
 * @example
 * ```typescript
 * import { WebhookInfoSchemaObject } from '@tundraconnect/telegram/schemas';
 *
 * const [error, info] = WebhookInfoSchemaObject.safeParse({
 *   url: 'https://bot.example.com/telegram',
 *   has_custom_certificate: false,
 *   pending_update_count: 0,
 * });
 * if (!error) {
 *   console.log(info.pending_update_count);
 * }
 * ```
 */
export type WebhookInfoSchema = {
  /** Webhook URL; empty when no webhook is set. */
  url: string;
  /** Whether a custom certificate was uploaded for the webhook. */
  has_custom_certificate: boolean;
  /** Updates waiting to be delivered. */
  pending_update_count: number;
  /** IP address currently used for delivery. */
  ip_address?: string;
  /** Unix time of the most recent delivery error. */
  last_error_date?: number;
  /** Human-readable message of the most recent delivery error. */
  last_error_message?: string;
  /** Unix time of the most recent error synchronizing updates with Telegram's datacenters. */
  last_synchronization_error_date?: number;
  /** Maximum simultaneous HTTPS connections for delivery. */
  max_connections?: number;
  /** Update types the bot is subscribed to. */
  allowed_updates?: string[];
};

/** Current webhook status, as returned by `getWebhookInfo`. */
export const WebhookInfoSchemaObject: BaseGuardian<WebhookInfoSchema> = Guardian
  .object({
    url: Guardian.string(),
    has_custom_certificate: Guardian.boolean(),
    pending_update_count: Guardian.number().integer(),
    ip_address: Guardian.string().optional(),
    last_error_date: Guardian.number().integer().optional(),
    last_error_message: Guardian.string().optional(),
    last_synchronization_error_date: Guardian.number().integer().optional(),
    max_connections: Guardian.number().integer().optional(),
    allowed_updates: Guardian.array(Guardian.string()).optional(),
  }).passthrough().describe({
    title: 'Webhook info',
    description: 'Current webhook status, as returned by `getWebhookInfo`.',
  });
