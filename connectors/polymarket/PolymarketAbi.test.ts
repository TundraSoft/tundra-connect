import * as asserts from '@asserts';
import { describe, it } from '@test';
import { fromHex, keccak256, toHex } from './PolymarketEip712.ts';
import {
  encodeAdapterCall,
  encodeNegRiskAdapterCall,
  encodeNegRiskRedeemCall,
  encodeProxyCallData,
  encodeRedeemCall,
  selector,
} from './PolymarketAbi.ts';

// Same constants and test vectors as this connect's Rust sibling
// (ClobClient/src/relayer/ops.rs, relayer/proxy_meta_tx.rs) — the exact
// byte layout was cross-checked there against a live relayer submission.
const PUSD = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
const CID = fromHex(
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
);

function selectorHex(signature: string): string {
  return toHex(selector(signature));
}

/** Splits `0x`-stripped calldata hex into 32-byte (64-char) words after the 4-byte (8-char) selector. */
function words(dataHex: string): string[] {
  const body = dataHex.slice(8);
  const out: string[] = [];
  for (let i = 0; i < body.length; i += 64) out.push(body.slice(i, i + 64));
  return out;
}

describe('PolymarketAbi — selector', () => {
  it('is the first 4 bytes of keccak256(signature)', () => {
    const full = keccak256(
      new TextEncoder().encode('transfer(address,uint256)'),
    );
    asserts.assertEquals(
      toHex(selector('transfer(address,uint256)')),
      toHex(full).slice(0, 8),
    );
  });
});

describe('PolymarketAbi — split/merge (5-arg adapter form)', () => {
  it('matches the exact calldata layout for a binary split', () => {
    const data = toHex(
      encodeAdapterCall('splitPosition', PUSD, CID, [1n, 2n], 5_000_000n),
    );
    asserts.assertEquals(
      data.slice(0, 8),
      selectorHex('splitPosition(address,bytes32,bytes32,uint256[],uint256)'),
    );
    const w = words(data);
    asserts.assertEquals(w.length, 8);
    asserts.assert(w[0]!.endsWith('c011a7e12a19f7b1f670d46f03b03f3342e82dfb'));
    asserts.assertEquals(w[1], '0'.repeat(64)); // parentCollectionId
    asserts.assertEquals(w[2], toHex(CID));
    asserts.assertEquals(parseInt(w[3]!, 16), 0xa0); // partition offset
    asserts.assertEquals(parseInt(w[4]!, 16), 5_000_000);
    asserts.assertEquals(parseInt(w[5]!, 16), 2); // partition length
    asserts.assertEquals(parseInt(w[6]!, 16), 1);
    asserts.assertEquals(parseInt(w[7]!, 16), 2);
  });

  it('merge is the exact ABI mirror of split — same tail, different selector', () => {
    const split = toHex(
      encodeAdapterCall('splitPosition', PUSD, CID, [1n, 2n], 2_500_000n),
    );
    const merge = toHex(
      encodeAdapterCall('mergePositions', PUSD, CID, [1n, 2n], 2_500_000n),
    );
    asserts.assertEquals(merge.slice(8), split.slice(8));
    asserts.assertNotEquals(merge.slice(0, 8), split.slice(0, 8));
    asserts.assertEquals(
      merge.slice(0, 8),
      selectorHex('mergePositions(address,bytes32,bytes32,uint256[],uint256)'),
    );
  });

  it("scales the amount to 6-decimal pUSD micro units at the call site (not this module's job — verifies the layout accepts an arbitrary amount)", () => {
    const data = toHex(
      encodeAdapterCall('splitPosition', PUSD, CID, [1n, 2n], 10_000n),
    );
    asserts.assertEquals(parseInt(words(data)[4]!, 16), 10_000); // $0.01 = 10k micro
  });
});

describe('PolymarketAbi — neg-risk (2-arg form)', () => {
  it('splits and merges use the 2-arg selector with just conditionId + amount', () => {
    for (
      const [fn, sig] of [
        ['splitPosition', 'splitPosition(bytes32,uint256)'],
        ['mergePositions', 'mergePositions(bytes32,uint256)'],
      ] as const
    ) {
      const data = toHex(encodeNegRiskAdapterCall(fn, CID, 1_000_000n));
      asserts.assertEquals(data.slice(0, 8), selectorHex(sig));
      const w = words(data);
      asserts.assertEquals(w.length, 2);
      asserts.assertEquals(w[0], toHex(CID));
      asserts.assertEquals(parseInt(w[1]!, 16), 1_000_000);
    }
  });
});

describe('PolymarketAbi — redeem', () => {
  it('the standard form has no amount and covers both index sets', () => {
    const data = toHex(encodeRedeemCall(PUSD, CID, [1n, 2n]));
    asserts.assertEquals(
      data.slice(0, 8),
      selectorHex('redeemPositions(address,bytes32,bytes32,uint256[])'),
    );
    const w = words(data);
    asserts.assertEquals(w.length, 7); // 4 head + 3 tail, no amount anywhere
    asserts.assert(w[0]!.endsWith('c011a7e12a19f7b1f670d46f03b03f3342e82dfb'));
    asserts.assertEquals(w[2], toHex(CID));
    asserts.assertEquals(parseInt(w[3]!, 16), 0x80); // 4 head words × 32
    asserts.assertEquals(parseInt(w[4]!, 16), 2);
    asserts.assertEquals(parseInt(w[5]!, 16), 1);
    asserts.assertEquals(parseInt(w[6]!, 16), 2);
  });

  it('the neg-risk form takes explicit per-outcome amounts', () => {
    const data = toHex(encodeNegRiskRedeemCall(CID, [1n, 1n]));
    asserts.assertEquals(
      data.slice(0, 8),
      selectorHex('redeemPositions(bytes32,uint256[])'),
    );
    const w = words(data);
    asserts.assertEquals(w.length, 5); // conditionId + offset + len + [1,1]
    asserts.assertEquals(w[0], toHex(CID));
    asserts.assertEquals(parseInt(w[1]!, 16), 0x40);
    asserts.assertEquals(parseInt(w[2]!, 16), 2);
    asserts.assertEquals(parseInt(w[3]!, 16), 1);
    asserts.assertEquals(parseInt(w[4]!, 16), 1);
  });
});

describe('PolymarketAbi — proxy(calls[])', () => {
  it('wraps one inner tx with typeCode 1 and carries its data through', () => {
    const data = toHex(
      encodeProxyCallData([{
        to: '0x2222222222222222222222222222222222222222',
        value: 0n,
        data: fromHex('0xdeadbeef'),
        operation: 1,
      }]),
    );
    asserts.assertEquals(
      data.slice(0, 8),
      selectorHex('proxy((uint8,address,uint256,bytes)[])'),
    );
    asserts.assert(data.includes('deadbeef'));
  });

  it('wraps multiple inner txs, each with its own offset', () => {
    const data = toHex(
      encodeProxyCallData([
        {
          to: '0x1111111111111111111111111111111111111111',
          value: 0n,
          data: fromHex('0xaaaa'),
          operation: 1,
        },
        {
          to: '0x3333333333333333333333333333333333333333',
          value: 0n,
          data: fromHex('0xbbbbbb'),
          operation: 1,
        },
      ]),
    );
    asserts.assertEquals(
      data.slice(0, 8),
      selectorHex('proxy((uint8,address,uint256,bytes)[])'),
    );
    asserts.assert(data.includes('aaaa'));
    asserts.assert(data.includes('bbbbbb'));
  });
});
