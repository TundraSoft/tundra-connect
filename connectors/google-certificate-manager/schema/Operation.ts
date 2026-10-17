import { type BaseGuardian, Guardian } from '@guardian';

/** Type definition for {@link OperationStatusSchemaObject}. */
export type OperationStatusSchema = {
  /** A `google.rpc.Code` value, e.g. `6` for `ALREADY_EXISTS`. */
  code?: number;
  /** Developer-facing message. */
  message?: string;
  /** Structured detail entries. */
  details?: Record<string, unknown>[];
};

/**
 * Schema for a failed operation's `error` (a `google.rpc.Status`).
 *
 * @example
 * ```typescript
 * import { OperationStatusSchemaObject } from '@tundraconnect/google-certificate-manager/schemas';
 *
 * const status = OperationStatusSchemaObject.parse({
 *   code: 6,
 *   message: 'Resource already exists',
 * });
 * ```
 */
export const OperationStatusSchemaObject: BaseGuardian<OperationStatusSchema> =
  Guardian.object({
    code: Guardian.number().strict().optional(),
    message: Guardian.string().optional(),
    details: Guardian.array(Guardian.object({}).passthrough()).optional(),
  }).passthrough().describe({
    title: 'Operation status',
    description: 'The google.rpc.Status a failed operation carries.',
  });

/** Type definition for {@link OperationSchemaObject}. */
export type OperationSchema = {
  /** Full name: `projects/{project}/locations/{location}/operations/{id}`. */
  name: string;
  /** `OperationMetadata`: `createTime`, `endTime`, `target`, `verb`, ... */
  metadata?: Record<string, unknown>;
  /** `true` once the operation finished, successfully or not. */
  done?: boolean;
  /** Set when the operation failed. */
  error?: OperationStatusSchema;
  /** Set when it succeeded: the created resource, or `Empty` for a delete. */
  response?: Record<string, unknown>;
};

/**
 * Schema for a long-running `Operation` — what every create and delete
 * returns.
 *
 * @example
 * ```typescript
 * import { OperationSchemaObject } from '@tundraconnect/google-certificate-manager/schemas';
 *
 * const operation = OperationSchemaObject.parse({
 *   name: 'projects/my-project/locations/global/operations/operation-1',
 *   done: false,
 * });
 * ```
 */
export const OperationSchemaObject: BaseGuardian<OperationSchema> = Guardian
  .object({
    name: Guardian.string().minLength(1),
    metadata: Guardian.object({}).passthrough().optional(),
    done: Guardian.boolean().strict().optional(),
    error: OperationStatusSchemaObject.optional(),
    response: Guardian.object({}).passthrough().optional(),
  }).passthrough().describe({
    title: 'Operation',
    description: 'A Certificate Manager long-running operation.',
  });
