/**
 * Guardian schemas behind `@tundraconnect/sentry`: every request and response
 * shape the client validates, each exported as a schema object with its
 * inferred TypeScript type. Use them to validate a payload you stored or
 * received elsewhere (a webhook body, a cached response), or to type your own
 * code against the client's shapes.
 *
 * @example
 * ```ts
 * import { IssueSchemaObject } from '@tundraconnect/sentry/schemas';
 *
 * declare const body: unknown; // e.g. a stored or forwarded payload
 * const [error, value] = IssueSchemaObject.safeParse(body);
 * if (error) console.error(error.message);
 * else console.log(value);
 * ```
 *
 * @module
 */

export {
  ISSUE_SORT_OPTIONS,
  ISSUE_STATUSES,
  ISSUE_SUBSTATUSES,
  type IssueProjectRefSchema,
  IssueProjectRefSchemaObject,
  PRIORITIES,
} from './Common.ts';
export { type ErrorSchema, ErrorSchemaObject } from './Error.ts';
export { type ProjectSchema, ProjectSchemaObject } from './Project.ts';
export {
  type ListProjectsRequestSchema,
  ListProjectsRequestSchemaObject,
  type ListProjectsResponseSchema,
  ListProjectsResponseSchemaObject,
} from './ListProjects.ts';
export { type IssueSchema, IssueSchemaObject } from './Issue.ts';
export {
  type ListIssuesRequestSchema,
  ListIssuesRequestSchemaObject,
  type ListIssuesResponseSchema,
  ListIssuesResponseSchemaObject,
} from './ListIssues.ts';
export {
  type UpdateIssueRequestSchema,
  UpdateIssueRequestSchemaObject,
} from './UpdateIssue.ts';
export { type IssueEventSchema, IssueEventSchemaObject } from './IssueEvent.ts';
export {
  type ListIssueEventsRequestSchema,
  ListIssueEventsRequestSchemaObject,
  type ListIssueEventsResponseSchema,
  ListIssueEventsResponseSchemaObject,
} from './ListIssueEvents.ts';
export { type ReleaseSchema, ReleaseSchemaObject } from './Release.ts';
export {
  type CreateReleaseRequestSchema,
  CreateReleaseRequestSchemaObject,
} from './CreateRelease.ts';
