import { type BaseGuardian, Guardian } from '@guardian';

/** Every `validationCode` Google documents. */
export const VALIDATION_CODES = [
  'VALUE_INVALID',
  'VALUE_REQUIRED',
  'NAME_INVALID',
  'NAME_RESERVED',
  'VALUE_OUT_OF_BOUNDS',
  'EXCEEDED_MAX_ENTITIES',
  'NAME_DUPLICATED',
] as const;

/**
 * Type definition for {@link ValidationMessageSchemaObject}: one problem the
 * debug endpoint found. `validationCode` is a `string` so a code Google adds
 * later never fails a read; the documented ones are in
 * {@link VALIDATION_CODES}.
 */
export type ValidationMessageSchema = {
  /** Where the problem is, e.g. `events[0].name`. */
  fieldPath?: string;
  /** What is wrong, in Google's words. */
  description?: string;
  /** One of {@link VALIDATION_CODES}. */
  validationCode?: string;
};

/**
 * Schema for one validation message.
 *
 * @example
 * ```typescript
 * import { ValidationMessageSchemaObject } from '@tundraconnect/google-analytics/schemas';
 *
 * const [error, message] = ValidationMessageSchemaObject.safeParse({
 *   fieldPath: 'events',
 *   description: 'Event at index: [0] has invalid name [_badEventName].',
 *   validationCode: 'NAME_INVALID',
 * });
 * ```
 */
export const ValidationMessageSchemaObject: BaseGuardian<
  ValidationMessageSchema
> = Guardian.object({
  fieldPath: Guardian.string().optional(),
  description: Guardian.string().optional(),
  validationCode: Guardian.string().optional(),
}).passthrough().describe({
  title: 'Validation message',
  description: 'One problem the Measurement Protocol debug endpoint reported.',
});

/** Type definition for {@link ValidationResponseSchemaObject}. */
export type ValidationResponseSchema = {
  /** Every problem found; empty when the payload is valid. */
  validationMessages: ValidationMessageSchema[];
};

/**
 * Schema for the debug endpoint's response body. A missing
 * `validationMessages` is read as "no problems".
 *
 * @example
 * ```typescript
 * import { ValidationResponseSchemaObject } from '@tundraconnect/google-analytics/schemas';
 *
 * const [error, response] = ValidationResponseSchemaObject.safeParse({
 *   validationMessages: [],
 * });
 * ```
 */
export const ValidationResponseSchemaObject: BaseGuardian<
  ValidationResponseSchema
> = Guardian.preprocess(
  (body: unknown) =>
    body && typeof body === 'object' && !('validationMessages' in body)
      ? { ...body, validationMessages: [] }
      : body,
  Guardian.object({
    validationMessages: Guardian.array(ValidationMessageSchemaObject),
  }).passthrough(),
).describe({
  title: 'Validation response',
  description:
    'What the Measurement Protocol debug endpoint found wrong with a payload.',
});
