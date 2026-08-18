/**
 * @module @tundraconnect/telegram
 */

// Export main client class
export { Telegram, type TelegramOptions } from './Telegram.ts';

// Export error handling
export * from './errors/mod.ts';

// Export the full schema barrel for advanced usage
export * from './schema/mod.ts';
