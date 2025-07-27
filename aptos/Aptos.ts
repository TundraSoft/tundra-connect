import { RESTler, RESTlerOptions } from '$restler';
import { getPublicKey, sign, utils, verify } from '$ed25519';
import { sha3_256 } from '$hashes/sha3';
import { encodeHex } from 'jsr:@std/encoding@1.0.8';

export class Aptos extends RESTler {
  public readonly vendor = 'Aptos';

  protected readonly mode: 'DEVNET' | 'TESTNET' | 'MAINNET';

  private get faucetURL(): string | null {
    switch (this.mode) {
      case 'DEVNET':
        return 'https://faucet.devnet.aptoslabs.com';
      case 'TESTNET':
        return 'https://faucet.testnet.aptoslabs.com';
      case 'MAINNET':
        return null; // No faucet in mainnet
      default:
        throw new Error(`Invalid mode: ${this.mode}`);
    }
  }

  constructor(mode: 'DEVNET' | 'TESTNET' | 'MAINNET' = 'MAINNET') {
    const options: RESTlerOptions = {
      version: 'v1',
      baseURL: '',
      contentType: 'JSON',
      timeout: 10,
    };
    switch (mode) {
      case 'DEVNET':
        options.baseURL = 'https://fullnode.devnet.aptoslabs.com/{version}';
        break;
      case 'TESTNET':
        options.baseURL = 'https://fullnode.testnet.aptoslabs.com/{version}';
        break;
      case 'MAINNET':
        options.baseURL = 'https://fullnode.mainnet.aptoslabs.com/{version}';
        break;
      default:
        throw new Error(`Invalid mode: ${mode}`);
    }
    super(options);
    this.mode = mode;
  }

  /**
   * Validates if a string is a valid Aptos address format
   * @param address The address to validate
   * @returns True if the address is a valid format, false otherwise
   */
  public isValidAddress(address: string): boolean {
    // Check if the address starts with '0x'
    if (!address.startsWith('0x')) {
      return false;
    }

    // Remove the '0x' prefix
    const addressWithoutPrefix = address.slice(2);

    // Check if the address contains only hexadecimal characters
    const hexRegex = /^[0-9a-fA-F]+$/;
    if (!hexRegex.test(addressWithoutPrefix)) {
      return false;
    }

    // Aptos addresses are 32 bytes (64 hex characters)
    // However, shorter addresses with leading zeros are allowed
    // So we check if the length is <= 64 characters
    if (addressWithoutPrefix.length > 64) {
      return false;
    }

    // Address passes all validation checks
    return true;
  }

  /**
   * Gets the normalized form of an Aptos address (padded to full length with leading zeros)
   * @param address The address to normalize
   * @returns The normalized address or null if the address is invalid
   */
  public normalizeAddress(address: string): string | null {
    if (!this.isValidAddress(address)) {
      return null;
    }

    // Remove the '0x' prefix
    const addressWithoutPrefix = address.slice(2);

    // Pad the address to full length (64 characters) with leading zeros
    const normalizedAddressWithoutPrefix = addressWithoutPrefix.padStart(
      64,
      '0',
    );

    // Add the '0x' prefix back
    return `0x${normalizedAddressWithoutPrefix}`;
  }

  public async createAccount() {}

  public async getAccount() {}
  public async getBalance() {}
  public async getTransaction() {}
  public async transfer() {}
  public async fundAccount() {}
}
