import { Guardian, type GuardianType } from '$guardian';
import {
  disclaimerGuard,
  historicalGuard,
  licenseGuard,
  startDateGuard,
} from './Common.ts';

/**
 * Schema for OpenExchange API currency conversion response
 *
 * This schema validates the response from the /convert.json endpoint,
 * which converts a specific amount from one currency to another.
 * The response includes conversion details, exchange rate information,
 * and the final converted amount.
 *
 * @example
 * ```typescript
 * const convertData = {
 *   disclaimer: "Usage subject to terms...",
 *   license: "https://openexchangerates.org/license",
 *   query: {
 *     from: "USD",
 *     to: "EUR",
 *     amount: 100
 *   },
 *   info: {
 *     rate: 0.883
 *   },
 *   historical: false,
 *   date: "2023-01-01",
 *   result: 88.3
 * };
 *
 * const [error, validatedConversion] = ConvertRequestSchemaObject.validate(convertData);
 * if (!error) {
 *   console.log('Converted amount:', validatedConversion.result);
 *   console.log('Exchange rate:', validatedConversion.info.rate);
 *   console.log('From:', validatedConversion.query.from, 'To:', validatedConversion.query.to);
 * }
 * ```
 */
export const ConvertRequestSchemaObject = Guardian.object().schema({
  /** Legal disclaimer text (optional) */
  disclaimer: disclaimerGuard.optional(),
  /** License information URL (optional) */
  license: licenseGuard.optional(),
  /** Conversion query parameters */
  query: Guardian.object().schema({
    /** Source currency code */
    from: Guardian.string(),
    /** Target currency code */
    to: Guardian.string(),
    /** Amount to convert (non-negative) */
    amount: Guardian.number().min(0),
  }),
  /** Exchange rate information */
  info: Guardian.object().schema({
    /** Exchange rate used for conversion */
    rate: Guardian.number().min(0),
  }),
  /** Flag indicating if historical rates were used (optional) */
  historical: historicalGuard.optional(),
  /** Date for the conversion (YYYY-MM-DD format, optional) */
  date: startDateGuard.optional(), // YYYY-MM-DD format
  /** Final converted amount (main result) */
  result: Guardian.number().min(0), // Main focus: conversion result
});

/** Type definition for OpenExchange API currency conversion response */
export type ConvertRequestSchema = GuardianType<
  typeof ConvertRequestSchemaObject
>;
