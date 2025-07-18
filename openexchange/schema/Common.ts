import {
  BooleanGuardian,
  Guardian,
  GuardianProxy,
  type GuardianType,
  NumberGuardian,
  ObjectGuardian,
  StringGuardian,
} from '$guardian';

/**
 * Common schema components for OpenExchange API responses
 *
 * This module provides reusable Guardian validation components that are used
 * across multiple OpenExchange API endpoint schemas. These components help
 * ensure consistent validation and reduce code duplication.
 *
 * @example
 * ```typescript
 * import { timestampGuard, baseGuard, RateSchemaObject } from './Common.ts';
 *
 * // Use individual guards in custom schemas
 * const customSchema = Guardian.object().schema({
 *   timestamp: timestampGuard,
 *   base: baseGuard,
 *   rates: RateSchemaObject
 * });
 * ```
 */

// Individual guard variables for reusability across different schemas

/** Validates disclaimer text (minimum 5 characters) */
export const disclaimerGuard: GuardianProxy<StringGuardian> = Guardian.string()
  .minLength(5);

/** Validates license text (minimum 5 characters) */
export const licenseGuard: GuardianProxy<StringGuardian> = Guardian.string()
  .minLength(5);

/** Validates Unix timestamp (non-negative integer) */
export const timestampGuard: GuardianProxy<NumberGuardian> = Guardian.number()
  .min(0);

/** Validates ISO 4217 currency codes (exactly 3 characters) */
export const baseGuard: GuardianProxy<StringGuardian> = Guardian.string()
  .minLength(3).maxLength(3);

/** Validates date strings in YYYY-MM-DD format */
export const startDateGuard: GuardianProxy<StringGuardian> = Guardian.string(); // YYYY-MM-DD format

/** Validates date strings in YYYY-MM-DD format */
export const endDateGuard: GuardianProxy<StringGuardian> = Guardian.string(); // YYYY-MM-DD format

/** Validates boolean flag for historical data */
export const historicalGuard: GuardianProxy<BooleanGuardian> = Guardian
  .boolean();

/**
 * Schema for currency exchange rates
 *
 * This schema validates a mapping of currency codes to their exchange rates.
 * Currency codes are ISO 4217 three-letter codes (e.g., USD, EUR, GBP),
 * and rates are positive decimal numbers representing the exchange rate
 * relative to the base currency.
 *
 * @example
 * ```typescript
 * const ratesData = {
 *   "USD": 1.0,
 *   "EUR": 0.85,
 *   "GBP": 0.73,
 *   "JPY": 110.25
 * };
 *
 * const [error, validatedRates] = RateSchemaObject.validate(ratesData);
 * if (!error) {
 *   console.log('USD to EUR rate:', validatedRates.EUR);
 * }
 * ```
 */
export const RateSchemaObject: GuardianProxy<
  ObjectGuardian<{ [key: string]: number }>
> = Guardian.object().keyValue(
  Guardian.string().minLength(3).maxLength(3), // Currency codes are typically 3-letter ISO codes
  Guardian.number().positive(), // Currency rates are positive numbers
);

/** Type definition for currency exchange rates mapping */
export type RateSchema = GuardianType<typeof RateSchemaObject>;
