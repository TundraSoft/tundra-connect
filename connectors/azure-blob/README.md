# Azure Blob Storage

Typed [Azure Blob Storage REST API](https://learn.microsoft.com/en-us/rest/api/storageservices/blob-service-rest-api)
client for Deno, Bun, Node.js and Cloudflare Workers, with Shared Key or SAS
authentication. Upload, download, list, inspect and delete blobs, including
streamed block uploads and downloads for large files. A lightweight,
Web-API-only alternative to `@azure/storage-blob` for the operations it covers.

[![JSR](https://jsr.io/badges/@tundraconnect/azure-blob)](https://jsr.io/@tundraconnect/azure-blob)
[![JSR Score](https://jsr.io/badges/@tundraconnect/azure-blob/score)](https://jsr.io/@tundraconnect/azure-blob)

## Overview

AzureBlob exposes the repo's canonical object-storage surface —
`putObject`, `getObject`, `deleteObject`, `listObjects`, `headObject` — on
top of Azure's classic Blob endpoint
(`https://{account}.blob.core.windows.net`). Every request is authenticated
with Shared Key HMAC-SHA256 signing (or a pass-through pre-generated SAS
token), computed purely with Web Crypto (`crypto.subtle`) so the connect
runs unmodified on Deno, Bun, Node, Cloudflare Workers, and in the browser.
It uses RESTler for transport and Guardian for runtime response validation.

## Documentation

| Topic                                                                          | Description                                |
| ------------------------------------------------------------------------------ | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/AzureBlob-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/AzureBlob-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/AzureBlob-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Azure Blob Storage REST API reference](https://learn.microsoft.com/en-us/rest/api/storageservices/blob-service-rest-api)
- [Create an Azure account](https://azure.microsoft.com/en-us/free/)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/azure-blob
```

**Bun:**

```sh
bunx jsr add @tundraconnect/azure-blob
```

**Node.js:**

```sh
npx jsr add @tundraconnect/azure-blob
```

## Quick Start

```ts
import { AzureBlob } from '@tundraconnect/azure-blob';

const client = new AzureBlob({
  auth: {
    type: 'CUSTOM',
    account: 'myaccount',
    accountKey: 'base64-shared-key',
  },
});

await client.putObject({
  bucket: 'my-container',
  key: 'hello.txt',
  body: 'hello world',
  contentType: 'text/plain',
});

const { body } = await client.getObject({
  bucket: 'my-container',
  key: 'hello.txt',
});
console.log(await body.text());
```

## Large files

```ts
import { AzureBlob } from '@tundraconnect/azure-blob';

const client = new AzureBlob({
  auth: { type: 'CUSTOM', account: 'myaccount', accountKey: '...' },
});

// Upload from a stream — one 4 MiB block in memory at a time.
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

See [API → Streaming](https://github.com/TundraSoft/tundra-connect/wiki/AzureBlob-API#streaming).

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
