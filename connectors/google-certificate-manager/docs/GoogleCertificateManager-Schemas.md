# GoogleCertificateManager Schemas

Guardian schemas and types exported from
`@tundraconnect/google-certificate-manager/schemas` (and the root module).
Every response schema passes unknown fields through, and every enum-like
field is typed open (`'ACTIVE' | 'FAILED' | … | (string & Record<never, never>)`),
so a value Google adds later still parses instead of failing the call.

```ts
import { CertificateSchemaObject } from '@tundraconnect/google-certificate-manager/schemas';

const certificate = CertificateSchemaObject.parse({
  name: 'projects/my-project/locations/global/certificates/example-com',
  managed: { domains: ['example.com'], state: 'ACTIVE' },
});
console.log(certificate.managed?.state);
```

| Schema object                                   | Type                                      | Describes                                                       |
| ----------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `CertificateSchemaObject`                       | `CertificateSchema`                       | A certificate: name, labels, SANs, expiry, `managed`, `usedBy`. |
| `ManagedCertificateSchemaObject`                | `ManagedCertificateSchema`                | `managed`: domains, `state`, provisioning detail.               |
| `ProvisioningIssueSchemaObject`                 | `ProvisioningIssueSchema`                 | `managed.provisioningIssue`: `reason`, `details`.               |
| `AuthorizationAttemptInfoSchemaObject`          | `AuthorizationAttemptInfoSchema`          | One domain's latest authorization attempt.                      |
| `CertificateMapEntrySchemaObject`               | `CertificateMapEntrySchema`               | A map entry: `hostname` or `matcher`, `certificates`, `state`.  |
| `OperationSchemaObject`                         | `OperationSchema`                         | A long-running operation: `done`, `error`, `response`.          |
| `OperationStatusSchemaObject`                   | `OperationStatusSchema`                   | A failed operation's `google.rpc.Status`.                       |
| `ListCertificatesResponseSchemaObject`          | `ListCertificatesResponseSchema`          | A raw `certificates.list` page.                                 |
| `ListCertificateMapEntriesResponseSchemaObject` | `ListCertificateMapEntriesResponseSchema` | A raw `certificateMapEntries.list` page.                        |
| `GoogleErrorEnvelopeSchemaObject`               | `GoogleErrorEnvelopeSchema`               | Google's `{ error: { code, message, status, details } }`.       |
| `GoogleErrorDetailSchemaObject`                 | `GoogleErrorDetailSchema`                 | One `details` entry (`@type`, `reason`).                        |

Known enum values, as types:

| Type                         | Values                                                        |
| ---------------------------- | ------------------------------------------------------------- |
| `ManagedCertificateState`    | `STATE_UNSPECIFIED`, `PROVISIONING`, `FAILED`, `ACTIVE`       |
| `ProvisioningIssueReason`    | `REASON_UNSPECIFIED`, `AUTHORIZATION_ISSUE`, `RATE_LIMITED`   |
| `AuthorizationAttemptState`  | `STATE_UNSPECIFIED`, `AUTHORIZING`, `AUTHORIZED`, `FAILED`    |
| `AuthorizationFailureReason` | `FAILURE_REASON_UNSPECIFIED`, `CONFIG`, `CAA`, `RATE_LIMITED` |
| `CertificateScope`           | `DEFAULT`, `EDGE_CACHE`, `ALL_REGIONS`, `CLIENT_AUTH`         |
| `CertificateMapEntryState`   | `SERVING_STATE_UNSPECIFIED`, `ACTIVE`, `PENDING`              |

The list methods return normalised results (`ListCertificatesResult`,
`ListCertificateMapEntriesResult`) whose arrays are always present; the
raw page schemas above keep Google's optional fields.
