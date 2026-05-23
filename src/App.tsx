import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  assistNoteEdit,
  createReminder,
  deleteNote,
  deleteReminder,
  fetchJobs,
  fetchKnowledge,
  fetchNoteMarkdown,
  fetchReminders,
  fetchStatus,
  submitLearning,
  updateNote,
  updateReminder,
  type NoteUpdate,
} from './api';
import ActivityPage from './components/ActivityPage';
import CategoryIndex from './components/CategoryIndex';
import ContextPanel from './components/ContextPanel';
import FlashcardsPage from './components/FlashcardsPage';
import Home from './components/Home';
import NoteDetail from './components/NoteDetail';
import Rail from './components/Rail';
import SearchOverlay from './components/SearchOverlay';
import SettingsPage from './components/SettingsPage';
import TagIndex from './components/TagIndex';
import {
  makeCategoryTree,
  makeUiCategories,
  type CategoryTreeNode,
  type UiCategory,
} from './lib/view';
import { loadTemplates, type GuidanceTemplate } from './lib/guidance';
import type { CreateNoteRequest, Flashcard, KnowledgeNote, KnowledgeState, LearnJob, Reminder } from './types';

// ── Types ────────────────────────────────────────────────────────────────────

type Theme = 'light' | 'white' | 'dark';
type Toast = { id: string; kind: 'info' | 'success' | 'error'; message: string };

const emptyState: KnowledgeState = { notes: [], categories: [], graph: [], flashcards: [] };
const preferenceKeys = { theme: 'knowledge-loom:theme', compactMode: 'knowledge-loom:compact-mode' };
const themeLabels: Record<Theme, { icon: string; next: Theme; label: string }> = {
  light: { icon: '◐', next: 'white', label: 'White' },
  white: { icon: '☾', next: 'dark', label: 'Dark' },
  dark: { icon: '☀', next: 'light', label: 'Light' },
};

function loadTheme(): Theme {
  const v = window.localStorage.getItem(preferenceKeys.theme);
  return v === 'light' || v === 'white' || v === 'dark' ? v : 'light';
}

// ── Route wrapper components ─────────────────────────────────────────────────
// Defined at module level so React doesn't remount them on re-renders.

type SharedHandlers = {
  onOpen: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onOpenCategory: (id: string) => void;
  onOpenFlashcards: (scope: 'all' | 'category' | 'tag', value?: string) => void;
};

function NoteRoute({
  notes, categories, readOnly, reminders,
  onOpenCategory, onOpenTag,
  onSave, onAssist, onDelete,
  onCreateReminder, onCompleteReminder, onDeleteReminder,
}: {
  notes: KnowledgeNote[];
  categories: UiCategory[];
  readOnly: boolean;
  reminders: Reminder[];
  onOpenCategory: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onSave: (id: string, update: NoteUpdate) => Promise<void>;
  onAssist: (id: string, prompt: string, draft: NoteUpdate) => Promise<NoteUpdate>;
  onDelete: (note: KnowledgeNote) => Promise<void>;
  onCreateReminder: (noteId: string, remindAt: string, message: string) => Promise<void>;
  onCompleteReminder: (id: string) => Promise<void>;
  onDeleteReminder: (id: string) => Promise<void>;
}) {
  const { id } = useParams<{ id: string }>();
  const [markdown, setMarkdown] = useState('');
  const note = notes.find((n) => n.id === id) ?? null;

  useEffect(() => {
    if (!note) return;
    fetchNoteMarkdown(note.id).then(setMarkdown).catch(() => setMarkdown(''));
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!note) return null;
  return (
    <NoteDetail
      note={note}
      notes={notes}
      categories={categories}
      markdown={markdown}
      readOnly={readOnly}
      reminders={reminders.filter((r) => r.noteId === note.id)}
      onOpenCategory={onOpenCategory}
      onOpenTag={onOpenTag}
      onSave={onSave}
      onAssist={onAssist}
      onDelete={() => onDelete(note)}
      onCreateReminder={onCreateReminder}
      onCompleteReminder={onCompleteReminder}
      onDeleteReminder={onDeleteReminder}
    />
  );
}

function CategoryRoute({
  notes, categories, categoryById, flashcards,
  onOpen, onOpenTag, onOpenCategory, onOpenFlashcards,
}: {
  notes: KnowledgeNote[];
  categories: UiCategory[];
  categoryById: Map<string, CategoryTreeNode>;
  flashcards: Flashcard[];
} & SharedHandlers) {
  const params = useParams<{ '*': string }>();
  const id = params['*'] ?? '';
  const node = categoryById.get(id) ?? null;
  if (!node) return null;

  const category = {
    ...(node.category ?? {
      slug: node.id, summaries: [], notes: [],
      summary: `Folder containing ${node.count} notes across nested categories.`,
    }),
    id: node.id,
    name: node.id,
    count: node.count,
    color: node.color,
    summary: node.category?.summary ?? `Folder containing ${node.count} notes across nested categories.`,
  };

  return (
    <CategoryIndex
      category={category}
      notes={notes}
      categories={categories}
      flashcards={flashcards}
      onOpen={onOpen}
      onOpenTag={onOpenTag}
      onOpenCategory={onOpenCategory}
      onOpenFlashcards={(cat) => onOpenFlashcards('category', cat)}
    />
  );
}

function TagRoute({
  notes, categories, flashcards,
  onOpen, onOpenTag, onOpenCategory, onOpenFlashcards,
}: {
  notes: KnowledgeNote[];
  categories: UiCategory[];
  flashcards: Flashcard[];
} & SharedHandlers) {
  const { tag } = useParams<{ tag: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') || '1');

  function handlePage(p: number) {
    if (p <= 1) setSearchParams({});
    else setSearchParams({ page: String(p) });
  }

  if (!tag) return null;
  return (
    <TagIndex
      tag={decodeURIComponent(tag)}
      notes={notes}
      categories={categories}
      flashcards={flashcards}
      page={page}
      onOpen={onOpen}
      onOpenTag={onOpenTag}
      onOpenCategory={onOpenCategory}
      onOpenFlashcards={(t) => onOpenFlashcards('tag', t)}
      onPage={handlePage}
    />
  );
}

function FlashcardsRoute({
  flashcards, notes, categories, tagCounts, onScopeChange, onOpenNote,
}: {
  flashcards: Flashcard[];
  notes: KnowledgeNote[];
  categories: UiCategory[];
  tagCounts: [string, number][];
  onScopeChange: (scope: 'all' | 'category' | 'tag', value?: string) => void;
  onOpenNote: (id: string) => void;
}) {
  const [searchParams] = useSearchParams();
  const category = searchParams.get('category') || '';
  const tag = searchParams.get('tag') || '';
  const scope: 'all' | 'category' | 'tag' = category ? 'category' : tag ? 'tag' : 'all';

  return (
    <FlashcardsPage
      flashcards={flashcards}
      notes={notes}
      categories={categories}
      tagCounts={tagCounts}
      scope={scope}
      value={category || tag || ''}
      onScopeChange={onScopeChange}
      onOpenNote={onOpenNote}
    />
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [state, setState] = useState<KnowledgeState>(emptyState);
  const [jobs, setJobs] = useState<LearnJob[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [compactMode, setCompactMode] = useState(
    () => window.localStorage.getItem(preferenceKeys.compactMode) === 'true',
  );
  const [readOnly, setReadOnly] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [railOpen, setRailOpen] = useState(false);
  const [templates, setTemplates] = useState<GuidanceTemplate[]>(loadTemplates);
  const [catSearch, setCatSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const hasLoadedJobs = useRef(false);

  // ── Toasts ──────────────────────────────────────────────────────────────

  const pushToast = useCallback((kind: Toast['kind'], message: string) => {
    const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, kind, message }].slice(-4));
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const [knowledge, jobState, status, reminderState] = await Promise.all([
      fetchKnowledge(), fetchJobs(), fetchStatus(), fetchReminders({ status: 'active' }),
    ]);
    setState(knowledge);
    setJobs((prev) => {
      if (hasLoadedJobs.current) {
        const byId = new Map(prev.map((j) => [j.id, j]));
        for (const job of jobState.jobs) {
          const was = byId.get(job.id);
          if (was && was.status !== 'done' && job.status === 'done')
            pushToast('success', `Research done: ${job.topic}`);
        }
      }
      hasLoadedJobs.current = true;
      return jobState.jobs;
    });
    setReadOnly(status.readOnly);
    setReminders(reminderState.reminders);
  }, [pushToast]);

  useEffect(() => {
    window.setTimeout(() => loadAll().catch(console.error), 0);
    const timer = window.setInterval(() => loadAll().catch(console.error), 2500);
    return () => window.clearInterval(timer);
  }, [loadAll]);

  // ── Preferences ──────────────────────────────────────────────────────────

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(preferenceKeys.theme, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(preferenceKeys.compactMode, String(compactMode));
  }, [compactMode]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRailOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      const inField = tag === 'TEXTAREA' || tag === 'INPUT';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape') setSearchOpen(false);
      if (inField) return;
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        const rows = Array.from(document.querySelectorAll('.note-row'));
        if (!rows.length) return;
        const cur = rows.findIndex((r) => r.classList.contains('focused'));
        const next = cur < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, cur + (e.key === 'j' ? 1 : -1)));
        rows.forEach((r) => r.classList.remove('focused'));
        rows[next].classList.add('focused');
        rows[next].scrollIntoView({ block: 'nearest' });
      }
      if (e.key === 'Enter') document.querySelector<HTMLElement>('.note-row.focused')?.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────

  const categories = useMemo(() => makeUiCategories(state.categories), [state.categories]);
  const categoryTree = useMemo(() => makeCategoryTree(categories), [categories]);
  const categoryById = useMemo(() => {
    const map = new Map<string, CategoryTreeNode>();
    const visit = (node: CategoryTreeNode) => { map.set(node.id, node); node.children.forEach(visit); };
    categoryTree.forEach(visit);
    return map;
  }, [categoryTree]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of state.notes)
      for (const tag of note.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [state.notes]);

  // Derive current note from URL for the context panel (outside Routes)
  const noteIdMatch = location.pathname.match(/^\/notes\/(.+)$/);
  const currentNoteId = noteIdMatch ? decodeURIComponent(noteIdMatch[1]) : null;
  const currentNote = currentNoteId ? state.notes.find((n) => n.id === currentNoteId) ?? null : null;
  const showContextPanel = !!currentNote;

  // ── Navigation ───────────────────────────────────────────────────────────

  const openNote = useCallback((id: string) => navigate(`/notes/${encodeURIComponent(id)}`), [navigate]);
  const openCategory = useCallback(
    (id: string) => navigate(`/categories/${id.split('/').map(encodeURIComponent).join('/')}`),
    [navigate],
  );
  const openTag = useCallback((tag: string) => navigate(`/tags/${encodeURIComponent(tag)}`), [navigate]);
  const goHome = useCallback(() => navigate('/'), [navigate]);
  const openActivity = useCallback(() => navigate('/activity'), [navigate]);
  const openSettings = useCallback(() => navigate('/settings'), [navigate]);

  const openFlashcards = useCallback(
    (scope: 'all' | 'category' | 'tag' = 'all', value?: string) => {
      if (scope === 'category' && value) navigate(`/flashcards?category=${encodeURIComponent(value)}`);
      else if (scope === 'tag' && value) navigate(`/flashcards?tag=${encodeURIComponent(value)}`);
      else navigate('/flashcards');
    },
    [navigate],
  );

  // ── Note handlers ────────────────────────────────────────────────────────

  async function handleDelete(note: KnowledgeNote) {
    if (!window.confirm(`Delete "${note.title}"? This removes the markdown source file.`)) return;
    const result = await deleteNote(note.id);
    setState(result.state);
    navigate('/', { replace: true });
  }

  async function handleSaveNote(id: string, update: NoteUpdate) {
    const result = await updateNote(id, update);
    setState(result.state);
  }

  async function handleAssistNote(id: string, prompt: string, draft: NoteUpdate) {
    return (await assistNoteEdit(id, prompt, draft)).update;
  }

  async function submitCapture(payload: CreateNoteRequest) {
    try {
      const result = await submitLearning(payload);
      setJobs((prev) => [result.job, ...prev.filter((j) => j.id !== result.job.id)]);
      if (result.state) {
        pushToast('success', `Saved note: ${result.note?.title || payload.title}`);
        setState(result.state);
        if (result.note?.id) navigate(`/notes/${encodeURIComponent(result.note.id)}`);
        return;
      }
      const label = payload.mode === 'link' ? 'Link queued' : payload.mode === 'polish' ? 'Draft queued for polishing' : 'Research queued';
      pushToast('info', `${label}: ${payload.title}`);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Failed to submit request');
    }
  }

  // ── Reminder handlers ────────────────────────────────────────────────────

  async function handleCreateReminder(noteId: string, remindAt: string, message: string) {
    await createReminder({ noteId, remindAt, message });
    setReminders((await fetchReminders({ status: 'active' })).reminders);
  }

  async function handleCompleteReminder(id: string) {
    await updateReminder(id, { completed: true });
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleDeleteReminder(id: string) {
    await deleteReminder(id);
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  const inFlightCount = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={`app${showContextPanel ? '' : ' no-right'}${compactMode ? ' dense' : ''}`}>

      <Rail
        categories={categories}
        categoryTree={categoryTree}
        flashcardCount={state.flashcards?.length || 0}
        inFlightCount={inFlightCount}
        tagCounts={tagCounts}
        catSearch={catSearch}
        tagSearch={tagSearch}
        railOpen={railOpen}
        onCatSearchChange={setCatSearch}
        onTagSearchChange={setTagSearch}
        onHome={goHome}
        onSearch={() => setSearchOpen(true)}
        onActivity={openActivity}
        onFlashcards={openFlashcards}
        onSettings={openSettings}
        openCategory={openCategory}
        openTag={openTag}
        closeRail={() => setRailOpen(false)}
      />

      {railOpen && <div className="rail-backdrop" onClick={() => setRailOpen(false)} />}

      <main>
        <div className="utility">
          <button className="rail-toggle" onClick={() => setRailOpen(true)} aria-label="Open menu">
            <span>☰</span>
          </button>
          <button className="search-trigger" onClick={() => setSearchOpen(true)}>
            <span className="glyph">⌕</span>
            <span className="search-hint">Search notes, tags, categories…</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="util-actions">
            <button onClick={() => setTheme((v) => themeLabels[v].next)} title={themeLabels[theme].label}>
              <span className="glyph">{themeLabels[theme].icon}</span>
              <span className="util-label">{themeLabels[theme].label}</span>
            </button>
            <button onClick={() => setCompactMode((v) => !v)} title={compactMode ? 'Comfort' : 'Compact'}>
              <span className="glyph">{compactMode ? '□' : '▤'}</span>
              <span className="util-label">{compactMode ? 'Comfort' : 'Compact'}</span>
            </button>
            <button onClick={goHome} title="Desk">
              <span className="glyph">✦</span>
              <span className="util-label">Desk</span>
            </button>
          </div>
        </div>

        <div className="main">
          <Routes>
            <Route path="/" element={
              <Home
                notes={state.notes}
                categories={categories}
                reminders={reminders}
                onOpen={openNote}
                onOpenTag={openTag}
                onCompleteReminder={handleCompleteReminder}
                onSubmit={submitCapture}
                readOnly={readOnly}
                templates={templates}
              />
            } />
            <Route path="/activity" element={
              <ActivityPage jobs={jobs} onOpenNote={openNote} />
            } />
            <Route path="/flashcards" element={
              <FlashcardsRoute
                flashcards={state.flashcards || []}
                notes={state.notes}
                categories={categories}
                tagCounts={tagCounts}
                onScopeChange={openFlashcards}
                onOpenNote={openNote}
              />
            } />
            <Route path="/notes/:id" element={
              <NoteRoute
                notes={state.notes}
                categories={categories}
                readOnly={readOnly}
                reminders={reminders}
                onOpenCategory={openCategory}
                onOpenTag={openTag}
                onSave={handleSaveNote}
                onAssist={handleAssistNote}
                onDelete={handleDelete}
                onCreateReminder={handleCreateReminder}
                onCompleteReminder={handleCompleteReminder}
                onDeleteReminder={handleDeleteReminder}
              />
            } />
            <Route path="/categories/*" element={
              <CategoryRoute
                notes={state.notes}
                categories={categories}
                categoryById={categoryById}
                flashcards={state.flashcards || []}
                onOpen={openNote}
                onOpenTag={openTag}
                onOpenCategory={openCategory}
                onOpenFlashcards={openFlashcards}
              />
            } />
            <Route path="/tags/:tag" element={
              <TagRoute
                notes={state.notes}
                categories={categories}
                flashcards={state.flashcards || []}
                onOpen={openNote}
                onOpenTag={openTag}
                onOpenCategory={openCategory}
                onOpenFlashcards={openFlashcards}
              />
            } />
            <Route path="/settings" element={
              <SettingsPage templates={templates} onTemplatesChange={setTemplates} />
            } />
          </Routes>
        </div>
      </main>

      {showContextPanel && currentNote && (
        <ContextPanel note={currentNote} notes={state.notes} onOpen={openNote} />
      )}

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        notes={state.notes}
        categories={categories}
        onOpen={openNote}
      />

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>{toast.message}</div>
        ))}
      </div>
    </div>
  );
}
