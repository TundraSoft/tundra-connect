import { type BaseGuardian, Guardian } from '@guardian';

/**
 * The Web Risk threat lists a URI can be checked against:
 *
 * - `MALWARE`: malware targeting any platform.
 * - `SOCIAL_ENGINEERING`: social engineering (phishing, deceptive sites)
 *   targeting any platform.
 * - `UNWANTED_SOFTWARE`: unwanted software targeting any platform.
 * - `SOCIAL_ENGINEERING_EXTENDED_COVERAGE`: an extended-coverage social
 *   engineering list — more matches, at the cost of more false positives.
 *
 * Google's enum also has `THREAT_TYPE_UNSPECIFIED`, which it documents as
 * unused; it is left out so it can't be requested by mistake.
 */
export const WEB_RISK_THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'SOCIAL_ENGINEERING_EXTENDED_COVERAGE',
] as const;

/** Type definition for {@link ThreatTypeSchemaObject}. */
export type ThreatTypeSchema = typeof WEB_RISK_THREAT_TYPES[number];

/**
 * The lists `GoogleWebRisk.search` checks when the caller names none: the
 * three core lists. The extended-coverage list is opt-in because it trades
 * precision for recall.
 */
export const DEFAULT_THREAT_TYPES: readonly ThreatTypeSchema[] = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
];

/**
 * Schema for one Web Risk threat type.
 *
 * @example
 * ```typescript
 * import { ThreatTypeSchemaObject } from '@tundraconnect/google-web-risk/schemas';
 *
 * const [error, threatType] = ThreatTypeSchemaObject.safeParse('MALWARE');
 * ```
 */
export const ThreatTypeSchemaObject: BaseGuardian<ThreatTypeSchema> = Guardian
  .enum(WEB_RISK_THREAT_TYPES).describe({
    title: 'Web Risk threat type',
    description: 'A Web Risk threat list a URI can be checked against.',
  });
