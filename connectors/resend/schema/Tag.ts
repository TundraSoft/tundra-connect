import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Resend's documented character set for a tag's `name` and `value`: ASCII
 * letters, digits, underscores and dashes, 1–256 characters.
 */
export const TAG_PATTERN: RegExp = /^[A-Za-z0-9_-]{1,256}$/;

/**
 * Type definition for {@link TagSchemaObject}.
 *
 * Hand-written so each field carries its own JSDoc — see CONVENTIONS.md's
 * "Schemas" section.
 */
export type TagSchema = {
  /** Tag name — ASCII letters, digits, `_` and `-`, at most 256 characters. */
  name: string;
  /** Tag value — ASCII letters, digits, `_` and `-`, at most 256 characters. */
  value: string;
};

/**
 * Schema for one custom tag attached to a sent email.
 *
 * Tags come back on {@link EmailSchema} and in webhook payloads, which makes
 * them the natural place to carry your own correlation id (`order_id`,
 * `user_id`, ...). Resend rejects anything outside {@link TAG_PATTERN}, so a
 * value such as an email address or a UUID with braces fails locally
 * rather than at send time.
 *
 * @example
 * ```typescript
 * import { TagSchemaObject } from '@tundraconnect/resend/schemas';
 *
 * const [error, tag] = TagSchemaObject.safeParse({
 *   name: 'category',
 *   value: 'confirm_email',
 * });
 * ```
 */
export const TagSchemaObject: BaseGuardian<TagSchema> = Guardian.object({
  name: Guardian.string().pattern(
    TAG_PATTERN,
    'Tag name must be 1-256 ASCII letters, digits, underscores or dashes',
  ),
  value: Guardian.string().pattern(
    TAG_PATTERN,
    'Tag value must be 1-256 ASCII letters, digits, underscores or dashes',
  ),
}).describe({
  title: 'Email tag',
  description:
    'A custom name/value pair attached to an email, echoed back on retrieval and in webhook events.',
});
