# ntfy API

## Configuration

```ts
import { Ntfy } from '@tundraconnect/ntfy';

// Zero-config: talks to https://ntfy.sh, no credentials.
const client = new Ntfy();

// Self-hosted instance, or a protected topic.
const client = new Ntfy({
  baseURL: 'https://ntfy.example.com',
  auth: { type: 'BASIC', username: 'phil', password: 'mypass' },
  timeout: 15,
});
```

Every option is optional — `new Ntfy()` (no arguments) is a fully working
client for public topics on the hosted `https://ntfy.sh` instance.
`NtfyOptions` is a plain `RESTlerOptions`; there is no vendor-specific
option to configure:

- `baseURL` defaults to `https://ntfy.sh`. Override it to talk to a
  self-hosted ntfy instance — everything else about the connect (auth,
  request/response shapes) works identically.
- `auth` is only needed for a protected topic:
  `{ type: 'BASIC', username, password }` or
  `{ type: 'BEARER', token, prefix? }` (an
  [ntfy access token](https://docs.ntfy.sh/config/#access-tokens), of the
  form `tk_...`). RESTler's built-in Basic/Bearer auth support already
  covers both — this connect needs no auth override of its own.
- `timeout` is expressed in seconds and defaults to `15`.

## Endpoints

| Method      | Endpoint | Result                                                      |
| ----------- | -------- | ----------------------------------------------------------- |
| `publish()` | `POST /` | Publishes a message; returns the published message envelope |

### `publish()`

```ts
import { Ntfy } from '@tundraconnect/ntfy';

const client = new Ntfy();

const message = await client.publish({
  topic: 'mytopic',
  title: 'Disk space alert',
  message: 'Disk usage on server1 is at 90%',
  priority: 4,
  tags: ['warning', 'floppy_disk'],
  click: 'https://example.com/dashboard',
  actions: [
    { action: 'view', label: 'Open dashboard', url: 'https://example.com' },
  ],
});

console.log(message.id, message.time);
```

`publish()` sends ntfy's JSON publish form (`POST /` with a JSON body) —
a strict superset of the plain-text `POST /<topic>` form, so it's the only
shape this connect models. The request is validated against
`PublishRequestSchema` before it's sent — see
[Schemas](ntfy-Schemas.md). Only `topic` is required; every other field
(`message`, `title`, `priority`, `tags`, `click`, `actions`, `attach`,
`filename`, `icon`, `markdown`, `delay`, `email`) is optional, matching
ntfy's own docs.

See [Errors](ntfy-Errors.md) for failure handling and
[Schemas](ntfy-Schemas.md) for request/response validation.

---

[← Back to ntfy](../README.md)
