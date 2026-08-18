import { type BaseGuardian, Guardian, type GuardianInfer } from '@guardian';

/**
 * Schema for a Sentry Project resource, as returned by
 * {@link Sentry.listProjects}
 * (https://docs.sentry.io/api/organizations/list-an-organizations-projects/).
 *
 * Models the commonly-present fields; Sentry documents several more
 * (`teams`, `environments`, `hasAccess`, `hasMonitors`, ...) that vary by
 * plan/feature flags, so the schema `.passthrough()`es rather than
 * exhaustively modelling every one of them.
 *
 * @example
 * ```typescript
 * import { ProjectSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * const [error, project] = ProjectSchemaObject.safeParse({
 *   id: '2',
 *   slug: 'pump-station',
 *   name: 'Pump Station',
 *   platform: 'python',
 *   dateCreated: '2018-11-06T21:19:55Z',
 *   isBookmarked: false,
 *   isMember: true,
 * });
 * if (!error) {
 *   console.log('Project:', project.slug);
 * }
 * ```
 */
type _ProjectShape = {
  id: string;
  slug: string;
  name: string;
  platform?: string | null;
  platforms?: string[];
  dateCreated: string;
  isBookmarked?: boolean;
  isMember?: boolean;
  features?: string[];
  firstEvent?: string | null;
};

const _projectSchema: BaseGuardian<_ProjectShape> = Guardian.object({
  /** Project ID. */
  id: Guardian.string(),
  /** Project slug, used in API paths. */
  slug: Guardian.string(),
  /** Project display name. */
  name: Guardian.string(),
  /** Primary platform identifier (e.g. `python`, `javascript-react`). */
  platform: Guardian.string().nullable().optional(),
  /** All platforms seen across events in this project. */
  platforms: Guardian.array(Guardian.string()).optional(),
  /** ISO 8601 timestamp the project was created. */
  dateCreated: Guardian.string(),
  /** Whether the requesting user has bookmarked this project. */
  isBookmarked: Guardian.boolean().optional(),
  /** Whether the requesting user is a member of this project's team(s). */
  isMember: Guardian.boolean().optional(),
  /** Enabled feature flags for this project (e.g. `"releases"`). */
  features: Guardian.array(Guardian.string()).optional(),
  /** ISO 8601 timestamp of the first event ever received; `null` if none yet. */
  firstEvent: Guardian.string().nullable().optional(),
}).passthrough().describe({
  title: 'Project resource',
  description:
    "A Sentry Project resource, as returned by an organization's projects list.",
});

/** Type definition for {@link ProjectSchemaObject}. */
export type ProjectSchema = GuardianInfer<typeof _projectSchema>;

export const ProjectSchemaObject: BaseGuardian<ProjectSchema> = _projectSchema;
