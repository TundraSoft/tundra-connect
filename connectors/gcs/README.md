# Google Cloud Storage (GCS)

Typed
[Google Cloud Storage JSON API](https://cloud.google.com/storage/docs/json_api/v1)
client for Deno, Bun, Node.js and Cloudflare Workers, with bearer-token or
service-account authentication. Upload, download, list, inspect and delete
objects, including resumable streamed uploads for large files. A lightweight,
Web-API-only alternative to `@google-cloud/storage` for the operations it
covers.

[![JSR](https://jsr.io/badges/@tundraconnect/gcs)](https://jsr.io/@tundraconnect/gcs)
[![JSR Score](https://jsr.io/badges/@tundraconnect/gcs/score)](https://jsr.io/@tundraconnect/gcs)

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

| Topic                                                                    | Description                                |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/GCS-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/GCS-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/GCS-Schemas) | Public Guardian schemas and inferred types |

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

See [API → Streaming](https://github.com/TundraSoft/tundra-connect/wiki/GCS-API#streaming).

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
