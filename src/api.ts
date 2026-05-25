import type { CreateNoteRequest, KnowledgeNote, KnowledgeState, LearnJob, Reminder, RagScope, ChatMessage } from './types';
import { supabase } from './lib/supabase';

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
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

export async function regenerateNote(id: string, target: 'flashcards' | 'quiz' | 'all'): Promise<void> {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  });
  if (!response.ok) throw new Error(`Failed to regenerate: ${response.status}`);
}

export type NoteUpdate = {
  title: string;
  category: string;
  summary: string;
  tags: string[];
  links: string[];
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
): AsyncGenerator<string> {
  const auth = await authHeaders();
  const response = await fetch('/api/rag/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ question, scope, history }),
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
