import { Guardian, GuardianType } from '$guardian';

/**
 * Schema for Surepass Aadhaar verification initiation response
 *
 * Validates the response from the Aadhaar OTP generation API endpoint which
 * starts the two-step Aadhaar verification process.
 *
 * @example
 * ```typescript
 * const response = {
 *   client_id: 'client-123',
 *   otp_sent: true,
 *   if_number: true,
 *   status: 'OTP_SENT'
 * };
 *
 * const [error, result] = SurepassInitiateAadhaarVerificationSchema.validate(response);
 * if (!error) {
 *   console.log('OTP sent successfully:', result.otp_sent);
 * }
 * ```
 */
export const SurepassInitiateAadhaarVerificationSchema = Guardian.object()
  .schema({
    /** Unique client identifier for OTP submission */
    client_id: Guardian.string(),
    /** Whether OTP was sent successfully */
    otp_sent: Guardian.boolean(),
    /** Whether the number format is valid */
    if_number: Guardian.boolean(),
    /** Status of the initiation request (optional) */
    status: Guardian.string().optional(),
  });

/**
 * Type definition for Surepass Aadhaar initiation response
 */
export type SurepassInitiateAadhaarVerification = GuardianType<
  typeof SurepassInitiateAadhaarVerificationSchema
>;

/**
 * Schema for Surepass Aadhaar verification completion response
 *
 * Validates the response from the Aadhaar OTP verification API endpoint which
 * completes the verification process and returns personal details.
 *
 * @example
 * ```typescript
 * const response = {
 *   client_id: 'client-123',
 *   aadhaar_number: '123456789012',
 *   gender: 'M',
 *   dob: '1990-01-01',
 *   full_name: 'John Doe',
 *   address: {
 *     house: '123',
 *     street: 'Main St',
 *     vtc: 'City Name',
 *     state: 'State Name'
 *   },
 *   // ... other fields
 * };
 *
 * const [error, result] = SurepassAadhaarVerificationSchema.validate(response);
 * if (!error) {
 *   console.log('Aadhaar verified:', result.full_name);
 * }
 * ```
 */
export const SurepassAadhaarVerificationSchema = Guardian.object().schema({
  /** Unique client identifier */
  client_id: Guardian.string(),
  /** 12-digit Aadhaar number */
  aadhaar_number: Guardian.string().pattern(/^\d{12}$/),
  /** Gender (M/F/T/O) */
  gender: Guardian.string().in([
    'M',
    'F',
    'T',
    'O',
  ]),
  /** Date of birth in YYYY-MM-DD format */
  dob: Guardian.string().pattern(/^\d{4}-\d{2}-\d{2}$/).toDate(),
  /** Full name as per Aadhaar */
  full_name: Guardian.string(),
  /** Care of field (optional) */
  care_of: Guardian.string().optional(),
  /** Base64 encoded profile image (optional) */
  profile_image: Guardian.string().optional(),
  /** Share code (optional) */
  share_code: Guardian.string().optional(),
  /** ZIP data */
  zip_data: Guardian.string(),
  /** Raw XML data */
  raw_xml: Guardian.string(),
  /** ZIP file data */
  zip: Guardian.string(),
  /** Address details */
  address: Guardian.object().schema({
    /** Location (optional) */
    loc: Guardian.string().optional(),
    /** Country (optional) */
    country: Guardian.string().optional(),
    /** House number (optional) */
    house: Guardian.string().optional(),
    /** Sub-district (optional) */
    subdist: Guardian.string().optional(),
    /** Village/Town/City (optional) */
    vtc: Guardian.string().optional(),
    /** Post Office (optional) */
    po: Guardian.string().optional(),
    /** State (optional) */
    state: Guardian.string().optional(),
    /** Street (optional) */
    street: Guardian.string().optional(),
    /** District (optional) */
    dist: Guardian.string().optional(),
    /** Landmark (optional) */
    landmark: Guardian.string().optional(),
  }),
});

/**
 * Type definition for Surepass Aadhaar verification response
 */
export type SurepassAadhaarVerification = GuardianType<
  typeof SurepassAadhaarVerificationSchema
>;
