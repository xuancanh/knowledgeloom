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
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration';
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

@Module({
  imports: [
    // Global providers — no need to import these in feature modules.
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    DatabaseModule,
    AuthModule,
    ...(process.env.SKIP_JOBS === '1' ? [] : [
      BullModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          connection: {
            host: config.get<string>('redisHost'),
            port: config.get<number>('redisPort'),
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
  ],
})
export class AppModule {}
