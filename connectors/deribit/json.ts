/**
 * @fileoverview Lossless JSON parsing for Deribit payloads.
 *
 * Deribit sends some integers wider than 2^53 as bare JSON numbers —
 * `starbase_match_id` (≈2.4e17) and the nanosecond `starbase_timestamp`
 * (≈1.8e18) on every trade. `JSON.parse` silently rounds those to the
 * nearest double, so two different trades can end up with the same id.
 * This parser turns every integer literal that a double can't hold
 * exactly into a string before parsing, keeping all of its digits.
 * Everything else parses exactly as `JSON.parse` would.
 *
 * @module
 */

/** Integer literals this long or longer may exceed `Number.MAX_SAFE_INTEGER`. */
const LONG_INTEGER = /\d{16}/;

const isDigit = (c: number): boolean => c >= 48 && c <= 57;

/**
 * `JSON.parse`, except that an integer outside the safe range becomes a
 * string with its exact digits.
 *
 * @param text - JSON text.
 * @returns The parsed value.
 * @throws {SyntaxError} When `text` isn't valid JSON.
 *
 * @example
 * ```ts
 * import { parseJsonLossless } from '@tundraconnect/deribit';
 *
 * const trade = parseJsonLossless('{"starbase_timestamp":1794003632876548820}');
 * console.log(trade); // { starbase_timestamp: '1794003632876548820' }
 * ```
 */
export function parseJsonLossless(text: string): unknown {
  // Fast path: no 16-digit run anywhere means no unsafe integer.
  if (!LONG_INTEGER.test(text)) return JSON.parse(text);
  let out = '';
  let copied = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 92) i++; // backslash: skip the escaped char
      else if (c === 34) inString = false;
      continue;
    }
    if (c === 34) {
      inString = true;
      continue;
    }
    if (c !== 45 && !isDigit(c)) continue;
    let j = i + 1;
    while (j < text.length && isDigit(text.charCodeAt(j))) j++;
    const next = text[j];
    if (next === '.' || next === 'e' || next === 'E') {
      // A fraction or exponent: a double by definition. Skip the rest.
      j++;
      while (j < text.length && /[0-9eE+-]/.test(text[j]!)) j++;
    } else {
      const token = text.slice(i, j);
      if (!Number.isSafeInteger(Number(token))) {
        out += `${text.slice(copied, i)}"${token}"`;
        copied = j;
      }
    }
    i = j - 1;
  }
  return JSON.parse(copied === 0 ? text : out + text.slice(copied));
}
