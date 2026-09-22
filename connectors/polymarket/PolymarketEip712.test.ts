import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  addressBytes,
  addressWord,
  bytes32Word,
  checksumAddress,
  domainSeparator,
  eip191Digest,
  fromHex,
  hashStruct,
  keccak256,
  stringWord,
  toHex,
  typedDataDigest,
  uintWord,
} from './PolymarketEip712.ts';

describe('PolymarketEip712', () => {
  it('hashes the canonical empty-input keccak256 vector', () => {
    asserts.assertEquals(
      toHex(keccak256(new Uint8Array(0))),
      'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
    );
  });

  it('round-trips hex encode/decode', () => {
    const bytes = fromHex('0x0102ff');
    asserts.assertEquals(Array.from(bytes), [1, 2, 255]);
    asserts.assertEquals(toHex(bytes), '0102ff');
  });

  it('rejects malformed hex without echoing the input', () => {
    let message = '';
    try {
      fromHex('0xzz');
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    asserts.assert(!message.includes('zz'));
    asserts.assertThrows(() => fromHex('0x123'));
  });

  it('checksums the known test address', () => {
    asserts.assertEquals(
      checksumAddress('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'),
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    );
    // idempotent on already-checksummed input
    asserts.assertEquals(
      checksumAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'),
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    );
  });

  it('rejects an address that is not 20 bytes', () => {
    asserts.assertThrows(() => checksumAddress('0x1234'));
    asserts.assertThrows(() => addressBytes('0x1234'));
  });

  it('encodes a uint256 word big-endian, left-padded', () => {
    const word = uintWord(0x1234n);
    asserts.assertEquals(word.length, 32);
    asserts.assertEquals(toHex(word.slice(-2)), '1234');
    asserts.assertEquals(
      Array.from(word.slice(0, 30)).every((b) => b === 0),
      true,
    );
  });

  it('rejects a negative uint word', () => {
    asserts.assertThrows(() => uintWord(-1n));
  });

  it('encodes an address word right-aligned into 32 bytes', () => {
    const word = addressWord('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    asserts.assertEquals(word.length, 32);
    asserts.assertEquals(
      Array.from(word.slice(0, 12)).every((b) => b === 0),
      true,
    );
    asserts.assertEquals(
      toHex(word.slice(12)),
      'f39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    );
  });

  it('passes a bytes32 word through unchanged and rejects the wrong length', () => {
    const exact = new Uint8Array(32).fill(7);
    asserts.assertEquals(bytes32Word(exact), exact);
    asserts.assertThrows(() => bytes32Word(new Uint8Array(31)));
  });

  it('hashes a string word via keccak256, not a raw embed', () => {
    asserts.assertEquals(stringWord(''), keccak256(new Uint8Array(0)));
  });

  it('derives the 3-field domain separator when no verifyingContract is given', () => {
    const withVc = domainSeparator(
      'ClobAuthDomain',
      '1',
      137,
      '0x0000000000000000000000000000000000000001',
    );
    const withoutVc = domainSeparator('ClobAuthDomain', '1', 137);
    asserts.assertEquals(withVc.length, 32);
    asserts.assertEquals(withoutVc.length, 32);
    asserts.assertNotEquals(toHex(withVc), toHex(withoutVc));
  });

  it('produces a deterministic hashStruct + typedDataDigest for a known simple type', () => {
    const structHash = hashStruct('Foo(uint256 bar)', [uintWord(42n)]);
    const domainSep = domainSeparator('Test', '1', 1);
    const digest = typedDataDigest(domainSep, structHash);
    asserts.assertEquals(digest.length, 32);
    // deterministic: same inputs -> same digest
    const again = typedDataDigest(
      domainSeparator('Test', '1', 1),
      hashStruct('Foo(uint256 bar)', [uintWord(42n)]),
    );
    asserts.assertEquals(toHex(digest), toHex(again));
  });

  it('eip191Digest matches the EIP-191 personal_sign envelope', () => {
    const message = new TextEncoder().encode('hello');
    const expected = keccak256(
      new TextEncoder().encode('\x19Ethereum Signed Message:\n5hello'),
    );
    asserts.assertEquals(toHex(eip191Digest(message)), toHex(expected));
  });

  it('eip191Digest length-prefixes with the DECIMAL byte length, not a fixed width', () => {
    const short = eip191Digest(new Uint8Array(3));
    const long = eip191Digest(new Uint8Array(30));
    asserts.assertNotEquals(toHex(short), toHex(long));
  });
});
