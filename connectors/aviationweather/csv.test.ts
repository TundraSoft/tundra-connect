import * as asserts from '@asserts';
import { describe, it } from '@test';
import { parseCsv } from './csv.ts';

describe('AviationWeather.parseCsv', () => {
  it('splits quoted fields, escapes and both line ends', () => {
    asserts.assertEquals(
      parseCsv('a,b,c\r\n"x, y","say ""hi""",\n1,,3\n'),
      [['a', 'b', 'c'], ['x, y', 'say "hi"', ''], ['1', '', '3']],
    );
  });

  it('keeps a last line without a newline', () => {
    asserts.assertEquals(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
    asserts.assertEquals(parseCsv(''), []);
  });
});
