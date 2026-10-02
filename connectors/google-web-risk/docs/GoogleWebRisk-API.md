# GoogleWebRisk API

Client configuration and endpoint methods for
`@tundraconnect/google-web-risk`.

## Configuration

```ts
import { GoogleWebRisk } from '@tundraconnect/google-web-risk';

const webRisk = new GoogleWebRisk({
  auth: { type: 'CUSTOM', apiKey: 'YOUR_API_KEY' },
  timeout: 1.5,
});
```

| Option    | Type                | Required | Default                                    | Description                                                     |
| --------- | ------------------- | -------- | ------------------------------------------ | --------------------------------------------------------------- |
| `auth`    | `GoogleWebRiskAuth` | yes      | —                                          | An API key, or an OAuth access token — see below.               |
| `timeout` | `number`            | no       | `10`                                       | Default per-call deadline in seconds, 1–120, fractions allowed. |
| `baseURL` | `string`            | no       | `https://webrisk.googleapis.com/{version}` | Override for a proxy or a test double.                          |
| `version` | `string`            | no       | `v1`                                       | Fills `{version}` in `baseURL`.                                 |

`auth` is one of:

| Shape                                | Sent as                         |
| ------------------------------------ | ------------------------------- |
| `{ type: 'CUSTOM', apiKey }`         | `X-Goog-Api-Key: <apiKey>`      |
| `{ type: 'BEARER', token, prefix? }` | `Authorization: Bearer <token>` |

Google accepts an API key either as a `key` query parameter or in the
`X-Goog-Api-Key` header. This connect uses the header, so the key is never
part of a URL. The header is marked sensitive, so RESTler redacts it from
`call`/`authFailure` event payloads and from error contexts. A `BEARER`
token must carry the `cloud-platform` scope. This client neither mints nor
refreshes it.

`auth` missing, of another type, or with a blank key/token &rarr;
`CONFIG_INVALID_AUTH` at construction.

### Getters

| Getter   | Type     | Description               |
| -------- | -------- | ------------------------- |
| `vendor` | `string` | Always `'GoogleWebRisk'`. |

## Endpoints

### `search(options)`

`GET /v1/uris:search?uri=…&threatTypes=…&threatTypes=…`

Checks one URI against the requested threat lists. `threatTypes` is sent as
one query parameter per list, as Web Risk requires.

```ts
const verdict = await webRisk.search({
  uri: 'http://testsafebrowsing.appspot.com/s/malware.html',
  threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING'],
  timeout: 1.5,
});
```

#### Parameters

| Field         | Type                 | Required | Description                                                                       |
| ------------- | -------------------- | -------- | --------------------------------------------------------------------------------- |
| `uri`         | `string`             | yes      | The URI to check. Needn't be canonicalized; Web Risk does that.                   |
| `threatTypes` | `ThreatTypeSchema[]` | no       | Lists to check. Defaults to `MALWARE`, `SOCIAL_ENGINEERING`, `UNWANTED_SOFTWARE`. |
| `timeout`     | `number`             | no       | Deadline for this call in seconds (1–120, fractions allowed).                     |

Threat types:

| Value                                  | List                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `MALWARE`                              | Malware targeting any platform.                                                   |
| `SOCIAL_ENGINEERING`                   | Social engineering (phishing, deceptive sites).                                   |
| `UNWANTED_SOFTWARE`                    | Unwanted software.                                                                |
| `SOCIAL_ENGINEERING_EXTENDED_COVERAGE` | Extended-coverage social engineering: more matches, more false positives. Opt-in. |

#### Returns

`SearchResult`:

| Shape                                      | Meaning                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `{ listed: false }`                        | Checked: on none of the requested lists.                                  |
| `{ listed: true, threatTypes, expiresOn }` | On these lists; `expiresOn` (`Date \| null`) is when to look it up again. |

`expiresOn` is `null` when Web Risk sends no `expireTime` or one that does
not parse. Web Risk's timestamps carry nanosecond precision, which is
trimmed to milliseconds before parsing.

#### Deadline

`timeout` bounds the whole call, body read included. It is not an idle
timeout. Missing it throws `TIMEOUT` (`transient: true`). It stays a total
deadline while RESTler's `maxRetryWait` is unset (the default); with it
set, a 429 retry's wait sits outside `timeout`.

#### Not wrapped

`hashes.search` and the Update API (`threatLists.computeDiff`) are left out
deliberately. See the README's "Pricing and limits": `hashes.search` costs
$50 per 1,000 calls, and using the Update API reprices every `uris:search`
call to that rate.

## Custom transport

Subclass and reassign the protected `_fetch` to route requests through
your own transport:

```ts
import {
  GoogleWebRisk,
  type GoogleWebRiskOptions,
} from '@tundraconnect/google-web-risk';

class RoutedWebRisk extends GoogleWebRisk {
  constructor(options: GoogleWebRiskOptions, transport: typeof fetch) {
    super(options);
    this._fetch = transport;
  }
}
```

---

[← Back to GoogleWebRisk](../README.md)
