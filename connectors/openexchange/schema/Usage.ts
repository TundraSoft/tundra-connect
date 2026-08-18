import { type BaseGuardian, Guardian } from '@guardian';

/**
 * Schema for OpenExchange API usage statistics
 *
 * This schema validates the usage statistics returned by the OpenExchange API,
 * including request counts, quotas, and daily averages. It is nested inside
 * the `data` object of the `/usage.json` response.
 *
 * @example
 * ```typescript
 * const usageData = {
 *   requests: 42,
 *   requests_quota: 1000,
 *   requests_remaining: 958,
 *   days_elapsed: 15,
 *   days_remaining: 15,
 *   daily_average: 2.8
 * };
 *
 * const [error, validatedUsage] = UsageSchemaObject.safeParse(usageData);
 * ```
 */
export type UsageSchema = {
  /** Number of requests made in the current period */
  requests: number;
  /** Total request quota for the current period */
  requests_quota: number;
  /** Number of requests remaining in the current period */
  requests_remaining: number;
  /** Number of days elapsed in the current period */
  days_elapsed: number;
  /** Number of days remaining in the current period */
  days_remaining: number;
  /** Average daily request count */
  daily_average: number;
};

/** Schema for OpenExchange API usage statistics (see {@link UsageSchema}). */
export const UsageSchemaObject: BaseGuardian<UsageSchema> = Guardian.object({
  /** Number of requests made in the current period */
  requests: Guardian.number().min(0),
  /** Total request quota for the current period */
  requests_quota: Guardian.number().nonZero().min(0),
  /** Number of requests remaining in the current period */
  requests_remaining: Guardian.number().min(0),
  /** Number of days elapsed in the current period */
  days_elapsed: Guardian.number().min(0),
  /** Number of days remaining in the current period */
  days_remaining: Guardian.number().min(0),
  /** Average daily request count */
  daily_average: Guardian.number().min(0),
}).describe({
  title: 'Usage payload',
  description: 'OpenExchange request quota and usage statistics.',
});

/**
 * Schema for OpenExchange API status information
 *
 * This schema validates the status information returned by the OpenExchange API,
 * including app ID, status, plan details, feature availability, and the
 * account's request usage statistics.
 *
 * @example
 * ```typescript
 * const statusData = {
 *   app_id: "your-app-id",
 *   status: "ACTIVE",
 *   plan: {
 *     name: "Free",
 *     quota: "1,000 requests/month",
 *     update_frequency: "60 minutes",
 *     features: {
 *       base: true,
 *       symbols: true,
 *       experimental: false,
 *       "time-series": false,
 *       convert: false,
 *       "bid-ask": false,
 *       ohlc: false,
 *       spot: true
 *     }
 *   },
 *   usage: {
 *     requests: 42,
 *     requests_quota: 1000,
 *     requests_remaining: 958,
 *     days_elapsed: 15,
 *     days_remaining: 15,
 *     daily_average: 2.8
 *   }
 * };
 *
 * const [error, validatedStatus] = StatusSchemaObject.safeParse(statusData);
 * ```
 */
export type StatusSchema = {
  /** Application ID for the API client */
  app_id: string;
  /** Current status of the application (ACTIVE or INACTIVE) */
  status: string;
  /** Plan information and features */
  plan: {
    /** Name of the current plan */
    name: string;
    /** Request quota description */
    quota: string;
    /** How frequently the data is updated */
    update_frequency: string;
    /** Available features for the current plan */
    features: {
      /** Base currency conversion support */
      base: boolean;
      /** Symbol filtering support */
      symbols: boolean;
      /** Experimental features access */
      experimental: boolean;
      /** Time-series data access */
      'time-series': boolean;
      /** Currency conversion support */
      convert: boolean;
      /** Bid-ask spread data access */
      'bid-ask': boolean;
      /** OHLC data access */
      ohlc: boolean;
      /** Spot rates access */
      spot: boolean;
    };
  };
  /** Usage statistics for the API client */
  usage: UsageSchema;
};

/** Schema for OpenExchange API status information (see {@link StatusSchema}). */
export const StatusSchemaObject: BaseGuardian<StatusSchema> = Guardian.object(
  {
    /** Application ID for the API client */
    app_id: Guardian.string(),
    /** Current status of the application (ACTIVE or INACTIVE) */
    status: Guardian.string().toUpperCase().isIn(['ACTIVE', 'INACTIVE']),
    /** Plan information and features */
    plan: Guardian.object({
      /** Name of the current plan */
      name: Guardian.string(),
      /** Request quota description */
      quota: Guardian.string(),
      /** How frequently the data is updated */
      update_frequency: Guardian.string(),
      /** Available features for the current plan */
      features: Guardian.object({
        /** Base currency conversion support */
        base: Guardian.boolean(),
        /** Symbol filtering support */
        symbols: Guardian.boolean(),
        /** Experimental features access */
        experimental: Guardian.boolean(),
        /** Time-series data access */
        'time-series': Guardian.boolean(),
        /** Currency conversion support */
        convert: Guardian.boolean(),
        /** Bid-ask spread data access */
        'bid-ask': Guardian.boolean(),
        /** OHLC data access */
        ohlc: Guardian.boolean(),
        /** Spot rates access */
        spot: Guardian.boolean(),
      }),
    }),
    /** Usage statistics for the API client */
    usage: UsageSchemaObject,
  },
).describe({
  title: 'Status payload',
  description: 'OpenExchange application status, plan capabilities, and usage.',
});

/**
 * Schema for the complete OpenExchange API status response
 *
 * This schema validates the complete response from the `/usage.json` endpoint,
 * including the HTTP status and the nested status/usage `data` object.
 *
 * @example
 * ```typescript
 * const statusResponse = {
 *   status: 200,
 *   data: {
 *     app_id: "your-app-id",
 *     status: "ACTIVE",
 *     plan: { ... },
 *     usage: {
 *       requests: 42,
 *       requests_quota: 1000,
 *       requests_remaining: 958,
 *       days_elapsed: 15,
 *       days_remaining: 15,
 *       daily_average: 2.8
 *     }
 *   }
 * };
 *
 * const [error, validatedResponse] = UsageResponseSchemaObject.safeParse(statusResponse);
 * ```
 */
export type UsageResponseSchema = {
  /** HTTP status code of the response */
  status: number;
  /** Status information, plan capabilities, and usage statistics */
  data: StatusSchema;
};

/** Schema for the complete OpenExchange API status response (see {@link UsageResponseSchema}). */
export const UsageResponseSchemaObject: BaseGuardian<UsageResponseSchema> =
  Guardian.object({
    /** HTTP status code of the response */
    status: Guardian.number(),
    /** Status information, plan capabilities, and usage statistics */
    data: StatusSchemaObject,
  }).describe({
    title: 'Status response',
    description: 'Complete OpenExchange usage endpoint response.',
  });
