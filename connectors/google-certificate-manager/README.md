# Google Certificate Manager

Typed Google Cloud Certificate Manager client for Deno, Bun, Node.js and
Cloudflare Workers: create, read, list and delete Google-managed TLS
certificates and certificate map entries, and follow the long-running
operations they return, with service-account auth signed by Web Crypto. No
`gcloud`, no Application Default Credentials and no
`@google-cloud/certificate-manager` SDK.

[![JSR](https://jsr.io/badges/@tundraconnect/google-certificate-manager)](https://jsr.io/@tundraconnect/google-certificate-manager)
[![JSR Score](https://jsr.io/badges/@tundraconnect/google-certificate-manager/score)](https://jsr.io/@tundraconnect/google-certificate-manager)

## Overview

The connect is built for one job: a TLS certificate per customer domain
behind a global external Application Load Balancer. The load balancer's HTTPS
proxy carries a certificate map. For each customer domain you:

1. **Create a managed certificate** for the hostname. With load-balancer
   authorization (the default: no DNS authorization), Google validates the
   domain once its A/AAAA records point at the load balancer.
2. **Create a map entry** binding the hostname to that certificate in the
   map.
3. **Read the certificate** while it provisions. `managed.state` is
   `PROVISIONING`, then `ACTIVE`. `FAILED` means Google gave up: delete the
   certificate and create a new one.
4. When the domain goes away, **delete the map entry, then the
   certificate**.

Creates and deletes return a long-running operation. `waitForOperation`
polls one until it finishes or a deadline passes. A failed operation throws
the same typed error a synchronous refusal would.

```ts
import {
  GoogleCertificateManager,
  GoogleCertificateManagerError,
  hostnameToResourceId,
} from '@tundraconnect/google-certificate-manager';

const client = new GoogleCertificateManager({
  auth: {
    type: 'CUSTOM',
    clientEmail: 'certs@my-project.iam.gserviceaccount.com',
    privateKey: '-----BEGIN PRIVATE KEY-----\n...',
  },
  projectId: 'my-project',
  certificateMapId: 'customer-domains',
});

const hostname = 'go.example.com';
const id = hostnameToResourceId(hostname, { prefix: 'brevily' });

try {
  await client.waitForOperation(
    await client.createCertificate({ certificateId: id, domains: [hostname] }),
  );
} catch (err) {
  // A retry after a lost answer: the certificate already exists.
  if (
    !(err instanceof GoogleCertificateManagerError &&
      err.code === 'ALREADY_EXISTS')
  ) throw err;
}

await client.createCertificateMapEntry({
  entryId: id,
  hostname,
  certificates: [id],
});

const certificate = await client.getCertificate(id);
console.log(certificate.managed?.state); // 'PROVISIONING' until DNS points at the LB
```

## Resource ids

Certificate and map-entry ids must be lowercase RFC 1035 labels: a letter
first, then letters, digits or hyphens, at most 63 characters.
`hostnameToResourceId` derives one from a hostname. It slugs the hostname
and always appends an 8-hex-digit hash, because the readable part alone
collides: `my-site.co.uk` and `my.site-co.uk` both slug to `my-site-co-uk`.
The result is deterministic, so the certificate and its map entry can share
it, and a later delete can recompute it from the hostname alone.

```ts continued
hostnameToResourceId('go.example.com'); // 'go-example-com-' + 8 hex digits
hostnameToResourceId('Go.Example.COM.'); // the same id
hostnameToResourceId('*.example.com'); // 'wildcard-example-com-…'
```

## Following provisioning

```ts continued
const cert = await client.getCertificate(id);
if (cert.managed?.state === 'PROVISIONING') {
  for (const attempt of cert.managed.authorizationAttemptInfo ?? []) {
    // e.g. 'go.example.com' 'FAILED' 'CONFIG': the A record is not on the LB yet
    console.log(attempt.domain, attempt.state, attempt.failureReason);
  }
}
```

## Errors

Every failure is a `GoogleCertificateManagerError`. Branch on `code`. The
ones a domain flow usually needs:

| Code                  | Meaning                                                              | `transient` |
| --------------------- | -------------------------------------------------------------------- | ----------- |
| `ALREADY_EXISTS`      | The resource is already there. Treat a retried create as success.    | no          |
| `NOT_FOUND`           | The resource does not exist. Treat a retried delete as success.      | no          |
| `FAILED_PRECONDITION` | e.g. deleting a certificate a map entry still uses.                  | no          |
| `PERMISSION_DENIED`   | Missing IAM role, or the Certificate Manager API is not enabled.     | no          |
| `QUOTA_EXCEEDED`      | A resource-count quota is exhausted. Delete resources or raise it.   | no          |
| `RATE_LIMITED`        | A per-minute rate limit. Retry with backoff.                         | yes         |
| `SERVICE_UNAVAILABLE` | A 5xx from Google, or from the token endpoint.                       | yes         |
| `TIMEOUT`             | No answer within the client's `timeout`.                             | yes         |
| `NETWORK_ERROR`       | The request failed before any response.                              | yes         |
| `OPERATION_TIMEOUT`   | `waitForOperation` hit its deadline. The operation may still finish. | yes         |

The full list is in [Errors](https://github.com/TundraSoft/tundra-connect/wiki/GoogleCertificateManager-Errors).

## Authentication

- `{ type: 'CUSTOM', clientEmail, privateKey, scope? }`: a service account.
  Take `client_email` and `private_key` from its downloaded JSON key. The
  client signs an RS256 JWT with Web Crypto, exchanges it at
  `https://oauth2.googleapis.com/token` and caches the access token until a
  minute before it expires. Concurrent requests share one exchange. The
  scope defaults to `https://www.googleapis.com/auth/cloud-platform`.
- `{ type: 'BEARER', token }`: an access token you already have. The client
  never refreshes it.

The service account needs `roles/certificatemanager.editor` (or the
`certificatemanager.certs.*`, `certificatemanager.certmapentries.*` and
`certificatemanager.operations.get` permissions) on the project, and the
Certificate Manager API must be enabled.

## Testing your code

Your tests don't need to fake HTTP. Have your code take a
`GoogleCertificateManager` instance and pass in a stand-in that returns the
shapes from `@tundraconnect/google-certificate-manager/schemas`, or throws a
real error:

```ts
import { GoogleCertificateManagerError } from '@tundraconnect/google-certificate-manager/errors';

const exists = new GoogleCertificateManagerError('ALREADY_EXISTS', {
  status: 409,
});
console.log(exists.code, exists.transient); // 'ALREADY_EXISTS' false
```

To exercise the client itself against a fake transport, subclass it and
reassign the protected `_fetch`.

## Documentation

| Topic                                                                                         | Description                                         |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/GoogleCertificateManager-API)         | Client configuration, methods and operation polling |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/GoogleCertificateManager-Errors)   | Error codes, mapping and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/GoogleCertificateManager-Schemas) | Public Guardian schemas and types                   |

## Upstream

- [Certificate Manager REST reference](https://cloud.google.com/certificate-manager/docs/reference/certificate-manager/rest)
- [Deploy a Google-managed certificate with load balancer authorization](https://cloud.google.com/certificate-manager/docs/deploy-google-managed-lb-auth)
- [Certificate maps](https://cloud.google.com/certificate-manager/docs/maps)
- [Quotas and limits](https://cloud.google.com/certificate-manager/docs/quotas)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/google-certificate-manager
```

**Bun:**

```sh
bunx jsr add @tundraconnect/google-certificate-manager
```

**Node.js:**

```sh
npx jsr add @tundraconnect/google-certificate-manager
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
