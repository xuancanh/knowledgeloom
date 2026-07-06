import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Flashcard, KnowledgeNote } from '../../types';
import { categoryContains, categoryId, categoryLabel, formatCreated, type UiCategory } from '../../lib/view';
import NoteList, { type ViewMode } from '../NoteList';
import { createShare } from '../../api';
import { NEW_NOTE_DRAFT_KEY } from '../routes/NewNoteRoute';
import styles from './CategoryIndex.module.css';

const COLOR_VAR: Record<string, string> = {
  oxblood: 'var(--accent)',
  moss: 'var(--moss)',
  indigo: 'var(--indigo)',
  ochre: 'var(--ochre)',
  teal: 'var(--teal)',
  rust: 'var(--rust)',
};

type SortKey = 'recent' | 'oldest' | 'links';

export default function CategoryIndex({
  category,
  notes,
  categories,
  flashcards,
  readNoteIds,
  onOpen,
  onOpenTag,
  onOpenCategory,
  onOpenFlashcards,
}: {
  category: UiCategory;
  notes: KnowledgeNote[];
  categories: UiCategory[];
  flashcards: Flashcard[];
  readNoteIds?: string[];
  onOpen: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onOpenCategory: (id: string) => void;
  onOpenFlashcards: (category: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortKey>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [noteSearch, setNoteSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'working' | 'copied'>('idle');

  const readSet = useMemo(() => new Set(readNoteIds || []), [readNoteIds]);

  const inCat = useMemo(
    () =>
      notes
        .filter((note) => categoryContains(category.id, categoryId(note.category)))
        .sort((a, b) => formatCreated(b.createdAt).localeCompare(formatCreated(a.createdAt))),
    [notes, category.id],
  );

  const sorted = useMemo(() => {
    if (sort === 'oldest') return [...inCat].reverse();
    if (sort === 'links') return [...inCat].sort((a, b) => b.links.length - a.links.length);
    return inCat;
  }, [inCat, sort]);

  const filtered = useMemo(() => {
    let result = sorted;
    if (unreadOnly) {
      result = result.filter((n) => !readSet.has(n.id));
    }
    if (tagFilter) {
      result = result.filter((n) => n.tags.some((t) => t.toLowerCase() === tagFilter.toLowerCase()));
    }
    const q = noteSearch.trim().toLowerCase();
    if (q) {
      result = result.filter((n) =>
        `${n.title} ${n.summary} ${n.tags.join(' ')}`.toLowerCase().includes(q),
      );
    }
    return result;
  }, [sorted, tagFilter, noteSearch, unreadOnly, readSet]);

  const relatedFlashcards = useMemo(
    () => flashcards.filter((card) => categoryContains(category.id, categoryId(card.category))),
    [flashcards, category.id],
  );

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    inCat.forEach((note) => note.tags.forEach((tag) => map.set(tag, (map.get(tag) || 0) + 1)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [inCat]);

  const totalLinks = inCat.reduce((sum, n) => sum + n.links.length, 0);

  const childCategories = useMemo(
    () =>
      categories.filter((cat) => {
        const catParts = cat.id.split('/');
        const thisParts = category.id.split('/');
        return catParts.length === thisParts.length + 1 && cat.id.startsWith(category.id + '/');
      }),
    [categories, category.id],
  );

  const accentColor = COLOR_VAR[category.color] || 'var(--accent)';
  const pathParts = category.id.split('/');
  const unreadCount = useMemo(() => inCat.filter((n) => !readSet.has(n.id)).length, [inCat, readSet]);
  const isFiltered = !!(tagFilter || noteSearch.trim() || unreadOnly);

  function toggleTagFilter(tag: string) {
    setTagFilter((prev) => (prev === tag ? null : tag));
  }

  function newNoteInCategory() {
    sessionStorage.setItem(NEW_NOTE_DRAFT_KEY, JSON.stringify({ category: category.id }));
    navigate('/new');
  }

  return (
    <div className={styles.page}>
      {/* Breadcrumb */}
      <nav className={styles.crumbs} aria-label="Category path">
        <span className={styles.crumbHome} onClick={() => onOpenCategory('')}>{t('categories.crumbHome')}</span>
        {pathParts.map((part, i) => {
          const id = pathParts.slice(0, i + 1).join('/');
          const isLast = i === pathParts.length - 1;
          return (
            <span key={id} className={styles.crumbSeg}>
              <span className={styles.crumbSep}>/</span>
              {isLast ? (
                <span className={styles.crumbCurrent}>{part}</span>
              ) : (
                <button className={styles.crumbLink} onClick={() => onOpenCategory(id)}>{part}</button>
              )}
            </span>
          );
        })}
      </nav>

      {/* Header */}
      <div className={styles.head} style={{ '--cat-color': accentColor } as React.CSSProperties}>
        <div className={styles.headRow}>
          <span className={styles.headDot} style={{ background: accentColor }} />
          <h1 className={styles.headTitle}>{categoryLabel(category.name)}</h1>
          <div className={styles.headChips}>
            <span className={styles.chip}>{t('categories.notesCount', { count: inCat.length })}</span>
            {relatedFlashcards.length > 0 && (
              <button className={`${styles.chip} ${styles.chipAction}`} onClick={() => onOpenFlashcards(category.name)}>
                {t('categories.flashcardsLink', { count: relatedFlashcards.length })}
              </button>
            )}
            {totalLinks > 0 && <span className={styles.chip}>{t('categories.linksCount', { count: totalLinks })}</span>}
          </div>
          <button
            className={styles.newNoteBtn}
            disabled={shareState === 'working'}
            onClick={async () => {
              setShareState('working');
              try {
                const share = await createShare({ category: category.name });
                await navigator.clipboard.writeText(`${window.location.origin}${share.url}`).catch(() => {});
                setShareState('copied');
                setTimeout(() => setShareState('idle'), 2500);
              } catch {
                setShareState('idle');
              }
            }}
            title="Create a public read-only link to this collection and its study deck"
          >
            {shareState === 'copied' ? 'Link copied ✓' : shareState === 'working' ? 'Sharing…' : 'Share'}
          </button>
          <button className={styles.newNoteBtn} onClick={newNoteInCategory}>{t('categories.newNote')}</button>
        </div>
        {category.summary && category.summary !== 'No summary yet.' && (
          <p className={styles.headSummary}>{category.summary}</p>
        )}
      </div>

      {/* Subfolders — always visible when present */}
      {childCategories.length > 0 && (
        <div className={styles.foldersSection}>
          <div className={styles.foldersLabel}>{t('categories.subfolders')}</div>
          <div className={styles.folderList}>
            {childCategories.map((cat) => {
              const catColor = COLOR_VAR[cat.color] || 'var(--accent)';
              const catNoteCount = notes.filter((n) => categoryContains(cat.id, categoryId(n.category))).length;
              return (
                <button
                  key={cat.id}
                  className={styles.folderRow}
                  onClick={() => onOpenCategory(cat.id)}
                  style={{ '--cat-color': catColor } as React.CSSProperties}
                >
                  <span className={styles.folderDot} style={{ background: catColor }} />
                  <span className={styles.folderName}>{categoryLabel(cat.name)}</span>
                  <span className={styles.folderCount}>{catNoteCount}</span>
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
          {t('common.notes')}
          <span className={styles.notesCount}>{isFiltered ? `${filtered.length} / ${inCat.length}` : inCat.length}</span>
        </h2>
        <div className={styles.sortTabs}>
          {(['recent', 'oldest', 'links'] as SortKey[]).map((key) => (
            <button key={key} className={sort === key ? 'active' : ''} onClick={() => setSort(key)}>
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
            onChange={(e) => setNoteSearch(e.target.value)}
            placeholder={t('categories.searchNotes')}
            spellCheck={false}
          />
          {noteSearch && (
            <button className="notes-search-clear" onClick={() => setNoteSearch('')}>✕</button>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            className={`unread-filter-btn${unreadOnly ? ' active' : ''}`}
            onClick={() => setUnreadOnly((v) => !v)}
            title={t('categories.unreadOnly')}
          >
            {t('categories.unreadOnly')}
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

      {/* Tag filter chips */}
      {tagCounts.length > 0 && (
        <div className={styles.tagFilter}>
          {tagCounts.slice(0, 20).map(([tag]) => (
            <button
              key={tag}
              className={`${styles.filterChip}${tagFilter === tag ? ` ${styles.filterChipActive}` : ''}`}
              onClick={() => toggleTagFilter(tag)}
            >
              #{tag}
              {tagFilter === tag && <span className={styles.filterClear}>✕</span>}
            </button>
          ))}
          {tagFilter && (
            <button className={styles.clearAll} onClick={() => setTagFilter(null)}>{t('common.clear')}</button>
          )}
        </div>
      )}

      {filtered.length === 0 && isFiltered ? (
        <div className="empty">{t('categories.noNotesMatch')}<button onClick={() => { setNoteSearch(''); setTagFilter(null); setUnreadOnly(false); }}>{t('categories.clearFilters')}</button></div>
      ) : (
        <NoteList notes={filtered} categories={categories} onOpen={onOpen} onOpenTag={onOpenTag} viewMode={viewMode} />
      )}
    </div>
  );
}
