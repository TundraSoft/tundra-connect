import { type BaseGuardian, Guardian } from '@guardian';

/** A warning EIA attached to a response, e.g. `incomplete return`. */
export type EIAWarningSchema = {
  /** Short label. */
  warning: string;
  /** Explanation. */
  description?: string;
} & Record<string, unknown>;

/**
 * One data row. Keys are the route's facets and columns exactly as EIA
 * names them (`period`, `series`, `series-description`, `value`, `units`,
 * `duoarea`, ...). Values are kept as sent: EIA sends most numbers as
 * strings (`"99.64"`), and a missing value as `null`. Nothing is parsed or
 * rounded, so a revised figure can be compared exactly.
 */
export type EIARowSchema = {
  /** The period the row covers, in the response's `dateFormat` (`2026-11-03`, `2026-10`, `2026`). */
  period: string;
} & Record<string, string | number | null>;

/** The `request` echo every v2 response carries. */
export type EIARequestEchoSchema = {
  /** Route that answered, e.g. `/v2/petroleum/pri/spt/data/`. */
  command: string;
  /** The parameters as EIA understood them. */
  params: unknown;
} & Record<string, unknown>;

/** A `.../data/` response: rows plus all of EIA's metadata. */
export type EIADataResponseSchema = {
  response: {
    /** Rows matching the query across all pages (EIA sends it as a string). */
    total: string | number;
    /** Format of `period`, e.g. `YYYY-MM-DD`. */
    dateFormat?: string;
    /** Frequency of the rows, e.g. `daily`. */
    frequency?: string;
    /** This page's rows, in EIA's order. */
    data: EIARowSchema[];
    /** Route description, when EIA includes it. */
    description?: string;
  } & Record<string, unknown>;
  /** The request as EIA parsed it. */
  request: EIARequestEchoSchema;
  /** EIA API version, e.g. `2.1.14`. */
  apiVersion: string;
  /** Warnings, e.g. that the 5,000-row cap truncated the result. */
  warnings?: EIAWarningSchema[];
} & Record<string, unknown>;

/** A child route of a route listing. */
export type EIAChildRouteSchema = {
  id: string;
  name?: string;
  description?: string;
} & Record<string, unknown>;

/** A frequency a data route offers. */
export type EIAFrequencySchema = {
  /** `daily`, `weekly`, `monthly`, `annual`, ... */
  id: string;
  description?: string;
  /** Short code, e.g. `D`. */
  query?: string;
  /** Period format, e.g. `YYYY-MM-DD`. */
  format?: string;
} & Record<string, unknown>;

/** A facet a data route can be filtered by. */
export type EIAFacetSchema = {
  id: string;
  description?: string;
} & Record<string, unknown>;

/**
 * Metadata for a route (`/v2/<route>/`): either a branch with child
 * `routes`, or a data route with its `frequency`, `facets`, `data` columns
 * and period range.
 */
export type EIARouteSchema = {
  response: {
    id: string;
    name?: string;
    description?: string;
    /** Child routes (branch routes). */
    routes?: EIAChildRouteSchema[];
    /** Frequencies (data routes). */
    frequency?: EIAFrequencySchema[];
    /** Facets (data routes). */
    facets?: EIAFacetSchema[];
    /** Data columns, keyed by name (data routes). */
    data?: unknown;
    /** First period available. */
    startPeriod?: string;
    /** Last period available — the latest release. */
    endPeriod?: string;
    defaultDateFormat?: string;
    defaultFrequency?: string;
  } & Record<string, unknown>;
  request: EIARequestEchoSchema;
  apiVersion: string;
  warnings?: EIAWarningSchema[];
} & Record<string, unknown>;

/** One value a facet can take. */
export type EIAFacetValueSchema = {
  /** The value to filter by, e.g. `RWTC`. */
  id: string;
  /** Its label. */
  name?: string;
  alias?: string;
} & Record<string, unknown>;

/** `/v2/<route>/facet/<facet>/`: every value of one facet. */
export type EIAFacetValuesSchema = {
  response: {
    totalFacets: number | string;
    facets: EIAFacetValueSchema[];
  } & Record<string, unknown>;
  request: EIARequestEchoSchema;
  apiVersion: string;
  warnings?: EIAWarningSchema[];
} & Record<string, unknown>;

const isCell = (v: unknown) =>
  v === null || typeof v === 'string' || typeof v === 'number';

/** One data row: `period` plus scalar columns. */
export const EIARowSchemaObject: BaseGuardian<EIARowSchema> = Guardian
  .unknown<EIARowSchema>().test(
    (v) =>
      typeof v === 'object' && v !== null && !Array.isArray(v) &&
      typeof (v as Record<string, unknown>).period === 'string' &&
      Object.values(v).every(isCell),
    'expected a row with a string period and scalar columns',
  );

/** A response warning. */
export const EIAWarningSchemaObject: BaseGuardian<EIAWarningSchema> = Guardian
  .object({
    warning: Guardian.string(),
    description: Guardian.string().optional(),
  }).passthrough() as BaseGuardian<EIAWarningSchema>;

const requestEcho: BaseGuardian<EIARequestEchoSchema> = Guardian.object({
  command: Guardian.string(),
  params: Guardian.unknown(),
}).passthrough() as BaseGuardian<EIARequestEchoSchema>;

const total = Guardian.unknown<string | number>().test(
  (v) => typeof v === 'string' || typeof v === 'number',
  'expected a number or numeric string',
);

/**
 * Validates a `.../data/` response.
 *
 * @example
 * ```ts
 * import { EIADataResponseSchemaObject } from '@tundraconnect/eia/schemas';
 *
 * declare const body: unknown;
 * const [error, page] = EIADataResponseSchemaObject.safeParse(body);
 * if (!error) console.log(page.response.total, page.response.data.length);
 * ```
 */
export const EIADataResponseSchemaObject: BaseGuardian<EIADataResponseSchema> =
  Guardian.object({
    response: Guardian.object({
      total,
      dateFormat: Guardian.string().optional(),
      frequency: Guardian.string().optional(),
      data: Guardian.array(EIARowSchemaObject),
      description: Guardian.string().optional(),
    }).passthrough(),
    request: requestEcho,
    apiVersion: Guardian.string(),
    warnings: Guardian.array(EIAWarningSchemaObject).optional(),
  }).passthrough().describe({
    title: 'EIA data response',
    description: 'One page of rows from a v2 data route, with its metadata.',
  }) as BaseGuardian<EIADataResponseSchema>;

const named = Guardian.object({
  id: Guardian.string(),
  name: Guardian.string().optional(),
  description: Guardian.string().optional(),
}).passthrough();

/**
 * Validates route metadata.
 *
 * @example
 * ```ts
 * import { EIARouteSchemaObject } from '@tundraconnect/eia/schemas';
 *
 * declare const body: unknown;
 * const [error, route] = EIARouteSchemaObject.safeParse(body);
 * if (!error) console.log(route.response.endPeriod);
 * ```
 */
export const EIARouteSchemaObject: BaseGuardian<EIARouteSchema> = Guardian
  .object({
    response: Guardian.object({
      id: Guardian.string(),
      name: Guardian.string().optional(),
      description: Guardian.string().optional(),
      routes: Guardian.array(named).optional(),
      frequency: Guardian.array(
        Guardian.object({
          id: Guardian.string(),
          description: Guardian.string().optional(),
          query: Guardian.string().optional(),
          format: Guardian.string().optional(),
        }).passthrough(),
      ).optional(),
      facets: Guardian.array(
        Guardian.object({
          id: Guardian.string(),
          description: Guardian.string().optional(),
        }).passthrough(),
      ).optional(),
      data: Guardian.unknown().optional(),
      startPeriod: Guardian.string().optional(),
      endPeriod: Guardian.string().optional(),
      defaultDateFormat: Guardian.string().optional(),
      defaultFrequency: Guardian.string().optional(),
    }).passthrough(),
    request: requestEcho,
    apiVersion: Guardian.string(),
    warnings: Guardian.array(EIAWarningSchemaObject).optional(),
  }).passthrough().describe({
    title: 'EIA route metadata',
    description:
      "Child routes, or a data route's frequencies, facets, columns and period range.",
  }) as BaseGuardian<EIARouteSchema>;

/**
 * Validates a facet-values response.
 *
 * @example
 * ```ts
 * import { EIAFacetValuesSchemaObject } from '@tundraconnect/eia/schemas';
 *
 * declare const body: unknown;
 * const [error, values] = EIAFacetValuesSchemaObject.safeParse(body);
 * if (!error) console.log(values.response.facets.map((f) => f.id));
 * ```
 */
export const EIAFacetValuesSchemaObject: BaseGuardian<EIAFacetValuesSchema> =
  Guardian.object({
    response: Guardian.object({
      totalFacets: total,
      facets: Guardian.array(
        Guardian.object({
          id: Guardian.string(),
          name: Guardian.string().optional(),
          alias: Guardian.string().optional(),
        }).passthrough(),
      ),
    }).passthrough(),
    request: requestEcho,
    apiVersion: Guardian.string(),
    warnings: Guardian.array(EIAWarningSchemaObject).optional(),
  }).passthrough().describe({
    title: 'EIA facet values',
    description: 'Every value one facet of a data route can take.',
  }) as BaseGuardian<EIAFacetValuesSchema>;

/** EIA's error body, in either of its two shapes. */
export type EIAErrorBodySchema = {
  /** `{ code, message }` from the API gateway, or a plain message from the API. */
  error?: string | { code?: string; message?: string };
  /** HTTP status echoed by the API. */
  code?: number | string;
};

/**
 * Validates EIA's error body loosely, so a proxy's error page still maps
 * by status.
 *
 * @example
 * ```ts
 * import { EIAErrorBodySchemaObject } from '@tundraconnect/eia/schemas';
 *
 * const [, body] = EIAErrorBodySchemaObject.safeParse({ error: 'Not found.', code: 404 });
 * console.log(body?.error);
 * ```
 */
export const EIAErrorBodySchemaObject: BaseGuardian<EIAErrorBodySchema> =
  Guardian.object({
    error: Guardian.unknown<string | { code?: string; message?: string }>()
      .test(
        (v) => typeof v === 'string' || (typeof v === 'object' && v !== null),
        'expected a string or an object',
      ).optional(),
    code: Guardian.unknown<number | string>().test(
      (v) => typeof v === 'string' || typeof v === 'number',
      'expected a number or string',
    ).optional(),
  }) as BaseGuardian<EIAErrorBodySchema>;
