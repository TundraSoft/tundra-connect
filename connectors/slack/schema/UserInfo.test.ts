import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  GetUserInfoRequestSchemaObject,
  GetUserInfoResponseSchemaObject,
} from './UserInfo.ts';

describe('Slack.schema.UserInfo', () => {
  describe('GetUserInfoRequestSchemaObject', () => {
    it('accepts a user id', () => {
      asserts.assertEquals(
        GetUserInfoRequestSchemaObject.safeParse({ user: 'U123ABC456' })[0],
        null,
      );
    });

    it('rejects an empty user id', () => {
      asserts.assertExists(
        GetUserInfoRequestSchemaObject.safeParse({ user: '' })[0],
      );
    });

    it('rejects a missing user id', () => {
      asserts.assertExists(GetUserInfoRequestSchemaObject.safeParse({})[0]);
    });
  });

  describe('GetUserInfoResponseSchemaObject', () => {
    it('accepts a documented success response', () => {
      const [error, response] = GetUserInfoResponseSchemaObject.safeParse({
        ok: true,
        user: { id: 'U123ABC456', name: 'ada', real_name: 'Ada Lovelace' },
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(response?.user.real_name, 'Ada Lovelace');
    });

    it('rejects a response missing user', () => {
      asserts.assertExists(
        GetUserInfoResponseSchemaObject.safeParse({ ok: true })[0],
      );
    });
  });
});
