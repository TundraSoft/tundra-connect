import { Guardian, type GuardianType } from '$guardian';

/**
 * Guardian schema for Surepass GSTIN (Goods and Services Tax Identification Number) verification response
 *
 * This schema validates the response from GSTIN verification API endpoints which provide
 * comprehensive business registration details from the GST network including registration
 * status, business activities, filing information, and jurisdiction details.
 *
 * @example
 * ```typescript
 * // Typical GSTIN verification response structure
 * const gstinData = {
 *   client_id: "GSTIN_12345",
 *   gstin: "29AABCU9603R1ZL",
 *   pan_number: "AABCU9603R",
 *   business_name: "ABC TECHNOLOGIES PVT LTD",
 *   legal_name: "ABC TECHNOLOGIES PRIVATE LIMITED",
 *   gstin_status: "Active",
 *   date_of_registration: "2017-07-01",
 *   constitution_of_business: "Private Limited Company",
 *   taxpayer_type: "Regular",
 *   state_jurisdiction: "Karnataka",
 *   center_jurisdiction: "Bangalore",
 *   address: "123 ABC Road, Bangalore 560001",
 *   nature_bus_activities: ["Software Development", "IT Services"],
 *   filing_status: ["Regular", "Active"]
 * };
 *
 * // Validate response
 * const result = SurepassGSTINDetailsSchema.safeParse(gstinData);
 * if (result.success) {
 *   console.log('Business:', result.data.business_name);
 *   console.log('Status:', result.data.gstin_status);
 *   console.log('Activities:', result.data.nature_bus_activities);
 * }
 * ```
 */
export const SurepassGSTINDetailsSchema = Guardian.object().schema({
  client_id: Guardian.string(),
  address_details: Guardian.object(),
  gstin: Guardian.string(),
  pan_number: Guardian.string(),
  business_name: Guardian.string(),
  legal_name: Guardian.string(),
  center_jurisdiction: Guardian.string(),
  state_jurisdiction: Guardian.string(),
  date_of_registration: Guardian.string(),
  constitution_of_business: Guardian.string(),
  taxpayer_type: Guardian.string(),
  gstin_status: Guardian.string(),
  date_of_cancellation: Guardian.string(),
  field_visit_conducted: Guardian.string(),
  nature_bus_activities: Guardian.array().of(Guardian.string()),
  nature_of_core_business_activity_code: Guardian.string(),
  nature_of_core_business_activity_description: Guardian.string(),
  aadhaar_validation: Guardian.string(),
  aadhaar_validation_date: Guardian.string(),
  filing_status: Guardian.array().of(Guardian.string()),
  address: Guardian.string(),
  hsn_info: Guardian.object(),
  filing_frequency: Guardian.array().of(Guardian.string()),
});

export type SurepassGSTINDetails = GuardianType<
  typeof SurepassGSTINDetailsSchema
>;
