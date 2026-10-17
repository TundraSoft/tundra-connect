import { type BaseGuardian, Guardian } from '@guardian';
import {
  type CertificateSchema,
  CertificateSchemaObject,
} from './Certificate.ts';
import {
  type CertificateMapEntrySchema,
  CertificateMapEntrySchemaObject,
} from './CertificateMapEntry.ts';

/** Type definition for {@link ListCertificatesResponseSchemaObject}. */
export type ListCertificatesResponseSchema = {
  /** This page of certificates. Google omits the field on an empty page. */
  certificates?: CertificateSchema[];
  /** Pass as `pageToken` for the next page; absent on the last one. */
  nextPageToken?: string;
  /** Locations that could not be reached. */
  unreachable?: string[];
};

/**
 * Schema for a `certificates.list` page.
 *
 * @example
 * ```typescript
 * import { ListCertificatesResponseSchemaObject } from '@tundraconnect/google-certificate-manager/schemas';
 *
 * const page = ListCertificatesResponseSchemaObject.parse({
 *   certificates: [],
 *   nextPageToken: 'abc',
 * });
 * ```
 */
export const ListCertificatesResponseSchemaObject: BaseGuardian<
  ListCertificatesResponseSchema
> = Guardian.object({
  certificates: Guardian.array(CertificateSchemaObject).optional(),
  nextPageToken: Guardian.string().optional(),
  unreachable: Guardian.array(Guardian.string()).optional(),
}).passthrough().describe({
  title: 'List certificates response',
  description: 'One page of certificates.',
});

/** Type definition for {@link ListCertificateMapEntriesResponseSchemaObject}. */
export type ListCertificateMapEntriesResponseSchema = {
  /** This page of map entries. Google omits the field on an empty page. */
  certificateMapEntries?: CertificateMapEntrySchema[];
  /** Pass as `pageToken` for the next page; absent on the last one. */
  nextPageToken?: string;
  /** Locations that could not be reached. */
  unreachable?: string[];
};

/**
 * Schema for a `certificateMapEntries.list` page.
 *
 * @example
 * ```typescript
 * import { ListCertificateMapEntriesResponseSchemaObject } from '@tundraconnect/google-certificate-manager/schemas';
 *
 * const page = ListCertificateMapEntriesResponseSchemaObject.parse({
 *   certificateMapEntries: [],
 * });
 * ```
 */
export const ListCertificateMapEntriesResponseSchemaObject: BaseGuardian<
  ListCertificateMapEntriesResponseSchema
> = Guardian.object({
  certificateMapEntries: Guardian.array(CertificateMapEntrySchemaObject)
    .optional(),
  nextPageToken: Guardian.string().optional(),
  unreachable: Guardian.array(Guardian.string()).optional(),
}).passthrough().describe({
  title: 'List certificate map entries response',
  description: 'One page of certificate map entries.',
});
