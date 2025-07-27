import {
  Guardian,
  GuardianProxy,
  type GuardianType,
  ObjectGuardian,
} from '$guardian';
import { sha3_256 } from '$hashes/sha3';

export const AptosAccountObject: GuardianProxy<
  ObjectGuardian<
    {
      address: string;
      privateKey: string | undefined;
      publicKey: string | undefined;
    }
  >
> = Guardian.object().schema({
  address: Guardian.string().startsWith('0x').pattern(/^0x[0-9a-fA-F]+$/)
    .maxLength(66),
  privateKey: Guardian.string().optional(),
  publicKey: Guardian.string().optional(),
});

export type AptosAccount = GuardianType<typeof AptosAccountObject>;
