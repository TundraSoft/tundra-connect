import * as asserts from '@asserts';
import { describe, it } from '@test';
import { OrderbookSchemaObject } from './Orderbook.ts';

describe('Orderbook schema', () => {
  it('unwraps orderbook_fp and coerces price/count pairs to numbers', () => {
    const book = OrderbookSchemaObject.parse({
      orderbook_fp: {
        yes_dollars: [['0.15', '100.00'], ['0.14', '50.00']],
        no_dollars: [['0.80', '20.00']],
      },
    });
    asserts.assertEquals(book.yes.length, 2);
    asserts.assertEquals(book.yes[0], { price: 0.15, count: 100 });
    asserts.assertEquals(book.no[0], { price: 0.8, count: 20 });
  });

  it('defaults missing sides to empty arrays', () => {
    const book = OrderbookSchemaObject.parse({ orderbook_fp: {} });
    asserts.assertEquals(book.yes, []);
    asserts.assertEquals(book.no, []);
  });

  it('tolerates a completely empty response', () => {
    const book = OrderbookSchemaObject.parse({});
    asserts.assertEquals(book.yes, []);
    asserts.assertEquals(book.no, []);
  });
});
