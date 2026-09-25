/**
 * @fileoverview Minimal Solidity ABI encoding — exactly the handful of
 * fixed-shape contract calls the Relayer path needs (the CTF collateral
 * adapters' `splitPosition`/`mergePositions`/`redeemPositions`, and the
 * Polymarket `ProxyWalletFactory.proxy(calls[])` wrapper), not a
 * general-purpose encoder.
 *
 * Every function here is pure (no I/O) and independently testable —
 * `PolymarketAbi.test.ts` verifies each one against the exact word-by-word
 * calldata this connect's Rust sibling implementation asserts (which was
 * itself cross-checked against a live relayer submission).
 *
 * @module
 */

import {
  addressWord,
  bytes32Word,
  concatBytes,
  keccak256,
  uintWord,
} from './PolymarketEip712.ts';

/** The first 4 bytes of `keccak256(signature)` — a Solidity function selector, e.g. `selector('transfer(address,uint256)')`. */
export function selector(signature: string): Uint8Array {
  return keccak256(new TextEncoder().encode(signature)).slice(0, 4);
}

/** ABI-encodes a `uint256[]` value: `[length, ...elements]`, each a 32-byte word. */
function encodeUint256Array(values: readonly bigint[]): Uint8Array {
  return concatBytes(
    uintWord(BigInt(values.length)),
    ...values.map(uintWord),
  );
}

/** ABI-encodes a dynamic `bytes` value: `[length, data right-padded to a 32-byte boundary]`. */
function encodeBytes(data: Uint8Array): Uint8Array {
  const length = uintWord(BigInt(data.length));
  const paddedLength = Math.ceil(data.length / 32) * 32;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  return concatBytes(length, padded);
}

const ZERO_BYTES32 = new Uint8Array(32);

/**
 * `CtfCollateralAdapter.splitPosition`/`mergePositions` — 5-arg standard
 * (non-neg-risk) form: `(address collateralToken, bytes32
 * parentCollectionId, bytes32 conditionId, uint256[] partition, uint256
 * amount)`. `parentCollectionId` is always the zero word for a top-level
 * (non-nested) condition.
 */
export function encodeAdapterCall(
  functionName: 'splitPosition' | 'mergePositions',
  collateralToken: string,
  conditionId: Uint8Array,
  partition: readonly bigint[],
  amount: bigint,
): Uint8Array {
  const head = concatBytes(
    addressWord(collateralToken),
    bytes32Word(ZERO_BYTES32),
    bytes32Word(conditionId),
    uintWord(160n), // 5 head words × 32 — offset to the partition tail
    uintWord(amount),
  );
  const tail = encodeUint256Array(partition);
  return concatBytes(
    selector(`${functionName}(address,bytes32,bytes32,uint256[],uint256)`),
    head,
    tail,
  );
}

/**
 * `NegRiskCtfCollateralAdapter.splitPosition`/`mergePositions` — 2-arg
 * neg-risk form: `(bytes32 conditionId, uint256 amount)`. The adapter
 * already knows the collateral and partition internally.
 */
export function encodeNegRiskAdapterCall(
  functionName: 'splitPosition' | 'mergePositions',
  conditionId: Uint8Array,
  amount: bigint,
): Uint8Array {
  return concatBytes(
    selector(`${functionName}(bytes32,uint256)`),
    bytes32Word(conditionId),
    uintWord(amount),
  );
}

/**
 * `CtfCollateralAdapter.redeemPositions` — 4-arg standard form: `(address
 * collateralToken, bytes32 parentCollectionId, bytes32 conditionId,
 * uint256[] indexSets)`. No `amount` — redeems the full held balance of
 * the given index sets.
 */
export function encodeRedeemCall(
  collateralToken: string,
  conditionId: Uint8Array,
  indexSets: readonly bigint[],
): Uint8Array {
  const head = concatBytes(
    addressWord(collateralToken),
    bytes32Word(ZERO_BYTES32),
    bytes32Word(conditionId),
    uintWord(128n), // 4 head words × 32 — offset to the indexSets tail
  );
  const tail = encodeUint256Array(indexSets);
  return concatBytes(
    selector('redeemPositions(address,bytes32,bytes32,uint256[])'),
    head,
    tail,
  );
}

/** `NegRiskCtfCollateralAdapter.redeemPositions` — 2-arg neg-risk form: `(bytes32 conditionId, uint256[] amounts)`. */
export function encodeNegRiskRedeemCall(
  conditionId: Uint8Array,
  amounts: readonly bigint[],
): Uint8Array {
  const head = concatBytes(
    bytes32Word(conditionId),
    uintWord(64n), // 2 head words × 32 — offset to the amounts tail
  );
  const tail = encodeUint256Array(amounts);
  return concatBytes(
    selector('redeemPositions(bytes32,uint256[])'),
    head,
    tail,
  );
}

/** One inner call the Polymarket proxy wallet executes on the user's behalf. */
export type ProxyTransaction = {
  /** Target contract address. */
  to: string;
  /** Native value to send, in wei. Always `0n` for the calls this connect makes. */
  value: bigint;
  /** ABI-encoded calldata for the inner call (e.g. `encodeAdapterCall(...)`'s output). */
  data: Uint8Array;
  /**
   * Polymarket's ProxyWallet call-type code — `1` for a regular call. This
   * is the OPPOSITE of the Gnosis Safe convention (`0` = CALL); the
   * ProxyWallet silently rejects `0`. Do not "normalize" it to match Safe.
   */
  operation: number;
};

/** ABI-encodes one {@link ProxyTransaction} as a `(uint8,address,uint256,bytes)` tuple — `data` is dynamic and last, so the tuple itself is dynamic-sized. */
function encodeProxyTransactionTuple(tx: ProxyTransaction): Uint8Array {
  const head = concatBytes(
    uintWord(BigInt(tx.operation)),
    addressWord(tx.to),
    uintWord(tx.value),
    uintWord(128n), // 4 head words × 32 — offset to the `data` tail
  );
  return concatBytes(head, encodeBytes(tx.data));
}

/**
 * ABI-encodes `ProxyWalletFactory.proxy((uint8,address,uint256,bytes)[]
 * calls)` — a single dynamic array of a dynamic-sized tuple (each element
 * carries an `offset`, exactly like a top-level dynamic array, because a
 * tuple containing a dynamic field is itself dynamic).
 */
export function encodeProxyCallData(
  txns: readonly ProxyTransaction[],
): Uint8Array {
  const elements = txns.map(encodeProxyTransactionTuple);
  let runningOffset = BigInt(elements.length) * 32n; // past all per-element offset words
  const elementOffsets: Uint8Array[] = [];
  for (const element of elements) {
    elementOffsets.push(uintWord(runningOffset));
    runningOffset += BigInt(element.length);
  }
  const arrayData = concatBytes(
    uintWord(BigInt(elements.length)),
    ...elementOffsets,
    ...elements,
  );
  return concatBytes(
    selector('proxy((uint8,address,uint256,bytes)[])'),
    uintWord(32n), // 1 head word — offset to the array data (the sole, dynamic, param)
    arrayData,
  );
}
