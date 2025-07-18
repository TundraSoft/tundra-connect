import { Guardian, type GuardianType } from '$guardian';

/**
 * Schema for OpenExchange API currencies response
 *
 * This schema validates the response from the /currencies.json endpoint,
 * which returns a mapping of currency codes to their full names.
 * Currency codes follow the ISO 4217 standard (3-letter codes).
 *
 * @example
 * ```typescript
 * const currenciesData = {
 *   "USD": "United States Dollar",
 *   "EUR": "Euro",
 *   "GBP": "British Pound Sterling",
 *   "JPY": "Japanese Yen",
 *   "CAD": "Canadian Dollar"
 * };
 *
 * const [error, validatedCurrencies] = CurrenciesSchemaObject.validate(currenciesData);
 * if (!error) {
 *   console.log('USD full name:', validatedCurrencies.USD);
 * }
 * ```
 */
export const CurrenciesSchemaObject = Guardian.object().keyValue(
  Guardian.string().minLength(3).maxLength(3), // Currency codes are typically 3-letter ISO codes
  Guardian.string().notEmpty(), // Currency names are non-empty strings
);

/** Type definition for OpenExchange API currencies mapping */
export type CurrenciesSchema = GuardianType<typeof CurrenciesSchemaObject>;
