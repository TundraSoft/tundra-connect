/**
 * @fileoverview Polymarket Relayer — gasless collateral split/merge/redeem
 * via meta-transactions routed through a Polymarket-UI proxy wallet.
 *
 * Every function here is pure (no I/O) and independently testable —
 * `PolymarketRelayer.test.ts` verifies each one against the exact test
 * vectors this connect's Rust sibling implementation pins (itself cross-
 * checked against a live relayer submission on 2026-08-12).
 *
 * Scope: the PROXY wallet type only (Polymarket UI's default — funds in a
 * ProxyWalletFactory-deployed wallet, a separate EOA signs). The SAFE
 * (Gnosis) wallet type uses a different `signatureParams` shape and
 * signing scheme this connect does not implement.
 *
 * @module
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import {
  addressBytes,
  checksumAddress,
  concatBytes,
  eip191Digest,
  fromHex,
  keccak256,
  toHex,
} from './PolymarketEip712.ts';
import {
  encodeAdapterCall,
  encodeNegRiskAdapterCall,
  encodeNegRiskRedeemCall,
  encodeProxyCallData,
  encodeRedeemCall,
  type ProxyTransaction,
} from './PolymarketAbi.ts';
import type { PolymarketSigner } from './PolymarketSigner.ts';
import type { RelayPayload } from './schema/Relayer.ts';

/** Collateral token Polymarket's CTF settles in — pUSD (Polymarket USD), not USDC/USDC.e. */
export const COLLATERAL_PUSD = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
/** CTF collateral adapter — standard (non-neg-risk) split/merge/redeem MUST route through this, not the raw CTF contract. */
export const CTF_COLLATERAL_ADAPTER =
  '0xAdA100Db00Ca00073811820692005400218FcE1f';
/** CTF collateral adapter — neg-risk markets' split/merge/redeem. */
export const NEG_RISK_CTF_COLLATERAL_ADAPTER =
  '0xadA2005600Dec949baf300f4C6120000bDB6eAab';
/** Polymarket's ProxyWalletFactory on Polygon — UI proxies deploy from this factory; meta-txs route through its `proxy()` method. */
export const PROXY_FACTORY = '0xaB45c5A4B0c941a2F231C04C3f49182e1A254052';
/** The relay hub that executes the meta-tx on the user's behalf. */
export const RELAY_HUB = '0xD216153c06E857cD7f72665E0aF1d7D82172F494';
/** Gas budget signed into the meta-tx — sits between the relay's ~1.35M cap and roughly 3× a `splitPosition` call's actual usage. */
export const DEFAULT_GAS_LIMIT = 1_000_000n;

const BINARY_PARTITION = [1n, 2n] as const;

/** Converts a USD amount to pUSD's 6-decimal micro-unit integer. Rejects an amount that rounds to zero — the chain rejects a zero-amount split/merge. */
function pusdMicroUnits(amountUsd: number): bigint {
  const micro = Math.round(amountUsd * 1_000_000);
  if (micro === 0) {
    throw new Error(`amount must be > 0 (got $${amountUsd})`);
  }
  return BigInt(micro);
}

/** Parses a `0x`-prefixed (or bare) 32-byte condition id. */
function parseConditionId(conditionId: string): Uint8Array {
  const hex = conditionId.startsWith('0x') ? conditionId.slice(2) : conditionId;
  if (hex.length !== 64) {
    throw new Error(
      `condition_id must be 32 bytes (64 hex chars); got ${hex.length} hex chars`,
    );
  }
  return fromHex(hex);
}

/** Builds a SPLIT `ProxyTransaction`: converts `amountUsd` of pUSD collateral into `amountUsd` shares of EACH outcome. `negRisk` selects the 2-arg neg-risk adapter form; binary updown markets pass `false`. */
export function buildSplitTx(
  conditionId: string,
  amountUsd: number,
  negRisk: boolean,
): ProxyTransaction {
  return buildAdapterTx('splitPosition', conditionId, amountUsd, negRisk);
}

/** Builds a MERGE `ProxyTransaction` — the inverse of split: burns `amountUsd` of each outcome pair and returns pUSD. Same adapter routing as split. */
export function buildMergeTx(
  conditionId: string,
  amountUsd: number,
  negRisk: boolean,
): ProxyTransaction {
  return buildAdapterTx('mergePositions', conditionId, amountUsd, negRisk);
}

function buildAdapterTx(
  functionName: 'splitPosition' | 'mergePositions',
  conditionId: string,
  amountUsd: number,
  negRisk: boolean,
): ProxyTransaction {
  const condition = parseConditionId(conditionId);
  const amount = pusdMicroUnits(amountUsd);
  if (negRisk) {
    return {
      to: NEG_RISK_CTF_COLLATERAL_ADAPTER,
      value: 0n,
      data: encodeNegRiskAdapterCall(functionName, condition, amount),
      operation: 1,
    };
  }
  return {
    to: CTF_COLLATERAL_ADAPTER,
    value: 0n,
    data: encodeAdapterCall(
      functionName,
      COLLATERAL_PUSD,
      condition,
      BINARY_PARTITION,
      amount,
    ),
    operation: 1,
  };
}

/**
 * Builds a REDEEM `ProxyTransaction` for a RESOLVED market — converts the
 * full held balance of both outcomes back to pUSD (winning shares pay $1
 * each, losing $0). Same adapter routing as split/merge.
 *
 * The neg-risk arm passes `amounts = [1, 1]`, matching the vendor's own
 * reference client verbatim — unverified beyond that; treat it as
 * documented-but-unconfirmed lore and test with a resolved $1 position
 * before trusting it at size.
 */
export function buildRedeemTx(
  conditionId: string,
  negRisk: boolean,
): ProxyTransaction {
  const condition = parseConditionId(conditionId);
  if (negRisk) {
    return {
      to: NEG_RISK_CTF_COLLATERAL_ADAPTER,
      value: 0n,
      data: encodeNegRiskRedeemCall(condition, [1n, 1n]),
      operation: 1,
    };
  }
  return {
    to: CTF_COLLATERAL_ADAPTER,
    value: 0n,
    data: encodeRedeemCall(COLLATERAL_PUSD, condition, BINARY_PARTITION),
    operation: 1,
  };
}

/**
 * The wire shape of `POST /submit` for the PROXY wallet type. Field ORDER
 * is load-bearing (the relay hub 401s on a different order than the
 * reference SDK emits) — build this object literal with its keys in
 * exactly this order; `JSON.stringify` preserves string-key insertion
 * order.
 */
export type ProxyMetaTx = {
  from: string;
  to: string;
  proxyWallet: string;
  data: string;
  nonce: string;
  signature: string;
  signatureParams: {
    gasPrice: string;
    gasLimit: string;
    relayerFee: string;
    relayHub: string;
    relay: string;
  };
  type: 'PROXY';
  metadata: string;
};

function toBigIntFromDecimal(value: string, what: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${what} is not a decimal integer: ${value}`);
  }
  return BigInt(value);
}

/** A non-negative integer as a 32-byte big-endian word. */
function uintWord(value: bigint): Uint8Array {
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  const bytes = fromHex(hex);
  const padded = new Uint8Array(32);
  padded.set(bytes, 32 - bytes.length);
  return padded;
}

/**
 * The relay-hub-prefixed struct hash the user signs:
 * `keccak256("rlx:" ‖ from ‖ to ‖ data ‖ txFee ‖ gasPrice ‖ gasLimit ‖
 * nonce ‖ relayHub ‖ relay)`. Addresses contribute their raw 20 bytes
 * (unpadded); numeric fields are 32-byte big-endian words. Byte layout
 * must match the vendor SDK exactly — any drift and the relay hub rejects
 * the signature at submit time.
 */
export function relayStructHash(
  from: string,
  to: string,
  data: Uint8Array,
  txFee: bigint,
  gasPrice: bigint,
  gasLimit: bigint,
  nonce: bigint,
  relayHub: string,
  relay: string,
): Uint8Array {
  return keccak256(
    concatBytes(
      new TextEncoder().encode('rlx:'),
      addressBytes(from),
      addressBytes(to),
      data,
      uintWord(txFee),
      uintWord(gasPrice),
      uintWord(gasLimit),
      uintWord(nonce),
      addressBytes(relayHub),
      addressBytes(relay),
    ),
  );
}

/**
 * Builds a complete proxy meta-tx envelope from inner transactions + a
 * freshly-fetched relay payload — signs with `signer` and self-checks the
 * signature recovers to the signer's address before returning, refusing to
 * emit an envelope that would bounce at the relay hub.
 *
 * Addresses in the returned envelope are LOWERCASE, not EIP-55 checksummed
 * — that requirement is documented for the SAFE wallet type only; the
 * PROXY path's reference SDK emits plain lowercase hex throughout.
 *
 * @throws {Error} When `relayPayload.nonce` isn't a decimal integer, or
 * (unreachable on a conforming runtime) the local signature self-check
 * fails.
 */
export function buildProxyMetaTx(
  signer: PolymarketSigner,
  txns: readonly ProxyTransaction[],
  relayPayload: RelayPayload,
  proxyWallet: string,
  metadata = '',
): ProxyMetaTx {
  const from = signer.address.toLowerCase();
  const to = PROXY_FACTORY.toLowerCase();
  const data = encodeProxyCallData(txns);
  const nonce = toBigIntFromDecimal(relayPayload.nonce, 'relay payload nonce');
  const relay = relayPayload.address.toLowerCase();
  const gasPrice = 0n;
  const relayerFee = 0n;
  const gasLimit = DEFAULT_GAS_LIMIT;

  const digest = relayStructHash(
    from,
    to,
    data,
    relayerFee,
    gasPrice,
    gasLimit,
    nonce,
    RELAY_HUB,
    relay,
  );
  const signature = signer.signMessage(digest);

  // Local self-check: recover the signer from the EIP-191 digest and refuse
  // to emit an envelope that would bounce at the relay hub.
  const recovered = recoverEip191Signer(digest, signature);
  if (recovered.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `local signature self-check failed — recovered ${recovered} != expected ${signer.address}`,
    );
  }

  return {
    from,
    to,
    proxyWallet: proxyWallet.toLowerCase(),
    data: `0x${toHex(data)}`,
    nonce: relayPayload.nonce,
    signature,
    signatureParams: {
      gasPrice: gasPrice.toString(),
      gasLimit: gasLimit.toString(),
      relayerFee: relayerFee.toString(),
      relayHub: RELAY_HUB.toLowerCase(),
      relay,
    },
    type: 'PROXY',
    metadata,
  };
}

/**
 * Recovers the checksummed signer address from an EIP-191 `personal_sign`
 * signature — used only for {@link buildProxyMetaTx}'s local self-check.
 * `message` is the RAW bytes that were signed (e.g. `relayStructHash`'s
 * output) — `PolymarketSigner.signMessage` applies the EIP-191 envelope
 * internally before signing, so recovery must apply that same envelope
 * before calling `recoverPublicKey`, or it recovers against the wrong
 * digest entirely.
 */
function recoverEip191Signer(
  message: Uint8Array,
  signatureHex: string,
): string {
  const bytes = fromHex(signatureHex);
  const recovery = bytes[64]! - 27;
  const recovered = new Uint8Array(65);
  recovered[0] = recovery;
  recovered.set(bytes.slice(0, 64), 1);
  const point = secp256k1.Signature.fromBytes(recovered, 'recovered')
    .recoverPublicKey(eip191Digest(message));
  const publicKey = point.toBytes(false);
  const hash = keccak256(publicKey.slice(1));
  return checksumAddress(toHex(hash.slice(12)));
}
