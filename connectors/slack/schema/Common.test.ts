import * as asserts from '@asserts';
import { describe, it } from '@test';
import { ResponseMetadataSchemaObject, slackTimestampGuard } from './Common.ts';

describe('Slack.schema.Common', () => {
  describe('slackTimestampGuard', () => {
    it('accepts a well-formed Slack timestamp', () => {
      const [error, value] = slackTimestampGuard.safeParse(
        '1503435956.000247',
      );
      asserts.assertEquals(error, null);
      asserts.assertEquals(value, '1503435956.000247');
    });

    it('rejects a value missing the fractional part', () => {
      asserts.assertExists(slackTimestampGuard.safeParse('1503435956')[0]);
    });

    it('rejects a non-numeric string', () => {
      asserts.assertExists(
        slackTimestampGuard.safeParse('not-a-timestamp')[0],
      );
    });
  });

  describe('ResponseMetadataSchemaObject', () => {
    it('accepts a next_cursor value', () => {
      const [error, value] = ResponseMetadataSchemaObject.safeParse({
        next_cursor: 'abc123',
      });
      asserts.assertEquals(error, null);
      asserts.assertEquals(value?.next_cursor, 'abc123');
    });

    it('accepts an empty object (no further pages)', () => {
      asserts.assertEquals(ResponseMetadataSchemaObject.safeParse({})[0], null);
    });
  });
});
