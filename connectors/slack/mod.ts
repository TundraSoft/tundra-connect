/**
 * @module @tundraconnect/slack
 */

// Export main client class
export { Slack, type SlackOptions } from './Slack.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
