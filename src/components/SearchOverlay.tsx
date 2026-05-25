import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { searchKnowledge } from '../api';
import type { KnowledgeNote } from '../types';
import { categoryId, formatCreated, highlightText, noteSearchText, type UiCategory } from '../lib/view';

/**
 * Command-palette search. It keeps user input stable while background polling
 * refreshes notes, and asks the backend to use Meilisearch for real queries.
 */
export default function SearchOverlay({
  open,
  onClose,
  notes,
  categories,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  notes: KnowledgeNote[];
  categories: UiCategory[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);
  const [hits, setHits] = useState<KnowledgeNote[]>([]);
  const [engine, setEngine] = useState('meilisearch');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wasOpenRef = useRef(false);

  /*
   * Initialize only when the overlay transitions from closed to open.
   * The app polls notes in the background; tying initialization to `notes`
   * directly would wipe the user's in-progress search every refresh.
   */
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    const timer = window.setTimeout(() => {
      setQuery('');
      setIdx(0);
      setHits(notes.slice(0, 12));
      setEngine('recent');
      inputRef.current?.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [notes, open]);

  /*
   * Search is debounced and backend-first. When Meilisearch is unavailable the
   * backend can still return fallback results, and this component has a final
   * local fallback for network-level failures.
   */
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(async () => {
      if (!query.trim()) {
        setHits(notes.slice(0, 12));
        setEngine('recent');
        return;
      }
      try {
        const result = await searchKnowledge(query, 'All');
        setHits(result.hits);
        setEngine(result.engine);
      } catch {
        const normalized = query.toLowerCase();
        setHits(notes.filter((note) => noteSearchText(note).includes(normalized)).slice(0, 20));
        setEngine('local');
      }
    }, 160);
    return () => window.clearTimeout(timer);
  }, [notes, open, query]);

  /*
   * Keyboard navigation follows command-palette conventions: arrows move the
   * active result, Enter opens it, and Escape closes the overlay.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setIdx((value) => Math.min(hits.length - 1, value + 1));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setIdx((value) => Math.max(0, value - 1));
      }
      if (event.key === 'Enter' && hits[idx]) {
        event.preventDefault();
        onOpen(hits[idx].id);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hits, idx, onClose, onOpen, open]);

  if (!open) return null;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-panel" onClick={(event) => event.stopPropagation()}>
        <div className="search-input">
          <span className="glyph">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIdx(0);
            }}
            placeholder={t('search.placeholder')}
          />
          <span className="esc">esc</span>
        </div>
        <div className="search-results">
          {hits.length === 0 && <div className="search-empty">{t('search.noMatches')}</div>}
          <div>
            <div className="search-grp">{query.trim() ? t('search.matches') : t('search.recent')} · {hits.length}</div>
            {hits.map((note, hitIndex) => {
              const cat = categories.find((item) => item.id === categoryId(note.category));
              return (
                <div
                  key={note.id}
                  className={`search-hit${hitIndex === idx ? ' active' : ''}`}
                  onClick={() => { onOpen(note.id); onClose(); }}
                  onMouseEnter={() => setIdx(hitIndex)}
                >
                  <div>
                    <div className="h-title">{highlightText(note.title, query)}</div>
                    <div className="h-snip">{highlightText(note.summary || '', query)}</div>
                  </div>
                  <div className="h-meta">
                    <div>{cat?.name || note.category}</div>
                    <div style={{ marginTop: 3 }}>{formatCreated(note.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="search-foot">
          <span><kbd>↑↓</kbd> {t('search.navigate')}</span>
          <span><kbd>↵</kbd> {t('search.open')}</span>
          <span><kbd>esc</kbd> {t('search.close')}</span>
          <span style={{ marginLeft: 'auto' }}>{engine} · {hits.length} hits</span>
        </div>
      </div>
    </div>
  );
}
