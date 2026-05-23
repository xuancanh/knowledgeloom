import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const rootDir = path.resolve(new URL('../..', import.meta.url).pathname);

/**
 * Loads a simple KEY=value env file before reading runtime config.
 * This intentionally stays dependency-free because the backend runs as a
 * lightweight local Node process.
 */
function loadEnv(filePath) {
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

if (process.env.KNOWLEDGE_SKIP_DOTENV !== '1') {
  loadEnv(path.join(rootDir, '.env'));
}

export const knowledgeDir = path.join(rootDir, 'knowledge');
export const notesDir = path.join(knowledgeDir, 'notes');
export const categoriesDir = path.join(knowledgeDir, 'categories');
export const indexPath = path.join(knowledgeDir, 'index.json');
export const jobsPath = path.join(knowledgeDir, 'jobs.json');
export const flashcardsPath = path.join(knowledgeDir, 'flashcards.json');
export const appDbPath = process.env.APP_DB_PATH || path.join(knowledgeDir, 'app.sqlite');
export const remindersDbPath = path.join(knowledgeDir, 'reminders.sqlite');

export const PORT = Number(process.env.PORT || 8787);
export const CODEX_COMMAND = process.env.CODEX_COMMAND || 'codex';
export const CODEX_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS || 180000);
export const CODEX_JOB_MAX_ATTEMPTS = Number(process.env.CODEX_JOB_MAX_ATTEMPTS || 3);
export const CODEX_JOB_RETRY_MS = Number(process.env.CODEX_JOB_RETRY_MS || 60000);
export const AI_FLASHCARDS_DISABLED = process.env.AI_FLASHCARDS_DISABLED === '1';
export const MEILI_HOST = process.env.MEILI_HOST || 'http://localhost:7700';
export const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY || '';
export const MEILI_INDEX = process.env.MEILI_INDEX || 'knowledge_notes';
export const meiliSyncPath = path.join(knowledgeDir, `meili-sync-${MEILI_INDEX.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
export const READ_ONLY_MODE = process.env.KNOWLEDGE_READ_ONLY === '1'
  || process.env.READ_ONLY_MODE === '1'
  || process.env.CF_PAGES === '1'
  || process.env.WORKERS_CI === '1';
