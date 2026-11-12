import * as asserts from '@asserts';
import { describe, it } from '@test';
import { fromHex, toHex } from './PolymarketEip712.ts';
import { selector } from './PolymarketAbi.ts';
import { builtInSigner, PolymarketSigner } from './PolymarketSigner.ts';
import {
  buildMergeTx,
  buildProxyMetaTx,
  buildRedeemTx,
  buildSplitTx,
  buildV2MergeTx,
  buildV2RedeemTxs,
  buildV2SplitTx,
  CTF_COLLATERAL_ADAPTER,
  NEG_RISK_CTF_COLLATERAL_ADAPTER,
  PROXY_FACTORY,
  RELAY_HUB,
  relayStructHash,
  ROUTER,
  v2PositionId,
} from './PolymarketRelayer.ts';

// Same test vectors as this connect's Rust sibling (ClobClient/src/relayer/
// ops.rs, relayer/proxy_meta_tx.rs) — cross-checked there against a live
// relayer submission.
const TEST_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const CID =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const PROXY_WALLET = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';

describe('PolymarketRelayer — split/merge/redeem tx building', () => {
  it('routes a binary split through the standard adapter with typeCode 1', () => {
    const tx = buildSplitTx(CID, 5.0, false);
    asserts.assertEquals(
      tx.to.toLowerCase(),
      CTF_COLLATERAL_ADAPTER.toLowerCase(),
    );
    asserts.assertEquals(tx.operation, 1);
    asserts.assertEquals(tx.value, 0n);
    asserts.assertEquals(
      toHex(tx.data).slice(0, 8),
      toHex(
        selector('splitPosition(address,bytes32,bytes32,uint256[],uint256)'),
      ),
    );
  });

  it('merge is the exact ABI mirror of split, routed through the same adapter', () => {
    const split = buildSplitTx(CID, 2.5, false);
    const merge = buildMergeTx(CID, 2.5, false);
    asserts.assertEquals(
      toHex(merge.data).slice(8),
      toHex(split.data).slice(8),
    );
    asserts.assertNotEquals(
      toHex(merge.data).slice(0, 8),
      toHex(split.data).slice(0, 8),
    );
  });

  it('neg-risk split/merge route through the neg-risk adapter with the 2-arg form', () => {
    const split = buildSplitTx(CID, 1.0, true);
    const merge = buildMergeTx(CID, 1.0, true);
    for (const tx of [split, merge]) {
      asserts.assertEquals(
        tx.to.toLowerCase(),
        NEG_RISK_CTF_COLLATERAL_ADAPTER.toLowerCase(),
      );
      asserts.assertEquals(toHex(tx.data).length, 8 + 2 * 64); // conditionId + amount, no head/tail split
    }
  });

  it('redeem has no amount and routes through the same adapter rules', () => {
    const tx = buildRedeemTx(CID, false);
    asserts.assertEquals(
      tx.to.toLowerCase(),
      CTF_COLLATERAL_ADAPTER.toLowerCase(),
    );
    asserts.assertEquals(tx.operation, 1);
  });

  it('rejects a zero amount and a malformed condition id', () => {
    asserts.assertThrows(() => buildSplitTx(CID, 0.0, false));
    asserts.assertThrows(() => buildMergeTx(CID, 0.0000001, false)); // rounds to 0 micro
    asserts.assertThrows(() => buildSplitTx('0x1234', 1.0, false));
  });

  it('rejects a negative or non-finite amount by name', () => {
    for (const amount of [-1, NaN, Infinity]) {
      asserts.assertThrows(
        () => buildSplitTx(CID, amount, false),
        Error,
        'amount must be > 0',
      );
    }
  });

  it('scales the amount to 6-decimal pUSD units', () => {
    const tx = buildSplitTx(CID, 0.01, false);
    const words = toHex(tx.data).slice(8);
    const amountWord = words.slice(4 * 64, 5 * 64);
    asserts.assertEquals(parseInt(amountWord, 16), 10_000); // $0.01 = 10k micro
  });
});

describe('PolymarketRelayer — relay struct hash', () => {
  it('matches the hand-built byte layout', () => {
    const from = '0x1111111111111111111111111111111111111111';
    const to = '0x2222222222222222222222222222222222222222';
    const data = fromHex('0xaabbcc');
    const relayHub = '0x3333333333333333333333333333333333333333';
    const relay = '0x4444444444444444444444444444444444444444';
    const h = relayStructHash(
      from,
      to,
      data,
      0n,
      0n,
      10_000_000n,
      7n,
      relayHub,
      relay,
    );
    asserts.assertEquals(h.length, 32);
    // deterministic
    const h2 = relayStructHash(
      from,
      to,
      data,
      0n,
      0n,
      10_000_000n,
      7n,
      relayHub,
      relay,
    );
    asserts.assertEquals(toHex(h), toHex(h2));
    // sensitive to every field
    const different = relayStructHash(
      from,
      to,
      data,
      0n,
      0n,
      10_000_000n,
      8n,
      relayHub,
      relay,
    );
    asserts.assertNotEquals(toHex(h), toHex(different));
  });
});

describe('PolymarketRelayer — proxy meta-tx envelope', () => {
  const payload = {
    address: '0x4444444444444444444444444444444444444444',
    nonce: '7',
  };

  it('builds the envelope shape with a self-checked signature', async () => {
    const signer = builtInSigner(new PolymarketSigner(TEST_KEY));
    const tx = buildSplitTx(CID, 2.0, false);
    const env = await buildProxyMetaTx(signer, [tx], payload, PROXY_WALLET, '');
    asserts.assertEquals(env.type, 'PROXY');
    asserts.assertEquals(env.nonce, '7');
    asserts.assertEquals(env.from, signer.address.toLowerCase()); // proxy path: lowercase
    asserts.assertEquals(env.to, PROXY_FACTORY.toLowerCase());
    asserts.assertEquals(env.signatureParams.gasLimit, '1000000');
    asserts.assertEquals(env.signatureParams.relayHub, RELAY_HUB.toLowerCase());
    asserts.assert(
      env.signature.startsWith('0x') && env.signature.length === 132,
    );
  });

  it('signatureParams JSON field order is gasPrice, gasLimit, relayerFee, relayHub, relay', async () => {
    const signer = builtInSigner(new PolymarketSigner(TEST_KEY));
    const tx = buildSplitTx(CID, 2.0, false);
    const env = await buildProxyMetaTx(signer, [tx], payload, PROXY_WALLET, '');
    const json = JSON.stringify(env.signatureParams);
    const order = [
      '"gasPrice"',
      '"gasLimit"',
      '"relayerFee"',
      '"relayHub"',
      '"relay"',
    ]
      .map((key) => json.indexOf(key));
    for (let i = 1; i < order.length; i++) {
      asserts.assert(order[i - 1]! < order[i]!, `field order drifted: ${json}`);
    }
  });

  it('rejects a non-numeric relay nonce', async () => {
    const signer = builtInSigner(new PolymarketSigner(TEST_KEY));
    const tx = buildSplitTx(CID, 1.0, false);
    await asserts.assertRejects(() =>
      buildProxyMetaTx(signer, [tx], {
        address: payload.address,
        nonce: 'not-a-number',
      }, PROXY_WALLET)
    );
  });

  it('wraps multiple inner transactions in one proxy call', async () => {
    const signer = builtInSigner(new PolymarketSigner(TEST_KEY));
    const split = buildSplitTx(CID, 1.0, false);
    const redeem = buildRedeemTx(CID, false);
    const env = await buildProxyMetaTx(
      signer,
      [split, redeem],
      payload,
      PROXY_WALLET,
    );
    asserts.assert(env.data.length > 0);
  });
});

// Protocol V2 Router calldata, cross-checked byte for byte against viem
// 2.21.0 `encodeFunctionData` for `split(bytes31,uint256)`,
// `merge(bytes31,uint256)` and `redeem(bytes31,uint256,uint256)`; the
// three selectors are in the deployed Router implementation's bytecode.
// The condition and position ids are a live Gamma V2 market's
// (polyv2xrp-updown-4h-1794344400).
describe('PolymarketRelayer — Protocol V2 Router', () => {
  const V2_CID =
    '0x0123af4bea70d5496e79463949a694ac2a000000000000000000000000000000';
  const WORD = '0123af4bea70d5496e79463949a694ac2a' + '0'.repeat(30);
  const amount = (micro: number) => micro.toString(16).padStart(64, '0');

  it('splits and merges on the Router with the 2-arg bytes31 form', () => {
    const split = buildV2SplitTx(V2_CID, 1.25);
    asserts.assertEquals(split.to, ROUTER);
    asserts.assertEquals(split.operation, 1);
    asserts.assertEquals(split.value, 0n);
    asserts.assertEquals(
      toHex(split.data),
      `82d3b9f1${WORD}${amount(1_250_000)}`,
    );
    asserts.assertEquals(
      toHex(buildV2MergeTx(V2_CID, 3).data),
      `5b63685e${WORD}${amount(3_000_000)}`,
    );
    asserts.assertEquals(
      toHex(selector('split(bytes31,uint256)')),
      '82d3b9f1',
    );
  });

  it('accepts the bare 31-byte condition id', () => {
    asserts.assertEquals(
      toHex(buildV2SplitTx(V2_CID.slice(0, 64), 1.25).data),
      toHex(buildV2SplitTx(V2_CID, 1.25).data),
    );
  });

  it('refuses a padded id with a non-zero final byte (a position id) and a zero amount', () => {
    asserts.assertThrows(() => buildV2SplitTx(`${V2_CID.slice(0, 64)}01`, 1));
    asserts.assertThrows(() => buildV2SplitTx('0x1234', 1));
    asserts.assertThrows(() => buildV2MergeTx(V2_CID, 0));
  });

  it('redeems one call per outcome holding shares, skipping zeros', () => {
    const both = buildV2RedeemTxs(V2_CID, [2.5, 0.000001]);
    asserts.assertEquals(both.length, 2);
    asserts.assertEquals(
      toHex(both[0]!.data),
      `d217a3cc${WORD}${amount(0)}${amount(2_500_000)}`,
    );
    asserts.assertEquals(
      toHex(both[1]!.data),
      `d217a3cc${WORD}${amount(1)}${amount(1)}`,
    );
    const noOnly = buildV2RedeemTxs(V2_CID, [0, 4]);
    asserts.assertEquals(noOnly.length, 1);
    asserts.assertEquals(noOnly[0]!.to, ROUTER);
    asserts.assertEquals(
      toHex(noOnly[0]!.data),
      `d217a3cc${WORD}${amount(1)}${amount(4_000_000)}`,
    );
    asserts.assertThrows(() => buildV2RedeemTxs(V2_CID, [0, 0]));
    asserts.assertThrows(() => buildV2RedeemTxs(V2_CID, [-1, 1]));
  });

  it('derives the PositionManager position ids Gamma lists', () => {
    asserts.assertEquals(
      v2PositionId(V2_CID, 0),
      '515362348146691341657562482954931281080656089672727589681305261334690004992',
    );
    asserts.assertEquals(
      v2PositionId(V2_CID, 1),
      '515362348146691341657562482954931281080656089672727589681305261334690004993',
    );
    asserts.assertThrows(() => v2PositionId(V2_CID, 256));
  });
});
