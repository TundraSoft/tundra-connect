# CloudflareTurnstile Schemas

Public Guardian schemas, exported from
`@tundraconnect/cloudflare-turnstile/schemas`.

```ts
import {
  VerificationSchemaObject,
  VerifyRequestSchemaObject,
} from '@tundraconnect/cloudflare-turnstile/schemas';
```

| Export                      | Type                  | Used for                                                              |
| --------------------------- | --------------------- | --------------------------------------------------------------------- |
| `VerifyRequestSchemaObject` | `VerifyRequestSchema` | The caller's part of a siteverify request (no `secret`).              |
| `VerificationSchemaObject`  | `VerificationSchema`  | A siteverify verdict.                                                 |
| `TURNSTILE_ERROR_CODES`     | `readonly [...]`      | Every documented `error-codes` value plus the two connect-added ones. |
| `TurnstileErrorCode`        | union type            | One entry of `TURNSTILE_ERROR_CODES`.                                 |
| `MAX_TOKEN_LENGTH`          | `2048`                | Turnstile's ceiling on a token's length.                              |

## The verdict

`VerificationSchema` is Cloudflare's response body, field names included:

| Field                   | Type       | Meaning                                    |
| ----------------------- | ---------- | ------------------------------------------ |
| `success`               | `boolean`  | The one required field.                    |
| `error-codes`           | `string[]` | Why `success` is `false`; `[]` on success. |
| `challenge_ts`          | `string`   | ISO 8601 time the challenge was solved.    |
| `hostname`              | `string`   | Hostname the widget was served on.         |
| `action`                | `string`   | The widget's `data-action`.                |
| `cdata`                 | `string`   | The widget's `data-cdata`.                 |
| `metadata.ephemeral_id` | `string`   | Enterprise-only device identifier.         |

## Leniency, deliberately

- **Every field but `success` is optional.** Cloudflare omits most of them
  on a failure.
- **`error-codes` is `string[]`, not a closed enum**, so a code Cloudflare
  adds later never turns a verdict into a `RESPONSE_ERROR`. The documented
  values are in `TURNSTILE_ERROR_CODES` for your own `switch`.
- **`success` is strict**: `"true"` or `1` is rejected, since a verdict
  that isn't a real boolean is not a verdict.
- **Unknown keys pass through**, so an additive field never fails a read.

---

[← Back to CloudflareTurnstile](../README.md)
