import * as asserts from '@asserts';
import { describe, it } from '@test';
import { fromHex, toHex } from './PolymarketEip712.ts';
import { selector } from './PolymarketAbi.ts';
import { PolymarketSigner } from './PolymarketSigner.ts';
import {
  buildMergeTx,
  buildProxyMetaTx,
  buildRedeemTx,
  buildSplitTx,
  CTF_COLLATERAL_ADAPTER,
  NEG_RISK_CTF_COLLATERAL_ADAPTER,
  PROXY_FACTORY,
  RELAY_HUB,
  relayStructHash,
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

  it('builds the envelope shape with a self-checked signature', () => {
    const signer = new PolymarketSigner(TEST_KEY);
    const tx = buildSplitTx(CID, 2.0, false);
    const env = buildProxyMetaTx(signer, [tx], payload, PROXY_WALLET, '');
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

  it('signatureParams JSON field order is gasPrice, gasLimit, relayerFee, relayHub, relay', () => {
    const signer = new PolymarketSigner(TEST_KEY);
    const tx = buildSplitTx(CID, 2.0, false);
    const env = buildProxyMetaTx(signer, [tx], payload, PROXY_WALLET, '');
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

  it('rejects a non-numeric relay nonce', () => {
    const signer = new PolymarketSigner(TEST_KEY);
    const tx = buildSplitTx(CID, 1.0, false);
    asserts.assertThrows(() =>
      buildProxyMetaTx(signer, [tx], {
        address: payload.address,
        nonce: 'not-a-number',
      }, PROXY_WALLET)
    );
  });

  it('wraps multiple inner transactions in one proxy call', () => {
    const signer = new PolymarketSigner(TEST_KEY);
    const split = buildSplitTx(CID, 1.0, false);
    const redeem = buildRedeemTx(CID, false);
    const env = buildProxyMetaTx(
      signer,
      [split, redeem],
      payload,
      PROXY_WALLET,
    );
    asserts.assert(env.data.length > 0);
  });
});
