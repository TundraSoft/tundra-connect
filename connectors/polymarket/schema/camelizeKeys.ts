/**
 * Deep snake_case → camelCase key conversion for WebSocket payloads. Every
 * key is converted — modelled or not — so a socket event's `data` keeps
 * every field the venue sent under one naming scheme. Values are untouched;
 * the schemas coerce decimal strings to numbers.
 *
 * @internal Not part of the public schema barrel.
 */
export function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())] =
      camelizeKeys(inner);
  }
  return out;
}
