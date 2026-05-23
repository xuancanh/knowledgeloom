import { useMemo } from 'react';
import type { Flashcard, KnowledgeNote } from '../../types';
import type { UiCategory } from '../../lib/view';
import { KIND_COLOR, KIND_LABEL } from './constants';
import type { Rating } from './types';

/**
 * Browse mode for the flashcards page.
 *
 * Shows a grid of flashcard tiles with kind breakdown bar, scope filters
 * (all / category / tag), and a "Start session" button. Clicking a tile
 * starts a study session from that index via `onStartStudy`.
 */
export function FlashcardBrowse({
  flashcards,
  notes,
  categories,
  tagCounts,
  scope,
  value,
  ratings,
  onScopeChange,
  onStartStudy,
}: {
  flashcards: Flashcard[];
  notes: KnowledgeNote[];
  categories: UiCategory[];
  tagCounts: Array<[string, number]>;
  scope: 'all' | 'category' | 'tag';
  value: string;
  ratings: Record<string, Rating>;
  onScopeChange: (scope: 'all' | 'category' | 'tag', value?: string) => void;
  onStartStudy: (index: number) => void;
}) {
  const scopedCards = useMemo(() => {
    if (scope === 'category' && value) return flashcards.filter((c) => c.category === value);
    if (scope === 'tag' && value) return flashcards.filter((c) => c.tags.includes(value));
    return flashcards;
  }, [flashcards, scope, value]);

  const kindGroups = useMemo(() => {
    const g: Record<string, number> = {};
    for (const card of scopedCards) g[card.kind] = (g[card.kind] || 0) + 1;
    return g;
  }, [scopedCards]);

  const reviewed = useMemo(
    () => scopedCards.filter((c) => ratings[c.id]).length,
    [scopedCards, ratings],
  );
  const progress = scopedCards.length ? Math.round((reviewed / scopedCards.length) * 100) : 0;

  return (
    <div className="fc-page">
      <div className="crumbs">
        <span>Desk</span><span className="sep">/</span><span>Flashcards</span>
      </div>

      <div className="fc-browse-head">
        <div className="fc-browse-title">
          <h1>Flashcards</h1>
          <p>AI-generated micro lessons from your notes. Start a focused session or click any card.</p>
        </div>
        {scopedCards.length > 0 && (
          <div className="fc-browse-meta">
            <div className="fc-browse-progress">
              <div className="fc-bar-track">
                <div className="fc-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <span>{reviewed}/{scopedCards.length} reviewed</span>
            </div>
            <button className="fc-start-btn" onClick={() => onStartStudy(0)}>
              Start session ▶
            </button>
          </div>
        )}
      </div>

      <div className="fc-scope-bar">
        <div className="fc-scope-pills">
          <button
            className={`fc-pill${scope === 'all' ? ' active' : ''}`}
            onClick={() => onScopeChange('all')}
          >
            All · {flashcards.length}
          </button>
        </div>
        <div className="fc-scope-selects">
          <select
            value={scope === 'category' ? value : ''}
            onChange={(e) => e.target.value ? onScopeChange('category', e.target.value) : onScopeChange('all')}
            aria-label="Filter by category"
          >
            <option value="">Category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <select
            value={scope === 'tag' ? value : ''}
            onChange={(e) => e.target.value ? onScopeChange('tag', e.target.value) : onScopeChange('all')}
            aria-label="Filter by tag"
          >
            <option value="">Tag</option>
            {tagCounts.map(([tag, count]) => (
              <option key={tag} value={tag}>{tag} ({count})</option>
            ))}
          </select>
        </div>
      </div>

      {scopedCards.length === 0 ? (
        <div className="empty">
          {notes.length
            ? 'No flashcards for this filter.'
            : 'Add notes first — flashcards are generated from saved notes.'}
        </div>
      ) : (
        <>
          <div className="fc-kind-bar">
            {Object.entries(KIND_COLOR)
              .filter(([k]) => kindGroups[k])
              .map(([kind, color]) => (
                <div
                  key={kind}
                  className="fc-kind-chip"
                  style={{ '--kc': color } as React.CSSProperties}
                >
                  <span className="fc-dot" style={{ background: color }} />
                  <span>{KIND_LABEL[kind]}</span>
                  <em>{kindGroups[kind]}</em>
                </div>
              ))}
          </div>

          <div className="fc-grid">
            {scopedCards.map((card, index) => {
              const kc = KIND_COLOR[card.kind] || 'var(--accent)';
              const rating = ratings[card.id];
              return (
                <button
                  key={card.id}
                  className={`fc-tile${rating ? ` r-${rating}` : ''}`}
                  onClick={() => onStartStudy(index)}
                  style={{ '--kc': kc } as React.CSSProperties}
                >
                  <div className="fc-tile-kind">
                    <span className="fc-dot" style={{ background: kc }} />
                    <span style={{ color: kc }}>{KIND_LABEL[card.kind] || card.kind}</span>
                    {rating && <span className={`fc-tile-r ${rating}`}>{rating}</span>}
                  </div>
                  <div className="fc-tile-q">{card.prompt}</div>
                  <div className="fc-tile-src">{card.noteTitle}</div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
