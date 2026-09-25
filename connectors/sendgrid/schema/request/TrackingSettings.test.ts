import * as asserts from '@asserts';
import { describe, it } from '@test';
import { TrackingSettingsSchemaObject } from './TrackingSettings.ts';

describe('SendGrid.schema.TrackingSettings', () => {
  it('accepts an empty settings object', () => {
    asserts.assertEquals(TrackingSettingsSchemaObject.safeParse({})[0], null);
  });

  it('accepts every documented tracking group', () => {
    const [error, settings] = TrackingSettingsSchemaObject.safeParse({
      click_tracking: { enable: true, enable_text: false },
      open_tracking: { enable: true, substitution_tag: '%open_tracking%' },
      subscription_tracking: {
        enable: true,
        text: 'Unsubscribe',
        html: '<p>Unsubscribe</p>',
        substitution_tag: '%unsubscribe%',
      },
      ganalytics: {
        enable: true,
        utm_source: 'newsletter',
        utm_medium: 'email',
        utm_campaign: 'launch',
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(settings?.ganalytics?.utm_source, 'newsletter');
  });

  it('rejects a tracking group missing `enable`', () => {
    asserts.assertExists(
      TrackingSettingsSchemaObject.safeParse({ click_tracking: {} })[0],
    );
  });

  it('rejects a non-boolean enable flag', () => {
    asserts.assertExists(
      TrackingSettingsSchemaObject.safeParse({
        open_tracking: { enable: 'maybe' },
      })[0],
    );
  });
});
