import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Schema for a channel's `topic`/`purpose`, an identically-shaped object
 * pair Slack attaches to every conversation.
 */
export type ChannelTopicSchema = {
  /** The topic/purpose text. */
  value?: string;
  /** User id who last set it. */
  creator?: string;
  /** Unix timestamp it was last set. */
  last_set?: number;
};

/** Schema for a conversation's `topic`/`purpose` object. */
export const ChannelTopicSchemaObject: BaseGuardian<ChannelTopicSchema> =
  Guardian
    .object({
      value: Guardian.string().optional(),
      creator: Guardian.string().optional(),
      last_set: Guardian.number().integer().optional(),
    }).passthrough().describe({
      title: 'Channel topic/purpose',
      description: "A conversation's topic or purpose, and who last set it.",
    });

/**
 * Schema for a Slack conversation (channel) resource, as returned by
 * `conversations.list`.
 *
 * Slack documents many more fields (`is_shared`, `is_org_shared`,
 * `previous_names`, `properties`, ...) that vary by workspace/plan — this
 * models the identity/visibility subset most callers need;
 * `.passthrough()` keeps the rest reachable at runtime without a schema
 * update.
 *
 * Hand-written (rather than `GuardianInfer<typeof ...>`-derived) for the
 * same JSR "slow types" reason documented on
 * `connectors/slack/schema/Message.ts`'s `MessageSchema`.
 *
 * @example
 * ```typescript
 * import { ChannelSchemaObject } from '@tundraconnect/slack/schemas';
 *
 * const [error, channel] = ChannelSchemaObject.safeParse({
 *   id: 'C123ABC456',
 *   name: 'general',
 *   is_channel: true,
 *   is_private: false,
 *   is_archived: false,
 * });
 * if (!error) {
 *   console.log(channel.name);
 * }
 * ```
 */
export type ChannelSchema = {
  /** The conversation's unique id. */
  id: string;
  /** The conversation's name, without a leading `#`. */
  name?: string;
  /** Whether this is a public channel. */
  is_channel?: boolean;
  /** Whether this is a private channel created before Slack unified private channels/groups. */
  is_group?: boolean;
  /** Whether this is a direct message conversation. */
  is_im?: boolean;
  /** Whether this is a private channel. */
  is_private?: boolean;
  /** Whether the conversation has been archived. */
  is_archived?: boolean;
  /** Whether this is the workspace's `#general` channel. */
  is_general?: boolean;
  /** Whether the calling bot/user is a member of this conversation. */
  is_member?: boolean;
  /** Unix timestamp the conversation was created. */
  created?: number;
  /** User id who created the conversation. */
  creator?: string;
  /** Approximate number of members. */
  num_members?: number;
  /** The conversation's topic. */
  topic?: ChannelTopicSchema;
  /** The conversation's purpose. */
  purpose?: ChannelTopicSchema;
};

/** Schema for a Slack conversation (channel) resource. */
export const ChannelSchemaObject: BaseGuardian<ChannelSchema> = Guardian
  .object({
    id: Guardian.string(),
    name: Guardian.string().optional(),
    is_channel: Guardian.boolean().optional(),
    is_group: Guardian.boolean().optional(),
    is_im: Guardian.boolean().optional(),
    is_private: Guardian.boolean().optional(),
    is_archived: Guardian.boolean().optional(),
    is_general: Guardian.boolean().optional(),
    is_member: Guardian.boolean().optional(),
    created: Guardian.number().integer().optional(),
    creator: Guardian.string().optional(),
    num_members: Guardian.number().integer().optional(),
    topic: ChannelTopicSchemaObject.optional(),
    purpose: ChannelTopicSchemaObject.optional(),
  }).passthrough().describe({
    title: 'Channel',
    description:
      'A Slack conversation (channel) resource, as returned by conversations.list.',
  });
