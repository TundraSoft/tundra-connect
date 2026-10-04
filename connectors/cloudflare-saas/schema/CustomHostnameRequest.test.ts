import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  CreateCustomHostnameRequestSchemaObject,
  FallbackOriginRequestSchemaObject,
  MAX_HOSTNAME_LENGTH,
  SslRequestSchemaObject,
  UpdateCustomHostnameRequestSchemaObject,
} from './CustomHostnameRequest.ts';

describe('CloudflareSaaS.schema.CustomHostnameRequest', () => {
  it('accepts a full create request', () => {
    const [error, request] = CreateCustomHostnameRequestSchemaObject.safeParse({
      hostname: 'app.customer.com',
      ssl: {
        method: 'txt',
        type: 'dv',
        bundle_method: 'ubiquitous',
        certificate_authority: 'google',
        cloudflare_branding: false,
        wildcard: false,
        settings: {
          min_tls_version: '1.2',
          http2: 'on',
          tls_1_3: 'on',
          early_hints: 'off',
          ciphers: ['ECDHE-RSA-AES128-GCM-SHA256'],
        },
      },
      custom_metadata: { tenant: 'acme', flags: null },
      custom_origin_server: 'origin-acme.yourapp.com',
      custom_origin_sni: 'origin-acme.yourapp.com',
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(request?.ssl?.method, 'txt');
    asserts.assertEquals(request?.custom_metadata?.tenant, 'acme');
  });

  it('accepts a hostname alone, a wildcard, and a punycode label', () => {
    for (
      const hostname of [
        'app.customer.com',
        '*.customer.com',
        'xn--bcher-kva.example',
        'a.b',
      ]
    ) {
      asserts.assertEquals(
        CreateCustomHostnameRequestSchemaObject.safeParse({ hostname })[0],
        null,
        hostname,
      );
    }
  });

  it('rejects malformed hostnames before Cloudflare sees them', () => {
    for (
      const hostname of [
        '',
        ' ',
        'nodots',
        'has space.example',
        'under_score.example',
        '-leading.example',
        'trailing-.example',
        'http://app.customer.com',
        'app.customer.com/path',
        '*.*.customer.com',
        `${'a'.repeat(250)}.example.com`,
      ]
    ) {
      asserts.assertExists(
        CreateCustomHostnameRequestSchemaObject.safeParse({ hostname })[0],
        hostname,
      );
    }
    asserts.assertEquals(MAX_HOSTNAME_LENGTH, 255);
  });

  it('rejects an invalid ssl block', () => {
    asserts.assertExists(
      SslRequestSchemaObject.safeParse({ method: 'dns' })[0],
    );
    asserts.assertExists(SslRequestSchemaObject.safeParse({ type: 'ov' })[0]);
    asserts.assertExists(
      SslRequestSchemaObject.safeParse({ bundle_method: 'fast' })[0],
    );
    asserts.assertExists(
      SslRequestSchemaObject.safeParse({
        certificate_authority: 'verisign',
      })[0],
    );
    asserts.assertExists(
      SslRequestSchemaObject.safeParse({
        settings: { min_tls_version: '1.4' },
      })[0],
    );
    asserts.assertExists(
      SslRequestSchemaObject.safeParse({ wildcard: 'yes' })[0],
    );
    asserts.assertExists(
      SslRequestSchemaObject.safeParse({
        custom_cert_bundle: [{ custom_certificate: 'pem' }],
      })[0],
    );
  });

  it('accepts an empty ssl block and an empty update', () => {
    asserts.assertEquals(SslRequestSchemaObject.safeParse({})[0], null);
    asserts.assertEquals(
      UpdateCustomHostnameRequestSchemaObject.safeParse({})[0],
      null,
    );
  });

  it('update: drops a hostname (it cannot change) and rejects a malformed origin', () => {
    const [error, changes] = UpdateCustomHostnameRequestSchemaObject.safeParse({
      hostname: 'new.customer.com',
      ssl: { method: 'txt' },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals('hostname' in (changes ?? {}), false);
    asserts.assertExists(
      UpdateCustomHostnameRequestSchemaObject.safeParse({
        custom_origin_server: 'bad origin',
      })[0],
    );
  });

  it('fallback origin: requires a hostname', () => {
    asserts.assertEquals(
      FallbackOriginRequestSchemaObject.safeParse({
        origin: 'fallback.yourapp.com',
      })[0],
      null,
    );
    asserts.assertExists(FallbackOriginRequestSchemaObject.safeParse({})[0]);
    asserts.assertExists(
      FallbackOriginRequestSchemaObject.safeParse({
        origin: '203.0.113.1/x',
      })[0],
    );
  });
});
