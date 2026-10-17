# GoogleCertificateManager API

Client configuration and methods for
`@tundraconnect/google-certificate-manager`.

## Configuration

```ts
import { GoogleCertificateManager } from '@tundraconnect/google-certificate-manager';

const client = new GoogleCertificateManager({
  auth: {
    type: 'CUSTOM',
    clientEmail: 'certs@my-project.iam.gserviceaccount.com',
    privateKey: '-----BEGIN PRIVATE KEY-----\n...',
  },
  projectId: 'my-project',
  certificateMapId: 'customer-domains',
});
```

| Option             | Type                           | Required | Default                                        | Description                                                         |
| ------------------ | ------------------------------ | -------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| `auth`             | `GoogleCertificateManagerAuth` | yes      | —                                              | A service account or an access token — see below.                   |
| `projectId`        | `string`                       | yes      | —                                              | Project id (`my-project`, `example.com:my-project`) or number.      |
| `location`         | `string`                       | no       | `global`                                       | Certificate Manager location. Global load balancers use `global`.   |
| `certificateMapId` | `string`                       | no       | —                                              | Default map for the map-entry methods (each also takes `mapId`).    |
| `timeout`          | `number`                       | no       | `30`                                           | Per-request timeout in seconds, 1–120. Also bounds a token request. |
| `maxRetryWait`     | `number`                       | no       | —                                              | Opt into RESTler's single retry of a 429 (seconds of hint allowed). |
| `baseURL`          | `string`                       | no       | `https://certificatemanager.googleapis.com/v1` | Override for a proxy or a test double.                              |

`auth` is one of:

| Shape                                                 | Behaviour                                                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `{ type: 'CUSTOM', clientEmail, privateKey, scope? }` | Signs an RS256 JWT (Web Crypto), exchanges it for an access token, caches it until 60 s before it expires. |
| `{ type: 'BEARER', token, prefix? }`                  | Sends `Authorization: Bearer <token>`. `prefix` defaults to `Bearer`. Never refreshed.                     |

Construction throws `CONFIG_INVALID_AUTH`, `CONFIG_INVALID_SERVICE_ACCOUNT`
or `CONFIG_INVALID_PROJECT` for a missing or malformed option. Nothing is
fetched or signed until the first request.

### Getters

| Getter             | Type                  | Description                          |
| ------------------ | --------------------- | ------------------------------------ |
| `vendor`           | `string`              | Always `'GoogleCertificateManager'`. |
| `projectId`        | `string`              | The configured project.              |
| `location`         | `string`              | The configured location.             |
| `certificateMapId` | `string \| undefined` | The default map, if any.             |

## Certificates

### `createCertificate(options)`

`POST /v1/projects/{project}/locations/{location}/certificates?certificateId=…`

| Option              | Type                     | Description                                                      |
| ------------------- | ------------------------ | ---------------------------------------------------------------- |
| `certificateId`     | `string`                 | The new id (see `hostnameToResourceId`).                         |
| `domains`           | `string[]`               | Domains the managed certificate covers. At least one.            |
| `dnsAuthorizations` | `string[]`               | Optional DNS authorization names. Omit for load-balancer auth.   |
| `description`       | `string`                 | Optional.                                                        |
| `labels`            | `Record<string, string>` | Optional. Useful for an orphan sweep (`labels.owner="brevily"`). |
| `scope`             | `CertificateScope`       | Optional. Google defaults to `DEFAULT` (global load balancers).  |

Returns the create `OperationSchema`. The operation finishing means the
resource exists; issuance happens later.

### `getCertificate(certificateId)`

`GET /v1/projects/{project}/locations/{location}/certificates/{id}` →
`CertificateSchema`. Read `managed.state`, `managed.provisioningIssue` and
`managed.authorizationAttemptInfo[]`.

### `listCertificates(options?)`

`GET /v1/projects/{project}/locations/{location}/certificates` with
`pageSize`, `pageToken`, `filter` and `orderBy`. Returns
`{ certificates, nextPageToken?, unreachable }`; both arrays are always
present.

### `iterateCertificates(options?)`

An async iterator over every certificate, following `nextPageToken`.

### `deleteCertificate(certificateId)`

`DELETE /v1/projects/{project}/locations/{location}/certificates/{id}` →
the delete `OperationSchema`. Delete the map entries that use the
certificate first, or Google answers `FAILED_PRECONDITION`.

## Certificate map entries

Each method takes the map from `options.mapId`, falling back to the
client's `certificateMapId`. With neither, it throws
`REQUEST_VALIDATION_ERROR` before any request.

### `createCertificateMapEntry(options)`

`POST …/certificateMaps/{map}/certificateMapEntries?certificateMapEntryId=…`

| Option         | Type                     | Description                                                    |
| -------------- | ------------------------ | -------------------------------------------------------------- |
| `entryId`      | `string`                 | The new id.                                                    |
| `hostname`     | `string`                 | The SNI hostname, or a `*.example.com` wildcard.               |
| `certificates` | `string[]`               | One to four certificate ids (expanded to full names) or names. |
| `mapId`        | `string`                 | Optional per-call map.                                         |
| `description`  | `string`                 | Optional.                                                      |
| `labels`       | `Record<string, string>` | Optional.                                                      |

Returns the create `OperationSchema`.

### `getCertificateMapEntry(entryId, { mapId? })`

→ `CertificateMapEntrySchema`. `state` is `PENDING` while the change
propagates, `ACTIVE` once served.

### `listCertificateMapEntries(options?)` / `iterateCertificateMapEntries(options?)`

As the certificate list methods, plus `mapId`. Returns
`{ certificateMapEntries, nextPageToken?, unreachable }`.

### `deleteCertificateMapEntry(entryId, { mapId? })`

→ the delete `OperationSchema`.

## Operations

### `getOperation(name)`

`GET /v1/{name}`. Takes the operation's full `name`
(`projects/…/locations/…/operations/…`) or its bare id, and returns the
operation as-is, failed or not.

### `waitForOperation(operation, options?)`

Polls until the operation is `done`, then returns it, or throws its mapped
error when it failed. An operation that is already `done` is settled
without a request.

| Option            | Default | Description                                         |
| ----------------- | ------- | --------------------------------------------------- |
| `timeoutSeconds`  | `60`    | Deadline; past it, `OPERATION_TIMEOUT` (transient). |
| `intervalSeconds` | `2`     | Delay between polls.                                |

A failed poll (say a 503) throws that failure unchanged; the operation
itself may still finish, so poll again later by `name`.

## Helpers

### `hostnameToResourceId(hostname, { prefix? })`

Derives a valid, deterministic id: the slugged hostname plus `-` and an
8-hex-digit FNV-1a hash of the normalised hostname, truncated to 63
characters. Unicode hostnames are punycoded, case and a trailing dot are
ignored, and a leading `*.` becomes `wildcard-`. `prefix` (a lowercase
label, at most 20 characters) is prepended as `<prefix>-`. Throws
`REQUEST_VALIDATION_ERROR` for something that is not a hostname.

### `isValidResourceId(id)` / `RESOURCE_ID_PATTERN`

The id rule every method enforces before sending: a lowercase letter
first, then lowercase letters, digits or hyphens, not ending in a hyphen,
at most 63 characters.
