import {
  RESTler,
  type RESTlerEvents,
  type RESTlerOptions,
  RESTlerResponse,
} from '$restler';
import type { EventOptionKeys } from '$utils';
import { GuardianProxy, ObjectGuardian } from '$guardian';

import {
  type SurepassAadhaarVerification,
  SurepassAadhaarVerificationSchema,
  type SurepassBankVerification,
  SurepassBankVerificationSchema,
  type SurepassCompanyDetails,
  SurepassCompanyDetailsSchema,
  type SurepassGSTINDetails,
  SurepassGSTINDetailsSchema,
  type SurepassInitiateAadhaarVerification,
  SurepassInitiateAadhaarVerificationSchema,
  type SurepassNameMatch,
  SurepassNameMatchSchema,
  type SurepassPanComprehensive,
  SurepassPanComprehensiveSchema,
  type SurepassResponse,
  SurepassResponseSchema,
} from './schemas/mod.ts';
import { SurepassError, type SurepassErrorCode } from './SurepassError.ts';

/**
 * Configuration options for the Surepass client
 *
 * @interface SurepassOptions
 * @extends RESTlerOptions
 */
export type SurepassOptions = RESTlerOptions & {
  /** Environment mode - SANDBOX for testing, PRODUCTION for live API calls */
  mode: 'SANDBOX' | 'PRODUCTION';
};

/**
 * Surepass KYC API Client
 *
 * A comprehensive client for interacting with Surepass KYC verification services.
 * Supports various verification types including Aadhaar, PAN, bank accounts,
 * company details, GSTIN, and name matching.
 *
 * @class Surepass
 * @extends RESTler
 *
 * @example
 * ```typescript
 * // Initialize the client
 * const surepass = new Surepass({
 *   mode: 'SANDBOX', // or 'PRODUCTION'
 *   auth: 'your-jwt-token'
 * });
 *
 * // Verify a PAN number
 * const panResult = await surepass.verifyPAN('ABCDE1234F');
 *
 * // Compare two names
 * const nameMatch = await surepass.compareNames('John Doe', 'john doe');
 *
 * // Verify bank account
 * const bankResult = await surepass.verifyBankAccount('1234567890', 'SBIN0000123');
 * ```
 */
export class Surepass extends RESTler {
  /** Vendor identifier for this service */
  public readonly vendor = 'Surepass';

  /**
   * Creates a new Surepass client instance
   *
   * @param options - Configuration options including mode and authentication
   * @throws {Error} If invalid mode is provided
   *
   * @example
   * ```typescript
   * const surepass = new Surepass({
   *   mode: 'SANDBOX',
   *   auth: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...'
   * });
   * ```
   */
  constructor(options: EventOptionKeys<SurepassOptions, RESTlerEvents>) {
    switch (options.mode) {
      case 'SANDBOX':
        options.baseURL = 'https://sandbox.surepass.app/api/{version}';
        break;
      default:
      case 'PRODUCTION':
        options.baseURL = 'https://kyc-api.surepass.app/api/{version}';
        break;
    }
    options.version = 'v1';
    options.contentType = 'JSON';
    options.timeout = 10; // seconds
    options.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    super(options);
  }

  /**
   * Compare two names for similarity
   *
   * Compares two names using Surepass's name matching algorithm and returns
   * a similarity score and match status.
   *
   * @param name1 - First name to compare
   * @param name2 - Second name to compare
   * @param isCompany - Whether the names are company names (default: false for person names)
   * @returns Promise<SurepassNameMatch> - Name matching result with score and status
   *
   * @throws {SurepassError} When API request fails or validation errors occur
   *
   * @example
   * ```typescript
   * // Compare person names
   * const result = await surepass.compareNames('John Doe', 'john doe');
   * console.log(result.match_score); // 0.95
   * console.log(result.match_status); // true
   *
   * // Compare company names
   * const companyResult = await surepass.compareNames(
   *   'TundraSoft Technologies Pvt Ltd',
   *   'Tundra Soft Technologies Private Limited',
   *   true
   * );
   * ```
   */
  async compareNames(
    name1: string,
    name2: string,
    isCompany: boolean = false,
  ): Promise<SurepassNameMatch> {
    try {
      const resp = await this._makeRequest<SurepassResponse>({
        path: 'utils/name-matching/',
      }, {
        method: 'POST',
        contentType: 'JSON',
        payload: {
          name_1: name1.trim(),
          name_2: name2.trim(),
          name_type: isCompany ? 'company' : 'person',
        },
      });
      const data = this.__checkAPIResponse<SurepassNameMatch>(
        resp,
        SurepassNameMatchSchema,
      );
      return data;
    } catch (cause) {
      if (cause instanceof SurepassError) {
        cause.context.endpoint = 'utils/name-matching/';
        throw cause;
      } else {
        throw new SurepassError('UNHANDLED_ERROR', {
          endpoint: 'utils/name-matching/',
        }, cause as Error);
      }
    }
  }

  /**
   * Verify a bank account using account number and IFSC code
   *
   * Validates whether a bank account exists and retrieves account holder details
   * along with comprehensive bank information.
   *
   * @param accountNumber - Bank account number to verify
   * @param ifsc - IFSC code of the bank branch
   * @returns Promise<SurepassBankVerification> - Bank verification result with account details
   *
   * @throws {SurepassError} When API request fails or validation errors occur
   *
   * @example
   * ```typescript
   * const result = await surepass.verifyBankAccount('1234567890', 'SBIN0000123');
   * console.log(result.account_exists); // true
   * console.log(result.full_name); // 'John Doe'
   * console.log(result.ifsc_details.bank_name); // 'State Bank of India'
   * ```
   */
  async verifyBankAccount(
    accountNumber: string,
    ifsc: string,
  ): Promise<SurepassBankVerification> {
    try {
      const resp = await this._makeRequest<SurepassResponse>({
        path: 'bank-verification',
      }, {
        method: 'POST',
        contentType: 'JSON',
        payload: {
          id_number: accountNumber,
          ifsc: ifsc,
          ifsc_details: true,
        },
      });
      const data = this.__checkAPIResponse<SurepassBankVerification>(
        resp,
        SurepassBankVerificationSchema,
      );
      return data;
    } catch (cause) {
      if (cause instanceof SurepassError) {
        cause.context.endpoint = 'bank-verification';
        throw cause;
      } else {
        throw new SurepassError('UNHANDLED_ERROR', {
          endpoint: 'bank-verification',
        }, cause as Error);
      }
    }
  }

  /**
   * Verify a PAN (Permanent Account Number) card
   *
   * Performs comprehensive verification of a PAN number and retrieves
   * associated details from government records.
   *
   * @param pan - PAN number to verify (format: ABCDE1234F)
   * @returns Promise<SurepassPanComprehensive> - Comprehensive PAN verification result
   *
   * @throws {SurepassError} When API request fails or validation errors occur
   *
   * @example
   * ```typescript
   * const result = await surepass.verifyPAN('ABCDE1234F');
   * console.log(result.name); // 'JOHN DOE'
   * console.log(result.status); // 'VALID'
   * console.log(result.category); // 'Individual'
   * ```
   */
  async verifyPAN(pan: string): Promise<SurepassPanComprehensive> {
    try {
      const resp = await this._makeRequest<SurepassResponse>({
        path: 'pan/pan-comprehensive-plus',
      }, {
        method: 'POST',
        contentType: 'JSON',
        payload: {
          id_number: pan,
        },
      });
      const data = this.__checkAPIResponse<SurepassPanComprehensive>(
        resp,
        SurepassPanComprehensiveSchema,
      );
      return data;
    } catch (cause) {
      if (cause instanceof SurepassError) {
        cause.context.endpoint = 'pan/pan-comprehensive-plus';
        throw cause;
      } else {
        throw new SurepassError('UNHANDLED_ERROR', {
          endpoint: 'pan/pan-comprehensive-plus',
        }, cause as Error);
      }
    }
  }

  /**
   * Initiate Aadhaar verification process
   *
   * Starts the Aadhaar verification process by sending an OTP to the mobile number
   * registered with the Aadhaar card. This is the first step in the two-step
   * Aadhaar verification process.
   *
   * @param aadhaar - 12-digit Aadhaar number
   * @returns Promise<SurepassInitiateAadhaarVerification> - Initiation result with client_id for OTP submission
   *
   * @throws {SurepassError} When API request fails or validation errors occur
   *
   * @example
   * ```typescript
   * // Step 1: Initiate verification
   * const initResult = await surepass.initiateAadhaar('123456789012');
   * console.log(initResult.client_id); // 'client-id-for-otp-submission'
   *
   * // Step 2: Submit OTP (use fetchAadhaar method)
   * const verifyResult = await surepass.fetchAadhaar(initResult.client_id, '123456');
   * ```
   */
  async initiateAadhaar(
    aadhaar: string,
  ): Promise<SurepassInitiateAadhaarVerification> {
    try {
      const resp = await this._makeRequest<SurepassResponse>({
        path: 'aadhaar-v2/generate-otp',
      }, {
        method: 'POST',
        contentType: 'JSON',
        payload: {
          id_number: aadhaar,
        },
      });
      const data = this.__checkAPIResponse<SurepassInitiateAadhaarVerification>(
        resp,
        SurepassInitiateAadhaarVerificationSchema,
      );
      return data;
    } catch (cause) {
      if (cause instanceof SurepassError) {
        cause.context.endpoint = 'aadhaar-v2/generate-otp';
        throw cause;
      } else {
        throw new SurepassError('UNHANDLED_ERROR', {
          endpoint: 'aadhaar-v2/generate-otp',
        }, cause as Error);
      }
    }
  }

  /**
   * Complete Aadhaar verification with OTP
   *
   * Completes the Aadhaar verification process by submitting the OTP received
   * on the registered mobile number. This is the second step in the two-step
   * Aadhaar verification process.
   *
   * @param clientId - Client ID received from initiateAadhaar call
   * @param otp - 6-digit OTP received on registered mobile number
   * @returns Promise<SurepassAadhaarVerification> - Complete Aadhaar verification result with personal details
   *
   * @throws {SurepassError} When API request fails, OTP is invalid, or validation errors occur
   *
   * @example
   * ```typescript
   * // Complete the verification process
   * const result = await surepass.fetchAadhaar('client-id-from-initiate', '123456');
   * console.log(result.name); // 'John Doe'
   * console.log(result.address); // Complete address object
   * console.log(result.date_of_birth); // 'DD-MM-YYYY'
   * ```
   */
  async fetchAadhaar(
    clientId: string,
    otp: string,
  ): Promise<SurepassAadhaarVerification> {
    try {
      const resp = await this._makeRequest<SurepassResponse>({
        path: 'aadhaar-v2/submit-otp',
      }, {
        method: 'POST',
        contentType: 'JSON',
        payload: {
          client_id: clientId,
          otp: otp,
        },
      });
      const data = this.__checkAPIResponse<SurepassAadhaarVerification>(
        resp,
        SurepassAadhaarVerificationSchema,
      );
      return data;
    } catch (cause) {
      if (cause instanceof SurepassError) {
        cause.context.endpoint = 'aadhaar-v2/submit-otp';
        throw cause;
      } else {
        throw new SurepassError('UNHANDLED_ERROR', {
          endpoint: 'aadhaar-v2/submit-otp',
        }, cause as Error);
      }
    }
  }

  /**
   * Verify company details using CIN (Corporate Identification Number)
   *
   * Retrieves comprehensive company information from the Ministry of Corporate Affairs
   * database using the CIN number.
   *
   * @param cin - Corporate Identification Number (21-character alphanumeric code)
   * @returns Promise<SurepassCompanyDetails> - Complete company details and registration information
   *
   * @throws {SurepassError} When API request fails or validation errors occur
   *
   * @example
   * ```typescript
   * const result = await surepass.verifyCIN('L72900DL2015PTC12345');
   * console.log(result.company_name); // 'ABC Technologies Private Limited'
   * console.log(result.company_status); // 'Active'
   * console.log(result.incorporation_date); // 'DD-MM-YYYY'
   * console.log(result.directors); // Array of director details
   * ```
   */
  async verifyCIN(cin: string): Promise<SurepassCompanyDetails> {
    try {
      const resp = await this._makeRequest<SurepassResponse>({
        path: 'corporate/company-details',
      }, {
        method: 'POST',
        contentType: 'JSON',
        payload: {
          id_number: cin,
        },
      });
      console.log(JSON.stringify(resp.body));
      const data = this.__checkAPIResponse<SurepassCompanyDetails>(
        resp,
        SurepassCompanyDetailsSchema,
      );
      return data;
    } catch (cause) {
      if (cause instanceof SurepassError) {
        cause.context.endpoint = 'corporate/company-details';
        throw cause;
      } else {
        throw new SurepassError('UNHANDLED_ERROR', {
          endpoint: 'corporate/company-details',
        }, cause as Error);
      }
    }
  }

  /**
   * Verify GSTIN (Goods and Services Tax Identification Number)
   *
   * Validates GSTIN and retrieves associated business registration details
   * from the GST network.
   *
   * @param gstin - 15-character GSTIN number
   * @returns Promise<SurepassGSTINDetails> - GSTIN verification result with business details
   *
   * @throws {SurepassError} When API request fails or validation errors occur
   *
   * @example
   * ```typescript
   * const result = await surepass.verifyGSTIN('29ABCDE1234F1Z5');
   * console.log(result.legal_name); // 'ABC TECHNOLOGIES PVT LTD'
   * console.log(result.gstin_status); // 'Active'
   * console.log(result.registration_date); // 'DD-MM-YYYY'
   * console.log(result.business_nature); // 'Service Provider'
   * ```
   */
  async verifyGSTIN(gstin: string): Promise<SurepassGSTINDetails> {
    try {
      const resp = await this._makeRequest<SurepassResponse>({
        path: 'corporate/gstin',
      }, {
        method: 'POST',
        contentType: 'JSON',
        payload: {
          id_number: gstin,
        },
      });
      const data = this.__checkAPIResponse<SurepassGSTINDetails>(
        resp,
        SurepassGSTINDetailsSchema,
      );
      return data;
    } catch (cause) {
      if (cause instanceof SurepassError) {
        cause.context.endpoint = 'corporate/gstin';
        throw cause;
      } else {
        throw new SurepassError('UNHANDLED_ERROR', {
          endpoint: 'corporate/gstin',
        }, cause as Error);
      }
    }
  }

  /**
   * Internal method to validate API responses and handle errors
   *
   * Validates the response structure, checks for API errors, and applies
   * schema validation to ensure type safety.
   *
   * @private
   * @template T - Expected response data type
   * @param resp - Raw API response from RESTler
   * @param validator - Optional Guardian schema validator for response data
   * @returns T - Validated response data
   *
   * @throws {SurepassError} When response validation fails or API returns errors
   */
  private __checkAPIResponse<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(
    resp: RESTlerResponse<SurepassResponse>,
    validator?: GuardianProxy<ObjectGuardian<T>>,
  ): T {
    const [error, respObj] = SurepassResponseSchema.validate(resp.body);
    if (error || !respObj) {
      throw new SurepassError('RESPONSE_ERROR', {
        status: resp.body!.status_code,
        details: error ? error.listCauses() : 'No response body received',
      });
    } else {
      if (respObj.success === false) {
        let code: SurepassErrorCode;
        switch (respObj.status_code) {
          case 500:
            code = 'SERVICE_UNAVAILABLE';
            break;
          case 422:
            code = 'VERIFICATION_FAILED';
            break;
          case 401:
            code = 'INVALID_TOKEN';
            break;
          case 429:
            code = 'RATE_LIMIT_EXCEEDED';
            break;
          default:
            code = 'UNKNOWN_RESPONSE_ERROR';
            break;
        }
        throw new SurepassError(code, {
          statusCode: resp.body!.status_code,
          message: respObj.message,
          details: respObj.data,
        });
      }
      // Ok now call the real validator
      if (validator) {
        const [validationError, validatedData] = validator.validate(
          respObj.data,
        );
        if (validationError) {
          throw new SurepassError('PARSE_ERROR', {
            details: validationError.listCauses(),
          });
        }
        return validatedData as T;
      } else {
        return respObj.data as T;
      }
    }
  }
}
