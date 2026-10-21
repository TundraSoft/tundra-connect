import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for {@link BulkResultSchemaObject}: what a bulk write or
 * bulk delete reports. When the client split a large call into several
 * requests, the counts are summed and the failed keys concatenated.
 */
export type BulkResultSchema = {
  /** Keys written (or deleted). */
  successful_key_count: number;
  /** Keys Cloudflare could not write (or delete); retry these. */
  unsuccessful_keys: string[];
};

/**
 * Schema for the `result` of `PUT /bulk` and `POST /bulk/delete`. Both
 * fields are optional on the wire (an older answer is an empty object);
 * the client fills the missing ones in.
 *
 * @example
 * ```typescript
 * import { BulkResultSchemaObject } from '@tundraconnect/cloudflare-kv/schemas';
 *
 * const [error, result] = BulkResultSchemaObject.safeParse({
 *   successful_key_count: 2,
 *   unsuccessful_keys: [],
 * });
 * ```
 */
export const BulkResultSchemaObject: BaseGuardian<
  {
    successful_key_count?: number;
    unsuccessful_keys?: string[];
  }
> = Guardian.object({
  successful_key_count: Guardian.number().optional(),
  unsuccessful_keys: Guardian.array(Guardian.string()).optional(),
}).passthrough().describe({
  title: 'Workers KV bulk result',
  description: 'Counts of keys a bulk write or delete applied.',
});

/**
 * One value of a bulk read made with `withMetadata: true`.
 */
export type BulkGetValueWithMetadataSchema = {
  /** The value: a string for `type: 'text'`, parsed JSON for `type: 'json'`. */
  value: unknown;
  /** The key's metadata, or `null` when it has none. */
  metadata: unknown;
  /** Expiry in seconds since the UNIX epoch, when the key expires. */
  expiration?: number;
};

/**
 * Type definition for {@link BulkGetResultSchemaObject}: the `values` map
 * of a bulk read. Every requested key is present; a key that does not
 * exist maps to `null`.
 */
export type BulkGetResultSchema = {
  /** Values by key name. */
  values: Record<string, unknown>;
};

/**
 * Schema for the `result` of `POST /bulk/get`.
 *
 * @example
 * ```typescript
 * import { BulkGetResultSchemaObject } from '@tundraconnect/cloudflare-kv/schemas';
 *
 * const [error, result] = BulkGetResultSchemaObject.safeParse({
 *   values: { 'r:acme': 'https://acme.example', 'r:gone': null },
 * });
 * ```
 */
export const BulkGetResultSchemaObject: BaseGuardian<BulkGetResultSchema> =
  Guardian.object({
    // A missing key maps to `null`, which a bare `unknown()` rejects;
    // `nullable()` returns a finished guardian the record overloads don't
    // admit by type, though the record validates with it at run time.
    values: Guardian.record(
      Guardian.unknown().nullable() as unknown as BaseGuardian<unknown>,
    ),
  }).passthrough().describe({
    title: 'Workers KV bulk read result',
    description: 'Values by key name; missing keys map to null.',
  }) as BaseGuardian<BulkGetResultSchema>;
