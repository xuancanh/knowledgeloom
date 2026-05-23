import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function loadEnv(filePath: string) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length && process.env[key] === undefined) {
      process.env[key] = rest.join('=').replace(/^"|"$/g, '');
    }
  }
}

export default () => {
  // __dirname = server/dist/config (compiled) or server/src/config (ts-node)
  // Both require 3 levels up to reach project root
  const rootDir = resolve(__dirname, '../../..');

  if (process.env.KNOWLEDGE_SKIP_DOTENV !== '1') {
    loadEnv(join(rootDir, '.env'));
  }

  const knowledgeDir = join(rootDir, 'knowledge');
  const meiliIndex = process.env.MEILI_INDEX || 'knowledge_notes';

  return {
    port: Number(process.env.PORT || 8787),
    rootDir,
    knowledgeDir,
    notesDir: join(knowledgeDir, 'notes'),
    categoriesDir: join(knowledgeDir, 'categories'),
    indexPath: join(knowledgeDir, 'index.json'),
    jobsPath: join(knowledgeDir, 'jobs.json'),
    flashcardsPath: join(knowledgeDir, 'flashcards.json'),
    appDbPath: process.env.APP_DB_PATH || join(knowledgeDir, 'app.sqlite'),
    remindersDbPath: join(knowledgeDir, 'reminders.sqlite'),
    codexCommand: process.env.CODEX_COMMAND || 'codex',
    codexTimeoutMs: Number(process.env.CODEX_TIMEOUT_MS || 180000),
    codexJobMaxAttempts: Number(process.env.CODEX_JOB_MAX_ATTEMPTS || 3),
    codexJobRetryMs: Number(process.env.CODEX_JOB_RETRY_MS || 60000),
    aiFlashcardsDisabled: process.env.AI_FLASHCARDS_DISABLED === '1',
    meiliHost: process.env.MEILI_HOST || 'http://localhost:7700',
    meiliMasterKey: process.env.MEILI_MASTER_KEY || '',
    meiliIndex,
    meiliSyncPath: join(knowledgeDir, `meili-sync-${meiliIndex.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`),
    // Note storage backend: 'local' (default) or 's3'
    noteStorage: process.env.NOTE_STORAGE || 'local',
    s3Endpoint: process.env.S3_ENDPOINT || '',
    s3Bucket: process.env.S3_BUCKET || '',
    s3Region: process.env.S3_REGION || 'auto',
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    s3Prefix: process.env.S3_PREFIX || 'notes/',

    // Search provider: 'meilisearch' (default) or 'inmemory'
    searchProvider: process.env.SEARCH_PROVIDER || 'meilisearch',

    // AI provider selection: 'codex' (default) or 'openrouter'
    aiProvider: process.env.AI_PROVIDER || 'codex',
    aiApiKey: process.env.AI_API_KEY || '',
    aiApiBaseUrl: process.env.AI_API_BASE_URL || 'https://openrouter.ai/api/v1',
    aiModel: process.env.AI_MODEL || 'anthropic/claude-3-5-sonnet',
    aiSystemPrompt: process.env.AI_SYSTEM_PROMPT || '',

    readOnly:
      process.env.KNOWLEDGE_READ_ONLY === '1' ||
      process.env.READ_ONLY_MODE === '1' ||
      process.env.CF_PAGES === '1' ||
      process.env.WORKERS_CI === '1',
  };
};
