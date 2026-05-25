/**
 * types.ts — shared domain types for the Knowledge Loom backend.
 *
 * These interfaces define the data shapes that flow between controllers,
 * services, and repositories. They mirror (and extend) the types in
 * `src/types.ts` used by the React frontend.
 *
 * Rule: keep types minimal and literal. Do not add class decorators or
 * runtime metadata here — this file is for pure TypeScript interfaces only.
 */
export interface KnowledgeNote {
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
}

export interface NoteSource {
  file: string;
  markdown: string;
  note: KnowledgeNote;
}

export interface CategoryEntry {
  name: string;
  slug: string;
  count: number;
  summaries: string[];
  notes: { id: string; title: string; summary: string }[];
}

export interface GraphEdge {
  source: string;
  targets: string[];
}

export interface Flashcard {
  id: string;
  noteId: string;
  noteTitle: string;
  category: string;
  tags: string[];
  prompt: string;
  lesson: string;
  kind: 'concept' | 'question' | 'lesson' | 'tradeoff' | 'pattern';
  isUserCreated?: boolean;
  reviewData?: {
    easeFactor: string;
    interval: number;
    repetitions: number;
    nextReviewAt: string | null;
    lastReviewAt: string | null;
    lastRating: string | null;
  };
}

export type QuizQuestionType = 'fill-blank' | 'multiple-choice' | 'short-answer';

export interface QuizQuestion {
  id: string;
  noteId: string;
  noteTitle: string;
  category: string;
  tags: string[];
  type: QuizQuestionType;
  question: string;
  answer: string;
  choices?: string[];
  correctIndex?: number;
  explanation?: string;
  reviewData?: {
    nextReviewAt: string | null;
    lastReviewAt: string | null;
    lastRating: 'correct' | 'wrong' | null;
    streak: number;
  };
}

export interface KnowledgeState {
  notes: KnowledgeNote[];
  categories: CategoryEntry[];
  graph: GraphEdge[];
  flashcards: Flashcard[];
  quizQuestions: QuizQuestion[];
  updatedAt: string;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'error';
export type JobMode = 'research' | 'link' | 'polish' | 'write' | 'regen';
export type GenSize = 'small' | 'medium' | 'large';

export interface Job {
  id: string;
  userId?: string;
  status: JobStatus;
  mode: JobMode;
  topic: string;
  context?: string;
  body?: string;
  url?: string;
  category?: string;
  summary?: string;
  tags?: string[];
  links?: string[];
  guidance?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  nextRunAt: string | null;
  error: string | null;
  // regen-mode fields
  noteId?: string;
  regenTarget?: 'flashcards' | 'quiz' | 'all';
  regenSize?: GenSize;
}

export interface Reminder {
  id: string;
  noteId: string;
  remindAt: string;
  message: string;
  createdAt: string;
  completedAt: string | null;
}
