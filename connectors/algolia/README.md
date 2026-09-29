# Algolia

Typed [Algolia Search](https://www.algolia.com/doc/rest-api/search/) API client
for Deno, Bun, Node.js and Cloudflare Workers. Search an index, save, fetch,
delete and browse records, and wait for indexing tasks to finish. A lightweight,
Web-API-only alternative to the official `algoliasearch` SDK for the endpoints
it covers.

[![JSR](https://jsr.io/badges/@tundraconnect/algolia)](https://jsr.io/@tundraconnect/algolia)
[![JSR Score](https://jsr.io/badges/@tundraconnect/algolia/score)](https://jsr.io/@tundraconnect/algolia)

## Overview

Algolia is a hosted search-as-a-service: you push JSON records into a
named "index," and Algolia serves fast, typo-tolerant, ranked search over
them. This connect covers the core index-record lifecycle — `search`,
`saveObject`, `getObject`, `deleteObject`, `browseObjects` (a cursor-based
full scan, distinct from search), and `waitTask` (polling an indexing
operation to confirm it's live) — against a single index per call.

Algolia authenticates every request with two headers derived from your
account: an Application ID and an API key. Those same two values also
determine which of Algolia's two hostnames a request goes to — see
[docs/Algolia-API.md](https://github.com/TundraSoft/tundra-connect/wiki/Algolia-API) for the full "dual base URL"
mechanism.

```ts
import { Algolia } from '@tundraconnect/algolia';

const client = new Algolia({
  auth: {
    type: 'CUSTOM',
    applicationId: 'YOUR_APP_ID',
    apiKey: 'YOUR_ADMIN_API_KEY',
  },
});

const results = await client.search('products', { query: 'red shoes' });
console.log(results.nbHits, results.hits.map((h) => h.objectID));
```

## Documentation

| Topic                                                                        | Description                                |
| ---------------------------------------------------------------------------- | ------------------------------------------ |
| [API](https://github.com/TundraSoft/tundra-connect/wiki/Algolia-API)         | Client configuration and endpoint methods  |
| [Errors](https://github.com/TundraSoft/tundra-connect/wiki/Algolia-Errors)   | Error codes and diagnostic metadata        |
| [Schemas](https://github.com/TundraSoft/tundra-connect/wiki/Algolia-Schemas) | Public Guardian schemas and inferred types |

## Upstream

- [Algolia REST API reference](https://www.algolia.com/doc/rest-api/search/)
- [Create an Algolia account](https://www.algolia.com/users/sign_up)

## Installation

**Deno:**

```sh
deno add jsr:@tundraconnect/algolia
```

**Bun:**

```sh
bunx jsr add @tundraconnect/algolia
```

**Node.js:**

```sh
npx jsr add @tundraconnect/algolia
```

## Quick Start

```ts
import { Algolia } from '@tundraconnect/algolia';

const client = new Algolia({
  auth: {
    type: 'CUSTOM',
    applicationId: 'YOUR_APP_ID',
    apiKey: 'YOUR_ADMIN_API_KEY',
  },
});

// Save a record — indexing is asynchronous, so wait for it to publish
// before relying on it showing up in search.
const saved = await client.saveObject('products', {
  name: 'Blue socks',
  price: 4.5,
});
await client.waitTask('products', saved.taskID);

// Search
const results = await client.search('products', {
  query: 'socks',
  hitsPerPage: 10,
});
console.log(results.hits[0]?.objectID);

// Fetch, then delete, a single record by id
const object = await client.getObject('products', saved.objectID);
const deleted = await client.deleteObject('products', object.objectID);
await client.waitTask('products', deleted.taskID);

// Scan an entire index page by page
let cursor: string | undefined;
do {
  const page = await client.browseObjects('products', { cursor });
  for (const hit of page.hits) console.log(hit.objectID);
  cursor = page.cursor;
} while (cursor);
```

## License

MIT. Part of [Tundra Connect](https://github.com/TundraSoft/tundra-connect),
typed vendor API clients for Deno, Bun, Node.js and Cloudflare Workers.
