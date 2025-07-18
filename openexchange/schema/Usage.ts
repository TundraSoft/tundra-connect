import { Guardian, type GuardianType } from '$guardian';

/**
 * Schema for OpenExchange API status information
 *
 * This schema validates the status information returned by the OpenExchange API,
 * including app ID, status, plan details, and feature availability.
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
 *   }
 * };
 *
 * const [error, validatedStatus] = StatusSchemaObject.validate(statusData);
 * ```
 */
export const StatusSchemaObject = Guardian.object().schema({
  /** Application ID for the API client */
  app_id: Guardian.string(),
  /** Current status of the application (ACTIVE or INACTIVE) */
  status: Guardian.string().upperCase().in(['ACTIVE', 'INACTIVE']),
  /** Plan information and features */
  plan: Guardian.object().schema({
    /** Name of the current plan */
    name: Guardian.string(),
    /** Request quota description */
    quota: Guardian.string(),
    /** How frequently the data is updated */
    update_frequency: Guardian.string(),
    /** Available features for the current plan */
    features: Guardian.object().schema({
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
});

/** Type definition for OpenExchange API status information */
export type StatusSchema = GuardianType<typeof StatusSchemaObject>;

/**
 * Schema for OpenExchange API usage statistics
 *
 * This schema validates the usage statistics returned by the OpenExchange API,
 * including request counts, quotas, and daily averages.
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
 * const [error, validatedUsage] = UsageSchemaObject.validate(usageData);
 * ```
 */
export const UsageSchemaObject = Guardian.object().schema({
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
});

/** Type definition for OpenExchange API usage statistics */
export type UsageSchema = GuardianType<typeof UsageSchemaObject>;

/**
 * Schema for the complete OpenExchange API status response
 *
 * This schema validates the complete response from the /status.json endpoint,
 * including HTTP status, status data, and usage statistics.
 *
 * @example
 * ```typescript
 * const statusResponse = {
 *   status: 200,
 *   data: {
 *     app_id: "your-app-id",
 *     status: "ACTIVE",
 *     plan: { ... }
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
 * const [error, validatedResponse] = UsageResponseSchemaObject.validate(statusResponse);
 * ```
 */
export const UsageResponseSchemaObject = Guardian.object().schema({
  /** HTTP status code of the response */
  status: Guardian.number(),
  /** Status information about the API client */
  data: StatusSchemaObject,
  /** Usage statistics for the API client */
  usage: UsageSchemaObject,
});

/** Type definition for the complete OpenExchange API status response */
export type UsageResponseSchema = GuardianType<
  typeof UsageResponseSchemaObject
>;
