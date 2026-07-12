/**
 * Typed HTTP client for all backend API calls.
 * Every exported function corresponds to one backend endpoint.
 *
 * Error handling is centralized in apiError(): failed responses throw an Error
 * whose message is the server's own message when present, otherwise normalized
 * per-status copy. The status and any structured payload (e.g. quota errors
 * carrying { quota, used, plan }) are attached so callers — upgrade prompts,
 * read-only banners — can react without re-parsing.
 */
import type { CreateNoteRequest, KnowledgeNote, KnowledgeState, LearnJob, Reminder, RagScope } from './types';
import { ext } from './lib/extensions';
import { currentSpaceId, setCurrentSpaceId, DEFAULT_SPACE_ID, type Space } from './lib/spaces';

/** Error thrown by the API client; carries the HTTP status and server payload. */
export interface ApiError extends Error {
  status: number;
  payload?: Record<string, unknown>;
}

/** Normalized, user-facing copy for statuses the server doesn't describe itself. */
const STATUS_COPY: Record<number, string> = {
  401: 'Please sign in and try again.',
  403: 'You don’t have permission to do that.',
  404: 'That item could not be found.',
  409: 'That changed somewhere else — reload and try again.',
  413: 'That file is too large.',
  429: 'You’ve hit a limit — try again shortly.',
};

/**
 * Build a normalized Error from a failed response. `action` is a short verb
 * phrase (e.g. "load spaces") used only as the last-resort message.
 */
export async function apiError(response: Response, action: string): Promise<ApiError> {
  let payload: Record<string, unknown> | null = null;
  try { payload = await response.clone().json(); } catch { /* non-JSON body */ }
  const serverMsg = payload && (typeof payload.error === 'string' ? payload.error
    : typeof payload.message === 'string' ? payload.message : '');
  const statusCopy = STATUS_COPY[response.status]
    ?? (response.status >= 500 ? 'Something went wrong on our end — please try again.' : '');
  const message = serverMsg || statusCopy || `Couldn’t ${action} (${response.status}).`;
  const err = new Error(message) as ApiError;
  err.status = response.status;
  if (payload && typeof payload === 'object') err.payload = payload;
  return err;
}

/** Returns auth headers from the extension auth adapter, or {} in local mode. */
async function authHeaders(): Promise<Record<string, string>> {
  const adapter = ext.authAdapter();
  if (!adapter) return {};
  const token = await adapter.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const auth = await authHeaders();
  const spaceId = currentSpaceId();
  const space: Record<string, string> = spaceId !== DEFAULT_SPACE_ID ? { 'x-space-id': spaceId } : {};
  const headers = { ...auth, ...space, ...(init.headers as Record<string, string> | undefined) };
  const response = await fetch(url, { ...init, headers });

  // The stored space was deleted (possibly from another device): fall back to
  // the default space instead of leaving the app wedged on 404s.
  if (response.status === 404 && spaceId !== DEFAULT_SPACE_ID) {
    const body = await response.clone().json().catch(() => null);
    if (body && /space not found/i.test(String(body.message ?? ''))) {
      setCurrentSpaceId(DEFAULT_SPACE_ID);
      window.location.assign('/');
    }
  }
  return response;
}

// --- Spaces ---

export async function fetchSpaces(): Promise<{ spaces: Space[]; limit: number | null }> {
  const response = await apiFetch('/api/spaces');
  if (!response.ok) throw await apiError(response, 'load spaces');
  return response.json();
}

export async function createSpace(name: string): Promise<Space> {
  const response = await apiFetch('/api/spaces', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw await apiError(response, 'create space');
  return response.json();
}

export async function renameSpace(id: string, name: string): Promise<Space> {
  const response = await apiFetch(`/api/spaces/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw await apiError(response, 'rename space');
  return response.json();
}

export async function deleteSpace(id: string): Promise<void> {
  const response = await apiFetch(`/api/spaces/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw await apiError(response, 'delete space');
}

export type NoteTransferMode = 'copy' | 'move';
export type NoteTransferResult = {
  noteId: string;
  fromSpaceId: string;
  toSpaceId: string;
  mode: NoteTransferMode;
};

export async function transferNoteToSpace(
  noteId: string,
  toSpaceId: string,
  mode: NoteTransferMode,
): Promise<NoteTransferResult> {
  const response = await apiFetch('/api/spaces/transfer-note', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ noteId, fromSpaceId: currentSpaceId(), toSpaceId, mode }),
  });
  if (!response.ok) throw await apiError(response, `${mode} note`);
  return response.json();
}

export type RestoreConflictPolicy = 'skip' | 'overwrite' | 'rename';
export type RestoreResult = {
  dryRun: boolean;
  policy: RestoreConflictPolicy;
  total: number;
  created: number;
  overwritten: number;
  renamed: number;
  skipped: number;
  conflicts: string[];
  restoredSettings: boolean;
};

export async function exportVaultBackup(): Promise<{ blob: Blob; filename: string }> {
  const response = await apiFetch('/api/export');
  if (!response.ok) throw await apiError(response, 'export the vault');
  const disposition = response.headers.get('content-disposition') || '';
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'knowledge-loom-backup.json';
  return { blob: await response.blob(), filename };
}

export async function restoreVaultBackup(file: File, options: {
  policy: RestoreConflictPolicy;
  dryRun: boolean;
  restoreSettings: boolean;
}): Promise<RestoreResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('policy', options.policy);
  form.append('dryRun', options.dryRun ? '1' : '0');
  form.append('restoreSettings', options.restoreSettings ? '1' : '0');
  const response = await apiFetch('/api/export/restore', { method: 'POST', body: form });
  if (!response.ok) throw await apiError(response, 'restore the vault');
  return response.json();
}

export async function fetchStatus(): Promise<{ readOnly: boolean }> {
  const response = await fetch('/api/status');
  if (!response.ok) throw await apiError(response, 'load service status');
  return response.json();
}

// Conditional-fetch cache for the large knowledge payload. On an unchanged
// poll the server returns 304 and we hand back the same object reference, so
// the caller's setState bails out of a re-render (Object.is) and no body is
// transferred or parsed. Keyed by space so switching scopes never serves stale
// state (a different scope's ETag simply won't match).
let knowledgeEtag: string | null = null;
let knowledgeState: KnowledgeState | null = null;
let knowledgeEtagSpace: string | null = null;

export async function fetchKnowledge(): Promise<KnowledgeState> {
  const space = currentSpaceId();
  const conditional: Record<string, string> = knowledgeEtag && knowledgeEtagSpace === space
    ? { 'If-None-Match': knowledgeEtag }
    : {};
  // no-store keeps the browser's HTTP cache out of the way so our explicit
  // If-None-Match / 304 handling is what runs (we cache in JS ourselves).
  const response = await apiFetch('/api/knowledge', { headers: conditional, cache: 'no-store' });
  if (response.status === 304 && knowledgeState) return knowledgeState;
  if (!response.ok) throw await apiError(response, 'load knowledge');
  const state = (await response.json()) as KnowledgeState;
  knowledgeEtag = response.headers.get('ETag');
  knowledgeEtagSpace = space;
  knowledgeState = state;
  return state;
}

export interface NoteDocument {
  markdown: string;
  version: string;
}

export async function fetchNoteDocument(id: string): Promise<NoteDocument> {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}`);
  if (!response.ok) throw await apiError(response, 'load note');
  return response.json();
}

export async function fetchNoteMarkdown(id: string): Promise<string> {
  return (await fetchNoteDocument(id)).markdown;
}

export async function deleteNote(id: string): Promise<{ deleted: string; state: KnowledgeState }> {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw await apiError(response, 'delete note');
  return response.json();
}

export async function markNoteRead(id: string): Promise<void> {
  await apiFetch(`/api/notes/${encodeURIComponent(id)}/read`, { method: 'POST' });
}

export async function patchSettings(patch: Record<string, unknown>): Promise<void> {
  await apiFetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export async function fetchReminders(filters: { noteId?: string; status?: 'active' | 'done' | 'due' } = {}): Promise<{ reminders: Reminder[] }> {
  const params = new URLSearchParams();
  if (filters.noteId) params.set('noteId', filters.noteId);
  if (filters.status) params.set('status', filters.status);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await apiFetch(`/api/reminders${suffix}`);
  if (!response.ok) throw await apiError(response, 'load reminders');
  return response.json();
}

export async function createReminder(payload: { noteId: string; remindAt: string; message?: string }): Promise<{ reminder: Reminder }> {
  const response = await apiFetch('/api/reminders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await apiError(response, 'create reminder');
  return response.json();
}

export async function updateReminder(id: string, update: { completed?: boolean; remindAt?: string; message?: string }): Promise<{ reminder: Reminder }> {
  const response = await apiFetch(`/api/reminders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!response.ok) throw await apiError(response, 'update reminder');
  return response.json();
}

export async function deleteReminder(id: string): Promise<{ deleted: string }> {
  const response = await apiFetch(`/api/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw await apiError(response, 'delete reminder');
  return response.json();
}

export async function createFlashcard(payload: {
  noteId: string; prompt: string; lesson: string; kind: string;
}): Promise<{ flashcard: any }> {
  const response = await apiFetch('/api/flashcards', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw await apiError(response, 'create flashcard');
  return response.json();
}

export async function updateFlashcard(id: string, payload: { prompt: string; lesson: string; kind: string }): Promise<{ updated: string }> {
  const response = await apiFetch(`/api/flashcards/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw await apiError(response, 'update flashcard');
  return response.json();
}

export async function deleteFlashcard(id: string): Promise<void> {
  const response = await apiFetch(`/api/flashcards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw await apiError(response, 'delete flashcard');
}

export async function reviewFlashcard(id: string, payload: { rating: 'again' | 'hard' | 'good'; noteId: string; isUserCard?: boolean }): Promise<{ review: any }> {
  const response = await apiFetch(`/api/flashcards/${encodeURIComponent(id)}/review`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw await apiError(response, 'submit review');
  return response.json();
}

export async function reviewQuiz(id: string, payload: { rating: 'correct' | 'wrong'; noteId: string; currentStreak?: number }): Promise<{ review: any }> {
  const response = await apiFetch(`/api/quiz/${encodeURIComponent(id)}/review`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw await apiError(response, 'submit quiz review');
  return response.json();
}

export async function hideQuiz(id: string): Promise<void> {
  const response = await apiFetch(`/api/quiz/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw await apiError(response, 'hide quiz question');
}

export async function restoreQuiz(id: string): Promise<void> {
  const response = await apiFetch(`/api/quiz/${encodeURIComponent(id)}/restore`, { method: 'POST' });
  if (!response.ok) throw await apiError(response, 'restore quiz question');
}

export async function regenerateNote(id: string, target: 'flashcards' | 'quiz' | 'all', size: import('./types').GenSize = 'small'): Promise<{ job: import('./types').LearnJob }> {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, size }),
  });
  if (!response.ok) throw await apiError(response, 'regenerate');
  return response.json();
}

export type NoteUpdate = {
  title: string;
  category: string;
  summary: string;
  tags: string[];
  links: string[];
  bilinks?: string[];
  body: string;
};

export async function assistDraft(
  draft: { title: string; body: string; category?: string; summary?: string; tags?: string[] },
  prompt: string,
): Promise<{ update: NoteUpdate; codexStatus: string }> {
  const response = await apiFetch('/api/notes/assist-draft', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, draft }),
  });
  if (!response.ok) throw await apiError(response, 'run AI assist');
  return response.json();
}

export async function assistNoteEdit(id: string, prompt: string, draft: NoteUpdate): Promise<{ update: NoteUpdate; codexStatus: string }> {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}/assist`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, draft }),
  });
  if (!response.ok) throw await apiError(response, 'run the AI edit');
  return response.json();
}

export interface NoteUpdateResult {
  note: KnowledgeNote;
  state: KnowledgeState;
  markdown: string;
  version: string;
}

export async function updateNote(id: string, update: NoteUpdate, expectedVersion?: string): Promise<NoteUpdateResult> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (expectedVersion) headers['if-match'] = `"${expectedVersion}"`;
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(update),
  });
  if (!response.ok) throw await apiError(response, 'update note');
  return response.json();
}

export async function patchNote(id: string, patch: Partial<NoteUpdate>): Promise<{ note: KnowledgeNote; state: KnowledgeState }> {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw await apiError(response, 'patch note');
  return response.json();
}

export async function backfillBilinks(): Promise<{ pairsConverted: number; state: KnowledgeState }> {
  const response = await apiFetch('/api/notes/backfill-bilinks', { method: 'POST' });
  if (!response.ok) throw await apiError(response, 'backfill bilinks');
  return response.json();
}

export async function uploadImage(file: File): Promise<{ url: string; filename: string }> {
  const form = new FormData();
  form.append('file', file);
  const response = await apiFetch('/api/images', { method: 'POST', body: form });
  if (!response.ok) throw await apiError(response, 'upload image');
  return response.json();
}

export async function submitLearning(payload: CreateNoteRequest): Promise<{ jobId: string; job: LearnJob; note?: KnowledgeNote; state?: KnowledgeState; markdown?: string }> {
  const response = await apiFetch('/api/learn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await apiError(response, 'create note');
  return response.json();
}

export async function fetchJob(jobId: string): Promise<LearnJob> {
  const response = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`);
  if (!response.ok) throw await apiError(response, 'load job');
  return response.json();
}

export async function fetchJobs(): Promise<{ jobs: LearnJob[] }> {
  const response = await apiFetch('/api/jobs');
  if (!response.ok) throw await apiError(response, 'load jobs');
  return response.json();
}

export async function searchKnowledge(query: string, category: string): Promise<{ engine: string; hits: KnowledgeNote[]; warning?: string }> {
  const params = new URLSearchParams({ q: query, category });
  const response = await apiFetch(`/api/search?${params.toString()}`);
  if (!response.ok) throw await apiError(response, 'search');
  return response.json();
}

export async function* streamRagAnswer(
  question: string,
  scope: RagScope,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  signal?: AbortSignal,
  mode: 'chat' | 'tutor' = 'chat',
): AsyncGenerator<string> {
  const auth = await authHeaders();
  const response = await fetch('/api/rag/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ question, scope, history, mode }),
    signal,
  });
  if (!response.ok) throw await apiError(response, 'start the chat response');
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
}

/* ── Study queue ── */

export type StudyQueue = {
  flashcards: import('./types').Flashcard[];
  quiz: import('./types').QuizQuestion[];
  reminders: Reminder[];
  counts: {
    flashcards: number; dueFlashcards: number; newFlashcards: number;
    quiz: number; dueQuiz: number; newQuiz: number; reminders: number;
  };
  generatedAt: string;
};

export async function fetchStudyToday(): Promise<StudyQueue> {
  const response = await apiFetch('/api/study/today');
  if (!response.ok) throw await apiError(response, 'load study queue');
  return response.json();
}

export type StudyStats = {
  windowDays: number;
  totals: {
    reviews: number;
    flashcardReviews: number;
    quizReviews: number;
    successRate: number | null;
    retention1d: number | null;
    retention7d: number | null;
  };
  categories: { category: string; attempts: number; successRate: number }[];
  weakestTopics: { noteId: string; title: string; category: string; attempts: number; successRate: number }[];
};

export type ExamPlanDto = {
  examDate: string;
  daysUntilExam: number;
  totalItems: number;
  totalReviews: number;
  days: { date: string; focus: 'learn' | 'consolidate' | 'final-review' | 'exam'; items: { id: string; type: string; noteId: string }[] }[];
};

export async function createExamPlan(examDate: string, scope?: { category?: string; tag?: string }): Promise<ExamPlanDto> {
  const response = await apiFetch('/api/study/exam-plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ examDate, scope }),
  });
  if (!response.ok) throw await apiError(response, 'build the exam plan');
  return response.json();
}

export async function fetchStudyStats(days = 30): Promise<StudyStats> {
  const response = await apiFetch(`/api/study/stats?days=${days}`);
  if (!response.ok) throw await apiError(response, 'load study stats');
  return response.json();
}

/* ── Import ── */

export async function importSource(input: {
  file?: File;
  text?: string;
  title?: string;
  category?: string;
  tags?: string[];
}): Promise<{ jobId: string; job: LearnJob; extractedChars: number; truncated: boolean }> {
  let response: Response;
  if (input.file) {
    const form = new FormData();
    form.append('file', input.file);
    if (input.title) form.append('title', input.title);
    if (input.category) form.append('category', input.category);
    if (input.tags?.length) form.append('tags', input.tags.join(','));
    response = await apiFetch('/api/import', { method: 'POST', body: form });
  } else {
    response = await apiFetch('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: input.text, title: input.title, category: input.category, tags: input.tags }),
    });
  }
  if (!response.ok) throw await apiError(response, 'import that');
  return response.json();
}

/* ── Share links ── */

export type CreateShareInput = ({ noteId: string } | { category: string }) & {
  expiresInDays?: number;
  password?: string;
};

export async function createShare(target: CreateShareInput): Promise<{ id: string; url: string; kind: 'note' | 'category'; target: string; expiresAt: string | null; passwordProtected: boolean }> {
  const response = await apiFetch('/api/shares', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(target),
  });
  if (!response.ok) throw await apiError(response, 'create share link');
  return response.json();
}

export async function revokeShare(id: string): Promise<void> {
  const response = await apiFetch(`/api/shares/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw await apiError(response, 'revoke share');
}

export type SharedNote = { title: string; category: string; summary: string; tags: string[]; body: string; createdAt: string };

export type PublicShare = {
  kind: 'note' | 'category';
  note?: SharedNote;
  collection?: { name: string; noteCount: number };
  notes?: SharedNote[];
  flashcards: { prompt: string; lesson: string; kind: string; noteTitle?: string }[];
  quiz: { type: string; question: string; answer: string; choices?: string[]; correctIndex?: number; explanation?: string; noteTitle?: string }[];
  sharedAt: string;
};

/** Public — no auth; anyone with the link. */
export async function fetchPublicShare(id: string, password?: string): Promise<PublicShare> {
  const response = await fetch(`/api/shares/${encodeURIComponent(id)}/public`, password === undefined ? undefined : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw await apiError(response, 'load the shared page');
  return response.json();
}

/* ── Marketplace ── */

export type MarketplaceListing = {
  id: string;
  title: string;
  description: string;
  kind: 'note' | 'category';
  tags: string[];
  author: string;
  imports: number;
  publishedAt: string;
  avgStars: number | null;
  ratingCount: number;
};

export async function rateListing(id: string, stars: number, comment = ''): Promise<{ avgStars: number; ratingCount: number }> {
  const response = await apiFetch(`/api/marketplace/${encodeURIComponent(id)}/rate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stars, comment }),
  });
  if (!response.ok) throw await apiError(response, 'submit your rating');
  return response.json();
}

export async function reportListing(id: string, reason = ''): Promise<{ reported: string; reportCount: number; unpublished: boolean }> {
  const response = await apiFetch(`/api/marketplace/${encodeURIComponent(id)}/report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) throw await apiError(response, 'report listing');
  return response.json();
}

export async function browseMarketplace(q = '', kind = ''): Promise<{ listings: MarketplaceListing[] }> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (kind) params.set('kind', kind);
  const response = await fetch(`/api/marketplace?${params}`);
  if (!response.ok) throw await apiError(response, 'browse marketplace');
  return response.json();
}

export async function fetchMyListings(): Promise<{ listings: MarketplaceListing[] }> {
  const response = await apiFetch('/api/marketplace/mine');
  if (!response.ok) throw await apiError(response, 'load your listings');
  return response.json();
}

export async function fetchMyShares(): Promise<{ shares: { id: string; noteId: string; kind: string; createdAt: string }[] }> {
  const response = await apiFetch('/api/shares');
  if (!response.ok) throw await apiError(response, 'load shares');
  return response.json();
}

export async function publishListing(input: { shareId: string; title: string; description?: string; tags?: string[]; author?: string }): Promise<{ listing: MarketplaceListing }> {
  const response = await apiFetch('/api/marketplace/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await apiError(response, 'publish that');
  return response.json();
}

export async function importListing(id: string): Promise<{ imported: { notes: string[]; flashcards: number; quiz: number } }> {
  const response = await apiFetch(`/api/marketplace/${encodeURIComponent(id)}/import`, { method: 'POST' });
  if (!response.ok) throw await apiError(response, 'import');
  return response.json();
}

export async function unpublishListing(id: string): Promise<void> {
  const response = await apiFetch(`/api/marketplace/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw await apiError(response, 'unpublish');
}

/* ── Podcast text-to-speech ── */

export async function fetchTtsConfig(): Promise<{ enabled: boolean }> {
  try {
    const response = await apiFetch('/api/tts/config');
    if (!response.ok) return { enabled: false };
    return response.json();
  } catch {
    return { enabled: false };
  }
}

/** Returns an object URL for the synthesized dialogue, or null when TTS is unavailable/failed. */
export async function fetchPodcastAudio(lines: Array<{ who: string; text: string }>): Promise<string | null> {
  try {
    const response = await apiFetch('/api/tts/podcast', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines }),
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/* ── Learn progress ── */

export type LearnProgressDto = {
  xp: number;
  todayXp: number;
  dailyGoalXp: number;
  streak: number;
  mastery: Record<string, 'mastered'>;
};

export async function fetchLearnProgress(): Promise<LearnProgressDto> {
  const response = await apiFetch('/api/learn-progress');
  if (!response.ok) throw await apiError(response, 'load learn progress');
  return response.json();
}

export async function awardLearnXp(xp: number): Promise<LearnProgressDto> {
  const response = await apiFetch('/api/learn-progress/award', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ xp }),
  });
  if (!response.ok) throw await apiError(response, 'award XP');
  return response.json();
}

export async function masterLearnNote(noteId: string): Promise<LearnProgressDto> {
  const response = await apiFetch(`/api/learn-progress/master/${encodeURIComponent(noteId)}`, { method: 'POST' });
  if (!response.ok) throw await apiError(response, 'mark mastered');
  return response.json();
}

/** Returns the AI-generated deck, or null when generation failed (caller falls back to the heuristic deck). */
export async function generateLearnDeck(payload: {
  noteId: string; title: string; category: string; summary: string; tags: string[];
}): Promise<unknown | null> {
  try {
    const response = await apiFetch('/api/learn-progress/generate-deck', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
