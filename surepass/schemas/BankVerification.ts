import { Guardian, type GuardianType } from '$guardian';

/**
 * Schema for Surepass bank account verification response
 *
 * Validates the response from the bank verification API endpoint which verifies
 * bank account details using account number and IFSC code, returning account
 * holder information and comprehensive bank details.
 *
 * @example
 * ```typescript
 * const response = {
 *   client_id: 'client-123',
 *   account_exists: true,
 *   full_name: 'John Doe',
 *   status: 'VALID',
 *   ifsc_details: {
 *     ifsc: 'SBIN0000123',
 *     bank_name: 'State Bank of India',
 *     branch: 'Main Branch',
 *     // ... other IFSC details
 *   }
 * };
 *
 * const [error, result] = SurepassBankVerificationSchema.validate(response);
 * if (!error) {
 *   console.log('Account verified:', result.account_exists);
 * }
 * ```
 */
export const SurepassBankVerificationSchema = Guardian.object().schema({
  /** Unique client identifier for the request */
  client_id: Guardian.string(),
  /** Whether the bank account exists */
  account_exists: Guardian.boolean(),
  /** UPI ID associated with the account (optional) */
  upi_id: Guardian.string().optional(),
  /** Full name of the account holder */
  full_name: Guardian.string(),
  /** IMPS reference number (optional) */
  imps_ref_no: Guardian.string().optional(),
  /** Additional remarks (optional) */
  remarks: Guardian.string().optional(),
  /** Verification status */
  status: Guardian.string(),
  /** Detailed IFSC and bank information */
  ifsc_details: Guardian.object().schema({
    /** Unique ID for the IFSC record */
    id: Guardian.number(),
    /** IFSC code */
    ifsc: Guardian.string(),
    /** MICR code */
    micr: Guardian.string(),
    /** ISO 3166 country code */
    iso3166: Guardian.string(),
    /** SWIFT code (optional) */
    swift: Guardian.string().optional(),
    /** Bank short code */
    bank: Guardian.string(),
    /** Bank code */
    bank_code: Guardian.string(),
    /** Full bank name */
    bank_name: Guardian.string(),
    /** Branch name */
    branch: Guardian.string(),
    /** Banking centre */
    centre: Guardian.string(),
    /** District */
    district: Guardian.string(),
    /** State */
    state: Guardian.string(),
    /** City */
    city: Guardian.string(),
    /** Branch address */
    address: Guardian.string(),
    /** Contact information (optional) */
    contact: Guardian.string().optional(),
    /** IMPS enabled flag */
    imps: Guardian.boolean(),
    /** RTGS enabled flag */
    rtgs: Guardian.boolean(),
    /** NEFT enabled flag */
    neft: Guardian.boolean(),
    /** UPI enabled flag */
    /** UPI enabled flag */
    upi: Guardian.boolean(),
    /** MICR check flag */
    micr_check: Guardian.boolean(),
  }),
});

/**
 * Type definition for Surepass bank verification response
 */
export type SurepassBankVerification = GuardianType<
  typeof SurepassBankVerificationSchema
>;
