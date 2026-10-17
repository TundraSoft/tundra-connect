import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  AuthorizationAttemptInfoSchemaObject,
  CertificateSchemaObject,
  ManagedCertificateSchemaObject,
  ProvisioningIssueSchemaObject,
} from './Certificate.ts';

describe('GoogleCertificateManager.schema.Certificate', () => {
  const full = {
    name: 'projects/p/locations/global/certificates/example-com',
    description: 'customer',
    createTime: '2026-10-17T10:00:00Z',
    updateTime: '2026-10-17T10:05:00.123456789Z',
    labels: { owner: 'brevily' },
    sanDnsnames: ['example.com'],
    pemCertificate: '-----BEGIN CERTIFICATE-----',
    expireTime: '2027-01-15T10:00:00Z',
    scope: 'DEFAULT',
    usedBy: [{
      name:
        '//certificatemanager.googleapis.com/projects/p/locations/global/certificateMaps/m/certificateMapEntries/e',
    }],
    managed: {
      domains: ['example.com'],
      state: 'ACTIVE',
      authorizationAttemptInfo: [{
        domain: 'example.com',
        state: 'AUTHORIZED',
      }],
    },
  };

  it('accepts a full managed certificate', () => {
    const cert = CertificateSchemaObject.parse(full);
    asserts.assertEquals(cert.managed?.state, 'ACTIVE');
    asserts.assertEquals(cert.labels, { owner: 'brevily' });
    asserts.assertEquals(cert.usedBy?.length, 1);
  });

  it('accepts a minimal certificate and unknown fields', () => {
    const cert = CertificateSchemaObject.parse({
      name: 'projects/p/locations/global/certificates/x',
      somethingNew: true,
    }) as Record<string, unknown>;
    asserts.assertEquals(cert.somethingNew, true);
  });

  it('keeps an enum value Google adds later', () => {
    const managed = ManagedCertificateSchemaObject.parse({
      state: 'SOME_NEW_STATE',
    });
    asserts.assertEquals(managed.state, 'SOME_NEW_STATE');
  });

  it('rejects a certificate without a name or with a bad label value', () => {
    for (
      const bad of [
        {},
        { name: '' },
        { ...full, labels: { owner: null } },
        { ...full, managed: { domains: 'example.com' } },
      ]
    ) {
      const [error] = CertificateSchemaObject.safeParse(bad);
      asserts.assertExists(error, JSON.stringify(bad));
    }
  });

  it('parses provisioning issues and authorization attempts', () => {
    asserts.assertEquals(
      ProvisioningIssueSchemaObject.parse({ reason: 'RATE_LIMITED' }).reason,
      'RATE_LIMITED',
    );
    const attempt = AuthorizationAttemptInfoSchemaObject.parse({
      domain: 'example.com',
      state: 'FAILED',
      failureReason: 'CAA',
      details: 'CAA forbids issuance',
    });
    asserts.assertEquals(attempt.failureReason, 'CAA');
    const [error] = AuthorizationAttemptInfoSchemaObject.safeParse({
      domain: ['x'],
    });
    asserts.assertExists(error);
  });
});
