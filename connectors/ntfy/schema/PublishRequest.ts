import { type BaseGuardian, Guardian, type ObjectGuardian } from '@guardian';

/**
 * ntfy topic names may only contain letters, numbers, underscores and
 * dashes, and are limited to 64 characters — see
 * {@link https://docs.ntfy.sh/publish/#topics ntfy's topic naming rules}.
 */
const NTFY_TOPIC_PATTERN = /^[-_A-Za-z0-9]+$/;

/**
 * Type definition for a `view` action button.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * PublishActionViewSchemaObject>`) so `PublishActionViewSchemaObject` below
 * can carry an explicit `ObjectGuardian<PublishActionViewSchema>` annotation
 * directly on its declaration — JSR's "slow types" check flags any
 * unexported intermediate `const` reachable (even via `typeof`) from a
 * public export, so the type has to be pinned here instead of inferred
 * through a builder chain.
 */
export type PublishActionViewSchema = {
  action: 'view';
  /** Button label shown to the user. */
  label: string;
  /** URL opened when the button is tapped. */
  url: string;
  /** Clear the notification after the button is tapped. */
  clear?: boolean;
};

/**
 * Schema for a `view` action button — opens `url` when tapped.
 *
 * Typed as `ObjectGuardian` (rather than the usual `BaseGuardian`) because
 * it's passed as a branch to {@link PublishActionSchemaObject}'s
 * `Guardian.discriminatedUnion(...)`, which requires each member to be an
 * `ObjectGuardian` so it can read the branch's discriminator field at
 * construction time.
 *
 * @example
 * ```typescript
 * import { PublishActionViewSchemaObject } from '@tundraconnect/ntfy/schemas';
 *
 * const [error, action] = PublishActionViewSchemaObject.safeParse({
 *   action: 'view',
 *   label: 'Open portal',
 *   url: 'https://example.com',
 * });
 * ```
 */
export const PublishActionViewSchemaObject: ObjectGuardian<
  PublishActionViewSchema
> = Guardian.object({
  action: Guardian.literal('view'),
  label: Guardian.string().minLength(1),
  url: Guardian.string().url(),
  clear: Guardian.boolean().optional(),
}).describe({
  title: 'ntfy view action',
  description: 'Action button that opens a URL when tapped.',
});

/**
 * Type definition for a `broadcast` action button. Hand-written — see
 * {@link PublishActionViewSchema} for why.
 */
export type PublishActionBroadcastSchema = {
  action: 'broadcast';
  /** Button label shown to the user. */
  label: string;
  /** Android intent name; defaults to `io.heckel.ntfy.USER_ACTION`. */
  intent?: string;
  /** String key/value pairs passed as intent extras. */
  extras?: Record<string, string>;
  /** Clear the notification after the button is tapped. */
  clear?: boolean;
};

/**
 * Schema for a `broadcast` action button (Android only) — sends an Android
 * broadcast intent when tapped. Typed as `ObjectGuardian` — see
 * {@link PublishActionViewSchemaObject} for why.
 *
 * @example
 * ```typescript
 * import { PublishActionBroadcastSchemaObject } from '@tundraconnect/ntfy/schemas';
 *
 * const [error, action] = PublishActionBroadcastSchemaObject.safeParse({
 *   action: 'broadcast',
 *   label: 'Take picture',
 *   extras: { cmd: 'pic', camera: 'front' },
 * });
 * ```
 */
export const PublishActionBroadcastSchemaObject: ObjectGuardian<
  PublishActionBroadcastSchema
> = Guardian.object({
  action: Guardian.literal('broadcast'),
  label: Guardian.string().minLength(1),
  intent: Guardian.string().optional(),
  extras: Guardian.record(Guardian.string()).optional(),
  clear: Guardian.boolean().optional(),
}).describe({
  title: 'ntfy broadcast action',
  description:
    'Action button that sends an Android broadcast intent when tapped.',
});

/**
 * Type definition for an `http` action button. Hand-written — see
 * {@link PublishActionViewSchema} for why.
 */
export type PublishActionHttpSchema = {
  action: 'http';
  /** Button label shown to the user. */
  label: string;
  /** Request endpoint. */
  url: string;
  /** HTTP method; defaults to `POST`. */
  method?: string;
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** Request body. */
  body?: string;
  /** Clear the notification once the request succeeds. */
  clear?: boolean;
};

/**
 * Schema for an `http` action button — sends an HTTP request when tapped.
 * Typed as `ObjectGuardian` — see {@link PublishActionViewSchemaObject} for
 * why.
 *
 * @example
 * ```typescript
 * import { PublishActionHttpSchemaObject } from '@tundraconnect/ntfy/schemas';
 *
 * const [error, action] = PublishActionHttpSchemaObject.safeParse({
 *   action: 'http',
 *   label: 'Close door',
 *   url: 'https://api.mygarage.lan/',
 *   method: 'PUT',
 * });
 * ```
 */
export const PublishActionHttpSchemaObject: ObjectGuardian<
  PublishActionHttpSchema
> = Guardian.object({
  action: Guardian.literal('http'),
  label: Guardian.string().minLength(1),
  url: Guardian.string().url(),
  method: Guardian.string().optional(),
  headers: Guardian.record(Guardian.string()).optional(),
  body: Guardian.string().optional(),
  clear: Guardian.boolean().optional(),
}).describe({
  title: 'ntfy http action',
  description: 'Action button that sends an HTTP request when tapped.',
});

/**
 * Type definition for a `copy` action button. Hand-written — see
 * {@link PublishActionViewSchema} for why.
 */
export type PublishActionCopySchema = {
  action: 'copy';
  /** Button label shown to the user. */
  label: string;
  /** Text copied to the clipboard when the button is tapped. */
  value: string;
  /** Clear the notification after the button is tapped. */
  clear?: boolean;
};

/**
 * Schema for a `copy` action button — copies `value` to the clipboard when
 * tapped. Typed as `ObjectGuardian` — see
 * {@link PublishActionViewSchemaObject} for why.
 *
 * @example
 * ```typescript
 * import { PublishActionCopySchemaObject } from '@tundraconnect/ntfy/schemas';
 *
 * const [error, action] = PublishActionCopySchemaObject.safeParse({
 *   action: 'copy',
 *   label: 'Copy code',
 *   value: '123456',
 * });
 * ```
 */
export const PublishActionCopySchemaObject: ObjectGuardian<
  PublishActionCopySchema
> = Guardian.object({
  action: Guardian.literal('copy'),
  label: Guardian.string().minLength(1),
  value: Guardian.string(),
  clear: Guardian.boolean().optional(),
}).describe({
  title: 'ntfy copy action',
  description: 'Action button that copies a value to the clipboard.',
});

/**
 * Type definition for one entry of a publish request's `actions` array.
 * Hand-written — see {@link PublishActionViewSchema} for why.
 */
export type PublishActionSchema =
  | PublishActionViewSchema
  | PublishActionBroadcastSchema
  | PublishActionHttpSchema
  | PublishActionCopySchema;

/**
 * Discriminated union of ntfy's four documented action-button types
 * (`view`, `broadcast`, `http`, `copy`), keyed by the `action` field.
 *
 * @example
 * ```typescript
 * import { PublishActionSchemaObject } from '@tundraconnect/ntfy/schemas';
 *
 * const [error, action] = PublishActionSchemaObject.safeParse({
 *   action: 'view',
 *   label: 'Open Twitter',
 *   url: 'https://twitter.com/binwiederhier',
 * });
 * if (!error && action.action === 'view') {
 *   console.log(action.url);
 * }
 * ```
 */
export const PublishActionSchemaObject: BaseGuardian<PublishActionSchema> =
  Guardian.discriminatedUnion(
    'action',
    [
      PublishActionViewSchemaObject,
      PublishActionBroadcastSchemaObject,
      PublishActionHttpSchemaObject,
      PublishActionCopySchemaObject,
    ],
  ).describe({
    title: 'ntfy action button',
    description: "One entry of a publish request's `actions` array.",
  });

/**
 * Type definition for the ntfy `POST /` JSON publish request body.
 * Hand-written — see {@link PublishActionViewSchema} for why.
 */
export type PublishRequestSchema = {
  /** Topic to publish to; letters, numbers, underscores, dashes, max 64 chars. */
  topic: string;
  /** Notification body text. */
  message?: string;
  /** Notification title; defaults to `ntfy.sh/<topic>` when omitted. */
  title?: string;
  /** Message priority: `1` (min) through `5` (max); ntfy defaults to `3`. */
  priority?: number;
  /** Tags — emoji shortcodes and/or plain labels. */
  tags?: string[];
  /** Website opened when the notification is tapped. */
  click?: string;
  /** Action buttons; ntfy allows at most 3. */
  actions?: PublishActionSchema[];
  /** External file URL attached to the notification. */
  attach?: string;
  /**
   * Override for the attachment's downloaded filename; only meaningful
   * alongside `attach`.
   */
  filename?: string;
  /** URL of a JPEG/PNG image shown as the notification icon. */
  icon?: string;
  /** Render `message` as Markdown. */
  markdown?: boolean;
  /**
   * Schedule delivery: a Unix timestamp, a duration (`'30m'`, `'2h'`), or
   * natural language (`'tomorrow, 10am'`).
   */
  delay?: string;
  /** Forward the notification to this email address. */
  email?: string;
};

/**
 * Schema for the ntfy `POST /` JSON publish request body
 *
 * This is the primary schema of the connect: the JSON publish form is a
 * strict superset of the plain-text `POST /<topic>` form, so this is the
 * only request shape the connect models — see
 * {@link https://docs.ntfy.sh/publish/#publish-as-json ntfy's JSON publish docs}.
 *
 * @example
 * ```typescript
 * import { PublishRequestSchemaObject } from '@tundraconnect/ntfy/schemas';
 *
 * const [error, request] = PublishRequestSchemaObject.safeParse({
 *   topic: 'mytopic',
 *   message: 'Hello from ntfy!',
 *   title: 'Greetings',
 *   priority: 4,
 *   tags: ['warning', 'skull'],
 * });
 * if (!error) {
 *   console.log(request.topic);
 * }
 * ```
 */
export const PublishRequestSchemaObject: BaseGuardian<PublishRequestSchema> =
  Guardian.object({
    topic: Guardian.string()
      .pattern(
        NTFY_TOPIC_PATTERN,
        'Topic may only contain letters, numbers, underscores and dashes',
      )
      .maxLength(64),
    message: Guardian.string().optional(),
    title: Guardian.string().optional(),
    priority: Guardian.number().integer().min(1).max(5).optional(),
    tags: Guardian.array(Guardian.string()).optional(),
    click: Guardian.string().url().optional(),
    actions: Guardian.array(PublishActionSchemaObject).maxLength(3)
      .optional(),
    attach: Guardian.string().url().optional(),
    filename: Guardian.string().optional(),
    icon: Guardian.string().url().optional(),
    markdown: Guardian.boolean().optional(),
    delay: Guardian.string().optional(),
    email: Guardian.string().email().optional(),
  }).describe({
    title: 'ntfy publish request',
    description: 'Request body validated before POST / (JSON publish form).',
  });
