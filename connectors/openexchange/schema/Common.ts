import { type BaseGuardian, Guardian } from '@guardian';

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
 * const customSchema = Guardian.object({
 *   timestamp: timestampGuard,
 *   base: baseGuard,
 *   rates: RateSchemaObject
 * });
 * ```
 */

// Individual guard variables for reusability across different schemas

/** Validates disclaimer text (minimum 5 characters) */
export const disclaimerGuard: BaseGuardian<string> = Guardian.string()
  .minLength(5);

/** Validates license text (minimum 5 characters) */
export const licenseGuard: BaseGuardian<string> = Guardian.string()
  .minLength(5);

/** Validates Unix timestamp (non-negative integer) */
export const timestampGuard: BaseGuardian<number> = Guardian.number().min(0);

/** Validates ISO 4217 currency codes (exactly 3 characters) */
export const baseGuard: BaseGuardian<string> = Guardian.string().minLength(3)
  .maxLength(3);

/** Validates date strings in YYYY-MM-DD format */
export const startDateGuard: BaseGuardian<string> = Guardian.string(); // YYYY-MM-DD format

/** Validates date strings in YYYY-MM-DD format */
export const endDateGuard: BaseGuardian<string> = Guardian.string(); // YYYY-MM-DD format

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
 * const [error, validatedRates] = RateSchemaObject.safeParse(ratesData);
 * if (!error) {
 *   console.log('USD to EUR rate:', validatedRates.EUR);
 * }
 * ```
 */
export type RateSchema = Record<string, number>;

/** Schema for currency exchange rates (see {@link RateSchema}). */
export const RateSchemaObject: BaseGuardian<RateSchema> = Guardian.record(
  Guardian.string().minLength(3).maxLength(3), // Currency codes are typically 3-letter ISO codes
  Guardian.number().positive(), // Currency rates are positive numbers
).describe({
  title: 'Exchange rates',
  description: 'A mapping of ISO 4217 currency codes to positive rates.',
});
