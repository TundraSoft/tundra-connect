import { type BaseGuardian, Guardian } from '@guardian';

/** Response schema for `GET /relay-payload` — the caller's next relay-hub nonce and the relay account that will broadcast the tx. */
export type RelayPayload = {
  address: string;
  nonce: string;
};

/**
 * Schema for the Relayer's `GET /relay-payload` response.
 *
 * @example
 * ```typescript
 * import { RelayPayloadSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, payload] = RelayPayloadSchemaObject.safeParse({
 *   address: '0x4444444444444444444444444444444444444444',
 *   nonce: '7',
 * });
 * ```
 */
export const RelayPayloadSchemaObject: BaseGuardian<RelayPayload> = Guardian
  .object({
    address: Guardian.string().minLength(1),
    nonce: Guardian.string().minLength(1),
  }).describe({
    title: 'Relay payload',
    description: 'The relay-hub nonce and relay account for one meta-tx.',
  });

/** Response schema for `POST /submit`. The on-chain transaction hash is NOT included — poll `GET /transaction` to retrieve it later (not implemented by this connect). */
export type RelayerSubmitResponse = {
  transactionId: string;
  /** e.g. `"STATE_NEW"`. */
  state?: string;
};

const _submitResponse = Guardian.object({
  transactionId: Guardian.string().minLength(1),
  state: Guardian.string().optional(),
}).describe({
  title: 'Relayer submit response',
  description:
    'Acknowledgement that the relay hub accepted the meta-tx for broadcast.',
});

/**
 * Schema for the Relayer's `POST /submit` response. The vendor's field is
 * `transactionID` (capital ID); normalized here to `transactionId` to
 * match this connect's casing convention.
 *
 * @example
 * ```typescript
 * import { RelayerSubmitResponseSchemaObject } from '@tundraconnect/polymarket/schemas';
 *
 * const [error, result] = RelayerSubmitResponseSchemaObject.safeParse({
 *   transactionID: '0190b317-a1d3-7bec-9b91-eeb6dcd3a620',
 *   state: 'STATE_NEW',
 * });
 * ```
 */
export const RelayerSubmitResponseSchemaObject: BaseGuardian<
  RelayerSubmitResponse
> = Guardian.preprocess(
  (raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const obj = raw as Record<string, unknown>;
    if (obj.transactionId === undefined && obj.transactionID !== undefined) {
      return { ...obj, transactionId: obj.transactionID };
    }
    return obj;
  },
  _submitResponse,
);
