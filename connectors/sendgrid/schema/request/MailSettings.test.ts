import * as asserts from '@asserts';
import { describe, it } from '@test';
import { MailSettingsSchemaObject } from './MailSettings.ts';

describe('SendGrid.schema.MailSettings', () => {
  it('accepts an empty settings object', () => {
    asserts.assertEquals(MailSettingsSchemaObject.safeParse({})[0], null);
  });

  it('accepts sandbox mode enabled', () => {
    const [error, settings] = MailSettingsSchemaObject.safeParse({
      sandbox_mode: { enable: true },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(settings?.sandbox_mode?.enable, true);
  });

  it('accepts every documented toggle plus a footer', () => {
    asserts.assertEquals(
      MailSettingsSchemaObject.safeParse({
        sandbox_mode: { enable: false },
        bypass_list_management: { enable: true },
        bypass_spam_management: { enable: true },
        bypass_bounce_management: { enable: true },
        bypass_unsubscribe_management: { enable: true },
        footer: {
          enable: true,
          text: 'Unsubscribe here',
          html: '<p>Unsubscribe</p>',
        },
      })[0],
      null,
    );
  });

  it('rejects a toggle missing `enable`', () => {
    asserts.assertExists(
      MailSettingsSchemaObject.safeParse({ sandbox_mode: {} })[0],
    );
  });

  it('rejects a non-boolean enable flag', () => {
    asserts.assertExists(
      MailSettingsSchemaObject.safeParse({
        sandbox_mode: { enable: 'maybe' },
      })[0],
    );
  });
});
