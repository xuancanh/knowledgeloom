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
import FlashcardsPage from './components/FlashcardsPage';
import Home from './components/Home';
import MiniGraph from './components/MiniGraph';
import NoteDetail from './components/NoteDetail';
import SearchOverlay from './components/SearchOverlay';
import TagIndex from './components/TagIndex';
import type { CreateNoteRequest, KnowledgeState, LearnJob, Reminder } from './types';
import {
  categoryLabel,
  formatCreated,
  makeCategoryTree,
  makeUiCategories,
  type CategoryTreeNode,
  type View,
} from './lib/view';

const emptyState: KnowledgeState = { notes: [], categories: [], graph: [], flashcards: [] };
type Theme = 'light' | 'white' | 'dark';
type Toast = { id: string; kind: 'info' | 'success' | 'error'; message: string };

const themeLabels: Record<Theme, { icon: string; next: Theme; label: string }> = {
  light: { icon: '◐', next: 'white', label: 'White' },
  white: { icon: '☾', next: 'dark', label: 'Dark' },
  dark: { icon: '☀', next: 'light', label: 'Light' },
};
const preferenceKeys = {
  theme: 'knowledge-loom:theme',
  compactMode: 'knowledge-loom:compact-mode',
};

function loadThemePreference(): Theme {
  const value = window.localStorage.getItem(preferenceKeys.theme);
  return value === 'light' || value === 'white' || value === 'dark' ? value : 'light';
}

function loadCompactPreference() {
  return window.localStorage.getItem(preferenceKeys.compactMode) === 'true';
}

function viewFromPath(pathname: string): View {
  const parts = pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts[0] === 'activity') return { kind: 'activity' };
  if (parts[0] === 'flashcards') {
    const params = new URLSearchParams(window.location.search);
    const category = params.get('category') || '';
    const tag = params.get('tag') || '';
    if (category) return { kind: 'flashcards', scope: 'category', value: category };
    if (tag) return { kind: 'flashcards', scope: 'tag', value: tag };
    return { kind: 'flashcards', scope: 'all' };
  }
  if (parts[0] === 'notes' && parts[1]) return { kind: 'note', id: parts[1] };
  if (parts[0] === 'categories' && parts[1]) return { kind: 'category', id: parts.slice(1).join('/') };
  if (parts[0] === 'tags' && parts[1]) {
    const page = Number(new URLSearchParams(window.location.search).get('page') || '1');
    return { kind: 'tag', tag: parts[1], page: Number.isFinite(page) && page > 0 ? page : 1 };
  }
  return { kind: 'home' };
}

function pathFromView(nextView: View) {
  if (nextView.kind === 'activity') return '/activity';
  if (nextView.kind === 'flashcards') {
    const base = '/flashcards';
    if (nextView.scope === 'category' && nextView.value) return `${base}?category=${encodeURIComponent(nextView.value)}`;
    if (nextView.scope === 'tag' && nextView.value) return `${base}?tag=${encodeURIComponent(nextView.value)}`;
    return base;
  }
  if (nextView.kind === 'note') return `/notes/${encodeURIComponent(nextView.id)}`;
  if (nextView.kind === 'category') return `/categories/${nextView.id.split('/').map(encodeURIComponent).join('/')}`;
  if (nextView.kind === 'tag') {
    const base = `/tags/${encodeURIComponent(nextView.tag)}`;
    return nextView.page && nextView.page > 1 ? `${base}?page=${nextView.page}` : base;
  }
  return '/';
}

function sameView(left: View, right: View) {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'home') return true;
  if (left.kind === 'activity') return true;
  if (left.kind === 'flashcards' && right.kind === 'flashcards') return (left.scope || 'all') === (right.scope || 'all') && (left.value || '') === (right.value || '');
  if (left.kind === 'note' && right.kind === 'note') return left.id === right.id;
  if (left.kind === 'category' && right.kind === 'category') return left.id === right.id;
  if (left.kind === 'tag' && right.kind === 'tag') return left.tag === right.tag && (left.page || 1) === (right.page || 1);
  return false;
}

const TAG_INITIAL_LIMIT = 18;

export default function App() {
  const [state, setState] = useState<KnowledgeState>(emptyState);
  const [jobs, setJobs] = useState<LearnJob[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname));
  const [searchOpen, setSearchOpen] = useState(false);
  const [markdown, setMarkdown] = useState('');
  const [theme, setTheme] = useState<Theme>(() => loadThemePreference());
  const [compactMode, setCompactMode] = useState(() => loadCompactPreference());
  const [readOnly, setReadOnly] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [railOpen, setRailOpen] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const hasLoadedJobs = useRef(false);

  const pushToast = useCallback((kind: Toast['kind'], message: string) => {
    const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    setToasts((items) => [...items, { id, kind, message }].slice(-4));
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const loadAll = useCallback(async () => {
    const [knowledge, jobStateValue, status, reminderState] = await Promise.all([fetchKnowledge(), fetchJobs(), fetchStatus(), fetchReminders({ status: 'active' })]);
    setState(knowledge);
    setJobs((previous) => {
      if (hasLoadedJobs.current) {
        const previousById = new Map(previous.map((job) => [job.id, job]));
        for (const job of jobStateValue.jobs) {
          const previousJob = previousById.get(job.id);
          const justCompleted = previousJob && previousJob.status !== 'done' && job.status === 'done';
          if (justCompleted) pushToast('success', `Research done: ${job.topic}`);
        }
      }
      hasLoadedJobs.current = true;
      return jobStateValue.jobs;
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
    const onPopState = () => setView(viewFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [view]);

  // Close rail when Escape is pressed
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRailOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const categories = useMemo(() => makeUiCategories(state.categories), [state.categories]);
  const categoryTree = useMemo(() => makeCategoryTree(categories), [categories]);
  const categoryById = useMemo(() => {
    const map = new Map<string, CategoryTreeNode>();
    const visit = (node: CategoryTreeNode) => {
      map.set(node.id, node);
      node.children.forEach(visit);
    };
    categoryTree.forEach(visit);
    return map;
  }, [categoryTree]);

  const currentNote = view.kind === 'note' ? state.notes.find((note) => note.id === view.id) || null : null;
  const currentCategoryNode = view.kind === 'category' ? categoryById.get(view.id) || null : null;
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
    summary: currentCategoryNode.category?.summary || `Folder containing ${currentCategoryNode.count} notes across nested categories.`,
  } : null;

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of state.notes) {
      for (const tag of note.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [state.notes]);

  // Filtered categories for search mode (flat list)
  const filteredCategories = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    if (!q) return null;
    return categories.filter((cat) => cat.id.toLowerCase().includes(q));
  }, [categories, catSearch]);

  // Filtered + optionally capped tag list
  const filteredTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    if (!q) return tagCounts;
    return tagCounts.filter(([tag]) => tag.toLowerCase().includes(q));
  }, [tagCounts, tagSearch]);

  const visibleTags = tagSearch ? filteredTags : filteredTags.slice(0, TAG_INITIAL_LIMIT);
  const hiddenTagCount = tagSearch ? 0 : Math.max(0, tagCounts.length - TAG_INITIAL_LIMIT);

  const inFlightCount = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length;
  const showContextPanel = view.kind === 'note' && !!currentNote;

  useEffect(() => {
    if (!currentNote) return;
    fetchNoteMarkdown(currentNote.id).then(setMarkdown).catch(() => setMarkdown(''));
  }, [currentNote]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      const inField = tag === 'TEXTAREA' || tag === 'INPUT';
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((value) => !value);
        return;
      }
      if (event.key === 'Escape') setSearchOpen(false);
      if (inField) return;
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const rows = Array.from(document.querySelectorAll('.note-row'));
        if (!rows.length) return;
        const current = rows.findIndex((row) => row.classList.contains('focused'));
        const next = current < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, current + (event.key === 'j' ? 1 : -1)));
        rows.forEach((row) => row.classList.remove('focused'));
        rows[next].classList.add('focused');
        rows[next].scrollIntoView({ block: 'nearest' });
      }
      if (event.key === 'Enter') {
        const focused = document.querySelector<HTMLElement>('.note-row.focused');
        focused?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function submitCapture(payload: CreateNoteRequest) {
    try {
      const result = await submitLearning(payload);
      setJobs((previous) => [result.job, ...previous.filter((job) => job.id !== result.job.id)]);
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
    const result = await assistNoteEdit(id, prompt, draft);
    return result.update;
  }

  async function handleCreateReminder(noteId: string, remindAt: string, message: string) {
    await createReminder({ noteId, remindAt, message });
    const result = await fetchReminders({ status: 'active' });
    setReminders(result.reminders);
  }

  async function handleCompleteReminder(id: string) {
    await updateReminder(id, { completed: true });
    setReminders((items) => items.filter((item) => item.id !== id));
  }

  async function handleDeleteReminder(id: string) {
    await deleteReminder(id);
    setReminders((items) => items.filter((item) => item.id !== id));
  }

  const navigate = useCallback((nextView: View, options: { replace?: boolean } = {}) => {
    setView((current) => {
      const nextPath = pathFromView(nextView);
      if (!sameView(current, nextView)) {
        if (options.replace) window.history.replaceState({ view: nextView }, '', nextPath);
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
  const openFlashcards = useCallback((scope: 'all' | 'category' | 'tag' = 'all', value?: string) => navigate({ kind: 'flashcards', scope, value }), [navigate]);

  function closeRail() { setRailOpen(false); }

  function renderCategoryNode(node: CategoryTreeNode): React.ReactNode {
    return (
      <div key={node.id} className="category-tree-node">
        <button
          className={`nav-item category-nav depth-${Math.min(node.depth, 4)}${view.kind === 'category' && view.id === node.id ? ' active' : ''}`}
          onClick={() => { openCategory(node.id); closeRail(); }}
          title={node.id}
        >
          <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>{node.children.length ? '▸' : '·'}</span>
          <span className={`dot ${node.color}`} />
          <span style={{ flex: 1, textAlign: 'left' }}>{node.label}</span>
          <span className="count">{node.count}</span>
        </button>
        {!!node.children.length && (
          <div className="category-tree-children">
            {node.children.map(renderCategoryNode)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`app${showContextPanel ? '' : ' no-right'}${compactMode ? ' dense' : ''}`}>

      {/* ── Left rail ── */}
      <aside className={`rail${railOpen ? ' rail-open' : ''}`}>
        <div className="rail-head">
          <div className="wordmark">
            <span className="mark" />
            <span className="name">Knowledge <em>Loom</em></span>
          </div>
          <div className="rail-sub">a desk for things you just learned</div>
          <button className="rail-close" onClick={closeRail} aria-label="Close menu">✕</button>
        </div>

        <nav className="rail-nav">
          {/* ── Main nav ── */}
          <div className="rail-nav-group">
            <button className={`nav-item${view.kind === 'home' ? ' active' : ''}`} onClick={() => { goHome(); closeRail(); }}>
              <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>✦</span> Capture
              <span className="kbd">/</span>
            </button>
            <button className="nav-item" onClick={() => { setSearchOpen(true); closeRail(); }}>
              <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>⌕</span> Search
              <span className="kbd">⌘K</span>
            </button>
            <button className={`nav-item activity-nav${view.kind === 'activity' ? ' active' : ''}${inFlightCount ? ' researching' : ''}`} onClick={() => { openActivity(); closeRail(); }}>
              <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>◷</span> Activity
              <span className="count">{inFlightCount}</span>
            </button>
            <button className={`nav-item${view.kind === 'flashcards' ? ' active' : ''}`} onClick={() => { openFlashcards(); closeRail(); }}>
              <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>▧</span> Flashcards
              <span className="count">{state.flashcards?.length || 0}</span>
            </button>
          </div>

          {/* ── Categories ── */}
          <div className="rail-section-head">
            <span className="rail-section-label">Categories</span>
            <span className="rail-section-count">{categories.length}</span>
          </div>
          <div className="rail-filter-wrap">
            <span className="rail-filter-icon">⌕</span>
            <input
              className="rail-filter"
              placeholder="Filter categories…"
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              spellCheck={false}
            />
            {catSearch && (
              <button className="rail-filter-clear" onClick={() => setCatSearch('')} aria-label="Clear">✕</button>
            )}
          </div>

          {filteredCategories ? (
            filteredCategories.length > 0 ? (
              filteredCategories.map((cat) => {
                const label = categoryLabel(cat.name);
                const parentPath = cat.id.includes('/') ? cat.id.slice(0, cat.id.lastIndexOf('/')) : '';
                return (
                  <button
                    key={cat.id}
                    className={`nav-item${view.kind === 'category' && view.id === cat.id ? ' active' : ''}`}
                    onClick={() => { openCategory(cat.id); setCatSearch(''); closeRail(); }}
                    title={cat.id}
                  >
                    <span className={`dot ${cat.color}`} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                      {parentPath && <span className="rail-filter-path">{parentPath}</span>}
                    </span>
                    <span className="count">{cat.count}</span>
                  </button>
                );
              })
            ) : (
              <div className="rail-empty">No categories match</div>
            )
          ) : (
            categoryTree.map(renderCategoryNode)
          )}

          {/* ── Tags ── */}
          <div className="rail-section-head">
            <span className="rail-section-label">Tags</span>
            <span className="rail-section-count">{tagCounts.length}</span>
          </div>
          <div className="rail-filter-wrap">
            <span className="rail-filter-icon">⌕</span>
            <input
              className="rail-filter"
              placeholder="Filter tags…"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              spellCheck={false}
            />
            {tagSearch && (
              <button className="rail-filter-clear" onClick={() => setTagSearch('')} aria-label="Clear">✕</button>
            )}
          </div>

          {filteredTags.length === 0 && tagSearch ? (
            <div className="rail-empty">No tags match</div>
          ) : (
            visibleTags.map(([tag, count]) => (
              <button
                key={tag}
                className={`nav-item${view.kind === 'tag' && view.tag === tag ? ' active' : ''}`}
                onClick={() => { openTag(tag); closeRail(); }}
              >
                <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0, fontFamily: 'monospace' }}>#</span>
                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span>
                <span className="count">{count}</span>
              </button>
            ))
          )}
          {hiddenTagCount > 0 && (
            <div className="rail-more">+{hiddenTagCount} more — search to filter</div>
          )}
        </nav>
      </aside>

      {/* Mobile backdrop */}
      {railOpen && <div className="rail-backdrop" onClick={closeRail} />}

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
            <button className="theme-toggle" onClick={() => setTheme((value) => themeLabels[value].next)} title={themeLabels[theme].label}>
              <span className="glyph">{themeLabels[theme].icon}</span>
              <span className="util-label">{themeLabels[theme].label}</span>
            </button>
            <button className="density-toggle" onClick={() => setCompactMode((value) => !value)} title={compactMode ? 'Comfort' : 'Compact'}>
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
              reminders={reminders.filter((reminder) => reminder.noteId === currentNote.id)}
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
              onOpenFlashcards={(category) => openFlashcards('category', category)}
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
        <aside className="context">
          <div className="ctx-block">
            <h3>Connections</h3>
            <MiniGraph note={currentNote} notes={state.notes} onOpen={openNote} />
          </div>
          <div className="ctx-block">
            <h3>Links out · {currentNote.links.length}</h3>
            <ul className="link-list">
              {currentNote.links.map((id) => {
                const note = state.notes.find((item) => item.id === id);
                if (!note) return null;
                return (
                  <li key={id} onClick={() => openNote(id)}>
                    <span className="arrow">↗</span>
                    <div>
                      <div className="ltitle">{note.title}</div>
                      <div className="lcat">{note.category} · {formatCreated(note.createdAt)}</div>
                    </div>
                  </li>
                );
              })}
              {currentNote.links.length === 0 && <li className="muted-row">None yet. Codex will add some after the next pass.</li>}
            </ul>
          </div>
          <div className="ctx-block">
            <h3>Backlinks · {state.notes.filter((note) => note.links.includes(currentNote.id)).length}</h3>
            <ul className="link-list">
              {state.notes.filter((note) => note.links.includes(currentNote.id)).map((note) => (
                <li key={note.id} onClick={() => openNote(note.id)}>
                  <span className="arrow">↘</span>
                  <div>
                    <div className="ltitle">{note.title}</div>
                    <div className="lcat">{note.category} · {formatCreated(note.createdAt)}</div>
                  </div>
                </li>
              ))}
              {state.notes.filter((note) => note.links.includes(currentNote.id)).length === 0 && <li className="muted-row">Nothing links here yet.</li>}
            </ul>
          </div>
          <div className="ctx-block">
            <h3>File</h3>
            <div className="fine">
              <div><b>{currentNote.id}.md</b></div>
              <div style={{ marginTop: 4 }}>vault / {currentNote.category}</div>
              <div style={{ marginTop: 4 }}>indexed · meilisearch</div>
            </div>
          </div>
        </aside>
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
          <div key={toast.id} className={`toast ${toast.kind}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
