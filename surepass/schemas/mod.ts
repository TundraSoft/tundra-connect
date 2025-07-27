/**
 * @fileoverview Surepass KYC API Client - Schema Exports
 *
 * This module exports all Guardian schema definitions and TypeScript types
 * used for validating API responses from the Surepass KYC service. Each schema
 * provides runtime validation and type safety for different verification endpoints.
 *
 * Available schemas:
 * - Aadhaar verification (initiate + complete)
 * - Bank account verification
 * - PAN comprehensive verification
 * - Company/CIN details
 * - GSTIN details
 * - Name matching
 * - Base API response
 *
 * @example
 * ```typescript
 * import { SurepassPanComprehensiveSchema, type SurepassPanComprehensive } from './schemas/mod.ts';
 *
 * // Validate API response
 * const [error, result] = SurepassPanComprehensiveSchema.validate(apiResponse);
 * if (!error) {
 *   console.log('Valid PAN:', result.pan_details.full_name);
 * }
 * ```
 */

export {
  type SurepassAadhaarVerification,
  SurepassAadhaarVerificationSchema,
  type SurepassInitiateAadhaarVerification,
  SurepassInitiateAadhaarVerificationSchema,
} from './AadhaarVerification.ts';
export {
  type SurepassBankVerification,
  SurepassBankVerificationSchema,
} from './BankVerification.ts';
export {
  type SurepassCompanyDetails,
  SurepassCompanyDetailsSchema,
} from './CompanyDetails.ts';
export {
  type SurepassGSTINDetails,
  SurepassGSTINDetailsSchema,
} from './GSTINDetails.ts';
export {
  type SurepassNameMatch,
  SurepassNameMatchSchema,
} from './NameMatch.ts';
export {
  type SurepassPanComprehensive,
  SurepassPanComprehensiveSchema,
} from './PanComprehensive.ts';
export { type SurepassResponse, SurepassResponseSchema } from './Response.ts';
