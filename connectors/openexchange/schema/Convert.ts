import { type BaseGuardian, Guardian } from '@guardian';
import { disclaimerGuard, licenseGuard, timestampGuard } from './Common.ts';

/**
 * Schema for OpenExchange API currency conversion response
 *
 * This schema validates the response from the `/convert/{value}/{from}/{to}`
 * endpoint, which converts a specific amount from one currency to another.
 * The response echoes the request parameters, includes the exchange-rate
 * metadata used for the conversion, and the final converted amount.
 *
 * @example
 * ```typescript
 * const convertData = {
 *   disclaimer: "Usage subject to terms...",
 *   license: "https://openexchangerates.org/license",
 *   request: {
 *     query: "100.0 USD => EUR",
 *     amount: 100,
 *     from: "USD",
 *     to: "EUR"
 *   },
 *   meta: {
 *     timestamp: 1640995200,
 *     rate: 0.883
 *   },
 *   response: 88.3
 * };
 *
 * const [error, validatedConversion] = ConvertRequestSchemaObject.safeParse(convertData);
 * if (!error) {
 *   console.log('Converted amount:', validatedConversion.response);
 *   console.log('Exchange rate:', validatedConversion.meta.rate);
 *   console.log('From:', validatedConversion.request.from, 'To:', validatedConversion.request.to);
 * }
 * ```
 */
export type ConvertRequestSchema = {
  /** Legal disclaimer text (optional) */
  disclaimer?: string;
  /** License information URL (optional) */
  license?: string;
  /** Echoed request parameters */
  request: {
    /** Human-readable description of the conversion query */
    query: string;
    /** Amount that was converted (non-negative) */
    amount: number;
    /** Source currency code */
    from: string;
    /** Target currency code */
    to: string;
  };
  /** Metadata about the exchange rate used for the conversion */
  meta: {
    /** Unix timestamp of the exchange rate used */
    timestamp: number;
    /** Exchange rate used for conversion */
    rate: number;
  };
  /** Final converted amount (main result) */
  response: number;
};

/** Schema for OpenExchange API currency conversion response (see {@link ConvertRequestSchema}). */
export const ConvertRequestSchemaObject: BaseGuardian<ConvertRequestSchema> =
  Guardian.object({
    /** Legal disclaimer text (optional) */
    disclaimer: disclaimerGuard.optional(),
    /** License information URL (optional) */
    license: licenseGuard.optional(),
    /** Echoed request parameters */
    request: Guardian.object({
      /** Human-readable description of the conversion query */
      query: Guardian.string(),
      /** Amount that was converted (non-negative) */
      amount: Guardian.number().min(0),
      /** Source currency code */
      from: Guardian.string(),
      /** Target currency code */
      to: Guardian.string(),
    }),
    /** Metadata about the exchange rate used for the conversion */
    meta: Guardian.object({
      /** Unix timestamp of the exchange rate used */
      timestamp: timestampGuard,
      /** Exchange rate used for conversion */
      rate: Guardian.number().min(0),
    }),
    /** Final converted amount (main result) */
    response: Guardian.number().min(0), // Main focus: conversion result
  }).describe({
    title: 'Conversion response',
    description: 'Response returned by the OpenExchange conversion endpoint.',
  });
