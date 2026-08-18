# GCS Schemas

The `@tundraconnect/gcs/schemas` subpath exports Guardian validators and
inferred types. Client methods validate every payload before returning it.

```ts
import {
  type ObjectSchema,
  ObjectSchemaObject,
} from '@tundraconnect/gcs/schemas';

const payload: unknown = {
  name: 'reports/2024-01.csv',
  bucket: 'my-bucket',
  contentType: 'text/csv',
  size: '1024',
};

const [error, object] = ObjectSchemaObject.safeParse(payload);
if (error || !object) throw error;

const typedObject: ObjectSchema = object;
console.log(typedObject.name, typedObject.size);
```

## Response Schemas

| Schema                            | Used by                                         |
| --------------------------------- | ----------------------------------------------- |
| `ObjectSchemaObject`              | `putObject`, `getObject`, `headObject`          |
| `ListObjectsResponseSchemaObject` | `listObjects`                                   |
| `ErrorEnvelopeSchemaObject`       | Vendor error envelopes                          |
| `ErrorDetailSchemaObject`         | One entry of an error envelope's `errors` array |

## Notes

- `ObjectSchemaObject.size` is kept as a `string`, matching GCS's own JSON
  representation — it's a decimal-string int64 precisely because it can
  exceed `Number.MAX_SAFE_INTEGER`; parsing it to a `number` would silently
  lose precision for very large objects.
- `ObjectSchemaObject` and `ListObjectsResponseSchemaObject` both use
  `.passthrough()`: GCS documents many more Object-resource fields (`owner`,
  `acl`, `retention`, ...) than this connect models explicitly, and the
  vendor is free to add new ones.
- `ListObjectsResponseSchemaObject.items` is `.optional()` because GCS
  omits the field entirely — rather than returning `[]` — when a
  bucket/prefix has no matching objects. `GCS.listObjects()` normalises a
  missing `items` to an empty `objects` array in its return value.

---

[← Back to GCS](../README.md)
