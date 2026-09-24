# AzureBlob API

## Configuration

```ts
import { AzureBlob } from '@tundraconnect/azure-blob';

// Shared Key (primary)
const client = new AzureBlob({
  auth: {
    type: 'CUSTOM',
    account: 'myaccount',
    accountKey: 'base64-shared-key',
  },
  apiVersion: '2021-08-06', // optional, this is the default
});

// Pre-generated SAS token (secondary, pass-through only — this connect
// does not generate SAS tokens)
const sasClient = new AzureBlob({
  auth: {
    type: 'CUSTOM',
    account: 'myaccount',
    sasToken: 'sv=2021-08-06&ss=b&srt=co&sp=rwdlacx&se=...&sig=...',
  },
});
```

`baseURL` defaults to `https://{account}.blob.core.windows.net` (the
classic Blob endpoint — not the Data Lake Storage Gen2
`.dfs.core.windows.net` host). Pass an explicit `baseURL` to target a local
emulator such as [Azurite](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite)
instead.

When both `accountKey` and `sasToken` are supplied, `sasToken` wins — Shared
Key signing is skipped entirely and the SAS token's query parameters are
appended to every request instead. Supplying neither throws
`CONFIG_MISSING_CREDENTIALS`.

## Endpoints

| Method           | Operation           | Azure REST call                                |
| ---------------- | ------------------- | ---------------------------------------------- |
| `putObject()`    | Put Blob            | `PUT /{container}/{blob}`                      |
| `getObject()`    | Get Blob            | `GET /{container}/{blob}`                      |
| `headObject()`   | Get Blob Properties | `HEAD /{container}/{blob}`                     |
| `deleteObject()` | Delete Blob         | `DELETE /{container}/{blob}`                   |
| `listObjects()`  | List Blobs          | `GET /{container}?restype=container&comp=list` |

The public parameter names are `bucket`/`key` (mapped internally onto
Azure's own "container"/"blob" terms), matching the naming used across this
repo's other object-storage connects.

```ts
import { AzureBlob } from '@tundraconnect/azure-blob';

const client = new AzureBlob({
  auth: {
    type: 'CUSTOM',
    account: 'myaccount',
    accountKey: 'base64-shared-key',
  },
});

// Upload
const put = await client.putObject({
  bucket: 'my-container',
  key: 'photos/cat.png',
  body: pngBytes,
  contentType: 'image/png',
  metadata: { uploadedBy: 'ada' },
});
console.log(put.etag, put.lastModified);

// Download
const { body, contentType, metadata } = await client.getObject({
  bucket: 'my-container',
  key: 'photos/cat.png',
});

// Properties only (no download)
const head = await client.headObject({
  bucket: 'my-container',
  key: 'photos/cat.png',
});
console.log(head.contentLength);

// List, one page at a time
let token: string | undefined;
do {
  const page = await client.listObjects({
    bucket: 'my-container',
    prefix: 'photos/',
    continuationToken: token,
  });
  for (const obj of page.objects) console.log(obj.key, obj.size);
  token = page.continuationToken;
} while (token);

// Delete
await client.deleteObject({ bucket: 'my-container', key: 'photos/cat.png' });
```

See [Errors](AzureBlob-Errors.md) for failure handling and
[Schemas](AzureBlob-Schemas.md) for response validation.

---

[← Back to AzureBlob](../README.md)

## Streaming

### `putObjectStream(options)`

Uploads a large blob from a `ReadableStream<Uint8Array>` (or a `Blob`) as
`Put Block` per chunk followed by one `Put Block List`, so only one block
is ever in memory.

Why not a single streamed `PUT`: `fetch` sends a stream body with chunked
transfer encoding and no `Content-Length`, which Blob Storage rejects and
which Shared Key cannot sign. Committing blocks is Azure's own answer to
large uploads, and uncommitted blocks persist for seven days.

| Option          | Type                                 | Required | Description                                                                    |
| --------------- | ------------------------------------ | -------- | ------------------------------------------------------------------------------ |
| `bucket`, `key` | `string`                             | yes      | Container and blob name.                                                       |
| `body`          | `ReadableStream<Uint8Array> \| Blob` | yes      | The data.                                                                      |
| `contentType`   | `string`                             | no       | Set on the committed blob via `x-ms-blob-content-type`.                        |
| `metadata`      | `Record<string,string>`              | no       | `x-ms-meta-*` on the committed blob.                                           |
| `blockSize`     | `number`                             | no       | Bytes per block. Default 4 MiB; Azure allows up to 4000 MiB and 50,000 blocks. |

Returns the same `PutObjectResultSchema` as `putObject`. Block ids are the
zero-padded block index, base64-encoded (Azure requires equal-length ids).
A failed block stops the upload before anything is committed.

### `getObjectStream({ bucket, key })`

Downloads a blob as an unread `ReadableStream<Uint8Array>` plus its
`contentType`, `contentLength`, `etag` and `lastModified`. The body is
never buffered; the vendor-wide `timeout` bounds only the wait for
headers, after which an idle timer that resets on every chunk governs the
transfer. **You own the stream** — consume it or `cancel()` it.

```ts
const { body } = await client.getObjectStream({
  bucket: 'backups',
  key: 'big.bin',
});
await body.pipeTo((await Deno.create('big.bin')).writable);
```
