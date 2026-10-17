import { GoogleCertificateManagerError } from './errors/mod.ts';

/**
 * The id rule Certificate Manager applies to `certificateId` and
 * `certificateMapEntryId` (and map ids): RFC 1035 labels — a lowercase
 * letter first, then lowercase letters, digits or hyphens, not ending in a
 * hyphen, 63 characters at most.
 */
export const RESOURCE_ID_PATTERN: RegExp =
  /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Longest prefix {@link hostnameToResourceId} accepts. */
const MAX_PREFIX_LENGTH = 20;
/** `-` plus the 8-hex-digit hash every derived id ends with. */
const HASH_SUFFIX_LENGTH = 9;

/** Options for {@link hostnameToResourceId}. */
export type HostnameToResourceIdOptions = {
  /**
   * Prepended as `<prefix>-`, e.g. `brevily` → `brevily-example-com-1a2b3c4d`.
   * Must itself start with a lowercase letter and contain only lowercase
   * letters, digits and hyphens; at most 20 characters.
   */
  prefix?: string;
};

/**
 * `true` when `id` is a valid Certificate Manager resource id (see
 * {@link RESOURCE_ID_PATTERN}).
 *
 * @example
 * ```ts
 * import { isValidResourceId } from '@tundraconnect/google-certificate-manager';
 *
 * isValidResourceId('example-com'); // true
 * isValidResourceId('example.com'); // false
 * ```
 */
export function isValidResourceId(id: string): boolean {
  return typeof id === 'string' && RESOURCE_ID_PATTERN.test(id);
}

/**
 * Derives a stable, valid Certificate Manager resource id from a hostname,
 * for use as both the certificate id and the map entry id of that
 * hostname.
 *
 * The id is the hostname lowercased with every run of characters outside
 * `[a-z0-9]` turned into one hyphen (a leading `*.` becomes `wildcard-`),
 * then `-` and an 8-hex-digit FNV-1a hash of the full normalised hostname.
 * The hash is always appended because the readable part alone collides:
 * `my-site.co.uk` and `my.site-co.uk` both slug to `my-site-co-uk`. Long
 * hostnames are truncated before the hash, so the result is always at
 * most 63 characters. Unicode hostnames are converted to punycode first,
 * and a trailing dot is ignored, so `Example.COM.` and `example.com` give
 * the same id. The hash is for uniqueness, not secrecy.
 *
 * @param hostname - The hostname, e.g. `go.example.com` or `*.example.com`.
 * @param options - See {@link HostnameToResourceIdOptions}.
 * @returns An id matching {@link RESOURCE_ID_PATTERN}.
 * @throws {GoogleCertificateManagerError} `REQUEST_VALIDATION_ERROR` when
 * `hostname` is empty or not a hostname, or `prefix` is invalid.
 *
 * @example
 * ```ts
 * import { hostnameToResourceId } from '@tundraconnect/google-certificate-manager';
 *
 * hostnameToResourceId('go.example.com'); // 'go-example-com-' + 8 hex digits
 * hostnameToResourceId('example.com', { prefix: 'brevily' }); // 'brevily-example-com-…'
 * ```
 */
export function hostnameToResourceId(
  hostname: string,
  options: HostnameToResourceIdOptions = {},
): string {
  const host = normaliseHostname(hostname);
  const { prefix } = options;
  if (prefix !== undefined) {
    if (
      typeof prefix !== 'string' || prefix.length > MAX_PREFIX_LENGTH ||
      !/^[a-z][a-z0-9-]*$/.test(prefix)
    ) {
      throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
        reason:
          `prefix: must start with a lowercase letter, contain only [a-z0-9-] and be at most ${MAX_PREFIX_LENGTH} characters`,
      });
    }
  }

  const slug = host.replace(/^\*\./, 'wildcard.')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  let head = prefix ? `${prefix.replace(/-+$/, '')}-${slug}` : slug;
  if (!/^[a-z]/.test(head)) head = `h-${head}`;
  head = head.slice(0, 63 - HASH_SUFFIX_LENGTH).replace(/-+$/, '');

  return `${head}-${fnv1a32(host)}`;
}

/**
 * Lowercases, trims, drops a trailing dot, punycodes a Unicode hostname and
 * checks the result looks like a hostname (optionally a `*.` wildcard).
 */
function normaliseHostname(hostname: string): string {
  if (typeof hostname !== 'string' || hostname.trim() === '') {
    throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
      reason: 'hostname: must be a non-empty string',
    });
  }
  let host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (/[^ -~]/.test(host)) {
    const wildcard = host.startsWith('*.');
    try {
      // WHATWG URL parsing applies UTS #46 (punycode) in every runtime,
      // Workers included.
      host = new URL(`http://${wildcard ? host.slice(2) : host}`).hostname;
    } catch {
      throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
        reason: `hostname: "${hostname}" is not a valid hostname`,
      });
    }
    if (wildcard) host = `*.${host}`;
  }
  if (
    host.length > 253 ||
    !/^(\*\.)?([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
      .test(host)
  ) {
    throw new GoogleCertificateManagerError('REQUEST_VALIDATION_ERROR', {
      reason: `hostname: "${hostname}" is not a valid hostname`,
    });
  }
  return host;
}

/** 32-bit FNV-1a over the UTF-16 code units of `value`, as 8 hex digits. */
function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
