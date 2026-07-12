import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  assistNoteEdit,
  createReminder,
  deleteNote,
  deleteReminder,
  fetchJobs,
  fetchKnowledge,
  fetchReminders,
  fetchSpaces,
  fetchStatus,
  patchNote,
  submitLearning,
  updateNote,
  updateReminder,
  transferNoteToSpace,
  type NoteTransferMode,
  type NoteUpdate,
} from '../api';
import {
  makeCategoryTree,
  makeUiCategories,
  type CategoryTreeNode,
} from '../lib/view';
import { loadTemplates, type GuidanceTemplate } from '../lib/guidance';
import type { CreateNoteRequest, KnowledgeNote, KnowledgeState, LearnJob, Reminder } from '../types';

type Theme = 'light' | 'white' | 'dark' | 'midnight' | 'simplistic';
type FontStyle = 'serif' | 'sans';
type Toast = { id: string; kind: 'info' | 'success' | 'error'; message: string };

const emptyState: KnowledgeState = { notes: [], categories: [], graph: [], flashcards: [], quizQuestions: [] };
const preferenceKeys = {
  theme: 'knowledge-loom:theme',
  compactMode: 'knowledge-loom:compact-mode',
  fontStyle: 'knowledge-loom:font-style',
};

export const themeLabels: Record<Theme, { icon: string; next: Theme; labelKey: string }> = {
  light: { icon: '☀', next: 'white', labelKey: 'shell.themeWarm' },
  white: { icon: '◐', next: 'simplistic', labelKey: 'shell.themeWhite' },
  simplistic: { icon: '◻', next: 'dark', labelKey: 'shell.themeMinimal' },
  dark: { icon: '☾', next: 'midnight', labelKey: 'shell.themeDark' },
  midnight: { icon: '◑', next: 'light', labelKey: 'shell.themeNight' },
};

export type { Theme };

export const fontStyleLabels: Record<FontStyle, { icon: string; next: FontStyle; labelKey: string }> = {
  serif: { icon: '𝐀', next: 'sans', labelKey: 'shell.fontSerif' },
  sans: { icon: 'A', next: 'serif', labelKey: 'shell.fontSans' },
};

function loadTheme(): Theme {
  const v = window.localStorage.getItem(preferenceKeys.theme);
  return v === 'light' || v === 'white' || v === 'dark' || v === 'midnight' || v === 'simplistic' ? v : 'light';
}

/**
 * Central application state hook — polling, mutations, navigation, derived data.
 *
 * Polls `/api/knowledge`, `/api/jobs`, `/api/status`, and `/api/reminders`
 * every 2.5 seconds. Holds all global state: notes, jobs, reminders, UI
 * preferences (theme, compactMode, railOpen, searchOpen), toasts, and
 * writing guidance templates.
 *
 * Exposes navigation callbacks (openNote, openCategory, openTag, etc.) and
 * mutation handlers (handleDelete, handleSaveNote, submitCapture, reminder CRUD).
 *
 * App.tsx is the sole consumer — it distributes values via props.
 */
export function useKnowledge() {
  const navigate = useNavigate();
  const location = useLocation();

  const [state, setState] = useState<KnowledgeState>(emptyState);
  const [jobs, setJobs] = useState<LearnJob[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [fontStyle, setFontStyle] = useState<FontStyle>(() => {
    const v = window.localStorage.getItem(preferenceKeys.fontStyle);
    return v === 'sans' ? 'sans' : 'serif';
  });
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
    document.documentElement.dataset.font = fontStyle;
    window.localStorage.setItem(preferenceKeys.fontStyle, fontStyle);
  }, [fontStyle]);

  useEffect(() => {
    window.localStorage.setItem(preferenceKeys.compactMode, String(compactMode));
  }, [compactMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRailOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      const inField = tag === 'TEXTAREA' || tag === 'INPUT' || active?.isContentEditable === true;
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

  const noteIdMatch = location.pathname.match(/^\/notes\/(.+)$/);
  const currentNoteId = noteIdMatch ? decodeURIComponent(noteIdMatch[1]) : null;
  const currentNote = currentNoteId ? state.notes.find((n) => n.id === currentNoteId) ?? null : null;
  const showContextPanel = !!currentNote;

  const openNote = useCallback((id: string) => navigate(`/notes/${encodeURIComponent(id)}`), [navigate]);
  const openCategory = useCallback(
    (id: string) => navigate(`/categories/${id.split('/').map(encodeURIComponent).join('/')}`),
    [navigate],
  );
  const openTag = useCallback((tag: string) => navigate(`/tags/${encodeURIComponent(tag)}`), [navigate]);
  const goHome = useCallback(() => navigate('/home'), [navigate]);
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

  const openQuiz = useCallback(
    (scope: 'all' | 'category' | 'tag' = 'all', value?: string) => {
      if (scope === 'category' && value) navigate(`/quiz?category=${encodeURIComponent(value)}`);
      else if (scope === 'tag' && value) navigate(`/quiz?tag=${encodeURIComponent(value)}`);
      else navigate('/quiz');
    },
    [navigate],
  );

  const openAllCategories = useCallback(() => navigate('/categories'), [navigate]);
  const openAllTags = useCallback(() => navigate('/tags'), [navigate]);
  const openGraph = useCallback(() => navigate('/graph'), [navigate]);
  const openLearn = useCallback(() => navigate('/learn'), [navigate]);
  const openToday = useCallback(() => navigate('/today'), [navigate]);
  const openImport = useCallback(() => navigate('/import'), [navigate]);
  const openMarketplace = useCallback(() => navigate('/marketplace'), [navigate]);

  async function graphAddLink(fromId: string, toId: string) {
    const note = state.notes.find((n) => n.id === fromId);
    if (!note) return;
    const result = await patchNote(fromId, { links: [...new Set([...note.links, toId])] });
    setState(result.state);
  }

  async function graphRemoveLink(fromId: string, toId: string) {
    const note = state.notes.find((n) => n.id === fromId);
    if (!note) return;
    const result = await patchNote(fromId, { links: note.links.filter((l) => l !== toId) });
    setState(result.state);
  }

  async function graphCreateNote(title: string): Promise<string> {
    const result = await submitLearning({ mode: 'write', title, body: `# ${title}\n\n` });
    if (result.state) setState(result.state);
    return result.note?.id ?? '';
  }

  async function graphDeleteNote(id: string) {
    const result = await deleteNote(id);
    setState(result.state);
  }

  async function graphRenameNote(id: string, title: string) {
    const result = await patchNote(id, { title });
    setState(result.state);
  }

  async function graphSetCategory(id: string, category: string) {
    const result = await patchNote(id, { category });
    setState(result.state);
  }

  async function handleDelete(note: KnowledgeNote) {
    if (!window.confirm(`Delete "${note.title}"? This removes the markdown source file.`)) return;
    const result = await deleteNote(note.id);
    setState(result.state);
    navigate('/home', { replace: true });
  }

  async function handleSaveNote(id: string, update: NoteUpdate, expectedVersion?: string) {
    const result = await updateNote(id, update, expectedVersion);
    setState(result.state);
    return result;
  }

  async function handleAssistNote(id: string, prompt: string, draft: NoteUpdate) {
    return (await assistNoteEdit(id, prompt, draft)).update;
  }

  const listSpaces = useCallback(async () => {
    return (await fetchSpaces()).spaces;
  }, []);

  const handleTransferNote = useCallback(async (id: string, toSpaceId: string, mode: NoteTransferMode) => {
    return transferNoteToSpace(id, toSpaceId, mode);
  }, []);

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

  return {
    state,
    jobs,
    reminders,
    searchOpen,
    setSearchOpen,
    theme,
    setTheme,
    fontStyle,
    setFontStyle,
    compactMode,
    setCompactMode,
    readOnly,
    toasts,
    railOpen,
    setRailOpen,
    templates,
    setTemplates,
    catSearch,
    setCatSearch,
    tagSearch,
    setTagSearch,
    categories,
    categoryTree,
    categoryById,
    tagCounts,
    currentNote,
    showContextPanel,
    inFlightCount,
    openNote,
    openCategory,
    openTag,
    goHome,
    openActivity,
    openSettings,
    openFlashcards,
    openQuiz,
    openAllCategories,
    openAllTags,
    openGraph,
    openLearn,
    openToday,
    openImport,
    openMarketplace,
    graphAddLink,
    graphRemoveLink,
    graphCreateNote,
    graphDeleteNote,
    graphRenameNote,
    graphSetCategory,
    handleDelete,
    handleSaveNote,
    handleAssistNote,
    listSpaces,
    handleTransferNote,
    submitCapture,
    handleCreateReminder,
    handleCompleteReminder,
    handleDeleteReminder,
  };
}
