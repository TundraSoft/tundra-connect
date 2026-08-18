import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';

/**
 * `version` may not be `.`/`..`, contain a forward slash, or contain
 * whitespace/control characters (newline, tab, form feed, NUL) — see
 * https://docs.sentry.io/api/releases/create-a-new-release-for-an-organization/.
 * The NUL check is a plain `.includes()` rather than folded into this
 * regex, so the pattern doesn't trip `no-control-regex`.
 */
const RELEASE_VERSION_INVALID_CHARS = /[\r\n\f\t/]/;

/**
 * Schema for {@link Sentry.createRelease} request options — body fields
 * accepted by `POST /organizations/{org}/releases/`
 * (https://docs.sentry.io/api/releases/create-a-new-release-for-an-organization/).
 * `version` and `projects` are required; everything else is optional.
 *
 * @example
 * ```typescript
 * import { CreateReleaseRequestSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, options] = CreateReleaseRequestSchemaObject.safeParse({
 *   version: 'frontend@1.0.0',
 *   projects: ['frontend'],
 *   ref: 'abc123',
 * });
 * ```
 */
type _CreateReleaseRequestShape = {
  version: string;
  projects: string[];
  ref?: string;
  url?: string;
  dateReleased?: string;
  commits?: Array<{
    id: string;
    repository?: string;
    message?: string;
    author_name?: string;
    author_email?: string;
    patch_set?: unknown[];
  }>;
  refs?: Array<{
    repository: string;
    commit: string;
    previousCommit?: string;
  }>;
};

const _createReleaseRequestSchema: BaseGuardian<_CreateReleaseRequestShape> =
  Guardian.object({
    /** Version identifier for this release (a version number, a commit hash, ...). Max 200 characters. */
    version: Guardian.string().minLength(1).maxLength(200).refine(
      (value) =>
        value !== '.' && value !== '..' && !value.includes('\0') &&
        !RELEASE_VERSION_INVALID_CHARS.test(value),
      "version must not be '.', '..', contain '/', or contain whitespace/control characters",
    ),
    /** Slugs of the projects involved in this release. */
    projects: Guardian.array(Guardian.string().minLength(1)).minLength(1),
    /** VCS ref (e.g. a git commit SHA) this release points to. */
    ref: Guardian.string().minLength(1).optional(),
    /** URL associated with this release (e.g. a build/CI link). */
    url: Guardian.string().url().optional(),
    /** ISO 8601 timestamp this release was deployed. */
    dateReleased: Guardian.string().minLength(1).optional(),
    /** Commits to associate with this release. */
    commits: Guardian.array(
      Guardian.object({
        /** Commit SHA/hash. */
        id: Guardian.string().minLength(1),
        /** Repository name, when more than one repository is linked. */
        repository: Guardian.string().optional(),
        /** Commit message. */
        message: Guardian.string().optional(),
        /** Commit author's name. */
        author_name: Guardian.string().optional(),
        /** Commit author's email. */
        author_email: Guardian.string().optional(),
        /** File-level patch operations for this commit. */
        patch_set: Guardian.array(Guardian.unknown()).optional(),
      }).passthrough(),
    ).optional(),
    /** VCS refs to associate with this release, as an alternative to `commits`. */
    refs: Guardian.array(
      Guardian.object({
        /** Repository name. */
        repository: Guardian.string().minLength(1),
        /** Commit SHA/hash this ref points to. */
        commit: Guardian.string().minLength(1),
        /** Commit SHA/hash of the previous release in this repository, when known. */
        previousCommit: Guardian.string().optional(),
      }).passthrough(),
    ).optional(),
  }).describe({
    title: 'Create release request',
    description:
      'Body fields accepted by Sentry.createRelease(), validated before the API call.',
  });

/** Type definition for {@link Sentry.createRelease} request options. */
export type CreateReleaseRequestSchema = GuardianInfer<
  typeof _createReleaseRequestSchema
>;

export const CreateReleaseRequestSchemaObject: BaseGuardian<
  CreateReleaseRequestSchema
> = _createReleaseRequestSchema;
