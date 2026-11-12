import * as asserts from '@asserts';
import { describe, it } from '@test';
import { parseJsonLossless } from './json.ts';

describe('Deribit.parseJsonLossless', () => {
  it('keeps unsafe integers as exact strings', () => {
    const text =
      '{"starbase_match_id":244591268720553984,"starbase_timestamp":1794004702749505936,"n":-9007199254740993}';
    asserts.assertEquals(parseJsonLossless(text), {
      starbase_match_id: '244591268720553984',
      starbase_timestamp: '1794004702749505936',
      n: '-9007199254740993',
    });
    // JSON.parse would have merged two neighbouring ids.
    asserts.assertEquals(
      JSON.parse('[244592457113677835,244592457113677834]')[0] ===
        JSON.parse('[244592457113677835,244592457113677834]')[1],
      true,
    );
    asserts.assertEquals(
      parseJsonLossless('[244592457113677835,244592457113677834]'),
      ['244592457113677835', '244592457113677834'],
    );
  });

  it('leaves safe integers, decimals, exponents and strings alone', () => {
    const value = {
      usIn: 1794003598052372,
      max: 9007199254740991,
      price: 75947.5,
      tiny: 1.565e-5,
      big: 1.0e4,
      s: 'id 1794004702749505936 "quoted" \\" 1234567890123456789',
    };
    asserts.assertEquals(parseJsonLossless(JSON.stringify(value)), value);
    asserts.assertEquals(
      parseJsonLossless('{"a":1.2345678901234567e+30}'),
      { a: 1.2345678901234567e+30 },
    );
  });

  it('throws on invalid JSON', () => {
    asserts.assertThrows(() => parseJsonLossless('{"a":12345678901234567'));
    asserts.assertThrows(() => parseJsonLossless('nope'));
  });
});
