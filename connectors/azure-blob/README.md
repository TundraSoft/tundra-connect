# AzureBlob

Typed, cross-runtime client for the [Azure Blob Storage REST API](https://learn.microsoft.com/en-us/rest/api/storageservices/blob-service-rest-api).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

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

| Topic                                | Description                                |
| ------------------------------------ | ------------------------------------------ |
| [API](docs/AzureBlob-API.md)         | Client configuration and endpoint methods  |
| [Errors](docs/AzureBlob-Errors.md)   | Error codes and diagnostic metadata        |
| [Schemas](docs/AzureBlob-Schemas.md) | Public Guardian schemas and inferred types |

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

## License

MIT
