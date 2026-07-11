/**
 * @knowledge-loom/server — public package surface.
 *
 * Everything a private composing app (knowledge-loom-ee, grove-server) may
 * import lives here: the root module + its composition options, the DI seam
 * tokens/interfaces it can implement or override, the guards/decorators its
 * controllers reuse, and the database tokens its repositories inject.
 *
 * Anything NOT exported here is internal and may change without notice.
 */

// Root module + composition options
export { AppModule, AppModuleOptions } from './app.module';

// Auth seam
export { AuthStrategy, AUTH_STRATEGY } from './auth/auth-strategy.interface';
export { LocalAuthStrategy } from './auth/local-auth.strategy';
export { ApiAuthGuard } from './auth/auth.guard';
export { AuthModule } from './auth/auth.module';
export { CurrentUser } from './auth/current-user.decorator';
export { CurrentScope } from './auth/current-scope.decorator';

// Usage / quota seam
export { UsageService, USAGE_SERVICE, NoopUsageService, AI_FEATURES } from './usage/usage.interface';
export { UsageModule } from './usage/usage.module';

// AI provider seam
export { AiProvider, AiMessage, AiCompletionOptions, AI_PROVIDER } from './ai/ai-provider.interface';

// Note storage seam
export { NoteStorageProvider, NOTE_STORAGE } from './storage/note-storage.interface';

// Search seam
export { SearchProvider, SearchDocument, SearchHit, SEARCH_PROVIDER } from './search/search-provider.interface';

// Database access (Drizzle instance + table injection tokens)
export { DatabaseModule, DrizzleDb } from './database/database.module';
export * from './database/database.constants';

// Shared guards and domain types
export { WritableGuard } from './common/guards/writable.guard';
export * from './types';
