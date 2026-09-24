# GCS

Typed, cross-runtime client for the
[Google Cloud Storage JSON API](https://cloud.google.com/storage/docs/json_api/v1).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers & Browser](https://img.shields.io/badge/Cloudflare_Workers_%26_Browser-compatible-orange?logo=cloudflareworkers)

## Overview

GCS implements this repository's canonical object-storage interface —
`putObject`, `getObject`, `deleteObject`, `listObjects`, `headObject` — on
top of the Google Cloud Storage JSON API. It uses RESTler for transport and
Guardian for runtime response validation.

GCS's own field names differ from the canonical interface (`name` instead of
`key`, `pageToken`/`nextPageToken` instead of a continuation token); the
client translates between them internally so the public method/parameter
names stay consistent with this repository's other object-storage connects.

## Documentation

| Topic                          | Description                                |
| ------------------------------ | ------------------------------------------ |
| [API](docs/GCS-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/GCS-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/GCS-Schemas.md) | Public Guardian schemas and inferred types |

## Upstream

- [Google Cloud Storage JSON API reference](https://cloud.google.com/storage/docs/json_api/v1)
- [Create a Google Cloud account](https://cloud.google.com/free)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/gcs
```

**Bun:**

```sh
bunx jsr add @tundraconnect/gcs
```

**Node.js:**

```sh
npx jsr add @tundraconnect/gcs
```

## Authentication

GCS supports two auth modes, both modelled as the standard `auth` option.
`auth` may also be omitted entirely for anonymous reads against a public
bucket.

### Mode 1 — Bearer token (simple)

Supply an already-obtained OAuth2 access token — from `gcloud auth
print-access-token`, Workload Identity, or your own refresh logic:

```ts
import { GCS } from '@tundraconnect/gcs';

const client = new GCS({
  auth: { type: 'BEARER', token: 'ya29.a0AfH6SMC...' },
});
```

### Mode 2 — Service account (full flow)

Supply a service account's `client_email`/`private_key` (from its downloaded
JSON key). GCS signs an RS256 JWT, exchanges it for a short-lived access
token, and caches that token until it nears expiry — entirely with Web
Crypto (`crypto.subtle`), no Node-specific APIs:

```ts
import { GCS } from '@tundraconnect/gcs';

const client = new GCS({
  auth: {
    type: 'CUSTOM',
    clientEmail: 'svc@my-project.iam.gserviceaccount.com',
    privateKey: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n',
    // Optional — defaults to the full-control scope.
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
  },
});
```

## Quick Start

```ts
import { GCS } from '@tundraconnect/gcs';

const client = new GCS({
  auth: { type: 'BEARER', token: 'ya29....' },
});

await client.putObject({
  bucket: 'my-bucket',
  key: 'reports/2024-01.csv',
  body: new TextEncoder().encode('a,b,c\n1,2,3\n'),
  contentType: 'text/csv',
});

const { body, metadata } = await client.getObject({
  bucket: 'my-bucket',
  key: 'reports/2024-01.csv',
});
console.log(metadata.size, await body.text());

const { objects } = await client.listObjects({
  bucket: 'my-bucket',
  prefix: 'reports/',
});
for (const object of objects) console.log(object.name);

await client.deleteObject({ bucket: 'my-bucket', key: 'reports/2024-01.csv' });
```

## Large files

```ts
import { GCS } from '@tundraconnect/gcs';

const client = new GCS({ auth: { type: 'BEARER', token: 'ya29....' } });

// Upload from a stream as a resumable upload — one 8 MiB chunk in memory
// at a time; contentType/metadata travel with the session.
const file = await Deno.open('backup.tar');
await client.putObjectStream({
  bucket: 'backups',
  key: 'backup.tar',
  body: file.readable,
});

// Download as a stream — nothing buffered.
const { body } = await client.getObjectStream({
  bucket: 'backups',
  key: 'backup.tar',
});
await body.pipeTo((await Deno.create('restored.tar')).writable);
```

See [API → Streaming](docs/GCS-API.md#streaming).

## License

MIT
