import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Type definition for a saved/returned Algolia record.
 *
 * An index record in Algolia is arbitrary user-supplied JSON plus the one
 * field Algolia itself always manages: `objectID`. Everything else — field
 * names, types, nesting — is entirely up to the caller, and search hits
 * additionally carry vendor-injected fields (`_highlightResult`,
 * `_snippetResult`, `_rankingInfo`, ...) depending on query parameters. This
 * type models only the one guaranteed field and passes every other field
 * through untouched rather than guessing at a shape.
 *
 * Hand-written (rather than derived via `GuardianInfer<typeof
 * _algoliaObjectSchema>`) so the exported schema below can carry an explicit
 * `BaseGuardian<AlgoliaObjectSchema>` annotation, and so schemas that embed
 * it (search/browse responses) can reference the type directly — JSR's
 * "slow types" check requires the originating declaration of any type
 * reachable from the public API to be explicit.
 */
export type AlgoliaObjectSchema = {
  /** Algolia-managed unique identifier for this record within its index. */
  objectID: string;
} & Record<string, unknown>;

/** Schema for a saved/returned Algolia record — see {@link AlgoliaObjectSchema}. */
export const AlgoliaObjectSchemaObject: BaseGuardian<AlgoliaObjectSchema> =
  Guardian.object({
    /** Algolia-managed unique identifier for this record within its index. */
    objectID: Guardian.string(),
  }).passthrough().describe({
    title: 'Algolia object',
    description:
      'A record stored in an Algolia index: the Algolia-managed `objectID` plus arbitrary caller-defined fields.',
  });

/**
 * Type definition for the arbitrary JSON object a caller sends to
 * {@link Algolia.saveObject}.
 *
 * Hand-written (rather than derived via `GuardianInfer`) so the exported
 * schema below can carry an explicit `BaseGuardian<AlgoliaObjectPayloadSchema>`
 * annotation with no unannotated intermediate — JSR's "slow types" check
 * requires the originating declaration of any type reachable from the
 * public API to be explicit, and that includes an unexported intermediate
 * `const` a public export is merely aliased from.
 */
export type AlgoliaObjectPayloadSchema = Record<string, unknown>;

/**
 * Schema for the arbitrary JSON object a caller sends to
 * {@link Algolia.saveObject}.
 *
 * Only checks that the payload IS a plain JSON object (not an array,
 * string, or other primitive) — the fields inside are entirely
 * caller-defined, so no further shape is enforced locally. `objectID` is
 * allowed but not required in the payload; Algolia generates one when
 * omitted.
 */
export const AlgoliaObjectPayloadSchemaObject: BaseGuardian<
  AlgoliaObjectPayloadSchema
> = Guardian.record(Guardian.unknown()).describe({
  title: 'Algolia object payload',
  description:
    'Arbitrary JSON object to save to an Algolia index. Must be a plain object, not an array or primitive.',
});
