import * as asserts from '@asserts';
import { describe, it } from '@test';
import {
  DEFAULT_THREAT_TYPES,
  ThreatTypeSchemaObject,
  WEB_RISK_THREAT_TYPES,
} from './ThreatType.ts';

describe('GoogleWebRisk.schema.ThreatType', () => {
  it('accepts every documented threat type', () => {
    for (const threatType of WEB_RISK_THREAT_TYPES) {
      asserts.assertEquals(
        ThreatTypeSchemaObject.safeParse(threatType)[0],
        null,
      );
    }
  });

  it('rejects the unused THREAT_TYPE_UNSPECIFIED and unknown values', () => {
    asserts.assertExists(
      ThreatTypeSchemaObject.safeParse('THREAT_TYPE_UNSPECIFIED')[0],
    );
    asserts.assertExists(ThreatTypeSchemaObject.safeParse('PHISHING')[0]);
  });

  it('defaults to the three core lists, not extended coverage', () => {
    asserts.assertEquals([...DEFAULT_THREAT_TYPES], [
      'MALWARE',
      'SOCIAL_ENGINEERING',
      'UNWANTED_SOFTWARE',
    ]);
  });
});
