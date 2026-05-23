/**
 * Injection tokens for the Drizzle database provider.
 *
 * NestJS convention: injection tokens for non-class providers (factories,
 * values) are defined in a dedicated constants file so they can be imported by
 * repositories without creating circular dependencies with the module file.
 *
 * We use a string token rather than a Symbol because string tokens are
 * serialisable, work reliably across module boundaries in Node.js, and are
 * easier to inspect in debug output.
 */
export const DRIZZLE_DB = 'DRIZZLE_DB';
