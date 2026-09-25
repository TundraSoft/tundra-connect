import { type BaseGuardian, Guardian } from '@guardian';

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
 * const [error, validatedCurrencies] = CurrenciesSchemaObject.safeParse(currenciesData);
 * if (!error) {
 *   console.log('USD full name:', validatedCurrencies.USD);
 * }
 * ```
 */
export type CurrenciesSchema = Record<string, string>;

/** Schema for OpenExchange API currencies response (see {@link CurrenciesSchema}). */
export const CurrenciesSchemaObject: BaseGuardian<CurrenciesSchema> = Guardian
  .record(
    Guardian.string().minLength(3).maxLength(3), // Currency codes are typically 3-letter ISO codes
    Guardian.string().notEmpty(), // Currency names are non-empty strings
  ).describe({
    title: 'Currencies response',
    description: 'A mapping of ISO 4217 currency codes to display names.',
  });
