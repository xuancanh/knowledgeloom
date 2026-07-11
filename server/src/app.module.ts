/**
 * AppModule — root NestJS module that wires every feature module together.
 *
 * Architecture overview:
 *
 *  ┌─────────────────────────────────────────────────────────────────────┐
 *  │                          AppModule                                  │
 *  │                                                                     │
 *  │  ConfigModule (global)  ─── dotenv + typed config factory           │
 *  │  DatabaseModule (global) ── Drizzle ORM + SQLite DDL + migration   │
 *  │                                                                     │
 *  │  StatusModule     → GET /api/status                                 │
 *  │  KnowledgeModule  → GET /api/knowledge                              │
 *  │                   → GET /api/search (SearchController)              │
 *  │  NotesModule      → GET/PUT/PATCH/DELETE /api/notes/:id             │
 *  │                   → POST /api/notes/:id/assist                      │
 *  │  RemindersModule  → GET/POST /api/reminders                         │
 *  │                   → PATCH/DELETE /api/reminders/:id                 │
 *  │  JobsModule       → GET /api/jobs                                   │
 *  │                   → GET /api/jobs/:id                               │
 *  │  LearnModule      → POST /api/learn                                 │
 *  └─────────────────────────────────────────────────────────────────────┘
 *
 *  Layer separation:
 *   Controllers → Services → Repositories (Drizzle / filesystem / HTTP)
 *
 *  The two @Global() modules (Config, Database) are imported here and nowhere
 *  else; their providers are visible to every module automatically.
 */
import { Module, DynamicModule, Logger, Type } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration';
import type { AuthStrategy } from './auth/auth-strategy.interface';
import type { UsageService } from './usage/usage.interface';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { StatusModule } from './status/status.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { NotesModule } from './notes/notes.module';
import { RemindersModule } from './reminders/reminders.module';
import { JobsModule } from './jobs/jobs.module';
import { LearnModule } from './learn/learn.module';
import { ImagesModule } from './images/images.module';
import { RagModule } from './rag/rag.module';
import { QuizModule } from './quiz/quiz.module';
import { SettingsModule } from './settings/settings.module';
import { ExportModule } from './export/export.module';
import { LearnProgressModule } from './learn-progress/learn-progress.module';
import { UsageModule } from './usage/usage.module';
import { StudyModule } from './study/study.module';
import { ImportModule } from './import/import.module';
import { TtsModule } from './tts/tts.module';
import { SharesModule } from './shares/shares.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { SpacesModule } from './spaces/spaces.module';

/**
 * Composition options for package consumers (private server apps importing
 * @knowledge-loom/server). All optional; `forRoot({})` builds the plain OSS
 * app. See docs/tech/ARCHITECTURE.md and the ee repo's PLATFORM_ARCHITECTURE.md.
 */
export interface AppModuleOptions {
  /** Extra Nest modules to mount (billing, admin, Grove, …). */
  extensions?: Array<Type<unknown> | DynamicModule>;
  /** Overrides AUTH_STRATEGY (DI-resolved class). Default: env-based selection. */
  authStrategy?: Type<AuthStrategy>;
  /** Overrides USAGE_SERVICE (DI-resolved class). Default: extensions/ probe, then no-op. */
  usageService?: Type<UsageService>;
}

const baseImports = (options: AppModuleOptions) => [
    // Global providers — no need to import these in feature modules.
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    DatabaseModule,
    AuthModule.forRoot(options.authStrategy),
    UsageModule.forRoot(options.usageService),
    ...(process.env.SKIP_JOBS === '1' ? [] : [
      BullModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          connection: {
            host: config.get<string>('redisHost'),
            port: config.get<number>('redisPort'),
            db: config.get<number>('redisDb') || 0,
          },
        }),
      }),
    ]),

    // Feature modules — each owns its own controllers/services/repos.
    StatusModule,
    KnowledgeModule,
    NotesModule,
    RemindersModule,
    JobsModule,
    LearnModule,
    ImagesModule,
    RagModule,
    QuizModule,
    SettingsModule,
    LearnProgressModule,
    StudyModule,
    ImportModule,
    TtsModule,
    SharesModule,
    MarketplaceModule,
    SpacesModule,
    ExportModule,
];

@Module({})
export class AppModule {
  /**
   * Builds the root module.
   *
   * - Package consumers pass `options.extensions` (and strategy overrides);
   *   no filesystem probing happens for what they provide explicitly.
   * - Legacy overlay builds pass nothing: the optional ExtensionsModule is
   *   appended when the extensions/ tree is present (linked/merged from a
   *   private repo). The variable path keeps tsc from resolving the module
   *   statically; OSS builds simply run without it.
   */
  static async forRoot(options: AppModuleOptions = {}): Promise<DynamicModule> {
    const imports = [...baseImports(options)];
    if (options.extensions?.length) {
      imports.push(...options.extensions);
      new Logger('AppModule').log(`Extension modules loaded (${options.extensions.length} via forRoot)`);
    } else {
      const extensionsModulePath = './extensions/extensions.module';
      try {
        const mod = await import(extensionsModulePath);
        imports.push(mod.ExtensionsModule);
        new Logger('AppModule').log('Extension modules loaded (extensions/)');
      } catch { /* extensions/ not present */ }
    }
    return { module: AppModule, imports };
  }
}
