import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  PublishAttachmentSchemaObject,
  PublishResponseSchemaObject,
} from './PublishResponse.ts';

describe('Ntfy.schema.PublishResponse', () => {
  it('accepts a minimal message response', () => {
    const [error, response] = PublishResponseSchemaObject.safeParse({
      id: 'sPs71M8A2T',
      time: 1643935928,
      event: 'message',
      topic: 'mytopic',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(response?.id, 'sPs71M8A2T');
  });

  it('accepts the documented full example', () => {
    const [error, response] = PublishResponseSchemaObject.safeParse({
      id: 'sPs71M8A2T',
      time: 1643935928,
      expires: 1643936928,
      event: 'message',
      topic: 'mytopic',
      priority: 5,
      tags: ['warning', 'skull'],
      click: 'https://homecam.mynet.lan/incident/1234',
      attachment: {
        name: 'camera.jpg',
        type: 'image/png',
        size: 33848,
        expires: 1643946728,
        url: 'https://ntfy.sh/file/sPs71M8A2T.png',
      },
      title: 'Unauthorized access detected',
      message: 'Movement detected in the yard. You better go check',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(response?.attachment?.name, 'camera.jpg');
    asserts.assertEquals(response?.tags, ['warning', 'skull']);
  });

  it('rejects a missing id', () => {
    asserts.assertExists(
      PublishResponseSchemaObject.safeParse({
        time: 1643935928,
        event: 'message',
        topic: 'mytopic',
      })[0],
    );
  });

  it('rejects an event other than "message"', () => {
    asserts.assertExists(
      PublishResponseSchemaObject.safeParse({
        id: 'sPs71M8A2T',
        time: 1643935928,
        event: 'keepalive',
        topic: 'mytopic',
      })[0],
    );
  });
});

describe('Ntfy.schema.PublishAttachmentSchemaObject', () => {
  it('accepts an attachment with only the required fields', () => {
    asserts.assertEquals(
      PublishAttachmentSchemaObject.safeParse({
        name: 'camera.jpg',
        url: 'https://ntfy.sh/file/sPs71M8A2T.jpg',
      })[0],
      null,
    );
  });

  it('rejects an attachment missing url', () => {
    asserts.assertExists(
      PublishAttachmentSchemaObject.safeParse({ name: 'camera.jpg' })[0],
    );
  });
});
