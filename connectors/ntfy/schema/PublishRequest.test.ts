import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  PublishActionBroadcastSchemaObject,
  PublishActionCopySchemaObject,
  PublishActionHttpSchemaObject,
  PublishActionSchemaObject,
  PublishActionViewSchemaObject,
  PublishRequestSchemaObject,
} from './PublishRequest.ts';

describe('Ntfy.schema.PublishRequest', () => {
  it('accepts a request with only the required topic', () => {
    const [error, request] = PublishRequestSchemaObject.safeParse({
      topic: 'mytopic',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(request?.topic, 'mytopic');
  });

  it('accepts a fully populated request', () => {
    const [error, request] = PublishRequestSchemaObject.safeParse({
      topic: 'mytopic',
      message: 'Hello from ntfy!',
      title: 'Greetings',
      priority: 4,
      tags: ['warning', 'skull'],
      click: 'https://example.com',
      attach: 'https://example.com/file.jpg',
      filename: 'greetings.jpg',
      icon: 'https://example.com/icon.png',
      markdown: true,
      delay: '30m',
      email: 'user@example.com',
      actions: [
        { action: 'view', label: 'Open', url: 'https://example.com' },
      ],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(request?.priority, 4);
    asserts.assertEquals(request?.tags, ['warning', 'skull']);
    asserts.assertEquals(request?.filename, 'greetings.jpg');
    asserts.assertEquals(request?.icon, 'https://example.com/icon.png');
    asserts.assertEquals(request?.email, 'user@example.com');
  });

  it('accepts a filename overriding the attachment name', () => {
    const [error, request] = PublishRequestSchemaObject.safeParse({
      topic: 'mytopic',
      attach: 'https://example.com/file.jpg',
      filename: 'custom-name.jpg',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(request?.filename, 'custom-name.jpg');
  });

  it('accepts a notification icon URL', () => {
    const [error, request] = PublishRequestSchemaObject.safeParse({
      topic: 'mytopic',
      icon: 'https://example.com/icon.png',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(request?.icon, 'https://example.com/icon.png');
  });

  it('rejects a non-URL icon value', () => {
    asserts.assertExists(
      PublishRequestSchemaObject.safeParse({
        topic: 'mytopic',
        icon: 'not-a-url',
      })[0],
    );
  });

  it('accepts a forwarding email address', () => {
    const [error, request] = PublishRequestSchemaObject.safeParse({
      topic: 'mytopic',
      email: 'user@example.com',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(request?.email, 'user@example.com');
  });

  it('rejects an invalid email address', () => {
    asserts.assertExists(
      PublishRequestSchemaObject.safeParse({
        topic: 'mytopic',
        email: 'not-an-email',
      })[0],
    );
  });

  it('rejects a missing topic', () => {
    asserts.assertExists(PublishRequestSchemaObject.safeParse({})[0]);
  });

  it('rejects a topic with disallowed characters', () => {
    asserts.assertExists(
      PublishRequestSchemaObject.safeParse({ topic: 'my topic!' })[0],
    );
  });

  it('rejects a topic longer than 64 characters', () => {
    asserts.assertExists(
      PublishRequestSchemaObject.safeParse({ topic: 'a'.repeat(65) })[0],
    );
  });

  it('rejects a priority outside 1-5', () => {
    asserts.assertExists(
      PublishRequestSchemaObject.safeParse({
        topic: 'mytopic',
        priority: 0,
      })[0],
    );
    asserts.assertExists(
      PublishRequestSchemaObject.safeParse({
        topic: 'mytopic',
        priority: 6,
      })[0],
    );
  });

  it('rejects a non-URL click value', () => {
    asserts.assertExists(
      PublishRequestSchemaObject.safeParse({
        topic: 'mytopic',
        click: 'not-a-url',
      })[0],
    );
  });

  it('rejects more than 3 actions', () => {
    const view = { action: 'view', label: 'Open', url: 'https://example.com' };
    asserts.assertExists(
      PublishRequestSchemaObject.safeParse({
        topic: 'mytopic',
        actions: [view, view, view, view],
      })[0],
    );
  });

  describe('PublishActionSchemaObject', () => {
    it('accepts a view action', () => {
      asserts.assertEquals(
        PublishActionSchemaObject.safeParse({
          action: 'view',
          label: 'Open Twitter',
          url: 'https://twitter.com/binwiederhier',
        })[0],
        null,
      );
    });

    it('accepts a broadcast action with extras', () => {
      asserts.assertEquals(
        PublishActionSchemaObject.safeParse({
          action: 'broadcast',
          label: 'Take picture',
          extras: { cmd: 'pic', camera: 'front' },
        })[0],
        null,
      );
    });

    it('accepts an http action with a custom method', () => {
      asserts.assertEquals(
        PublishActionSchemaObject.safeParse({
          action: 'http',
          label: 'Close door',
          url: 'https://api.mygarage.lan/',
          method: 'PUT',
          headers: { Authorization: 'Bearer abc' },
        })[0],
        null,
      );
    });

    it('accepts a copy action', () => {
      asserts.assertEquals(
        PublishActionSchemaObject.safeParse({
          action: 'copy',
          label: 'Copy code',
          value: '123456',
        })[0],
        null,
      );
    });

    it('rejects an unknown action discriminator', () => {
      asserts.assertExists(
        PublishActionSchemaObject.safeParse({
          action: 'explode',
          label: 'Boom',
        })[0],
      );
    });

    it('rejects a view action missing url', () => {
      asserts.assertExists(
        PublishActionViewSchemaObject.safeParse({
          action: 'view',
          label: 'Open',
        })[0],
      );
    });

    it('rejects a copy action missing value', () => {
      asserts.assertExists(
        PublishActionCopySchemaObject.safeParse({
          action: 'copy',
          label: 'Copy',
        })[0],
      );
    });

    it('rejects a broadcast action missing label', () => {
      asserts.assertExists(
        PublishActionBroadcastSchemaObject.safeParse({
          action: 'broadcast',
        })[0],
      );
    });

    it('rejects an http action with a non-URL endpoint', () => {
      asserts.assertExists(
        PublishActionHttpSchemaObject.safeParse({
          action: 'http',
          label: 'Close door',
          url: 'not-a-url',
        })[0],
      );
    });
  });
});
