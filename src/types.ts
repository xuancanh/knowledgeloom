/** A single knowledge note with frontmatter metadata. */
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

export type QuizQuestionType = 'fill-blank' | 'multiple-choice' | 'short-answer';

export type QuizQuestion = {
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
};

export type KnowledgeState = {
  notes: KnowledgeNote[];
  categories: KnowledgeCategory[];
  graph: Array<{ source: string; targets: string[] }>;
  flashcards?: Flashcard[];
  quizQuestions?: QuizQuestion[];
  readNoteIds?: string[];
  readCounts?: Record<string, number>;
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
  isUserCreated?: boolean;
  reviewData?: {
    easeFactor: string;
    interval: number;
    repetitions: number;
    nextReviewAt: string | null;
    lastReviewAt: string | null;
    lastRating: string | null;
  };
};

export type GenSize = 'small' | 'medium' | 'large';

export type CreateMode = 'write' | 'polish' | 'research' | 'link' | 'regen';

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

export type RagScope =
  | { type: 'all' }
  | { type: 'note'; id: string }
  | { type: 'category'; path: string }
  | { type: 'tag'; tag: string };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
};
