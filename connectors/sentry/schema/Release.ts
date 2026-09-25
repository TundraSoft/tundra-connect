import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Schema for a Sentry Release resource, as returned by
 * {@link Sentry.createRelease}
 * (https://docs.sentry.io/api/releases/create-a-new-release-for-an-organization/).
 *
 * Models the commonly-present fields; Sentry documents several more
 * (`owner`, `newGroups`, `versionInfo`, ...) that vary by request, so the
 * schema `.passthrough()`es rather than exhaustively modelling every one of
 * them.
 *
 * @example
 * ```typescript
 * import { ReleaseSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, release] = ReleaseSchemaObject.safeParse({
 *   id: 1,
 *   version: 'frontend@1.0.0',
 *   status: 'open',
 *   dateCreated: '2024-01-01T00:00:00Z',
 *   commitCount: 0,
 *   projects: [{ id: 1, slug: 'sentry', name: 'sentry', platform: 'javascript' }],
 * });
 * if (!error) {
 *   console.log('Created release:', release.version);
 * }
 * ```
 */
export type ReleaseSchema = {
  id: number | string;
  version: string;
  shortVersion?: string;
  status?: string;
  ref?: string | null;
  url?: string | null;
  dateReleased?: string | null;
  dateCreated: string;
  commitCount?: number;
  deployCount?: number;
  authors?: unknown[];
  projects?: unknown[];
  firstEvent?: string | null;
  lastEvent?: string | null;
};

const _releaseSchema: BaseGuardian<ReleaseSchema> = Guardian.object({
  /** Release ID. */
  id: Guardian.oneOf(
    [Guardian.number(), Guardian.string()],
    'id must be a number or string',
  ),
  /** The version identifier supplied when the release was created. */
  version: Guardian.string(),
  /** A shortened, display-friendly form of `version`. */
  shortVersion: Guardian.string().optional(),
  /** Release status (e.g. `open`, `archived`). */
  status: Guardian.string().optional(),
  /** VCS ref (e.g. a git commit SHA) this release points to. */
  ref: Guardian.string().nullable().optional(),
  /** URL associated with this release (e.g. a build/CI link). */
  url: Guardian.string().nullable().optional(),
  /** ISO 8601 timestamp the release was deployed; `null` if not yet released. */
  dateReleased: Guardian.string().nullable().optional(),
  /** ISO 8601 timestamp the release resource was created. */
  dateCreated: Guardian.string(),
  /** Number of commits associated with this release. */
  commitCount: Guardian.number().integer().optional(),
  /** Number of deploys of this release. */
  deployCount: Guardian.number().integer().optional(),
  /** Commit authors associated with this release. */
  authors: Guardian.array(Guardian.unknown()).optional(),
  /** Projects this release is associated with. */
  projects: Guardian.array(Guardian.unknown()).optional(),
  /** ISO 8601 timestamp of the first event associated with this release. */
  firstEvent: Guardian.string().nullable().optional(),
  /** ISO 8601 timestamp of the most recent event associated with this release. */
  lastEvent: Guardian.string().nullable().optional(),
}).passthrough().describe({
  title: 'Release resource',
  description:
    'A Sentry Release resource, as returned by the create-release endpoint.',
});

/** Guardian schema that validates a {@link ReleaseSchema}. */
export const ReleaseSchemaObject: BaseGuardian<ReleaseSchema> = _releaseSchema;
