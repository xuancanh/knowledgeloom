import { useMemo, useState } from 'react';
import type { Flashcard, KnowledgeNote } from '../types';
import { categoryId, formatCreated, type UiCategory } from '../lib/view';
import NoteList from './NoteList';

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
  page,
  onOpen,
  onOpenTag,
  onOpenCategory,
  onOpenFlashcards,
  onPage,
}: {
  tag: string;
  notes: KnowledgeNote[];
  categories: UiCategory[];
  flashcards: Flashcard[];
  page: number;
  onOpen: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onOpenCategory: (id: string) => void;
  onOpenFlashcards: (tag: string) => void;
  onPage: (page: number) => void;
}) {
  const [sort, setSort] = useState<SortKey>('recent');

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
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
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

  const totalPages = Math.max(1, Math.ceil(sortedAll.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const visibleNotes = sortedAll.slice(start, start + PAGE_SIZE);

  function changePage(next: number) {
    onPage(Math.min(Math.max(1, next), totalPages));
  }

  function changeSort(next: SortKey) {
    setSort(next);
    onPage(1);
  }

  const maxCoCount = coTags[0]?.[1] || 1;

  return (
    <div className="ti-page">
      <div className="crumbs">
        <span>Tags</span>
        <span className="sep">/</span>
        <span>#{tag}</span>
      </div>

      {/* Compact inline header */}
      <div className="ti-head">
        <div className="ti-head-row">
          <h1 className="ti-head-tag">
            <span className="ti-hash">#</span>{tag}
          </h1>
          <div className="ti-head-chips">
            <span className="ti-chip">{taggedNotes.length} notes</span>
            {relatedFlashcards.length > 0 && (
              <button className="ti-chip ti-chip-action" onClick={() => onOpenFlashcards(tag)}>
                {relatedFlashcards.length} flashcards ↗
              </button>
            )}
            {coTags.length > 0 && (
              <span className="ti-chip">{coTags.length} related tags</span>
            )}
          </div>
        </div>
      </div>

      {/* Inline: categories this tag spans */}
      {catCounts.length > 0 && (
        <div className="ti-strip">
          <span className="ti-strip-label">In</span>
          <div className="ti-strip-items">
            {catCounts.map(([cid, count]) => {
              const cat = categories.find((c) => c.id === cid);
              const color = COLOR_VAR[cat?.color || 'oxblood'] || 'var(--accent)';
              return (
                <button
                  key={cid}
                  className="ti-cat-pill"
                  onClick={() => onOpenCategory(cid)}
                  style={{ '--cat-color': color } as React.CSSProperties}
                >
                  <span className="ti-cat-dot" style={{ background: color }} />
                  {cat?.name || cid}
                  <em>{count}</em>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Inline: related (co-occurring) tags */}
      {coTags.length > 0 && (
        <div className="ti-strip">
          <span className="ti-strip-label">Related</span>
          <div className="ti-strip-items ti-cotags-items">
            {coTags.map(([coTag, count]) => {
              const weight = count / maxCoCount;
              return (
                <button
                  key={coTag}
                  className="ti-co-tag"
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

      {/* Notes */}
      <div className="ti-section-head">
        <h2 className="ti-notes-label">
          Articles
          <span className="ti-notes-range">
            {taggedNotes.length
              ? ` · ${start + 1}–${Math.min(start + PAGE_SIZE, sortedAll.length)} of ${sortedAll.length}`
              : ''}
          </span>
        </h2>
        <div className="ti-sort-tabs">
          {(['recent', 'oldest', 'links'] as SortKey[]).map((key) => (
            <button
              key={key}
              className={sort === key ? 'active' : ''}
              onClick={() => changeSort(key)}
            >
              {key === 'recent' ? 'Recent' : key === 'oldest' ? 'Oldest' : 'Most linked'}
            </button>
          ))}
        </div>
      </div>

      <NoteList notes={visibleNotes} categories={categories} onOpen={onOpen} onOpenTag={onOpenTag} />

      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => changePage(safePage - 1)} disabled={safePage === 1}>Previous</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} className={p === safePage ? 'active' : ''} onClick={() => changePage(p)}>
              {p}
            </button>
          ))}
          <button onClick={() => changePage(safePage + 1)} disabled={safePage === totalPages}>Next</button>
        </div>
      )}
    </div>
  );
}
