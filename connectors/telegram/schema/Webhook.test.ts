import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  DeleteWebhookRequestSchemaObject,
  SetWebhookRequestSchemaObject,
  WebhookInfoSchemaObject,
  webhookSecretTokenGuard,
} from './Webhook.ts';

const SECRET = 'S3cret_token-ABC';
const setWebhook = (fields: Record<string, unknown>) =>
  SetWebhookRequestSchemaObject.safeParse({
    url: 'https://bot.example.com/telegram',
    secret_token: SECRET,
    ...fields,
  });

describe('Telegram.schema.Webhook', () => {
  describe('webhookSecretTokenGuard', () => {
    it('accepts 1 and 256 characters of the allowed alphabet', () => {
      asserts.assertEquals(webhookSecretTokenGuard.safeParse('a')[0], null);
      asserts.assertEquals(
        webhookSecretTokenGuard.safeParse('A-z_9'.repeat(51) + 'x')[0],
        null,
      );
    });

    it('rejects empty, 257 characters, and characters outside A-Z a-z 0-9 _ -', () => {
      for (
        const value of ['', 'a'.repeat(257), 'has space', 'dot.ted', 'plus+']
      ) {
        asserts.assertExists(
          webhookSecretTokenGuard.safeParse(value)[0],
          value,
        );
      }
    });

    it('never repeats the rejected value in the error', () => {
      const [error] = webhookSecretTokenGuard.safeParse('SECRETMARKER!');
      asserts.assertExists(error);
      asserts.assert(
        !JSON.stringify(error.toJSON()).includes('SECRETMARKER'),
      );
    });
  });

  describe('SetWebhookRequestSchemaObject', () => {
    it('accepts a full request', () => {
      const [error, request] = setWebhook({
        allowed_updates: ['message', 'callback_query', 'my_chat_member'],
        drop_pending_updates: true,
        max_connections: 40,
        ip_address: '203.0.113.7',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(request?.max_connections, 40);
    });

    it('accepts an empty allowed_updates list', () => {
      asserts.assertEquals(setWebhook({ allowed_updates: [] })[0], null);
    });

    it('requires https on a supported port', () => {
      asserts.assertExists(setWebhook({ url: 'http://bot.example.com/t' })[0]);
      asserts.assertExists(setWebhook({ url: 'not a url' })[0]);
      asserts.assertExists(setWebhook({ url: '' })[0]);
      asserts.assertExists(
        setWebhook({ url: 'https://bot.example.com:8080/t' })[0],
      );
      for (const port of [443, 80, 88, 8443]) {
        asserts.assertEquals(
          setWebhook({ url: `https://bot.example.com:${port}/t` })[0],
          null,
          String(port),
        );
      }
    });

    it('requires secret_token', () => {
      asserts.assertExists(
        SetWebhookRequestSchemaObject.safeParse({
          url: 'https://bot.example.com/telegram',
        })[0],
      );
      asserts.assertExists(setWebhook({ secret_token: 'bad token' })[0]);
    });

    it('enforces max_connections 1-100 without coercion', () => {
      asserts.assertEquals(setWebhook({ max_connections: 1 })[0], null);
      asserts.assertEquals(setWebhook({ max_connections: 100 })[0], null);
      for (const value of [0, 101, 1.5, '40']) {
        asserts.assertExists(
          setWebhook({ max_connections: value })[0],
          String(value),
        );
      }
    });

    it('rejects an unknown update type and a string drop_pending_updates', () => {
      asserts.assertExists(setWebhook({ allowed_updates: ['messages'] })[0]);
      asserts.assertExists(setWebhook({ drop_pending_updates: 'true' })[0]);
    });

    it('rejects an unknown key, e.g. certificate (needs multipart)', () => {
      asserts.assertExists(setWebhook({ certificate: 'x' })[0]);
    });
  });

  describe('DeleteWebhookRequestSchemaObject', () => {
    it('accepts an empty body or drop_pending_updates', () => {
      asserts.assertEquals(
        DeleteWebhookRequestSchemaObject.safeParse({})[0],
        null,
      );
      asserts.assertEquals(
        DeleteWebhookRequestSchemaObject.safeParse({
          drop_pending_updates: true,
        })[0],
        null,
      );
      asserts.assertExists(
        DeleteWebhookRequestSchemaObject.safeParse({ drop: true })[0],
      );
    });
  });

  describe('WebhookInfoSchemaObject', () => {
    it('accepts a status with a recent delivery error, keeping unknown fields', () => {
      const [error, info] = WebhookInfoSchemaObject.safeParse({
        url: 'https://bot.example.com/telegram',
        has_custom_certificate: false,
        pending_update_count: 3,
        last_error_date: 1735689600,
        last_error_message: 'Wrong response from the webhook: 500',
        max_connections: 40,
        allowed_updates: ['message', 'a_future_kind'],
        future_field: true,
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(info?.pending_update_count, 3);
      asserts.assertEquals(
        (info as Record<string, unknown> | undefined)?.future_field,
        true,
      );
    });

    it('accepts an empty url (no webhook set)', () => {
      asserts.assertEquals(
        WebhookInfoSchemaObject.safeParse({
          url: '',
          has_custom_certificate: false,
          pending_update_count: 0,
        })[0],
        null,
      );
    });
  });
});
