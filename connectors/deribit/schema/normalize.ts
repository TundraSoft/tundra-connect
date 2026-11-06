/**
 * @fileoverview Key normalisation shared by every Deribit schema: wire
 * snake_case becomes camelCase at every depth, and nothing is dropped.
 *
 * @module
 */

const camel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Deep-camelCases object keys; arrays and scalars pass through unchanged. */
export function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[camel(key)] = camelize(v);
  }
  return out;
}

/** Stringifies the exact-integer id fields that may arrive as numbers. */
export function stringifyIds(
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  for (const key of keys) {
    const v = value[key];
    if (typeof v === 'number') value[key] = String(v);
  }
  return value;
}
