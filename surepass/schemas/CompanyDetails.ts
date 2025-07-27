import { Guardian, type GuardianType } from '$guardian';

/**
 * Guardian schema for Surepass company details verification response
 *
 * This schema validates the response from CIN (Corporate Identification Number) verification
 * API endpoints. It includes comprehensive company information including registration details,
 * financial information, director details, and compliance status.
 *
 * @example
 * ```typescript
 * // Typical company details response structure
 * const companyData = {
 *   client_id: "CIN_12345",
 *   company_id: "U72900DL2015PTC123456",
 *   company_type: "Private Limited Company",
 *   company_name: "ABC TECHNOLOGIES PRIVATE LIMITED",
 *   details: {
 *     company_info: {
 *       cin: "U72900DL2015PTC123456",
 *       roc_code: "RoC-Delhi",
 *       registration_number: "123456",
 *       company_category: "Company limited by shares",
 *       class_of_company: "Private",
 *       company_sub_category: "Non-govt company",
 *       authorized_capital: "1000000",
 *       paid_up_capital: "500000",
 *       number_of_members: "5",
 *       date_of_incorporation: "2015-03-15",
 *       registered_address: "123 ABC Street, New Delhi",
 *       address_other_than_ro: "456 XYZ Road, Mumbai",
 *       email_id: "info@abctech.com",
 *       listed_status: "Unlisted",
 *       active_compliance: "Yes",
 *       suspended_at_stock_exchange: "No",
 *       last_agm_date: "2023-09-30",
 *       last_bs_date: "2023-03-31",
 *       company_status: "Active",
 *       status_under_cirp: "No"
 *     },
 *     directors: [
 *       {
 *         din_number: "12345678",
 *         director_name: "RAHUL KUMAR",
 *         start_date: "2015-03-15",
 *         end_date: null,
 *         surrendered_din: null
 *       }
 *     ]
 *   }
 * };
 *
 * // Validate response
 * const result = SurepassCompanyDetailsSchema.safeParse(companyData);
 * if (result.success) {
 *   console.log('Company:', result.data.company_name);
 *   console.log('Status:', result.data.details.company_info.company_status);
 *   console.log('Directors:', result.data.details.directors.length);
 * }
 * ```
 */
export const SurepassCompanyDetailsSchema = Guardian.object().schema({
  client_id: Guardian.string(),
  company_id: Guardian.string(),
  company_type: Guardian.string(),
  company_name: Guardian.string(),
  details: Guardian.object().schema({
    company_info: Guardian.object().schema({
      cin: Guardian.string(),
      roc_code: Guardian.string(),
      registration_number: Guardian.string(),
      company_category: Guardian.string(),
      class_of_company: Guardian.string(),
      company_sub_category: Guardian.string(),
      authorized_capital: Guardian.string(),
      paid_up_capital: Guardian.string(),
      number_of_members: Guardian.string(),
      date_of_incorporation: Guardian.string(),
      registered_address: Guardian.string(),
      address_other_than_ro: Guardian.string(),
      email_id: Guardian.string(),
      listed_status: Guardian.string(),
      active_compliance: Guardian.string().optional(),
      suspended_at_stock_exchange: Guardian.string(),
      last_agm_date: Guardian.string(),
      last_bs_date: Guardian.string(),
      company_status: Guardian.string(),
      status_under_cirp: Guardian.string().optional(),
    }),
    directors: Guardian.array().of(
      Guardian.object().schema({
        din_number: Guardian.string(),
        director_name: Guardian.string(),
        start_date: Guardian.string().pattern(/^\d{4}-\d{2}-\d{2}$/).toDate(),
        end_date: Guardian.string().pattern(/^\d{4}-\d{2}-\d{2}$/).toDate()
          .optional(),
        surrendered_din: Guardian.string().optional(),
      }),
    ),
  }),
});

export type SurepassCompanyDetails = GuardianType<
  typeof SurepassCompanyDetailsSchema
>;
