import * as asserts from '@asserts';
import { describe, it } from '@test';
import { CreateCallRequestSchemaObject } from './CreateCallRequest.ts';

describe('Twilio.schema.CreateCallRequest', () => {
  it('accepts a request with url', () => {
    asserts.assertEquals(
      CreateCallRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        url: 'http://demo.twilio.com/docs/voice.xml',
      })[0],
      null,
    );
  });

  it('accepts a request with twiml', () => {
    asserts.assertEquals(
      CreateCallRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        twiml: '<Response><Say>Ahoy there!</Say></Response>',
      })[0],
      null,
    );
  });

  it('accepts a request with applicationSid', () => {
    asserts.assertEquals(
      CreateCallRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        applicationSid: 'AP' + '0'.repeat(32),
      })[0],
      null,
    );
  });

  it('rejects a request missing url, twiml, and applicationSid', () => {
    asserts.assertExists(
      CreateCallRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
      })[0],
    );
  });

  it('rejects a request missing to', () => {
    asserts.assertExists(
      CreateCallRequestSchemaObject.safeParse({
        from: '+15017122661',
        url: 'http://demo.twilio.com/docs/voice.xml',
      })[0],
    );
  });

  it('rejects a request missing from', () => {
    asserts.assertExists(
      CreateCallRequestSchemaObject.safeParse({
        to: '+14155552671',
        url: 'http://demo.twilio.com/docs/voice.xml',
      })[0],
    );
  });

  it('accepts a SIP address / Client identifier for to/from (not E.164-only)', () => {
    asserts.assertEquals(
      CreateCallRequestSchemaObject.safeParse({
        to: 'sip:user@example.com',
        from: 'client:charlie',
        url: 'http://demo.twilio.com/docs/voice.xml',
      })[0],
      null,
    );
  });

  it('accepts documented optional fields', () => {
    asserts.assertEquals(
      CreateCallRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        url: 'http://demo.twilio.com/docs/voice.xml',
        method: 'GET',
        fallbackUrl: 'http://demo.twilio.com/fallback.xml',
        fallbackMethod: 'POST',
        statusCallback: 'https://example.com/status',
        statusCallbackEvent: ['initiated', 'answered'],
        statusCallbackMethod: 'POST',
        sendDigits: 'ww1234#',
        timeout: 30,
        record: true,
        recordingChannels: 'dual',
        trim: 'do-not-trim',
        machineDetection: 'Enable',
        machineDetectionTimeout: 15,
        machineDetectionSpeechThreshold: 2000,
        machineDetectionSpeechEndThreshold: 1000,
        machineDetectionSilenceTimeout: 4000,
        asyncAmd: true,
        recordingTrack: 'both',
        recordingStatusCallbackEvent: ['in-progress', 'completed'],
        timeLimit: 3600,
        byoc: 'BY' + '0'.repeat(32),
      })[0],
      null,
    );
  });

  it('rejects an out-of-range timeout', () => {
    asserts.assertExists(
      CreateCallRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        url: 'http://demo.twilio.com/docs/voice.xml',
        timeout: 601,
      })[0],
    );
  });

  it('rejects an out-of-range machineDetectionSpeechThreshold', () => {
    asserts.assertExists(
      CreateCallRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        url: 'http://demo.twilio.com/docs/voice.xml',
        machineDetectionSpeechThreshold: 999,
      })[0],
    );
  });

  it('rejects an invalid sendDigits string', () => {
    asserts.assertExists(
      CreateCallRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        url: 'http://demo.twilio.com/docs/voice.xml',
        sendDigits: 'not-valid-digits!',
      })[0],
    );
  });

  it('rejects an unsupported recordingChannels value', () => {
    asserts.assertExists(
      CreateCallRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        url: 'http://demo.twilio.com/docs/voice.xml',
        recordingChannels: 'stereo',
      })[0],
    );
  });

  it('rejects a malformed byoc trunk SID', () => {
    asserts.assertExists(
      CreateCallRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        url: 'http://demo.twilio.com/docs/voice.xml',
        byoc: 'not-a-sid',
      })[0],
    );
  });

  it('rejects twiml over 4000 characters', () => {
    asserts.assertExists(
      CreateCallRequestSchemaObject.safeParse({
        to: '+14155552671',
        from: '+15017122661',
        twiml: '<Response><Say>' + 'x'.repeat(4000) + '</Say></Response>',
      })[0],
    );
  });
});
