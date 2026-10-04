import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CertificateSchemaObject,
  CUSTOM_HOSTNAME_SSL_STATUSES,
  CustomHostnameSslSchemaObject,
  ValidationRecordSchemaObject,
} from './CustomHostnameSsl.ts';

describe('CloudflareSaaS.schema.CustomHostnameSsl', () => {
  it('accepts a pending http-DCV block with validation records', () => {
    const [error, ssl] = CustomHostnameSslSchemaObject.safeParse({
      id: '0d89c70d-ad9f-4843-b99f-6cc0252067e9',
      type: 'dv',
      method: 'http',
      status: 'pending_validation',
      bundle_method: 'ubiquitous',
      certificate_authority: 'google',
      wildcard: false,
      settings: { min_tls_version: '1.2', http2: 'on', ciphers: null },
      validation_records: [{
        http_url:
          'http://app.customer.com/.well-known/pki-validation/ca3-x.txt',
        http_body: 'ca3-abc',
        status: 'pending',
      }],
      validation_errors: [{
        message: 'SERVFAIL looking up CAA for app.customer.com',
      }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(ssl?.validation_records?.[0]?.http_body, 'ca3-abc');
    asserts.assertEquals(
      ssl?.validation_errors?.[0]?.message?.startsWith('SERVFAIL'),
      true,
    );
  });

  it('accepts an active block with certificate details and an empty object', () => {
    asserts.assertEquals(
      CustomHostnameSslSchemaObject.safeParse({
        status: 'active',
        issuer: 'GoogleTrustServices',
        serial_number: '1234',
        signature: 'ECDSAWithSHA256',
        expires_on: '2027-01-01T00:00:00Z',
        hosts: ['app.customer.com'],
      })[0],
      null,
    );
    asserts.assertEquals(CustomHostnameSslSchemaObject.safeParse({})[0], null);
  });

  it('keeps an undocumented status and an additive field', () => {
    const [error, ssl] = CustomHostnameSslSchemaObject.safeParse({
      status: 'brand_new_state',
      brand_new: true,
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(ssl?.status, 'brand_new_state');
    asserts.assertEquals((ssl as Record<string, unknown>).brand_new, true);
  });

  it('rejects a coerced wildcard flag and a non-array validation_records', () => {
    asserts.assertExists(
      CustomHostnameSslSchemaObject.safeParse({ wildcard: 'no' })[0],
    );
    asserts.assertExists(
      CustomHostnameSslSchemaObject.safeParse({ validation_records: {} })[0],
    );
  });

  it('validation record: accepts txt, cname and email shapes', () => {
    asserts.assertEquals(
      ValidationRecordSchemaObject.safeParse({
        txt_name: '_acme-challenge.x',
        txt_value: 'v',
      })[0],
      null,
    );
    asserts.assertEquals(
      ValidationRecordSchemaObject.safeParse({
        cname: 'x',
        cname_target: 'y.dcv.cloudflare.com',
      })[0],
      null,
    );
    asserts.assertEquals(
      ValidationRecordSchemaObject.safeParse({
        emails: ['admin@customer.com'],
      })[0],
      null,
    );
    asserts.assertExists(
      ValidationRecordSchemaObject.safeParse({ emails: 'a@b.c' })[0],
    );
  });

  it('documents the status list', () => {
    asserts.assert(CUSTOM_HOSTNAME_SSL_STATUSES.includes('pending_validation'));
    asserts.assert(CUSTOM_HOSTNAME_SSL_STATUSES.includes('active'));
    asserts.assertEquals(CUSTOM_HOSTNAME_SSL_STATUSES.length, 21);
  });

  it('accepts certificates and the older top-level DCV fields', () => {
    const [error, ssl] = CustomHostnameSslSchemaObject.safeParse({
      txt_name: '_acme-challenge.x',
      txt_value: 'v',
      http_url: 'http://x/.well-known/pki-validation/a.txt',
      http_body: 'b',
      cname: 'c',
      cname_target: 'd.dcv.cloudflare.com',
      issued_on: '2026-10-04T12:00:00Z',
      certificates: [{
        issuer: 'LetsEncrypt',
        expires_on: '2027-01-01T00:00:00Z',
      }],
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(ssl?.certificates?.[0]?.issuer, 'LetsEncrypt');
    asserts.assertExists(
      CustomHostnameSslSchemaObject.safeParse({ certificates: {} })[0],
    );
  });

  it('certificate: every field optional, wrong types rejected', () => {
    asserts.assertEquals(CertificateSchemaObject.safeParse({})[0], null);
    asserts.assertExists(
      CertificateSchemaObject.safeParse({ expires_on: {} })[0],
    );
  });
});
