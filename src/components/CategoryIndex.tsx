import { useMemo, useState } from 'react';
import type { Flashcard, KnowledgeNote } from '../types';
import { categoryContains, categoryId, categoryLabel, formatCreated, type UiCategory } from '../lib/view';
import NoteList from './NoteList';

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
  onOpen,
  onOpenTag,
  onOpenCategory,
  onOpenFlashcards,
}: {
  category: UiCategory;
  notes: KnowledgeNote[];
  categories: UiCategory[];
  flashcards: Flashcard[];
  onOpen: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onOpenCategory: (id: string) => void;
  onOpenFlashcards: (category: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>('recent');

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
        return (
          catParts.length === thisParts.length + 1 &&
          cat.id.startsWith(category.id + '/')
        );
      }),
    [categories, category.id],
  );

  const accentColor = COLOR_VAR[category.color] || 'var(--accent)';
  const pathParts = category.id.split('/');

  return (
    <div className="ci-page">
      {/* Clickable breadcrumb */}
      <nav className="ci-crumbs" aria-label="Category path">
        <span className="ci-crumb-home" onClick={() => onOpenCategory('')}>Categories</span>
        {pathParts.map((part, i) => {
          const id = pathParts.slice(0, i + 1).join('/');
          const isLast = i === pathParts.length - 1;
          return (
            <span key={id} className="ci-crumb-seg">
              <span className="ci-crumb-sep">/</span>
              {isLast ? (
                <span className="ci-crumb-current">{part}</span>
              ) : (
                <button className="ci-crumb-link" onClick={() => onOpenCategory(id)}>
                  {part}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      {/* Compact inline header — no box, no card */}
      <div className="ci-head" style={{ '--cat-color': accentColor } as React.CSSProperties}>
        <div className="ci-head-row">
          <span className="ci-head-dot" style={{ background: accentColor }} />
          <h1 className="ci-head-title">{categoryLabel(category.name)}</h1>
          <div className="ci-head-chips">
            <span className="ci-chip">{inCat.length} notes</span>
            {relatedFlashcards.length > 0 && (
              <button className="ci-chip ci-chip-action" onClick={() => onOpenFlashcards(category.name)}>
                {relatedFlashcards.length} flashcards ↗
              </button>
            )}
            {tagCounts.length > 0 && (
              <span className="ci-chip">{tagCounts.length} tags</span>
            )}
            {totalLinks > 0 && (
              <span className="ci-chip">{totalLinks} links</span>
            )}
          </div>
        </div>
        {category.summary && category.summary !== 'No summary yet.' && (
          <p className="ci-head-summary">{category.summary}</p>
        )}
      </div>

      {/* Subcategories — compact chip strip */}
      {childCategories.length > 0 && (
        <div className="ci-strip ci-subcat-strip">
          <span className="ci-strip-label">Folders</span>
          <div className="ci-strip-items">
            {childCategories.map((cat) => {
              const catColor = COLOR_VAR[cat.color] || 'var(--accent)';
              const catNoteCount = notes.filter((n) =>
                categoryContains(cat.id, categoryId(n.category)),
              ).length;
              return (
                <button
                  key={cat.id}
                  className="ci-subcat-pill"
                  onClick={() => onOpenCategory(cat.id)}
                  style={{ '--cat-color': catColor } as React.CSSProperties}
                >
                  <span className="ci-subcat-dot" style={{ background: catColor }} />
                  {categoryLabel(cat.name)}
                  <em>{catNoteCount}</em>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tag chips — compact strip */}
      {tagCounts.length > 0 && (
        <div className="ci-strip ci-tags-strip">
          <span className="ci-strip-label">Tags</span>
          <div className="ci-strip-items">
            {tagCounts.slice(0, 14).map(([tag, count]) => (
              <button key={tag} className="ci-tag-chip" onClick={() => onOpenTag(tag)}>
                #{tag}
                <em>{count}</em>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="divider" />

      {/* Notes */}
      <div className="ci-section-head">
        <h2 className="ci-notes-label">
          Notes
          <span className="ci-notes-count">{inCat.length}</span>
        </h2>
        <div className="ci-sort-tabs">
          {(['recent', 'oldest', 'links'] as SortKey[]).map((key) => (
            <button
              key={key}
              className={sort === key ? 'active' : ''}
              onClick={() => setSort(key)}
            >
              {key === 'recent' ? 'Recent' : key === 'oldest' ? 'Oldest' : 'Most linked'}
            </button>
          ))}
        </div>
      </div>
      <NoteList notes={sorted} categories={categories} onOpen={onOpen} onOpenTag={onOpenTag} />
    </div>
  );
}
