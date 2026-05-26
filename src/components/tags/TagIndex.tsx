import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Flashcard, KnowledgeNote } from '../../types';
import { categoryId, formatCreated, type UiCategory } from '../../lib/view';
import NoteList, { type ViewMode } from '../NoteList';
import styles from './TagIndex.module.css';

const PAGE_SIZE = 10;

const COLOR_VAR: Record<string, string> = {
  oxblood: 'var(--accent)',
  moss: 'var(--moss)',
  indigo: 'var(--indigo)',
  ochre: 'var(--ochre)',
  teal: 'var(--teal)',
  rust: 'var(--rust)',
};

type SortKey = 'recent' | 'oldest' | 'links';

export default function TagIndex({
  tag,
  notes,
  categories,
  flashcards,
  readNoteIds,
  page,
  onOpen,
  onOpenTag,
  onOpenFlashcards,
  onPage,
}: {
  tag: string;
  notes: KnowledgeNote[];
  categories: UiCategory[];
  flashcards: Flashcard[];
  readNoteIds?: string[];
  page: number;
  onOpen: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onOpenFlashcards: (tag: string) => void;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<SortKey>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [noteSearch, setNoteSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const readSet = useMemo(() => new Set(readNoteIds || []), [readNoteIds]);

  const taggedNotes = useMemo(
    () =>
      notes
        .filter((note) => note.tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
        .sort((a, b) => formatCreated(b.createdAt).localeCompare(formatCreated(a.createdAt))),
    [notes, tag],
  );

  const relatedFlashcards = useMemo(
    () => flashcards.filter((card) => card.tags.some((t) => t.toLowerCase() === tag.toLowerCase())),
    [flashcards, tag],
  );

  const coTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of taggedNotes) {
      for (const t of note.tags) {
        if (t.toLowerCase() !== tag.toLowerCase()) {
          counts.set(t, (counts.get(t) || 0) + 1);
        }
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [taggedNotes, tag]);

  const catCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of taggedNotes) {
      const cid = categoryId(note.category);
      counts.set(cid, (counts.get(cid) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [taggedNotes]);

  const sortedAll = useMemo(() => {
    if (sort === 'oldest') return [...taggedNotes].reverse();
    if (sort === 'links') return [...taggedNotes].sort((a, b) => b.links.length - a.links.length);
    return taggedNotes;
  }, [sort, taggedNotes]);

  const filtered = useMemo(() => {
    let result = sortedAll;
    if (unreadOnly) {
      result = result.filter((n) => !readSet.has(n.id));
    }
    if (catFilter) {
      result = result.filter((n) => categoryId(n.category) === catFilter);
    }
    const q = noteSearch.trim().toLowerCase();
    if (q) {
      result = result.filter((n) =>
        `${n.title} ${n.summary} ${n.tags.join(' ')}`.toLowerCase().includes(q),
      );
    }
    return result;
  }, [sortedAll, catFilter, noteSearch, unreadOnly, readSet]);

  const unreadCount = useMemo(() => taggedNotes.filter((n) => !readSet.has(n.id)).length, [taggedNotes, readSet]);
  const isFiltered = !!(catFilter || noteSearch.trim() || unreadOnly);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const visibleNotes = viewMode === 'grid' ? filtered : filtered.slice(start, start + PAGE_SIZE);

  const maxCoCount = coTags[0]?.[1] || 1;

  function changePage(next: number) {
    onPage(Math.min(Math.max(1, next), totalPages));
  }

  function changeSort(next: SortKey) {
    setSort(next);
    onPage(1);
  }

  function toggleCatFilter(cid: string) {
    setCatFilter((prev) => (prev === cid ? null : cid));
    onPage(1);
  }

  return (
    <div className={styles.page}>
      <div className="crumbs">
        <span>{t('tags.crumbHome')}</span>
        <span className="sep">/</span>
        <span>#{tag}</span>
      </div>

      {/* Header */}
      <div className={styles.head}>
        <div className={styles.headRow}>
          <h1 className={styles.headTag}>
            <span className={styles.hash}>#</span>{tag}
          </h1>
          <div className={styles.headChips}>
            <span className={styles.chip}>{t('tags.notesCount', { count: taggedNotes.length })}</span>
            {relatedFlashcards.length > 0 && (
              <button className={`${styles.chip} ${styles.chipAction}`} onClick={() => onOpenFlashcards(tag)}>
                {t('tags.flashcardsLink', { count: relatedFlashcards.length })}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Categories this tag appears in — always visible, doubles as filter */}
      {catCounts.length > 0 && (
        <div className={styles.metaSection}>
          <span className={styles.metaLabel}>{t('tags.inLabel')}</span>
          <div className={styles.metaItems}>
            {catCounts.map(([cid, count]) => {
              const cat = categories.find((c) => c.id === cid);
              const color = COLOR_VAR[cat?.color || 'oxblood'] || 'var(--accent)';
              const isActive = catFilter === cid;
              return (
                <button
                  key={cid}
                  className={`${styles.catPill}${isActive ? ` ${styles.catPillActive}` : ''}`}
                  onClick={() => toggleCatFilter(cid)}
                  style={{ '--cat-color': color } as React.CSSProperties}
                  title={isActive ? 'Click to clear filter' : 'Filter by this category'}
                >
                  <span className={styles.catDot} style={{ background: color }} />
                  {cat?.name || cid}
                  <em>{count}</em>
                  {isActive && <span className={styles.pillClear}>✕</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Related tags — always visible */}
      {coTags.length > 0 && (
        <div className={styles.metaSection}>
          <span className={styles.metaLabel}>{t('tags.relatedLabel')}</span>
          <div className={styles.metaItems}>
            {coTags.map(([coTag, count]) => {
              const weight = count / maxCoCount;
              return (
                <button
                  key={coTag}
                  className={styles.coTag}
                  onClick={() => onOpenTag(coTag)}
                  style={{ '--co-weight': weight } as React.CSSProperties}
                >
                  #{coTag}
                  <em>{count}</em>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="divider" />

      {/* Notes toolbar */}
      <div className={styles.sectionHead}>
        <h2 className={styles.notesLabel}>
          {t('tags.articlesLabel')}
          <span className={styles.notesRange}>
            {filtered.length
              ? isFiltered
                ? ` · ${filtered.length} / ${taggedNotes.length}`
                : ` · ${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length}`
              : ''}
          </span>
        </h2>
        <div className={styles.sortTabs}>
          {(['recent', 'oldest', 'links'] as SortKey[]).map((key) => (
            <button key={key} className={sort === key ? 'active' : ''} onClick={() => changeSort(key)}>
              {key === 'recent' ? t('common.recent') : key === 'oldest' ? t('common.oldest') : t('common.mostLinked')}
            </button>
          ))}
        </div>
      </div>

      <div className="notes-toolbar">
        <div className="notes-search-wrap">
          <span className="notes-search-icon">⌕</span>
          <input
            className="notes-search"
            value={noteSearch}
            onChange={(e) => { setNoteSearch(e.target.value); onPage(1); }}
            placeholder={t('tags.searchNotes')}
            spellCheck={false}
          />
          {noteSearch && (
            <button className="notes-search-clear" onClick={() => setNoteSearch('')}>✕</button>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            className={`unread-filter-btn${unreadOnly ? ' active' : ''}`}
            onClick={() => { setUnreadOnly((v) => !v); onPage(1); }}
            title={t('tags.unreadOnly')}
          >
            {t('tags.unreadOnly')}
            <span className="unread-filter-count">{unreadCount}</span>
          </button>
        )}
        <div className="view-mode-btns">
          {(['list', 'grid', 'compact'] as ViewMode[]).map((m) => (
            <button
              key={m}
              className={`view-mode-btn${viewMode === m ? ' active' : ''}`}
              onClick={() => setViewMode(m)}
              title={m.charAt(0).toUpperCase() + m.slice(1)}
            >
              {m === 'list' ? '☰' : m === 'grid' ? '⊞' : '≡'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          {isFiltered
            ? <span>{t('tags.noNotesMatch')}<button onClick={() => { setNoteSearch(''); setCatFilter(null); setUnreadOnly(false); }}>{t('tags.clearFilters')}</button></span>
            : t('tags.noNotesTag')}
        </div>
      ) : (
        <NoteList notes={visibleNotes} categories={categories} onOpen={onOpen} onOpenTag={onOpenTag} viewMode={viewMode} />
      )}

      {viewMode !== 'grid' && totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => changePage(safePage - 1)} disabled={safePage === 1}>{t('common.previous')}</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} className={p === safePage ? 'active' : ''} onClick={() => changePage(p)}>{p}</button>
          ))}
          <button onClick={() => changePage(safePage + 1)} disabled={safePage === totalPages}>{t('common.next')}</button>
        </div>
      )}
    </div>
  );
}
