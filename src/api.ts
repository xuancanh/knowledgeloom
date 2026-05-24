import type { CreateNoteRequest, KnowledgeNote, KnowledgeState, LearnJob, Reminder } from './types';

/**
 * Loads service capability flags such as read-only deployment mode.
 */
export async function fetchStatus(): Promise<{ readOnly: boolean }> {
  const response = await fetch('/api/status');
  if (!response.ok) throw new Error(`Failed to load service status: ${response.status}`);
  return response.json();
}

/**
 * Loads the full derived knowledge manifest from the backend.
 * Calling this route also causes the backend to rebuild indexes from markdown.
 */
export async function fetchKnowledge(): Promise<KnowledgeState> {
  const response = await fetch('/api/knowledge');
  if (!response.ok) throw new Error(`Failed to load knowledge: ${response.status}`);
  return response.json();
}

/**
 * Loads the raw markdown source for one note so the reader/editor can render
 * the body and expose the source drawer.
 */
export async function fetchNoteMarkdown(id: string): Promise<string> {
  const response = await fetch(`/api/notes/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`Failed to load note: ${response.status}`);
  const data = await response.json();
  return data.markdown;
}

/**
 * Deletes a note markdown file by id and returns the rebuilt knowledge state.
 */
export async function deleteNote(id: string): Promise<{ deleted: string; state: KnowledgeState }> {
  const response = await fetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Failed to delete note: ${response.status}`);
  return response.json();
}

/**
 * Loads reminders, optionally filtered by note or status.
 */
export async function fetchReminders(filters: { noteId?: string; status?: 'active' | 'done' | 'due' } = {}): Promise<{ reminders: Reminder[] }> {
  const params = new URLSearchParams();
  if (filters.noteId) params.set('noteId', filters.noteId);
  if (filters.status) params.set('status', filters.status);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/reminders${suffix}`);
  if (!response.ok) throw new Error(`Failed to load reminders: ${response.status}`);
  return response.json();
}

/**
 * Schedules a future reminder for one note.
 */
export async function createReminder(payload: { noteId: string; remindAt: string; message?: string }): Promise<{ reminder: Reminder }> {
  const response = await fetch('/api/reminders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to create reminder: ${response.status}`);
  return response.json();
}

/**
 * Updates reminder state, primarily marking it completed or active again.
 */
export async function updateReminder(id: string, update: { completed?: boolean; remindAt?: string; message?: string }): Promise<{ reminder: Reminder }> {
  const response = await fetch(`/api/reminders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!response.ok) throw new Error(`Failed to update reminder: ${response.status}`);
  return response.json();
}

/**
 * Deletes a reminder permanently.
 */
export async function deleteReminder(id: string): Promise<{ deleted: string }> {
  const response = await fetch(`/api/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Failed to delete reminder: ${response.status}`);
  return response.json();
}

/**
 * Creates a user-owned flashcard linked to a note.
 */
export async function createFlashcard(payload: {
  noteId: string; prompt: string; lesson: string; kind: string;
}): Promise<{ flashcard: any }> {
  const response = await fetch('/api/flashcards', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to create flashcard: ${response.status}`);
  return response.json();
}

/**
 * Updates a user-owned flashcard.
 */
export async function updateFlashcard(id: string, payload: { prompt: string; lesson: string; kind: string }): Promise<{ updated: string }> {
  const response = await fetch(`/api/flashcards/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to update flashcard: ${response.status}`);
  return response.json();
}

/**
 * Removes (hides) a flashcard, either AI-generated or user-created.
 */
export async function deleteFlashcard(id: string): Promise<void> {
  const response = await fetch(`/api/flashcards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Failed to delete flashcard: ${response.status}`);
}

/**
 * Submits a review rating for a flashcard (spaced repetition).
 */
export async function reviewFlashcard(id: string, payload: { rating: 'again' | 'hard' | 'good'; noteId: string; isUserCard?: boolean }): Promise<{ review: any }> {
  const response = await fetch(`/api/flashcards/${encodeURIComponent(id)}/review`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to submit review: ${response.status}`);
  return response.json();
}

export type NoteUpdate = {
  title: string;
  category: string;
  summary: string;
  tags: string[];
  links: string[];
  body: string;
};

/**
 * Sends the current unsaved editor draft plus a user instruction to Codex.
 * The response is an edit proposal only; callers should apply it to local form
 * state and let the user save through `updateNote` after review.
 */
export async function assistNoteEdit(id: string, prompt: string, draft: NoteUpdate): Promise<{ update: NoteUpdate; codexStatus: string }> {
  const response = await fetch(`/api/notes/${encodeURIComponent(id)}/assist`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, draft }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let detail = text;
    try {
      detail = JSON.parse(text).error || text;
    } catch {
      // Keep the raw text body when the server returns a non-JSON error page.
    }
    throw new Error(`Failed to run AI edit: ${response.status}${detail ? ` - ${detail}` : ''}`);
  }
  return response.json();
}

/**
 * Rewrites a note's frontmatter and markdown body, then returns the rebuilt
 * knowledge state plus the new markdown source.
 */
export async function updateNote(id: string, update: NoteUpdate): Promise<{ note: KnowledgeNote; state: KnowledgeState; markdown: string }> {
  const response = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!response.ok) throw new Error(`Failed to update note: ${response.status}`);
  return response.json();
}

/**
 * Uploads an image file and returns its served URL.
 */
export async function uploadImage(file: File): Promise<{ url: string; filename: string }> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch('/api/images', { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Failed to upload image: ${response.status}`);
  return response.json();
}

/**
 * Creates or enqueues a new knowledge note.
 *
 * The backend branches by `mode`: direct writes return a completed job plus a
 * rebuilt state immediately, while polish/research requests enter the durable
 * Codex queue and are reflected in the activity rail.
 */
export async function submitLearning(payload: CreateNoteRequest): Promise<{ jobId: string; job: LearnJob; note?: KnowledgeNote; state?: KnowledgeState; markdown?: string }> {
  const response = await fetch('/api/learn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to create note: ${response.status}`);
  return response.json();
}

/**
 * Fetches a single durable Codex job by id.
 */
export async function fetchJob(jobId: string): Promise<LearnJob> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
  if (!response.ok) throw new Error(`Failed to load job: ${response.status}`);
  return response.json();
}

/**
 * Fetches the full durable job list for the activity rail and in-flight view.
 */
export async function fetchJobs(): Promise<{ jobs: LearnJob[] }> {
  const response = await fetch('/api/jobs');
  if (!response.ok) throw new Error(`Failed to load jobs: ${response.status}`);
  return response.json();
}

/**
 * Searches through the backend search endpoint. The backend prefers
 * Meilisearch and falls back to local filtering when Meili is unavailable.
 */
export async function searchKnowledge(query: string, category: string): Promise<{ engine: string; hits: KnowledgeNote[]; warning?: string }> {
  const params = new URLSearchParams({ q: query, category });
  const response = await fetch(`/api/search?${params.toString()}`);
  if (!response.ok) throw new Error(`Failed to search: ${response.status}`);
  return response.json();
}
