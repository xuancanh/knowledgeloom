/**
 * Configuration factory — loads all environment variables once at startup,
 * normalises them into typed config keys, and makes them available everywhere
 * via NestJS ConfigService.
 *
 * Path resolution: __dirname is server/dist/config (compiled) or
 * server/src/config (ts-node). Both require resolve(__dirname, '../../..')
 * to reach the project root.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Reads a .env file and sets process.env for any keys not already defined. */
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

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  const prefix = `${flag}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (arg) {
    return arg.slice(prefix.length);
  }
  return undefined;
}

export default () => {
  // __dirname = server/dist/config (compiled) or server/src/config (ts-node)
  // Both require 3 levels up to reach project root. KNOWLEDGE_ROOT overrides
  // it — required by test suites so spawned servers never touch the real
  // knowledge/ directory (cwd is NOT used for path derivation).
  const rootDir = process.env.KNOWLEDGE_ROOT || resolve(__dirname, '../../..');

  if (process.env.KNOWLEDGE_SKIP_DOTENV !== '1') {
    loadEnv(join(rootDir, '.env'));
  }

  const knowledgeDir = join(rootDir, 'knowledge');
  // Per-user data root: knowledge/users/{userId}/
  const usersDir = join(knowledgeDir, 'users');
  const meiliIndex = process.env.MEILI_INDEX || 'knowledge_notes';

  const databaseDialect = getArg('--db-dialect') || getArg('--database-dialect') || process.env.DATABASE_DIALECT || 'sqlite';
  const databaseUrl = getArg('--db-url') || getArg('--database-url') || process.env.DATABASE_URL || '';

  return {
    port: Number(process.env.PORT || 8787),
    rootDir,
    knowledgeDir,
    // Per-user isolation: all per-user data lives under knowledge/users/{userId}/
    usersDir,
    databaseDialect,
    databaseUrl,
    // Legacy single-user paths kept for backward-compat during migration
    notesDir: join(knowledgeDir, 'notes'),
    categoriesDir: join(knowledgeDir, 'categories'),
    indexPath: join(knowledgeDir, 'index.json'),
    jobsPath: join(knowledgeDir, 'jobs.json'),
    flashcardsPath: join(knowledgeDir, 'flashcards.json'),
    appDbPath: process.env.APP_DB_PATH || join(knowledgeDir, 'app.sqlite'),
    remindersDbPath: join(knowledgeDir, 'reminders.sqlite'),
    // Auth — 'local' (default) or 'supabase' (requires the extension modules)
    authProvider: process.env.AUTH_PROVIDER || '',
    // Optional bearer token for internet-exposed self-hosted instances (local provider)
    authSecret: process.env.AUTH_SECRET || '',
    // Supabase auth (read by the extensions Supabase strategy)
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    codexCommand: process.env.CODEX_COMMAND || 'codex',
    codexTimeoutMs: Number(process.env.CODEX_TIMEOUT_MS || 180000),
    codexJobMaxAttempts: Number(process.env.CODEX_JOB_MAX_ATTEMPTS || 3),
    codexJobRetryMs: Number(process.env.CODEX_JOB_RETRY_MS || 60000),
    aiFlashcardsDisabled: process.env.AI_FLASHCARDS_DISABLED === '1',
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: Number(process.env.REDIS_PORT || 6379),
    redisPassword: process.env.REDIS_PASSWORD || '',
    // Optional logical database — lets tests/parallel envs isolate queues and counters.
    redisDb: Number(process.env.REDIS_DB || 0),
    publicRateLimitStore: process.env.PUBLIC_RATE_LIMIT_STORE
      || (process.env.NODE_ENV === 'production' ? 'redis' : 'memory'),
    publicRateLimit: Number(process.env.PUBLIC_RATE_LIMIT || 120),
    shareUnlockRateLimit: Number(process.env.SHARE_UNLOCK_RATE_LIMIT || 10),
    publicRateLimitPrefix: process.env.PUBLIC_RATE_LIMIT_PREFIX || 'kl:rate-limit:',
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

    // Audio transcription for import: 'openai' (Whisper-compatible HTTP API),
    // 'cli' (local command, e.g. whisper.cpp), or 'none' (audio import disabled).
    transcribeProvider: process.env.TRANSCRIBE_PROVIDER
      || (process.env.TRANSCRIBE_API_KEY ? 'openai' : 'none'),
    transcribeApiBase: process.env.TRANSCRIBE_API_BASE || 'https://api.openai.com/v1',
    transcribeApiKey: process.env.TRANSCRIBE_API_KEY || '',
    transcribeModel: process.env.TRANSCRIBE_MODEL || 'whisper-1',
    // CLI template; {file} is replaced with the audio path. Must print the transcript to stdout.
    transcribeCommand: process.env.TRANSCRIBE_COMMAND || '',
    // Wall-clock cap for a single transcription (HTTP request or CLI process),
    // bounding the blast radius of a slow/hostile upload. Default 2 minutes.
    transcribeTimeoutMs: Number(process.env.TRANSCRIBE_TIMEOUT_MS || 120000),

    // Vision extraction for image/handwriting import. Defaults to the main AI
    // provider's HTTP credentials when it is OpenAI-compatible (openrouter).
    visionApiBase: process.env.VISION_API_BASE || process.env.AI_API_BASE_URL || 'https://openrouter.ai/api/v1',
    visionApiKey: process.env.VISION_API_KEY
      || ((process.env.AI_PROVIDER || 'codex') !== 'codex' ? process.env.AI_API_KEY || '' : ''),
    visionModel: process.env.VISION_MODEL || 'gpt-4o-mini',

    // Text-to-speech for podcast audio: 'openai' (any /audio/speech-compatible
    // API) or 'none' (podcast stays text + browser timing).
    ttsProvider: process.env.TTS_PROVIDER || (process.env.TTS_API_KEY ? 'openai' : 'none'),
    ttsApiBase: process.env.TTS_API_BASE || 'https://api.openai.com/v1',
    ttsApiKey: process.env.TTS_API_KEY || '',
    ttsModel: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
    ttsVoiceA: process.env.TTS_VOICE_A || 'nova',   // maya
    ttsVoiceB: process.env.TTS_VOICE_B || 'onyx',   // theo

    // Max spaces per user, counting the default space (0 = unlimited).
    // Hosted builds override this via the subscription plan instead.
    maxSpaces: Number(process.env.MAX_SPACES || 0),

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
