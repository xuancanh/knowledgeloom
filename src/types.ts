export type KnowledgeNote = {
  id: string;
  fileName: string;
  path: string;
  title: string;
  category: string;
  summary: string;
  tags: string[];
  links: string[];
  createdAt: string;
  sourceUrl?: string;
  originalRequest?: string;
};

export type KnowledgeCategory = {
  name: string;
  slug: string;
  count: number;
  summaries: string[];
  notes: Array<{ id: string; title: string; summary: string }>;
};

export type KnowledgeState = {
  notes: KnowledgeNote[];
  categories: KnowledgeCategory[];
  graph: Array<{ source: string; targets: string[] }>;
  flashcards?: Flashcard[];
  updatedAt?: string;
};

export type Flashcard = {
  id: string;
  noteId: string;
  noteTitle: string;
  category: string;
  tags: string[];
  prompt: string;
  lesson: string;
  kind: 'concept' | 'question' | 'lesson' | 'tradeoff' | 'pattern';
};

export type CreateMode = 'write' | 'polish' | 'research' | 'link';

export type CreateNoteRequest = {
  mode: CreateMode;
  title: string;
  context?: string;
  body?: string;
  url?: string;
  category?: string;
  summary?: string;
  tags?: string[];
  links?: string[];
  guidance?: string;
};

export type LearnJob = {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  mode?: CreateMode;
  topic: string;
  context?: string;
  body?: string;
  url?: string;
  category?: string;
  summary?: string;
  tags?: string[];
  links?: string[];
  attempts?: number;
  maxAttempts?: number;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  nextRunAt?: string | null;
  codexStatus?: string;
  error?: string | null;
  note?: KnowledgeNote;
  state?: KnowledgeState;
};

export type Reminder = {
  id: string;
  noteId: string;
  remindAt: string;
  message: string;
  createdAt: string;
  completedAt: string | null;
};
