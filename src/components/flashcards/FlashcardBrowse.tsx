import { useMemo, useState, useRef, useEffect } from 'react';
import type { Flashcard, KnowledgeNote } from '../../types';
import type { UiCategory } from '../../lib/view';
import { KIND_COLOR, KIND_LABEL, RATING_LABEL, RATING_COLOR } from './constants';
import type { Rating } from './types';
import { createFlashcard } from '../../api';

function isCardDue(card: Flashcard): boolean {
  if (!card.reviewData?.nextReviewAt) return true;
  return new Date(card.reviewData.nextReviewAt) <= new Date();
}

function getDueLabel(card: Flashcard): string | null {
  if (!card.reviewData?.nextReviewAt) return null;
  const due = new Date(card.reviewData.nextReviewAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);
  if (diffHours <= 0) return 'Due now';
  if (diffHours < 24) return `Due in ${diffHours}h`;
  return `Due in ${diffDays}d`;
}

const CARD_LIMITS = [10, 20, 50] as const;

function MultiSelectDropdown({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: Array<{ id: string; label: string; count: number }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function toggle(itemId: string) {
    if (selected.includes(itemId)) onChange(selected.filter((id) => id !== itemId));
    else onChange([...selected, itemId]);
  }

  return (
    <div className="fc-multi" ref={ref}>
      <button className="fc-multi-trigger" onClick={() => setOpen(!open)}>
        {label} {selected.length > 0 && `(${selected.length})`} ▾
      </button>
      {open && (
        <div className="fc-multi-dropdown">
          {items.length === 0 && <div className="fc-multi-empty">None</div>}
          {items.map((item) => (
            <label key={item.id} className="fc-multi-item">
              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
              <span className="fc-multi-name">{item.label}</span>
              <span className="fc-multi-count">{item.count}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function FlashcardBrowse({
  flashcards,
  scopedCards,
  notes,
  categories,
  tagCounts,
  scope,
  value,
  ratings,
  kindFilter,
  ratingFilter,
  searchQuery,
  selectedCategories,
  selectedTags,
  dueCount,
  onScopeChange,
  onStartStudy,
  onStartSession,
  onKindFilterChange,
  onRatingFilterChange,
  onSearchChange,
  onSelectedCategoriesChange,
  onSelectedTagsChange,
  onAddFlashcard,
  onDeleteFlashcard,
}: {
  flashcards: Flashcard[];
  scopedCards: Flashcard[];
  notes: KnowledgeNote[];
  categories: UiCategory[];
  tagCounts: Array<[string, number]>;
  scope: 'all' | 'category' | 'tag';
  value: string;
  ratings: Record<string, Rating>;
  kindFilter: string | null;
  ratingFilter: string | null;
  searchQuery: string;
  selectedCategories: string[];
  selectedTags: string[];
  dueCount: number;
  onScopeChange: (scope: 'all' | 'category' | 'tag', value?: string) => void;
  onStartStudy: (index: number) => void;
  onStartSession: (opts: { dueOnly: boolean; shouldShuffle: boolean; limit: number }) => void;
  onKindFilterChange: (v: string | null) => void;
  onRatingFilterChange: (v: string | null) => void;
  onSearchChange: (q: string) => void;
  onSelectedCategoriesChange: (ids: string[]) => void;
  onSelectedTagsChange: (ids: string[]) => void;
  onAddFlashcard?: (noteId: string) => void;
  onDeleteFlashcard?: (cardId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [addPrompt, setAddPrompt] = useState('');
  const [addLesson, setAddLesson] = useState('');
  const [addKind, setAddKind] = useState('concept');
  const [addNoteId, setAddNoteId] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; prompt: string } | null>(null);

  const kindGroups = useMemo(() => {
    const g: Record<string, number> = {};
    for (const card of scopedCards) g[card.kind] = (g[card.kind] || 0) + 1;
    return g;
  }, [scopedCards]);

  const ratingGroups = useMemo(() => {
    const g: Record<string, number> = {};
    for (const card of scopedCards) {
      const r = card.reviewData?.lastRating;
      if (r) g[r] = (g[r] || 0) + 1;
    }
    return g;
  }, [scopedCards]);

  const kindFilteredCards = useMemo(
    () => kindFilter ? scopedCards.filter((c) => c.kind === kindFilter) : scopedCards,
    [scopedCards, kindFilter],
  );

  const reviewed = useMemo(
    () => kindFilteredCards.filter((c) => ratings[c.id]).length,
    [kindFilteredCards, ratings],
  );
  const totalCards = kindFilter ? kindFilteredCards.length : scopedCards.length;
  const progress = kindFilteredCards.length ? Math.round((reviewed / kindFilteredCards.length) * 100) : 0;

  const catOptions = useMemo(
    () => categories.map((c) => ({ id: c.name, label: c.name, count: scopedCards.filter((s) => s.category === c.name).length })),
    [categories, scopedCards],
  );
  const tagOptions = useMemo(
    () => tagCounts.map(([t]) => ({ id: t, label: t, count: scopedCards.filter((s) => s.tags.includes(t)).length })),
    [tagCounts, scopedCards],
  );

  async function handleCreateFlashcard() {
    if (!addPrompt.trim() || !addLesson.trim()) return;
    const noteId = addNoteId || notes[0]?.id || '';
    if (!noteId) return;
    try {
      await createFlashcard({ noteId, prompt: addPrompt.trim(), lesson: addLesson.trim(), kind: addKind });
      setAdding(false);
      setAddPrompt('');
      setAddLesson('');
      setAddKind('concept');
    } catch (e) {
      console.error('Failed to create flashcard', e);
    }
  }

  const scopeDescription = kindFilter
    ? `${KIND_LABEL[kindFilter]} · ${kindFilteredCards.length} card${kindFilteredCards.length !== 1 ? 's' : ''}`
    : scope === 'category' && value
      ? `${value} · ${scopedCards.length} card${scopedCards.length !== 1 ? 's' : ''}`
      : scope === 'tag' && value
        ? `#${value} · ${scopedCards.length} card${scopedCards.length !== 1 ? 's' : ''}`
        : `${flashcards.length} card${flashcards.length !== 1 ? 's' : ''}`;

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
        {totalCards > 0 && (
          <div className="fc-browse-meta">
            <div className="fc-browse-progress">
              <div className="fc-bar-track">
                <div className="fc-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <span>{reviewed}/{totalCards} reviewed</span>
            </div>
            <button className="fc-start-btn" onClick={() => setShowDialog(true)} disabled={totalCards === 0}>
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
        <div className="fc-filter-controls">
          <div className="fc-search-box">
            <span className="fc-search-icon">⌕</span>
            <input
              type="text"
              placeholder="Search cards…"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button className="fc-search-clear" onClick={() => onSearchChange('')}>✕</button>
            )}
          </div>
          <MultiSelectDropdown
            label="Category"
            items={catOptions}
            selected={selectedCategories}
            onChange={onSelectedCategoriesChange}
          />
          <MultiSelectDropdown
            label="Tag"
            items={tagOptions}
            selected={selectedTags}
            onChange={onSelectedTagsChange}
          />
        </div>
      </div>

      {(selectedCategories.length > 0 || selectedTags.length > 0) && (
        <div className="fc-active-filters">
          {selectedCategories.map((cat) => (
            <span key={cat} className="fc-filter-chip">
              {cat}
              <button onClick={() => onSelectedCategoriesChange(selectedCategories.filter((c) => c !== cat))}>✕</button>
            </span>
          ))}
          {selectedTags.map((tag) => (
            <span key={tag} className="fc-filter-chip">
              #{tag}
              <button onClick={() => onSelectedTagsChange(selectedTags.filter((t) => t !== tag))}>✕</button>
            </span>
          ))}
          {(selectedCategories.length + selectedTags.length) > 1 && (
            <button className="fc-filter-clear" onClick={() => { onSelectedCategoriesChange([]); onSelectedTagsChange([]); }}>
              Clear all
            </button>
          )}
        </div>
      )}

      {kindFilteredCards.length === 0 ? (
        <div className="empty">
          {kindFilter
            ? `No "${KIND_LABEL[kindFilter]}" flashcards.`
            : notes.length
              ? 'No flashcards for this filter.'
              : 'Add notes first — flashcards are generated from saved notes.'}
        </div>
      ) : (
        <>
          <div className="fc-kind-bar">
            {Object.entries(KIND_COLOR)
              .filter(([k]) => kindGroups[k])
              .map(([kind, color]) => (
                <button
                  key={kind}
                  className={`fc-kind-chip${kindFilter === kind ? ' active' : ''}`}
                  style={{ '--kc': color } as React.CSSProperties}
                  onClick={() => onKindFilterChange(kindFilter === kind ? null : kind)}
                >
                  <span className="fc-dot" style={{ background: color }} />
                  <span>{KIND_LABEL[kind]}</span>
                  <em>{kindGroups[kind]}</em>
                </button>
              ))}
            {kindFilter && (
              <button className="fc-kind-chip fc-kind-clear" onClick={() => onKindFilterChange(null)}>
                Clear filter ✕
              </button>
            )}
          </div>

          <div className="fc-rating-bar">
            {(['again', 'hard', 'good'] as const).map((rating) => {
              const color = RATING_COLOR[rating];
              const count = ratingGroups[rating] ?? 0;
              return (
                <button
                  key={rating}
                  className={`fc-rating-chip${ratingFilter === rating ? ' active' : ''}`}
                  style={{ '--rc': color } as React.CSSProperties}
                  onClick={() => onRatingFilterChange(ratingFilter === rating ? null : rating)}
                >
                  <span className="fc-dot" style={{ background: color }} />
                  <span>{RATING_LABEL[rating]}</span>
                  <em>{count}</em>
                </button>
              );
            })}
            {ratingFilter && (
              <button className="fc-rating-chip fc-rating-clear" onClick={() => onRatingFilterChange(null)}>
                Clear ✕
              </button>
            )}
          </div>

          <div className="fc-grid">
            {kindFilteredCards.map((card, index) => {
              const kc = KIND_COLOR[card.kind] || 'var(--accent)';
              const rating = ratings[card.id];
              const due = isCardDue(card);
              const dueLabel = getDueLabel(card);
              return (
                <div key={card.id} className={`fc-tile-wrap${rating ? ` r-${rating}` : ''}`}>
                  <button
                    className={`fc-tile${rating ? ` r-${rating}` : ''}`}
                    onClick={() => onStartStudy(index)}
                    style={{ '--kc': kc } as React.CSSProperties}
                  >
                    <div className="fc-tile-kind">
                      <span className="fc-dot" style={{ background: kc }} />
                      <span style={{ color: kc }}>{KIND_LABEL[card.kind] || card.kind}</span>
                      {card.isUserCreated && <span className="fc-user-badge" title="User-created">✎</span>}
                      {rating && <span className={`fc-tile-r ${rating}`}>{RATING_LABEL[rating] || rating}</span>}
                      {dueLabel && <span className={`fc-due-badge ${due ? 'overdue' : ''}`}>{dueLabel}</span>}
                    </div>
                    <div className="fc-tile-q">{card.prompt}</div>
                    <div className="fc-tile-src">{card.noteTitle}</div>
                  </button>
                  {onDeleteFlashcard && (
                    <button
                      className="fc-tile-remove"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: card.id, prompt: card.prompt }); }}
                      title="Remove flashcard"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="fc-toolbar">
        {onAddFlashcard && (
          <button className="fc-add-btn" onClick={() => setAdding(!adding)}>
            {adding ? 'Cancel' : '+ Add flashcard'}
          </button>
        )}
      </div>

      {adding && onAddFlashcard && (
        <div className="fc-add-modal">
          <h3>New flashcard</h3>
          <select value={addNoteId} onChange={(e) => setAddNoteId(e.target.value)} className="fc-add-select">
            <option value="">Select a note…</option>
            {notes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
          </select>
          <select value={addKind} onChange={(e) => setAddKind(e.target.value)} className="fc-add-select">
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input
            className="fc-add-input"
            placeholder="Prompt / question"
            value={addPrompt}
            onChange={(e) => setAddPrompt(e.target.value)}
          />
          <textarea
            className="fc-add-textarea"
            placeholder="Lesson / answer"
            value={addLesson}
            onChange={(e) => setAddLesson(e.target.value)}
            rows={3}
          />
          <button className="fc-start-btn" onClick={handleCreateFlashcard} disabled={!addPrompt.trim() || !addLesson.trim()}>
            Save flashcard
          </button>
        </div>
      )}

      {showDialog && (
        <SessionDialog
          totalCards={totalCards}
          dueCount={dueCount}
          scopeDescription={scopeDescription}
          onCancel={() => setShowDialog(false)}
          onStart={(opts) => { setShowDialog(false); onStartSession(opts); }}
        />
      )}

      {deleteTarget && onDeleteFlashcard && (
        <div className="fc-dialog-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="fc-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 className="fc-dialog-title">Delete flashcard?</h2>
            <p className="fc-delete-prompt">{deleteTarget.prompt}</p>
            <div className="fc-dialog-footer">
              <div />
              <div className="fc-dialog-actions">
                <button className="fc-btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button className="fc-delete-btn" onClick={() => { onDeleteFlashcard(deleteTarget.id); setDeleteTarget(null); }}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionDialog({
  totalCards,
  dueCount,
  scopeDescription,
  onCancel,
  onStart,
}: {
  totalCards: number;
  dueCount: number;
  scopeDescription: string;
  onCancel: () => void;
  onStart: (opts: { dueOnly: boolean; shouldShuffle: boolean; limit: number }) => void;
}) {
  const [dueOnly, setDueOnly] = useState(true);
  const [shouldShuffle, setShouldShuffle] = useState(true);
  const [limit, setLimit] = useState(0);

  const sessionCount = dueOnly ? dueCount : totalCards;
  const capped = limit > 0 && limit < sessionCount ? limit : sessionCount;

  return (
    <div className="fc-dialog-overlay" onClick={onCancel}>
      <div className="fc-dialog" onClick={(e) => e.stopPropagation()}>
        <h2 className="fc-dialog-title">Session options</h2>

        <div className="fc-dialog-section">
          <div className="fc-dialog-scope">{scopeDescription}</div>
        </div>

        <div className="fc-dialog-section">
          <label className="fc-dialog-row">
            <span className="fc-dialog-label">Due cards only</span>
            <span className="fc-dialog-hint">{dueCount} card{dueCount !== 1 ? 's' : ''} need review</span>
            <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
            <span className="fc-toggle-track" />
          </label>
        </div>

        <div className="fc-dialog-section">
          <label className="fc-dialog-row">
            <span className="fc-dialog-label">Randomize order</span>
            <span className="fc-dialog-hint">Shuffle cards for varied practice</span>
            <input type="checkbox" checked={shouldShuffle} onChange={(e) => setShouldShuffle(e.target.checked)} />
            <span className="fc-toggle-track" />
          </label>
        </div>

        <div className="fc-dialog-section">
          <span className="fc-dialog-label">Cards to study</span>
          <div className="fc-dialog-limits">
            {CARD_LIMITS.map((n) => (
              <button
                key={n}
                className={`fc-limit-btn${limit === n ? ' active' : ''}`}
                onClick={() => setLimit(limit === n ? 0 : n)}
              >
                {n}
              </button>
            ))}
            <button
              className={`fc-limit-btn${limit === 0 ? ' active' : ''}`}
              onClick={() => setLimit(0)}
            >
              All
            </button>
          </div>
        </div>

        <div className="fc-dialog-footer">
          <span className="fc-dialog-count">
            {capped} card{capped !== 1 ? 's' : ''}
          </span>
          <div className="fc-dialog-actions">
            <button className="fc-btn-ghost" onClick={onCancel}>Cancel</button>
            <button className="fc-start-btn" onClick={() => onStart({ dueOnly, shouldShuffle, limit })}>
              Start
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
