/**
 * A typed client for the [Algolia Search REST
 * API](https://www.algolia.com/doc/rest-api/search/) —
 * search, save, fetch, delete, and browse records in an Algolia index, plus
 * poll indexing tasks to completion.
 *
 * Typed Algolia Search client: search, save, fetch, delete and browse index
 * records, and wait for indexing tasks to finish.
 *
 * Subpaths: `./schemas` (Guardian schemas and inferred types) and `./errors`
 * (`AlgoliaError` and its code registry).
 *
 * @example
 * ```ts
 * import { Algolia } from '@tundraconnect/algolia';
 *
 * const client = new Algolia({
 *   auth: {
 *     type: 'CUSTOM',
 *     applicationId: 'YOUR_APP_ID',
 *     apiKey: 'YOUR_ADMIN_API_KEY',
 *   },
 * });
 *
 * // Save a record — indexing is asynchronous, so wait for it to publish
 * // before relying on it showing up in search.
 * const saved = await client.saveObject('products', {
 *   name: 'Blue socks',
 *   price: 4.5,
 * });
 * await client.waitTask('products', saved.taskID);
 *
 * // Search
 * const results = await client.search('products', {
 *   query: 'socks',
 *   hitsPerPage: 10,
 * });
 * console.log(results.hits[0]?.objectID);
 *
 * // Fetch, then delete, a single record by id
 * const object = await client.getObject('products', saved.objectID);
 * const deleted = await client.deleteObject('products', object.objectID);
 * await client.waitTask('products', deleted.taskID);
 *
 * // Scan an entire index page by page
 * let cursor: string | undefined;
 * do {
 *   const page = await client.browseObjects('products', { cursor });
 *   for (const hit of page.hits) console.log(hit.objectID);
 *   cursor = page.cursor;
 * } while (cursor);
 * ```
 *
 * @module
 */

// Export main client class
export {
  Algolia,
  type AlgoliaAuth,
  type AlgoliaOptions,
  type WaitTaskOptions,
} from './Algolia.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
