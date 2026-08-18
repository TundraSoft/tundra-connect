# AzureBlob Schemas

The `@tundraconnect/azure-blob/schemas` subpath exports Guardian validators
and inferred types. Client methods validate every response (or the
header-derived object built from one) before returning it.

```ts
import {
  type BlobItemSchema,
  BlobItemSchemaObject,
} from '@tundraconnect/azure-blob/schemas';

const payload: unknown = {
  name: 'photos/cat.png',
  lastModified: 'Tue, 01 Jan 2019 12:00:00 GMT',
  etag: '"0x8D1234567890ABC"',
  contentLength: '12345',
  contentType: 'image/png',
};

const [error, item] = BlobItemSchemaObject.safeParse(payload);
if (error || !item) throw error;

const typed: BlobItemSchema = item;
console.log(typed.lastModified.toISOString());
```

## Response Schemas

| Schema                          | Used by                        |
| ------------------------------- | ------------------------------ |
| `PutObjectResultSchemaObject`   | `putObject()`                  |
| `GetObjectResultSchemaObject`   | `getObject()`                  |
| `HeadObjectResultSchemaObject`  | `headObject()`                 |
| `ListBlobsResponseSchemaObject` | `listObjects()`                |
| `ErrorSchemaObject`             | Vendor XML `<Error>` envelopes |

## Component Schemas

| Schema                       | Purpose                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `BlobItemSchemaObject`       | One normalized entry from a List Blobs response                      |
| `BlobPropertiesSchemaObject` | Header-derived properties shared by Get Blob and Get Blob Properties |

## XML Response Handling

Azure's Blob Storage REST API is XML-based (List Blobs, and every error
envelope) rather than JSON. RESTler auto-parses an `application/xml`
response body into an object keyed by the root tag name — for example, List
Blobs surfaces as `{ EnumerationResults: { Blobs: { Blob: [...] }, ... } }`,
and a single `<Blob>` flattens to an object while two or more become an
array. `ListBlobsResponseSchemaObject` uses `Guardian.preprocess()` to
normalize that ambiguous shape into a flat `{ blobs: BlobItemSchema[],
nextMarker?: string }` before validating the normalized fields — see
`schema/response/ListBlobsResponse.ts` for the exact flattening logic, and
its co-located test for fixtures verified directly against the XML parser's
real output.

`Get Blob`'s binary body is requested with `responseType: 'BLOB'` and
validated with `Guardian.instanceof(Blob)`.

---

[← Back to AzureBlob](../README.md)
