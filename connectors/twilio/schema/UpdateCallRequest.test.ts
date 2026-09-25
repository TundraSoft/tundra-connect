import * as asserts from '@asserts';
import { describe, it } from '@test';
import { UpdateCallRequestSchemaObject } from './UpdateCallRequest.ts';

describe('Twilio.schema.UpdateCallRequest', () => {
  it('accepts status: completed to end an in-progress call', () => {
    asserts.assertEquals(
      UpdateCallRequestSchemaObject.safeParse({ status: 'completed' })[0],
      null,
    );
  });

  it('accepts status: canceled to end a queued/ringing call', () => {
    asserts.assertEquals(
      UpdateCallRequestSchemaObject.safeParse({ status: 'canceled' })[0],
      null,
    );
  });

  it('accepts twiml to redirect a live call', () => {
    asserts.assertEquals(
      UpdateCallRequestSchemaObject.safeParse({
        twiml: '<Response><Say>Please hold.</Say></Response>',
      })[0],
      null,
    );
  });

  it('accepts url + method to redirect a live call', () => {
    asserts.assertEquals(
      UpdateCallRequestSchemaObject.safeParse({
        url: 'http://demo.twilio.com/docs/voice.xml',
        method: 'POST',
      })[0],
      null,
    );
  });

  it('accepts statusCallback when url is also supplied', () => {
    asserts.assertEquals(
      UpdateCallRequestSchemaObject.safeParse({
        url: 'https://example.com/twiml',
        statusCallback: 'https://example.com/status-changed',
      })[0],
      null,
    );
  });

  it('rejects statusCallback without url', () => {
    asserts.assertExists(
      UpdateCallRequestSchemaObject.safeParse({
        statusCallback: 'https://example.com/status-changed',
      })[0],
    );
  });

  it('rejects an empty update (no fields supplied)', () => {
    asserts.assertExists(UpdateCallRequestSchemaObject.safeParse({})[0]);
  });

  it("rejects a status other than 'canceled'/'completed'", () => {
    asserts.assertExists(
      UpdateCallRequestSchemaObject.safeParse({ status: 'queued' })[0],
    );
  });

  it('rejects twiml over 4000 characters', () => {
    asserts.assertExists(
      UpdateCallRequestSchemaObject.safeParse({
        twiml: '<Response><Say>' + 'x'.repeat(4000) + '</Say></Response>',
      })[0],
    );
  });

  it('accepts fallbackUrl/fallbackMethod/timeLimit', () => {
    asserts.assertEquals(
      UpdateCallRequestSchemaObject.safeParse({
        fallbackUrl: 'https://example.com/fallback',
        fallbackMethod: 'GET',
        timeLimit: 1800,
      })[0],
      null,
    );
  });
});
