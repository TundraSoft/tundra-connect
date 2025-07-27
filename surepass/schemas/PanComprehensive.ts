import { Guardian, type GuardianType } from '$guardian';

/**
 * Schema for Surepass PAN comprehensive verification response
 *
 * Validates the response from the PAN verification API endpoint which performs
 * comprehensive verification of PAN numbers and returns detailed information
 * including personal details, address, and verification status.
 *
 * @example
 * ```typescript
 * const response = {
 *   client_id: 'client-123',
 *   pan_number: 'ABCDE1234F',
 *   pan_details: {
 *     full_name: 'JOHN DOE',
 *     dob: '1990-01-01',
 *     category: 'person',
 *     status: 'VALID',
 *     address: {
 *       city: 'Mumbai',
 *       state: 'Maharashtra',
 *       country: 'India'
 *     }
 *   }
 * };
 *
 * const [error, result] = SurepassPanComprehensiveSchema.validate(response);
 * if (!error) {
 *   console.log('PAN verified:', result.pan_details.full_name);
 * }
 * ```
 */
export const SurepassPanComprehensiveSchema = Guardian.object().schema({
  /** Unique client identifier for the request */
  client_id: Guardian.string(),
  /** 10-character PAN number in format ABCDE1234F */
  pan_number: Guardian.string().pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/),
  /** Comprehensive PAN details */
  pan_details: Guardian.object().schema({
    /** Full name as per PAN records */
    full_name: Guardian.string(),
    /** Masked Aadhaar number if linked (optional) */
    masked_aadhaar: Guardian.string().optional(),
    /** Address details (optional) */
    address: Guardian.object().schema({
      /** Address line 1 */
      line_1: Guardian.string(),
      /** Address line 2 */
      line_2: Guardian.string(),
      /** Street name */
      street_name: Guardian.string(),
      /** ZIP/PIN code (optional) */
      zip: Guardian.string().optional(),
      /** City */
      city: Guardian.string(),
      /** State */
      state: Guardian.string(),
      /** Country */
      country: Guardian.string(),
      /** Complete address */
      full: Guardian.string(),
    }).optional(),
    /** Email address (optional) */
    email: Guardian.string().email().optional(),
    /** Phone number (optional) */
    phone_number: Guardian.string().optional(),
    /** Gender (M/F/T/O or empty, optional) */
    gender: Guardian.string().in(['M', 'F', 'T', 'O', '']).optional(),
    /** Date of birth in YYYY-MM-DD format */
    dob: Guardian.string().pattern(/^\d{4}-\d{2}-\d{2}$/).toDate(),
    /** Input date of birth (optional) */
    input_dob: Guardian.string().optional(),
    /** Whether Aadhaar is linked (optional) */
    aadhaar_linked: Guardian.boolean().optional(),
    /** Whether DOB is verified */
    dob_verified: Guardian.boolean(),
    /** DOB check result */
    dob_check: Guardian.boolean(),
    /** PAN category */
    category: Guardian.string().in([
      'company',
      'person',
      'huf',
      'firm',
      'aop',
      'aop_trust',
      'boi',
      'local_authority',
      'artificial_juridical_person',
      'government',
    ]),
    /** Father's name (optional) */
    father_name: Guardian.string().optional(),
  }),
});

/**
 * Type definition for Surepass PAN comprehensive verification response
 */
export type SurepassPanComprehensive = GuardianType<
  typeof SurepassPanComprehensiveSchema
>;
