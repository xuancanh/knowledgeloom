/**
 * Typed HTTP client for all backend API calls.
 * Every exported function corresponds to one backend endpoint.
 * Error handling: throws on non-2xx responses with status code in message.
 */
import type { CreateNoteRequest, KnowledgeNote, KnowledgeState, LearnJob, Reminder, RagScope, ChatMessage } from './types';
import { ee } from './lib/ee';

/** Returns auth headers from the extensions auth adapter, or {} in local mode. */
async function authHeaders(): Promise<Record<string, string>> {
  const adapter = ee.authAdapter();
  if (!adapter) return {};
  const token = await adapter.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const auth = await authHeaders();
  const headers = { ...auth, ...(init.headers as Record<string, string> | undefined) };
  return fetch(url, { ...init, headers });
}

export async function fetchStatus(): Promise<{ readOnly: boolean }> {
  const response = await fetch('/api/status');
  if (!response.ok) throw new Error(`Failed to load service status: ${response.status}`);
  return response.json();
}

export async function fetchKnowledge(): Promise<KnowledgeState> {
  const response = await apiFetch('/api/knowledge');
  if (!response.ok) throw new Error(`Failed to load knowledge: ${response.status}`);
  return response.json();
}

export async function fetchNoteMarkdown(id: string): Promise<string> {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`Failed to load note: ${response.status}`);
  const data = await response.json();
  return data.markdown;
}

export async function deleteNote(id: string): Promise<{ deleted: string; state: KnowledgeState }> {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Failed to delete note: ${response.status}`);
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
  if (!response.ok) throw new Error(`Failed to load reminders: ${response.status}`);
  return response.json();
}

export async function createReminder(payload: { noteId: string; remindAt: string; message?: string }): Promise<{ reminder: Reminder }> {
  const response = await apiFetch('/api/reminders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to create reminder: ${response.status}`);
  return response.json();
}

export async function updateReminder(id: string, update: { completed?: boolean; remindAt?: string; message?: string }): Promise<{ reminder: Reminder }> {
  const response = await apiFetch(`/api/reminders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!response.ok) throw new Error(`Failed to update reminder: ${response.status}`);
  return response.json();
}

export async function deleteReminder(id: string): Promise<{ deleted: string }> {
  const response = await apiFetch(`/api/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Failed to delete reminder: ${response.status}`);
  return response.json();
}

export async function createFlashcard(payload: {
  noteId: string; prompt: string; lesson: string; kind: string;
}): Promise<{ flashcard: any }> {
  const response = await apiFetch('/api/flashcards', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to create flashcard: ${response.status}`);
  return response.json();
}

export async function updateFlashcard(id: string, payload: { prompt: string; lesson: string; kind: string }): Promise<{ updated: string }> {
  const response = await apiFetch(`/api/flashcards/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to update flashcard: ${response.status}`);
  return response.json();
}

export async function deleteFlashcard(id: string): Promise<void> {
  const response = await apiFetch(`/api/flashcards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Failed to delete flashcard: ${response.status}`);
}

export async function reviewFlashcard(id: string, payload: { rating: 'again' | 'hard' | 'good'; noteId: string; isUserCard?: boolean }): Promise<{ review: any }> {
  const response = await apiFetch(`/api/flashcards/${encodeURIComponent(id)}/review`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to submit review: ${response.status}`);
  return response.json();
}

export async function reviewQuiz(id: string, payload: { rating: 'correct' | 'wrong'; noteId: string; currentStreak?: number }): Promise<{ review: any }> {
  const response = await apiFetch(`/api/quiz/${encodeURIComponent(id)}/review`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to submit quiz review: ${response.status}`);
  return response.json();
}

export async function hideQuiz(id: string): Promise<void> {
  const response = await apiFetch(`/api/quiz/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Failed to hide quiz question: ${response.status}`);
}

export async function restoreQuiz(id: string): Promise<void> {
  const response = await apiFetch(`/api/quiz/${encodeURIComponent(id)}/restore`, { method: 'POST' });
  if (!response.ok) throw new Error(`Failed to restore quiz question: ${response.status}`);
}

export async function regenerateNote(id: string, target: 'flashcards' | 'quiz' | 'all', size: import('./types').GenSize = 'small'): Promise<{ job: import('./types').LearnJob }> {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, size }),
  });
  if (!response.ok) throw new Error(`Failed to regenerate: ${response.status}`);
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
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let detail = text;
    try { detail = JSON.parse(text).error || text; } catch { /* keep raw text */ }
    throw new Error(`AI Assist failed: ${response.status}${detail ? ` - ${detail}` : ''}`);
  }
  return response.json();
}

export async function assistNoteEdit(id: string, prompt: string, draft: NoteUpdate): Promise<{ update: NoteUpdate; codexStatus: string }> {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}/assist`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, draft }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let detail = text;
    try { detail = JSON.parse(text).error || text; } catch { /* keep raw text */ }
    throw new Error(`Failed to run AI edit: ${response.status}${detail ? ` - ${detail}` : ''}`);
  }
  return response.json();
}

export async function updateNote(id: string, update: NoteUpdate): Promise<{ note: KnowledgeNote; state: KnowledgeState; markdown: string }> {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!response.ok) throw new Error(`Failed to update note: ${response.status}`);
  return response.json();
}

export async function patchNote(id: string, patch: Partial<NoteUpdate>): Promise<{ note: KnowledgeNote; state: KnowledgeState }> {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Failed to patch note: ${response.status}`);
  return response.json();
}

export async function backfillBilinks(): Promise<{ pairsConverted: number; state: KnowledgeState }> {
  const response = await apiFetch('/api/notes/backfill-bilinks', { method: 'POST' });
  if (!response.ok) throw new Error(`Failed to backfill bilinks: ${response.status}`);
  return response.json();
}

export async function uploadImage(file: File): Promise<{ url: string; filename: string }> {
  const form = new FormData();
  form.append('file', file);
  const response = await apiFetch('/api/images', { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Failed to upload image: ${response.status}`);
  return response.json();
}

export async function submitLearning(payload: CreateNoteRequest): Promise<{ jobId: string; job: LearnJob; note?: KnowledgeNote; state?: KnowledgeState; markdown?: string }> {
  const response = await apiFetch('/api/learn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to create note: ${response.status}`);
  return response.json();
}

export async function fetchJob(jobId: string): Promise<LearnJob> {
  const response = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`);
  if (!response.ok) throw new Error(`Failed to load job: ${response.status}`);
  return response.json();
}

export async function fetchJobs(): Promise<{ jobs: LearnJob[] }> {
  const response = await apiFetch('/api/jobs');
  if (!response.ok) throw new Error(`Failed to load jobs: ${response.status}`);
  return response.json();
}

export async function searchKnowledge(query: string, category: string): Promise<{ engine: string; hits: KnowledgeNote[]; warning?: string }> {
  const params = new URLSearchParams({ q: query, category });
  const response = await apiFetch(`/api/search?${params.toString()}`);
  if (!response.ok) throw new Error(`Failed to search: ${response.status}`);
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
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`RAG stream failed: ${response.status}${text ? ` — ${text}` : ''}`);
  }
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
  if (!response.ok) throw new Error(`Failed to load study queue: ${response.status}`);
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

export async function fetchStudyStats(days = 30): Promise<StudyStats> {
  const response = await apiFetch(`/api/study/stats?days=${days}`);
  if (!response.ok) throw new Error(`Failed to load study stats: ${response.status}`);
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
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let detail = text;
    try { detail = JSON.parse(text).error || text; } catch { /* raw */ }
    throw new Error(detail || `Import failed: ${response.status}`);
  }
  return response.json();
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
  if (!response.ok) throw new Error(`Failed to load learn progress: ${response.status}`);
  return response.json();
}

export async function awardLearnXp(xp: number): Promise<LearnProgressDto> {
  const response = await apiFetch('/api/learn-progress/award', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ xp }),
  });
  if (!response.ok) throw new Error(`Failed to award XP: ${response.status}`);
  return response.json();
}

export async function masterLearnNote(noteId: string): Promise<LearnProgressDto> {
  const response = await apiFetch(`/api/learn-progress/master/${encodeURIComponent(noteId)}`, { method: 'POST' });
  if (!response.ok) throw new Error(`Failed to mark mastered: ${response.status}`);
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
