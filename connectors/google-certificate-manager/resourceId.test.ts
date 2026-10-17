import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  hostnameToResourceId,
  isValidResourceId,
  RESOURCE_ID_PATTERN,
} from './resourceId.ts';
import { GoogleCertificateManagerError } from './errors/mod.ts';

describe('GoogleCertificateManager.resourceId', () => {
  it('slugs the hostname and appends an 8-hex-digit hash', () => {
    const id = hostnameToResourceId('go.example.com');
    asserts.assertMatch(id, /^go-example-com-[0-9a-f]{8}$/);
    asserts.assert(isValidResourceId(id));
  });

  it('is deterministic and ignores case, whitespace and a trailing dot', () => {
    const id = hostnameToResourceId('example.com');
    asserts.assertEquals(hostnameToResourceId(' Example.COM. '), id);
    asserts.assertEquals(hostnameToResourceId('example.com'), id);
  });

  it('keeps hostnames whose slugs collide apart', () => {
    const a = hostnameToResourceId('my-site.co.uk');
    const b = hostnameToResourceId('my.site-co.uk');
    asserts.assertEquals(a.slice(0, -9), b.slice(0, -9));
    asserts.assertNotEquals(a, b);
  });

  it('applies a prefix', () => {
    asserts.assertMatch(
      hostnameToResourceId('example.com', { prefix: 'brevily' }),
      /^brevily-example-com-[0-9a-f]{8}$/,
    );
  });

  it('starts with a letter even when the hostname does not', () => {
    const id = hostnameToResourceId('1password.com');
    asserts.assertMatch(id, /^h-1password-com-[0-9a-f]{8}$/);
    asserts.assert(isValidResourceId(id));
  });

  it('names a wildcard', () => {
    asserts.assertMatch(
      hostnameToResourceId('*.example.com'),
      /^wildcard-example-com-[0-9a-f]{8}$/,
    );
    asserts.assertNotEquals(
      hostnameToResourceId('*.example.com'),
      hostnameToResourceId('wildcard.example.com'),
    );
  });

  it('caps the id at 63 characters without a trailing hyphen before the hash', () => {
    const long = `${'a'.repeat(50)}.${'b'.repeat(50)}.example.com`;
    const id = hostnameToResourceId(long, { prefix: 'brevily' });
    asserts.assert(id.length <= 63, id);
    asserts.assert(isValidResourceId(id), id);
    asserts.assertEquals(id.includes('--'), false);
    // Different long hostnames sharing the truncated head still differ.
    const other = hostnameToResourceId(`${long.slice(0, -4)}.net`, {
      prefix: 'brevily',
    });
    asserts.assertNotEquals(id, other);
  });

  it('trims long runs of hyphens', () => {
    const host = `a${'-'.repeat(61)}a.${'b'.repeat(60)}.com`;
    const id = hostnameToResourceId(host, { prefix: 'p-' });
    asserts.assert(isValidResourceId(id), id);
    asserts.assertEquals(id.includes('--'), false);
  });

  it('punycodes a Unicode hostname', () => {
    const id = hostnameToResourceId('bücher.example');
    asserts.assertMatch(id, /^xn-bcher-kva-example-[0-9a-f]{8}$/);
    asserts.assertEquals(
      id,
      hostnameToResourceId('xn--bcher-kva.example'),
    );
  });

  it('rejects something that is not a hostname', () => {
    const bad: unknown[] = [
      '',
      '   ',
      undefined,
      'http://example.com',
      'example.com/path',
      'exa mple.com',
      '-example.com',
      'example..com',
      `${'a'.repeat(64)}.com`,
    ];
    for (const hostname of bad) {
      const err = asserts.assertThrows(
        () => hostnameToResourceId(hostname as string),
        GoogleCertificateManagerError,
      );
      asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    }
  });

  it('rejects an invalid prefix', () => {
    for (const prefix of ['', 'Brevily', '1abc', 'a_b', 'x'.repeat(21)]) {
      const err = asserts.assertThrows(
        () => hostnameToResourceId('example.com', { prefix }),
        GoogleCertificateManagerError,
      );
      asserts.assertEquals(err.code, 'REQUEST_VALIDATION_ERROR');
    }
  });

  it('validates resource ids', () => {
    for (const id of ['a', 'example-com', 'a1', `a${'b'.repeat(62)}`]) {
      asserts.assert(isValidResourceId(id), id);
      asserts.assert(RESOURCE_ID_PATTERN.test(id), id);
    }
    for (
      const id of ['', 'A', '1a', 'a-', 'a.b', 'a_b', `a${'b'.repeat(63)}`]
    ) {
      asserts.assertEquals(isValidResourceId(id), false, id);
    }
    asserts.assertEquals(isValidResourceId(42 as never), false);
  });
});
