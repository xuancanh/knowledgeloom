import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  assistNoteEdit,
  createReminder,
  deleteReminder,
  deleteNote,
  fetchJobs,
  fetchKnowledge,
  fetchNoteMarkdown,
  fetchReminders,
  fetchStatus,
  submitLearning,
  updateReminder,
  updateNote,
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
import TagIndex from './components/TagIndex';
import { pathFromView, sameView, viewFromPath } from './lib/routing';
import {
  makeCategoryTree,
  makeUiCategories,
  type CategoryTreeNode,
  type View,
} from './lib/view';
import type { CreateNoteRequest, KnowledgeState, LearnJob, Reminder } from './types';

const emptyState: KnowledgeState = { notes: [], categories: [], graph: [], flashcards: [] };
type Theme = 'light' | 'white' | 'dark';
type Toast = { id: string; kind: 'info' | 'success' | 'error'; message: string };

const themeLabels: Record<Theme, { icon: string; next: Theme; label: string }> = {
  light: { icon: '◐', next: 'white', label: 'White' },
  white: { icon: '☾', next: 'dark', label: 'Dark' },
  dark: { icon: '☀', next: 'light', label: 'Light' },
};
const preferenceKeys = { theme: 'knowledge-loom:theme', compactMode: 'knowledge-loom:compact-mode' };

function loadTheme(): Theme {
  const v = window.localStorage.getItem(preferenceKeys.theme);
  return v === 'light' || v === 'white' || v === 'dark' ? v : 'light';
}

export default function App() {
  const [state, setState] = useState<KnowledgeState>(emptyState);
  const [jobs, setJobs] = useState<LearnJob[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname));
  const [searchOpen, setSearchOpen] = useState(false);
  const [markdown, setMarkdown] = useState('');
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [compactMode, setCompactMode] = useState(
    () => window.localStorage.getItem(preferenceKeys.compactMode) === 'true',
  );
  const [readOnly, setReadOnly] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [railOpen, setRailOpen] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const hasLoadedJobs = useRef(false);

  const pushToast = useCallback((kind: Toast['kind'], message: string) => {
    const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, kind, message }].slice(-4));
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(preferenceKeys.theme, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(preferenceKeys.compactMode, String(compactMode));
  }, [compactMode]);

  useEffect(() => {
    window.history.replaceState({ view }, '', pathFromView(view));
    const onPop = () => setView(viewFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [view]);

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

  const currentNote = view.kind === 'note' ? state.notes.find((n) => n.id === view.id) ?? null : null;
  const currentCategoryNode = view.kind === 'category' ? categoryById.get(view.id) ?? null : null;
  const currentCategory = currentCategoryNode ? {
    ...(currentCategoryNode.category || {
      slug: currentCategoryNode.id,
      summaries: [],
      notes: [],
      summary: `Folder containing ${currentCategoryNode.count} notes across nested categories.`,
    }),
    id: currentCategoryNode.id,
    name: currentCategoryNode.id,
    count: currentCategoryNode.count,
    color: currentCategoryNode.color,
    summary: currentCategoryNode.category?.summary ?? `Folder containing ${currentCategoryNode.count} notes across nested categories.`,
  } : null;

  useEffect(() => {
    if (!currentNote) return;
    fetchNoteMarkdown(currentNote.id).then(setMarkdown).catch(() => setMarkdown(''));
  }, [currentNote]);

  const navigate = useCallback((nextView: View, opts: { replace?: boolean } = {}) => {
    setView((cur) => {
      const nextPath = pathFromView(nextView);
      if (!sameView(cur, nextView)) {
        if (opts.replace) window.history.replaceState({ view: nextView }, '', nextPath);
        else window.history.pushState({ view: nextView }, '', nextPath);
      } else if (window.location.pathname !== nextPath) {
        window.history.replaceState({ view: nextView }, '', nextPath);
      }
      return nextView;
    });
  }, []);

  const openNote = useCallback((id: string) => navigate({ kind: 'note', id }), [navigate]);
  const openCategory = useCallback((id: string) => navigate({ kind: 'category', id }), [navigate]);
  const openTag = useCallback((tag: string) => navigate({ kind: 'tag', tag, page: 1 }), [navigate]);
  const openTagPage = useCallback((tag: string, page: number) => navigate({ kind: 'tag', tag, page }), [navigate]);
  const goHome = useCallback(() => navigate({ kind: 'home' }), [navigate]);
  const openActivity = useCallback(() => navigate({ kind: 'activity' }), [navigate]);
  const openFlashcards = useCallback(
    (scope: 'all' | 'category' | 'tag' = 'all', value?: string) => navigate({ kind: 'flashcards', scope, value }),
    [navigate],
  );

  async function submitCapture(payload: CreateNoteRequest) {
    try {
      const result = await submitLearning(payload);
      setJobs((prev) => [result.job, ...prev.filter((j) => j.id !== result.job.id)]);
      if (result.state) {
        pushToast('success', `Saved note: ${result.note?.title || payload.title}`);
        setState(result.state);
        if (result.note?.id) navigate({ kind: 'note', id: result.note.id });
        return;
      }
      const label = payload.mode === 'link' ? 'Link queued for research' : payload.mode === 'polish' ? 'Draft queued for polishing' : 'Research queued';
      pushToast('info', `${label}: ${payload.title}`);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Failed to submit request');
    }
  }

  async function handleDelete() {
    if (!currentNote) return;
    if (!window.confirm(`Delete "${currentNote.title}"? This removes the markdown source file.`)) return;
    const result = await deleteNote(currentNote.id);
    setState(result.state);
    navigate({ kind: 'home' }, { replace: true });
  }

  async function handleSaveNote(id: string, update: NoteUpdate) {
    const result = await updateNote(id, update);
    setState(result.state);
    setMarkdown(result.markdown);
  }

  async function handleAssistNote(id: string, prompt: string, draft: NoteUpdate) {
    return (await assistNoteEdit(id, prompt, draft)).update;
  }

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
  const showContextPanel = view.kind === 'note' && !!currentNote;

  return (
    <div className={`app${showContextPanel ? '' : ' no-right'}${compactMode ? ' dense' : ''}`}>

      <Rail
        view={view}
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
            <button className="theme-toggle" onClick={() => setTheme((v) => themeLabels[v].next)} title={themeLabels[theme].label}>
              <span className="glyph">{themeLabels[theme].icon}</span>
              <span className="util-label">{themeLabels[theme].label}</span>
            </button>
            <button className="density-toggle" onClick={() => setCompactMode((v) => !v)} title={compactMode ? 'Comfort' : 'Compact'}>
              <span className="glyph">{compactMode ? '□' : '▤'}</span>
              <span className="util-label">{compactMode ? 'Comfort' : 'Compact'}</span>
            </button>
            <button className="desk-btn" onClick={goHome} title="Desk">
              <span className="glyph">✦</span>
              <span className="util-label">Desk</span>
            </button>
          </div>
        </div>

        <div className="main">
          {view.kind === 'home' && (
            <Home
              notes={state.notes}
              categories={categories}
              reminders={reminders}
              onOpen={openNote}
              onOpenTag={openTag}
              onCompleteReminder={handleCompleteReminder}
              onSubmit={submitCapture}
              readOnly={readOnly}
            />
          )}
          {view.kind === 'activity' && (
            <ActivityPage jobs={jobs} onOpenNote={openNote} />
          )}
          {view.kind === 'flashcards' && (
            <FlashcardsPage
              flashcards={state.flashcards || []}
              notes={state.notes}
              categories={categories}
              tagCounts={tagCounts}
              scope={view.scope || 'all'}
              value={view.value || ''}
              onScopeChange={openFlashcards}
              onOpenNote={openNote}
            />
          )}
          {view.kind === 'note' && currentNote && (
            <NoteDetail
              note={currentNote}
              notes={state.notes}
              categories={categories}
              markdown={markdown}
              onOpenCategory={openCategory}
              onOpenTag={openTag}
              onDelete={handleDelete}
              onAssist={handleAssistNote}
              onCreateReminder={handleCreateReminder}
              onCompleteReminder={handleCompleteReminder}
              onDeleteReminder={handleDeleteReminder}
              onSave={handleSaveNote}
              reminders={reminders.filter((r) => r.noteId === currentNote.id)}
              readOnly={readOnly}
            />
          )}
          {view.kind === 'category' && currentCategory && (
            <CategoryIndex
              category={currentCategory}
              notes={state.notes}
              categories={categories}
              flashcards={state.flashcards || []}
              onOpen={openNote}
              onOpenTag={openTag}
              onOpenCategory={openCategory}
              onOpenFlashcards={(cat) => openFlashcards('category', cat)}
            />
          )}
          {view.kind === 'tag' && (
            <TagIndex
              tag={view.tag}
              notes={state.notes}
              categories={categories}
              flashcards={state.flashcards || []}
              page={view.page || 1}
              onOpen={openNote}
              onOpenTag={openTag}
              onOpenCategory={openCategory}
              onOpenFlashcards={(tag) => openFlashcards('tag', tag)}
              onPage={(page) => openTagPage(view.tag, page)}
            />
          )}
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
