import { type BaseGuardian, Guardian } from '@guardian';
import { type DnsRecordSchema, DnsRecordSchemaObject } from './DnsRecord.ts';
import {
  DNS_RECORD_PATCH_FIELDS,
  DNS_RECORD_REQUEST_FIELDS,
  type DnsRecordPatchSchema,
  type DnsRecordRequestSchema,
} from './DnsRecordRequest.ts';

const idGuardian = Guardian.string().notEmpty('`id` cannot be empty');

/**
 * Type definition for {@link DnsRecordBatchRequestSchemaObject}: up to four
 * lists of operations Cloudflare applies atomically, in this order —
 * `deletes`, `patches`, `puts`, `posts`.
 */
export type DnsRecordBatchRequestSchema = {
  /** Records to delete, by id. */
  deletes?: { id: string }[];
  /** Records to partially update: the id plus the fields to change. */
  patches?: ({ id: string } & DnsRecordPatchSchema)[];
  /** Records to replace wholesale: the id plus the full record. */
  puts?: ({ id: string } & DnsRecordRequestSchema)[];
  /** Records to create. */
  posts?: DnsRecordRequestSchema[];
};

/**
 * Schema for a batch request. The client additionally requires at least
 * one non-empty list, and `content` or `data` on every put/post.
 *
 * @example
 * ```typescript
 * import { DnsRecordBatchRequestSchemaObject } from '@tundraconnect/cloudflare-dns/schemas';
 *
 * const [error, batch] = DnsRecordBatchRequestSchemaObject.safeParse({
 *   deletes: [{ id: '372e67954025e0ba6aaa6d586b9e0b59' }],
 *   posts: [{ type: 'A', name: 'a.example.com', content: '203.0.113.1' }],
 * });
 * ```
 */
export const DnsRecordBatchRequestSchemaObject: BaseGuardian<
  DnsRecordBatchRequestSchema
> = Guardian.object({
  deletes: Guardian.array(Guardian.object({ id: idGuardian })).optional(),
  patches: Guardian.array(
    Guardian.object({ id: idGuardian, ...DNS_RECORD_PATCH_FIELDS }),
  ).optional(),
  puts: Guardian.array(
    Guardian.object({ id: idGuardian, ...DNS_RECORD_REQUEST_FIELDS }),
  ).optional(),
  posts: Guardian.array(Guardian.object(DNS_RECORD_REQUEST_FIELDS)).optional(),
}).describe({
  title: 'DNS record batch request',
  description:
    'Deletes, patches, puts and posts to apply atomically to a zone.',
});

/**
 * Type definition for {@link DnsRecordBatchResultSchemaObject}: the records
 * each list of a batch produced, in the same four lists.
 */
export type DnsRecordBatchResultSchema = {
  /** The records that were deleted. */
  deletes?: DnsRecordSchema[];
  /** The records after their patch. */
  patches?: DnsRecordSchema[];
  /** The records after their replacement. */
  puts?: DnsRecordSchema[];
  /** The records that were created. */
  posts?: DnsRecordSchema[];
};

/**
 * Schema for the unwrapped `result` of a batch.
 *
 * @example
 * ```typescript
 * import { DnsRecordBatchResultSchemaObject } from '@tundraconnect/cloudflare-dns/schemas';
 *
 * const [error, result] = DnsRecordBatchResultSchemaObject.safeParse({
 *   deletes: [{ id: '372e67954025e0ba6aaa6d586b9e0b59', name: 'old.example.com', type: 'A' }],
 *   posts: [],
 * });
 * ```
 */
export const DnsRecordBatchResultSchemaObject: BaseGuardian<
  DnsRecordBatchResultSchema
> = Guardian.object({
  deletes: Guardian.array(DnsRecordSchemaObject).optional(),
  patches: Guardian.array(DnsRecordSchemaObject).optional(),
  puts: Guardian.array(DnsRecordSchemaObject).optional(),
  posts: Guardian.array(DnsRecordSchemaObject).optional(),
}).passthrough().describe({
  title: 'DNS record batch result',
  description: 'The records each list of a batch produced.',
});
