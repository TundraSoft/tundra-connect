import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Reusable Guardian components shared across the Slack request/response
 * schemas: the `<seconds>.<microseconds>` message-timestamp shape Slack
 * uses as both a message id and a cursor into a channel's history, and the
 * `response_metadata` pagination envelope every cursor-paginated method
 * (`conversations.list`, `conversations.history`, ...) returns.
 *
 * @example
 * ```typescript
 * import { slackTimestampGuard } from '@tundraconnect/slack/schemas';
 *
 * const [error, ts] = slackTimestampGuard.safeParse('1503435956.000247');
 * if (!error) {
 *   console.log('Valid Slack timestamp:', ts);
 * }
 * ```
 */

/** Slack message timestamp: `<unix seconds>.<microseconds>`, e.g. `1503435956.000247`. */
export const SLACK_TS_PATTERN = /^\d{9,}\.\d{3,}$/;

/** Type definition for a validated Slack message timestamp. */
export type SlackTimestampSchema = string;

/**
 * Validates a Slack message timestamp — the `ts` value Slack assigns every
 * message, and the id used to address it via `chat.update`/`chat.delete`.
 */
export const slackTimestampGuard: BaseGuardian<SlackTimestampSchema> = Guardian
  .string()
  .pattern(
    SLACK_TS_PATTERN,
    "Slack message timestamp must match '<unix seconds>.<microseconds>' (e.g. '1503435956.000247')",
  ).describe({
    title: 'Slack message timestamp',
    description:
      "A message's unique id within its channel — the unix time it was sent, to microsecond precision.",
  });

/**
 * Type definition for the `response_metadata` envelope Slack attaches to a
 * cursor-paginated response.
 */
export type ResponseMetadataSchema = {
  /** Pass back as the `cursor` parameter to fetch the next page; absent or empty on the last page. */
  next_cursor?: string;
};

/** The `response_metadata` envelope Slack attaches to a cursor-paginated response. */
export const ResponseMetadataSchemaObject: BaseGuardian<
  ResponseMetadataSchema
> = Guardian.object({
  next_cursor: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Response metadata',
  description:
    'Cursor-pagination envelope: `next_cursor` is passed back as the `cursor` parameter to fetch the next page.',
});
