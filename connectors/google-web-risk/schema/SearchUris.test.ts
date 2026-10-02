import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  SearchUrisRequestSchemaObject,
  SearchUrisResponseSchemaObject,
  SearchUrisThreatSchemaObject,
} from './SearchUris.ts';

describe('GoogleWebRisk.schema.SearchUris', () => {
  it('accepts a request with a uri and threat types', () => {
    asserts.assertEquals(
      SearchUrisRequestSchemaObject.safeParse({
        uri: 'https://example.com/',
        threatTypes: ['MALWARE'],
      })[0],
      null,
    );
  });

  it('rejects a blank uri and an empty threat-type list', () => {
    asserts.assertExists(
      SearchUrisRequestSchemaObject.safeParse({
        uri: '',
        threatTypes: ['MALWARE'],
      })[0],
    );
    asserts.assertExists(
      SearchUrisRequestSchemaObject.safeParse({
        uri: 'https://example.com/',
        threatTypes: [],
      })[0],
    );
  });

  it('accepts the empty "not listed" response', () => {
    const [error, body] = SearchUrisResponseSchemaObject.safeParse({});
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.threat, undefined);
  });

  it('parses a documented match', () => {
    const [error, body] = SearchUrisResponseSchemaObject.safeParse({
      threat: {
        threatTypes: ['MALWARE'],
        expireTime: '2019-07-17T15:01:23.045123456Z',
      },
    });
    asserts.assertEquals(error, null);
    asserts.assertEquals(body?.threat?.threatTypes, ['MALWARE']);
    asserts.assertEquals(
      body?.threat?.expireTime,
      '2019-07-17T15:01:23.045123456Z',
    );
  });

  it('keeps an additive field rather than failing', () => {
    asserts.assertEquals(
      SearchUrisThreatSchemaObject.safeParse({
        threatTypes: ['MALWARE'],
        newField: true,
      })[0],
      null,
    );
  });

  it('rejects a threat whose threatTypes is not an array', () => {
    asserts.assertExists(
      SearchUrisResponseSchemaObject.safeParse({
        threat: { threatTypes: 'MALWARE' },
      })[0],
    );
  });
});
