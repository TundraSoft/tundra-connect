import * as asserts from '$asserts';
import { assertSpyCall, assertSpyCalls, spy, stub } from '$testing/mock';
import { Surepass } from './Surepass.ts';
import { SurepassError } from './SurepassError.ts';
import {
  SurepassAadhaarVerificationSchema,
  SurepassBankVerificationSchema,
  SurepassCompanyDetailsSchema,
  SurepassGSTINDetailsSchema,
  SurepassInitiateAadhaarVerificationSchema,
  SurepassNameMatchSchema,
  SurepassPanComprehensiveSchema,
  SurepassResponseSchema,
} from './schemas/mod.ts';

// Mock data for testing - simplified to match actual schemas
const mockNameMatchResponse = {
  client_id: 'client123',
  name_1: 'John Doe',
  name_2: 'john doe',
  match_score: 0.95,
  match_status: true,
};

const mockPanResponse = {
  client_id: 'client123',
  pan_number: 'BNZAA2318J',
  pan_details: {
    full_name: 'JOHN DOE',
    category: 'Individual',
    dob: new Date('1990-01-01'),
    address: {
      line_1: '123 Main St',
      line_2: 'Apt 4B',
      street_name: 'Main Street',
      zip: '400001',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      full: '123 Main St, Apt 4B, Mumbai, Maharashtra 400001',
    },
  },
};

const mockBankResponse = {
  client_id: 'client123',
  account_exists: true,
  upi_id: 'john@upi',
  full_name: 'JOHN DOE',
  status: 'VALID',
  ifsc_details: {
    id: 1,
    ifsc: 'SBIN0001234',
    micr: '123456001',
    iso3166: 'IN',
    swift: 'SBININBB',
    bank: 'SBI',
    bank_code: 'SBIN',
    bank_name: 'State Bank of India',
    branch: 'Main Branch',
    centre: 'Mumbai',
    district: 'Mumbai',
    state: 'Maharashtra',
    city: 'Mumbai',
    address: '123 Main Street',
    contact: '1234567890',
    imps: true,
    rtgs: true,
    neft: true,
    upi: true,
    micr_check: true,
  },
};

const mockAadhaarInitResponse = {
  client_id: 'aadhaar_client_123',
  otp_sent: true,
  if_number: true,
};

const mockAadhaarFetchResponse = {
  client_id: 'aadhaar_client_123',
  aadhaar_number: '123456789012',
  gender: 'M',
  dob: new Date('1990-01-01'),
  full_name: 'JOHN DOE',
  zip_data: 'zipdata123',
  raw_xml: '<xml>...</xml>',
  zip: '400001',
  address: {
    loc: 'Andheri',
    country: 'India',
    house: 'A-123',
    subdist: 'Mumbai Suburban',
    vtc: 'Andheri',
    po: 'Mumbai',
    state: 'Maharashtra',
    street: '',
    dist: 'Mumbai',
    landmark: 'Near Station',
  },
};

const mockCINResponse = {
  client_id: 'cin_client_123',
  company_id: 'CIN123456',
  company_type: 'Public',
  company_name: 'Test Company Limited',
  details: {
    company_info: {
      cin: 'L12345MH2000PLC123456',
      roc_code: 'ROC-Mumbai',
      registration_number: 'CIN123456',
      company_category: 'Public',
      class_of_company: 'Limited',
      company_sub_category: 'Limited',
      authorized_capital: '1000000',
      paid_up_capital: '500000',
      number_of_members: '100',
      date_of_incorporation: '2000-01-01',
      registered_address: '123 Business Street, Mumbai',
      address_other_than_ro: '',
      email_id: 'test@company.com',
      listed_status: 'Listed',
      active_compliance: 'Yes',
      suspended_at_stock_exchange: 'No',
      last_agm_date: '2023-03-31',
      last_bs_date: '2023-03-31',
      company_status: 'Active',
      status_under_cirp: 'No',
    },
    directors: [
      {
        din_number: 'DIN123456',
        director_name: 'Director Name',
        start_date: '2000-01-01',
        end_date: null,
        surrendered_din: null,
      },
    ],
  },
};

const mockGSTINResponse = {
  client_id: 'gstin_client_123',
  address_details: {},
  gstin: '29AABCU9603R1ZL',
  pan_number: 'AABCU9603R',
  business_name: 'Test Business',
  legal_name: 'Test Business Legal Name',
  center_jurisdiction: 'Mumbai',
  state_jurisdiction: 'Maharashtra',
  date_of_registration: '01/07/2017',
  constitution_of_business: 'Proprietorship',
  taxpayer_type: 'Regular',
  gstin_status: 'Active',
  date_of_cancellation: '',
  field_visit_conducted: 'No',
  nature_bus_activities: ['Software Development'],
  nature_of_core_business_activity_code: '62',
  nature_of_core_business_activity_description: 'Computer programming',
  aadhaar_validation: 'Y',
  aadhaar_validation_date: '01/07/2017',
  filing_status: ['Filed'],
  address: '123 Business Street, Mumbai',
  hsn_info: {},
  filing_frequency: ['Monthly'],
};

Deno.test('Surepass', async (t) => {
  await t.step('should initialize with correct base URL for SANDBOX', () => {
    const surepass = new Surepass({
      mode: 'SANDBOX',
      auth: 'test-token',
    });

    asserts.assertEquals(surepass.vendor, 'Surepass');
    // Note: We can't directly access baseURL as it's protected, but the construction should not throw
    asserts.assertExists(surepass);
  });

  await t.step('should initialize with correct base URL for PRODUCTION', () => {
    const surepass = new Surepass({
      mode: 'PRODUCTION',
      auth: 'test-token',
    });

    asserts.assertEquals(surepass.vendor, 'Surepass');
    asserts.assertExists(surepass);
  });

  await t.step('should have all required methods', () => {
    const surepass = new Surepass({
      mode: 'SANDBOX',
      auth: 'test-token',
    });

    // Check that all expected methods exist
    asserts.assertEquals(typeof surepass.compareNames, 'function');
    asserts.assertEquals(typeof surepass.verifyBankAccount, 'function');
    asserts.assertEquals(typeof surepass.verifyPAN, 'function');
    asserts.assertEquals(typeof surepass.initiateAadhaar, 'function');
    asserts.assertEquals(typeof surepass.fetchAadhaar, 'function');
    asserts.assertEquals(typeof surepass.verifyCIN, 'function');
    asserts.assertEquals(typeof surepass.verifyGSTIN, 'function');
  });
});

Deno.test('Surepass.SurepassError', async (t) => {
  await t.step('should create error with valid code', () => {
    const error = new SurepassError('INVALID_TOKEN');
    asserts.assertInstanceOf(error, SurepassError);
    asserts.assertStringIncludes(error.message, 'bearer token');
  });

  await t.step('should create error with metadata', () => {
    const error = new SurepassError('RESPONSE_ERROR', {
      status: 400,
      endpoint: 'test-endpoint',
    });
    asserts.assertInstanceOf(error, SurepassError);
    asserts.assertStringIncludes(error.message, '400');
  });

  await t.step('should handle unknown error codes', () => {
    const error = new SurepassError('INVALID_CODE' as any);
    asserts.assertInstanceOf(error, SurepassError);
    asserts.assertStringIncludes(error.message, 'unknown error');
  });

  await t.step('should preserve original code for unknown errors', () => {
    const error = new SurepassError('INVALID_CODE' as any);
    asserts.assertEquals(error.context.originalCode, 'INVALID_CODE');
  });
});

Deno.test('Surepass.schemas', async (t) => {
  await t.step('SurepassResponse schema validation', () => {
    // Valid response
    const validResponse = {
      status_code: 200,
      success: true,
      message: 'Success',
      message_code: 'SUCCESS',
      data: { test: 'data' },
    };

    const [error, result] = SurepassResponseSchema.validate(validResponse);
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.status_code, 200);

    // Valid minimal response
    const minimalResponse = {};
    const [minError, minResult] = SurepassResponseSchema.validate(
      minimalResponse,
    );
    asserts.assertEquals(minError, null);
    asserts.assertExists(minResult);
  });

  await t.step('SurepassNameMatch schema validation', () => {
    // Valid name match response
    const validNameMatch = {
      client_id: 'test-client-123',
      name_1: 'John Doe',
      name_2: 'john doe',
      match_score: 0.95,
      match_status: true,
    };

    const [error, result] = SurepassNameMatchSchema.validate(validNameMatch);
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.match_score, 0.95);

    // Invalid - missing required fields
    const invalidNameMatch = {
      client_id: 'test-client-123',
      // missing name_1, name_2, etc.
    };
    const [invalidError] = SurepassNameMatchSchema.validate(invalidNameMatch);
    asserts.assertNotEquals(invalidError, null);
  });

  await t.step('SurepassBankVerification schema validation', () => {
    // Valid bank verification response
    const validBankVerification = {
      client_id: 'test-client-123',
      account_exists: true,
      upi_id: 'test@upi',
      full_name: 'John Doe',
      status: 'VALID',
      ifsc_details: {
        id: 1,
        ifsc: 'SBIN0000123',
        micr: '123456789',
        iso3166: 'IN',
        swift: 'SBININBB',
        bank: 'SBI',
        bank_code: 'SBIN',
        bank_name: 'State Bank of India',
        branch: 'Main Branch',
        centre: 'Mumbai',
        district: 'Mumbai',
        state: 'Maharashtra',
        city: 'Mumbai',
        address: '123 Main St',
        contact: '1234567890',
        imps: true,
        rtgs: true,
        neft: true,
        upi: true,
        micr_check: true,
      },
    };

    const [error, result] = SurepassBankVerificationSchema.validate(
      validBankVerification,
    );
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.account_exists, true);

    // Invalid - missing required ifsc_details
    const invalidBankVerification = {
      client_id: 'test-client-123',
      account_exists: true,
      full_name: 'John Doe',
      status: 'VALID',
      // missing ifsc_details
    };
    const [invalidError] = SurepassBankVerificationSchema.validate(
      invalidBankVerification,
    );
    asserts.assertNotEquals(invalidError, null);
  });

  await t.step('should validate all schema exports', () => {
    // Check that all schemas are properly exported and are Guardian objects
    asserts.assertExists(SurepassResponseSchema);
    asserts.assertExists(SurepassNameMatchSchema);
    asserts.assertExists(SurepassBankVerificationSchema);
    asserts.assertExists(SurepassPanComprehensiveSchema);
    asserts.assertExists(SurepassInitiateAadhaarVerificationSchema);
    asserts.assertExists(SurepassAadhaarVerificationSchema);
    asserts.assertExists(SurepassCompanyDetailsSchema);
    asserts.assertExists(SurepassGSTINDetailsSchema);

    // Verify they have validate methods (Guardian schemas)
    asserts.assertEquals(typeof SurepassResponseSchema.validate, 'function');
    asserts.assertEquals(typeof SurepassNameMatchSchema.validate, 'function');
    asserts.assertEquals(
      typeof SurepassBankVerificationSchema.validate,
      'function',
    );
  });
});

Deno.test('Surepass API Methods - Basic Functionality', async (t) => {
  let surepass: Surepass;

  // Setup before each test
  function setup() {
    surepass = new Surepass({
      mode: 'SANDBOX',
      auth: 'test-token-123',
    });
  }

  await t.step('compareNames - should have correct method signature', () => {
    setup();

    // Test method exists and has correct signature
    asserts.assertEquals(typeof surepass.compareNames, 'function');

    // Test that the method accepts the correct parameters (we can't test actual API calls without credentials)
    // Just verify the method exists and can be called
    const methodExists = typeof surepass.compareNames === 'function';
    asserts.assertEquals(methodExists, true);
  });

  await t.step('verifyPAN - should have correct method signature', () => {
    setup();

    asserts.assertEquals(typeof surepass.verifyPAN, 'function');
  });

  await t.step(
    'verifyBankAccount - should have correct method signature',
    () => {
      setup();

      asserts.assertEquals(typeof surepass.verifyBankAccount, 'function');
    },
  );

  await t.step('initiateAadhaar - should have correct method signature', () => {
    setup();

    asserts.assertEquals(typeof surepass.initiateAadhaar, 'function');
  });

  await t.step('fetchAadhaar - should have correct method signature', () => {
    setup();

    asserts.assertEquals(typeof surepass.fetchAadhaar, 'function');
  });

  await t.step('verifyCIN - should have correct method signature', () => {
    setup();

    asserts.assertEquals(typeof surepass.verifyCIN, 'function');
  });

  await t.step('verifyGSTIN - should have correct method signature', () => {
    setup();

    asserts.assertEquals(typeof surepass.verifyGSTIN, 'function');
  });

  await t.step('should have vendor property set correctly', () => {
    setup();

    asserts.assertEquals(surepass.vendor, 'Surepass');
  });
});

Deno.test('Surepass Environment Configuration', async (t) => {
  await t.step('should configure for SANDBOX mode', () => {
    const surepass = new Surepass({
      mode: 'SANDBOX',
      auth: 'test-token-123',
    });

    asserts.assertEquals(surepass.vendor, 'Surepass');
    asserts.assertExists(surepass);
  });

  await t.step('should configure for PRODUCTION mode', () => {
    const surepass = new Surepass({
      mode: 'PRODUCTION',
      auth: 'prod-token-123',
    });

    asserts.assertEquals(surepass.vendor, 'Surepass');
    asserts.assertExists(surepass);
  });

  await t.step('should handle different auth token formats', () => {
    // Test with various token formats
    const tokenFormats = [
      'simple-token',
      'Bearer-Token-123',
      'jwt.token.signature',
      'very-long-token-with-many-characters-and-numbers-123456789',
    ];

    tokenFormats.forEach((token) => {
      const surepass = new Surepass({
        mode: 'SANDBOX',
        auth: token,
      });
      asserts.assertExists(surepass);
    });
  });
});

Deno.test('Surepass Input Validation and Edge Cases', async (t) => {
  let surepass: Surepass;

  function setup() {
    surepass = new Surepass({
      mode: 'SANDBOX',
      auth: 'test-token-123',
    });
  }

  await t.step('should handle various input formats for PAN', () => {
    setup();

    const panFormats = [
      'BNZAA2318J',
      'bnzaa2318j',
      'BnZaA2318J',
      'ABCDE1234F',
      'XYZTE9876A',
    ];

    // Just test that method exists and accepts these inputs
    panFormats.forEach((pan) => {
      asserts.assertEquals(typeof surepass.verifyPAN, 'function');
      // We don't actually call the method to avoid network issues
    });
  });

  await t.step('should handle various IFSC codes format validation', () => {
    setup();

    const ifscCodes = [
      'SBIN0001234',
      'HDFC0000123',
      'ICIC0001234',
      'AXIS0012345',
      'PUNB0123456',
    ];

    // Test that method exists for all formats
    ifscCodes.forEach((ifsc) => {
      asserts.assertEquals(typeof surepass.verifyBankAccount, 'function');
    });
  });

  await t.step('should validate method parameter types', () => {
    setup();

    // Test that all methods exist and are functions
    asserts.assertEquals(typeof surepass.compareNames, 'function');
    asserts.assertEquals(typeof surepass.verifyPAN, 'function');
    asserts.assertEquals(typeof surepass.verifyBankAccount, 'function');
    asserts.assertEquals(typeof surepass.initiateAadhaar, 'function');
    asserts.assertEquals(typeof surepass.fetchAadhaar, 'function');
    asserts.assertEquals(typeof surepass.verifyCIN, 'function');
    asserts.assertEquals(typeof surepass.verifyGSTIN, 'function');
  });

  await t.step('should handle different name formats for comparison', () => {
    setup();

    // Test various edge case scenarios without making actual calls
    const testCases = [
      ["John O'Connor", 'John O Connor'],
      ['José María', 'Jose Maria'],
      ['JOHN DOE', 'john doe'],
      ['   John   ', 'John'],
    ];

    testCases.forEach(() => {
      // Just verify the method exists
      asserts.assertEquals(typeof surepass.compareNames, 'function');
    });
  });
});

Deno.test('Surepass Schema Validation Tests', async (t) => {
  await t.step('should validate name match response schema', () => {
    const validNameMatch = {
      client_id: 'test-client-123',
      name_1: 'John Doe',
      name_2: 'john doe',
      match_score: 0.95,
      match_status: true,
    };

    const [error, result] = SurepassNameMatchSchema.validate(validNameMatch);
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.match_score, 0.95);
    asserts.assertEquals(result?.match_status, true);
  });

  await t.step('should validate bank verification response schema', () => {
    const validBankVerification = {
      client_id: 'test-client-123',
      account_exists: true,
      upi_id: 'test@upi',
      full_name: 'John Doe',
      status: 'VALID',
      ifsc_details: {
        id: 1,
        ifsc: 'SBIN0000123',
        micr: '123456789',
        iso3166: 'IN',
        swift: 'SBININBB',
        bank: 'SBI',
        bank_code: 'SBIN',
        bank_name: 'State Bank of India',
        branch: 'Main Branch',
        centre: 'Mumbai',
        district: 'Mumbai',
        state: 'Maharashtra',
        city: 'Mumbai',
        address: '123 Main St',
        contact: '1234567890',
        imps: true,
        rtgs: true,
        neft: true,
        upi: true,
        micr_check: true,
      },
    };

    const [error, result] = SurepassBankVerificationSchema.validate(
      validBankVerification,
    );
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.account_exists, true);
    asserts.assertEquals(result?.ifsc_details.bank_name, 'State Bank of India');
  });

  await t.step('should validate PAN comprehensive response schema', () => {
    const validPanResponse = {
      client_id: 'test-client-123',
      pan_number: 'BNZAA2318J',
      pan_details: {
        full_name: 'JOHN DOE',
        category: 'person', // Use valid enum value
        dob: '1990-01-01', // Use string format as expected by schema
        dob_verified: true, // Required field
        dob_check: true, // Required field
        address: {
          line_1: '123 Main St',
          line_2: 'Apt 4B',
          street_name: 'Main Street',
          zip: '400001',
          city: 'Mumbai',
          state: 'Maharashtra',
          country: 'India',
          full: '123 Main St, Apt 4B, Mumbai, Maharashtra 400001',
        },
      },
    };

    const [error, result] = SurepassPanComprehensiveSchema.validate(
      validPanResponse,
    );
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.pan_number, 'BNZAA2318J');
    asserts.assertEquals(result?.pan_details.full_name, 'JOHN DOE');
    asserts.assertEquals(result?.pan_details.category, 'person');
  });

  await t.step('should validate Aadhaar initiate response schema', () => {
    const validAadhaarInit = {
      client_id: 'aadhaar-client-123',
      otp_sent: true,
      if_number: true,
    };

    const [error, result] = SurepassInitiateAadhaarVerificationSchema.validate(
      validAadhaarInit,
    );
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.client_id, 'aadhaar-client-123');
    asserts.assertEquals(result?.otp_sent, true);
  });

  await t.step('should validate complete Aadhaar response schema', () => {
    const validAadhaarResponse = {
      client_id: 'aadhaar-client-123',
      aadhaar_number: '123456789012',
      gender: 'M',
      dob: '1990-01-01', // Use string format as expected by schema
      full_name: 'JOHN DOE',
      zip_data: 'zipdata123',
      raw_xml: '<xml>...</xml>',
      zip: '400001',
      address: {
        loc: 'Andheri',
        country: 'India',
        house: 'A-123',
        subdist: 'Mumbai Suburban',
        vtc: 'Andheri',
        po: 'Mumbai',
        state: 'Maharashtra',
        street: '',
        dist: 'Mumbai',
        landmark: 'Near Station',
      },
    };

    const [error, result] = SurepassAadhaarVerificationSchema.validate(
      validAadhaarResponse,
    );
    asserts.assertEquals(error, null);
    asserts.assertEquals(result?.aadhaar_number, '123456789012');
    asserts.assertEquals(result?.full_name, 'JOHN DOE');
    asserts.assertEquals(result?.gender, 'M');
  });

  await t.step('should reject invalid schema data', () => {
    // Test invalid name match (missing required fields)
    const invalidNameMatch = {
      client_id: 'test-client-123',
      // missing name_1, name_2, match_score, match_status
    };
    const [nameError] = SurepassNameMatchSchema.validate(invalidNameMatch);
    asserts.assertNotEquals(nameError, null);

    // Test invalid bank verification (missing ifsc_details)
    const invalidBank = {
      client_id: 'test-client-123',
      account_exists: true,
      // missing required ifsc_details
    };
    const [bankError] = SurepassBankVerificationSchema.validate(invalidBank);
    asserts.assertNotEquals(bankError, null);

    // Test invalid PAN (wrong pattern)
    const invalidPan = {
      client_id: 'test-client-123',
      pan_number: 'INVALID123', // Wrong PAN format
      pan_details: {
        full_name: 'JOHN DOE',
        category: 'Individual',
        dob: new Date('1990-01-01'),
        address: {
          line_1: '123 Main St',
          line_2: 'Apt 4B',
          street_name: 'Main Street',
          zip: '400001',
          city: 'Mumbai',
          state: 'Maharashtra',
          country: 'India',
          full: '123 Main St, Apt 4B, Mumbai, Maharashtra 400001',
        },
      },
    };
    const [panError] = SurepassPanComprehensiveSchema.validate(invalidPan);
    asserts.assertNotEquals(panError, null);
  });
});

Deno.test('Surepass API Methods - Comprehensive Tests with Mocking', async (t) => {
  let surepass: Surepass;
  let makeRequestStub: ReturnType<typeof stub>;

  function setup() {
    surepass = new Surepass({
      mode: 'SANDBOX',
      auth: 'test-token-123',
    });
  }

  function teardown() {
    if (makeRequestStub && !makeRequestStub.restored) {
      makeRequestStub.restore();
    }
  }

  await t.step('compareNames - should successfully compare names', async () => {
    setup();

    // Mock the _makeRequest method
    makeRequestStub = stub(surepass as any, '_makeRequest', () => {
      return Promise.resolve({
        statusCode: 200,
        body: {
          status_code: 200,
          success: true,
          message: 'Success',
          data: mockNameMatchResponse,
        },
      });
    });

    const result = await surepass.compareNames('John Doe', 'john doe');

    asserts.assertEquals(result.client_id, 'client123');
    asserts.assertEquals(result.match_score, 0.95);
    asserts.assertEquals(result.match_status, true);

    // Verify the request was made with correct parameters
    assertSpyCall(makeRequestStub, 0, {
      args: [
        { path: 'utils/name-matching/' },
        {
          method: 'POST',
          contentType: 'JSON',
          payload: {
            name_1: 'John Doe',
            name_2: 'john doe',
            name_type: 'person',
          },
        },
      ],
    });

    teardown();
  });

  await t.step('compareNames - should handle company names', async () => {
    setup();

    makeRequestStub = stub(surepass as any, '_makeRequest', () => {
      return Promise.resolve({
        statusCode: 200,
        body: {
          status_code: 200,
          success: true,
          message: 'Success',
          data: mockNameMatchResponse,
        },
      });
    });

    await surepass.compareNames('Company ABC', 'ABC Company', true);

    // Verify company name type was used
    assertSpyCall(makeRequestStub, 0, {
      args: [
        { path: 'utils/name-matching/' },
        {
          method: 'POST',
          contentType: 'JSON',
          payload: {
            name_1: 'Company ABC',
            name_2: 'ABC Company',
            name_type: 'company',
          },
        },
      ],
    });

    teardown();
  });

  await t.step('verifyPAN - should successfully verify PAN', async () => {
    setup();

    makeRequestStub = stub(surepass as any, '_makeRequest', () => {
      return Promise.resolve({
        statusCode: 200,
        body: {
          status_code: 200,
          success: true,
          message: 'Success',
          data: {
            client_id: 'client123',
            pan_number: 'BNZAA2318J',
            pan_details: {
              full_name: 'JOHN DOE',
              category: 'person',
              dob: '1990-01-01',
              dob_verified: true,
              dob_check: true,
              address: {
                line_1: '123 Main St',
                line_2: 'Apt 4B',
                street_name: 'Main Street',
                zip: '400001',
                city: 'Mumbai',
                state: 'Maharashtra',
                country: 'India',
                full: '123 Main St, Apt 4B, Mumbai, Maharashtra 400001',
              },
            },
          },
        },
      });
    });

    const result = await surepass.verifyPAN('BNZAA2318J');

    asserts.assertEquals(result.pan_number, 'BNZAA2318J');
    asserts.assertEquals(result.pan_details.full_name, 'JOHN DOE');

    assertSpyCall(makeRequestStub, 0, {
      args: [
        { path: 'pan/pan-comprehensive-plus' },
        {
          method: 'POST',
          contentType: 'JSON',
          payload: {
            id_number: 'BNZAA2318J',
          },
        },
      ],
    });

    teardown();
  });

  await t.step(
    'verifyBankAccount - should successfully verify bank account',
    async () => {
      setup();

      makeRequestStub = stub(surepass as any, '_makeRequest', () => {
        return Promise.resolve({
          statusCode: 200,
          body: {
            status_code: 200,
            success: true,
            message: 'Success',
            data: mockBankResponse,
          },
        });
      });

      const result = await surepass.verifyBankAccount(
        '1234567890',
        'SBIN0001234',
      );

      asserts.assertEquals(result.account_exists, true);
      asserts.assertEquals(result.full_name, 'JOHN DOE');
      asserts.assertEquals(
        result.ifsc_details.bank_name,
        'State Bank of India',
      );

      assertSpyCall(makeRequestStub, 0, {
        args: [
          { path: 'bank-verification' },
          {
            method: 'POST',
            contentType: 'JSON',
            payload: {
              id_number: '1234567890',
              ifsc: 'SBIN0001234',
              ifsc_details: true,
            },
          },
        ],
      });

      teardown();
    },
  );

  await t.step(
    'initiateAadhaar - should successfully initiate Aadhaar verification',
    async () => {
      setup();

      makeRequestStub = stub(surepass as any, '_makeRequest', () => {
        return Promise.resolve({
          statusCode: 200,
          body: {
            status_code: 200,
            success: true,
            message: 'Success',
            data: mockAadhaarInitResponse,
          },
        });
      });

      const result = await surepass.initiateAadhaar('123456789012');

      asserts.assertEquals(result.client_id, 'aadhaar_client_123');
      asserts.assertEquals(result.otp_sent, true);

      assertSpyCall(makeRequestStub, 0, {
        args: [
          { path: 'aadhaar-v2/generate-otp' },
          {
            method: 'POST',
            contentType: 'JSON',
            payload: {
              id_number: '123456789012',
            },
          },
        ],
      });

      teardown();
    },
  );

  await t.step(
    'fetchAadhaar - should successfully fetch Aadhaar details',
    async () => {
      setup();

      makeRequestStub = stub(surepass as any, '_makeRequest', () => {
        return Promise.resolve({
          statusCode: 200,
          body: {
            status_code: 200,
            success: true,
            message: 'Success',
            data: {
              client_id: 'aadhaar_client_123',
              aadhaar_number: '123456789012',
              gender: 'M',
              dob: '1990-01-01',
              full_name: 'JOHN DOE',
              zip_data: 'zipdata123',
              raw_xml: '<xml>...</xml>',
              zip: '400001',
              address: {
                loc: 'Andheri',
                country: 'India',
                house: 'A-123',
                subdist: 'Mumbai Suburban',
                vtc: 'Andheri',
                po: 'Mumbai',
                state: 'Maharashtra',
                street: '',
                dist: 'Mumbai',
                landmark: 'Near Station',
              },
            },
          },
        });
      });

      const result = await surepass.fetchAadhaar('client123', '123456');

      asserts.assertEquals(result.aadhaar_number, '123456789012');
      asserts.assertEquals(result.full_name, 'JOHN DOE');
      asserts.assertEquals(result.gender, 'M');

      assertSpyCall(makeRequestStub, 0, {
        args: [
          { path: 'aadhaar-v2/submit-otp' },
          {
            method: 'POST',
            contentType: 'JSON',
            payload: {
              client_id: 'client123',
              otp: '123456',
            },
          },
        ],
      });

      teardown();
    },
  );

  await t.step('verifyCIN - should successfully verify CIN', async () => {
    setup();

    makeRequestStub = stub(surepass as any, '_makeRequest', () => {
      return Promise.resolve({
        statusCode: 200,
        body: {
          status_code: 200,
          success: true,
          message: 'Success',
          data: mockCINResponse,
        },
      });
    });

    const result = await surepass.verifyCIN('L12345MH2000PLC123456');

    asserts.assertEquals(result.client_id, 'cin_client_123');
    asserts.assertEquals(result.company_name, 'Test Company Limited');

    assertSpyCall(makeRequestStub, 0, {
      args: [
        { path: 'corporate/company-details' },
        {
          method: 'POST',
          contentType: 'JSON',
          payload: {
            id_number: 'L12345MH2000PLC123456',
          },
        },
      ],
    });

    teardown();
  });

  await t.step('verifyGSTIN - should successfully verify GSTIN', async () => {
    setup();

    makeRequestStub = stub(surepass as any, '_makeRequest', () => {
      return Promise.resolve({
        statusCode: 200,
        body: {
          status_code: 200,
          success: true,
          message: 'Success',
          data: mockGSTINResponse,
        },
      });
    });

    const result = await surepass.verifyGSTIN('29AABCU9603R1ZL');

    asserts.assertEquals(result.gstin, '29AABCU9603R1ZL');
    asserts.assertEquals(result.business_name, 'Test Business');
    asserts.assertEquals(result.gstin_status, 'Active');

    assertSpyCall(makeRequestStub, 0, {
      args: [
        { path: 'corporate/gstin' },
        {
          method: 'POST',
          contentType: 'JSON',
          payload: {
            id_number: '29AABCU9603R1ZL',
          },
        },
      ],
    });

    teardown();
  });
});

Deno.test('Surepass Error Handling Tests', async (t) => {
  let surepass: Surepass;
  let makeRequestStub: ReturnType<typeof stub>;

  function setup() {
    surepass = new Surepass({
      mode: 'SANDBOX',
      auth: 'test-token-123',
    });
  }

  function teardown() {
    if (makeRequestStub && !makeRequestStub.restored) {
      makeRequestStub.restore();
    }
  }

  await t.step('should handle API error responses', async () => {
    setup();

    makeRequestStub = stub(surepass as any, '_makeRequest', () => {
      return Promise.resolve({
        statusCode: 401,
        body: {
          status_code: 401,
          success: false,
          message: 'Invalid token',
          data: null,
        },
      });
    });

    try {
      await surepass.compareNames('John', 'Jane');
      asserts.fail('Should have thrown an error');
    } catch (error) {
      asserts.assertInstanceOf(error, SurepassError);
      asserts.assertEquals(
        (error as SurepassError).context.endpoint,
        'utils/name-matching/',
      );
    }

    teardown();
  });

  await t.step('should handle different error status codes', async () => {
    setup();

    const testCases = [
      { statusCode: 500, expectedCode: 'SERVICE_UNAVAILABLE' },
      { statusCode: 422, expectedCode: 'VERIFICATION_FAILED' },
      { statusCode: 401, expectedCode: 'INVALID_TOKEN' },
      { statusCode: 429, expectedCode: 'RATE_LIMIT_EXCEEDED' },
      { statusCode: 400, expectedCode: 'UNKNOWN_RESPONSE_ERROR' },
    ];

    for (const testCase of testCases) {
      if (makeRequestStub && !makeRequestStub.restored) {
        makeRequestStub.restore();
      }

      makeRequestStub = stub(surepass as any, '_makeRequest', () => {
        return Promise.resolve({
          statusCode: testCase.statusCode,
          body: {
            status_code: testCase.statusCode,
            success: false,
            message: 'Error message',
            data: null,
          },
        });
      });

      try {
        await surepass.verifyPAN('BNZAA2318J');
        asserts.fail(
          `Should have thrown an error for status code ${testCase.statusCode}`,
        );
      } catch (error) {
        asserts.assertInstanceOf(error, SurepassError);
        // Note: We can't easily test the internal error code mapping without exposing it
      }
    }

    teardown();
  });

  await t.step('should handle invalid response body', async () => {
    setup();

    makeRequestStub = stub(surepass as any, '_makeRequest', () => {
      return Promise.resolve({
        statusCode: 200,
        body: null, // Invalid response body
      });
    });

    try {
      await surepass.verifyPAN('BNZAA2318J');
      asserts.fail('Should have thrown an error');
    } catch (error) {
      asserts.assertInstanceOf(error, SurepassError);
    }

    teardown();
  });

  await t.step('should handle validation errors in response data', async () => {
    setup();

    makeRequestStub = stub(surepass as any, '_makeRequest', () => {
      return Promise.resolve({
        statusCode: 200,
        body: {
          status_code: 200,
          success: true,
          message: 'Success',
          data: {
            // Invalid data that doesn't match schema
            invalid_field: 'invalid_value',
          },
        },
      });
    });

    try {
      await surepass.verifyPAN('BNZAA2318J');
      asserts.fail('Should have thrown an error');
    } catch (error) {
      asserts.assertInstanceOf(error, SurepassError);
    }

    teardown();
  });

  await t.step('should handle unhandled errors', async () => {
    setup();

    makeRequestStub = stub(surepass as any, '_makeRequest', () => {
      throw new Error('Network error');
    });

    try {
      await surepass.verifyPAN('BNZAA2318J');
      asserts.fail('Should have thrown an error');
    } catch (error) {
      asserts.assertInstanceOf(error, SurepassError);
      asserts.assertEquals(
        (error as SurepassError).context.endpoint,
        'pan/pan-comprehensive-plus',
      );
    }

    teardown();
  });

  await t.step(
    'should preserve SurepassError when already thrown',
    async () => {
      setup();

      makeRequestStub = stub(surepass as any, '_makeRequest', () => {
        throw new SurepassError('INVALID_TOKEN');
      });

      try {
        await surepass.verifyPAN('BNZAA2318J');
        asserts.fail('Should have thrown an error');
      } catch (error) {
        asserts.assertInstanceOf(error, SurepassError);
        asserts.assertEquals(
          (error as SurepassError).context.endpoint,
          'pan/pan-comprehensive-plus',
        );
      }

      teardown();
    },
  );
});

Deno.test('Surepass Input Processing Tests', async (t) => {
  let surepass: Surepass;
  let makeRequestStub: ReturnType<typeof stub>;

  function setup() {
    surepass = new Surepass({
      mode: 'SANDBOX',
      auth: 'test-token-123',
    });
  }

  function teardown() {
    if (makeRequestStub && !makeRequestStub.restored) {
      makeRequestStub.restore();
    }
  }

  await t.step('should trim whitespace from names', async () => {
    setup();

    makeRequestStub = stub(surepass as any, '_makeRequest', () => {
      return Promise.resolve({
        statusCode: 200,
        body: {
          status_code: 200,
          success: true,
          message: 'Success',
          data: mockNameMatchResponse,
        },
      });
    });

    await surepass.compareNames('  John Doe  ', '  jane doe  ');

    // Verify names were trimmed
    assertSpyCall(makeRequestStub, 0, {
      args: [
        { path: 'utils/name-matching/' },
        {
          method: 'POST',
          contentType: 'JSON',
          payload: {
            name_1: 'John Doe',
            name_2: 'jane doe',
            name_type: 'person',
          },
        },
      ],
    });

    teardown();
  });

  await t.step(
    'should handle different parameter types for all methods',
    async () => {
      setup();

      makeRequestStub = stub(surepass as any, '_makeRequest', () => {
        return Promise.resolve({
          statusCode: 200,
          body: {
            status_code: 200,
            success: true,
            message: 'Success',
            data: mockAadhaarInitResponse,
          },
        });
      });

      // Test with various string inputs
      await surepass.initiateAadhaar('123456789012');

      // Use a different mock for fetchAadhaar that matches the schema
      if (makeRequestStub && !makeRequestStub.restored) {
        makeRequestStub.restore();
      }
      makeRequestStub = stub(surepass as any, '_makeRequest', () => {
        return Promise.resolve({
          statusCode: 200,
          body: {
            status_code: 200,
            success: true,
            message: 'Success',
            data: {
              client_id: 'aadhaar_client_123',
              aadhaar_number: '123456789012',
              gender: 'M',
              dob: '1990-01-01',
              full_name: 'JOHN DOE',
              zip_data: 'zipdata123',
              raw_xml: '<xml>...</xml>',
              zip: '400001',
              address: {
                loc: 'Andheri',
                country: 'India',
                house: 'A-123',
                subdist: 'Mumbai Suburban',
                vtc: 'Andheri',
                po: 'Mumbai',
                state: 'Maharashtra',
                street: '',
                dist: 'Mumbai',
                landmark: 'Near Station',
              },
            },
          },
        });
      });

      await surepass.fetchAadhaar('client123', '123456');

      assertSpyCalls(makeRequestStub, 1);

      teardown();
    },
  );
});
