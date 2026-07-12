import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Flashcard, KnowledgeNote } from '../../types';
import type { UiCategory } from '../../lib/view';
import { KIND_COLOR, KIND_LABEL, RATING_LABEL, RATING_COLOR } from './constants';
import type { Rating } from './types';
import { createFlashcard, reviewFlashcard } from '../../api';
import { MultiSelectDropdown } from '../MultiSelectDropdown';

function isCardDue(card: Flashcard): boolean {
  if (!card.reviewData?.nextReviewAt) return true;
  return new Date(card.reviewData.nextReviewAt) <= new Date();
}

function getDueLabel(card: Flashcard, t: (key: string, opts?: Record<string, unknown>) => string): string | null {
  if (!card.reviewData?.nextReviewAt) return null;
  const due = new Date(card.reviewData.nextReviewAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);
  if (diffHours <= 0) return t('flashcards.dueNow');
  if (diffHours < 24) return t('flashcards.dueHours', { count: diffHours });
  return t('flashcards.dueDays', { count: diffDays });
}

const CARD_LIMITS = [10, 20, 50] as const;

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
  onStartSession,
  onRated,
  onOpenNote,
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
  onStartSession: (opts: { dueOnly: boolean; shouldShuffle: boolean; limit: number }) => void;
  onRated: (cardId: string, rating: Rating) => void;
  onOpenNote: (id: string) => void;
  onKindFilterChange: (v: string | null) => void;
  onRatingFilterChange: (v: string | null) => void;
  onSearchChange: (q: string) => void;
  onSelectedCategoriesChange: (ids: string[]) => void;
  onSelectedTagsChange: (ids: string[]) => void;
  onAddFlashcard?: (noteId: string) => void;
  onDeleteFlashcard?: (cardId: string) => void;
}) {
  const { t } = useTranslation();
  const [previewCard, setPreviewCard] = useState<Flashcard | null>(null);
  const [previewFlipped, setPreviewFlipped] = useState(false);
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
    ? `${KIND_LABEL[kindFilter]} · ${kindFilteredCards.length}`
    : scope === 'category' && value
      ? `${value} · ${scopedCards.length}`
      : scope === 'tag' && value
        ? `#${value} · ${scopedCards.length}`
        : `${flashcards.length}`;

  return (
    <div className="fc-page">
      <div className="crumbs">
        <span>{t('common.desk')}</span><span className="sep">/</span><span>{t('flashcards.title')}</span>
      </div>

      <div className="fc-browse-head">
        <div className="fc-browse-title">
          <h1>{t('flashcards.title')}</h1>
          <p>{t('flashcards.subtitle')}</p>
        </div>
        {totalCards > 0 && (
          <div className="fc-browse-meta">
            <div className="fc-browse-progress">
              <div className="fc-bar-track">
                <div className="fc-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <span>{t('flashcards.reviewedCount', { reviewed, total: totalCards })}</span>
            </div>
            <button className="fc-start-btn" onClick={() => setShowDialog(true)} disabled={totalCards === 0}>
              {t('flashcards.startSession')}
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
            {t('common.all')} · {flashcards.length}
          </button>
        </div>
        <div className="fc-filter-controls">
          <div className="fc-search-box">
            <span className="fc-search-icon">⌕</span>
            <input
              type="text"
              placeholder={t('flashcards.searchCards')}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button className="fc-search-clear" onClick={() => onSearchChange('')} aria-label={t('common.clear')}>✕</button>
            )}
          </div>
          <MultiSelectDropdown
            label={t('common.categories')}
            items={catOptions}
            selected={selectedCategories}
            onChange={onSelectedCategoriesChange}
          />
          <MultiSelectDropdown
            label={t('common.tags')}
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
              <button onClick={() => onSelectedCategoriesChange(selectedCategories.filter((c) => c !== cat))} aria-label={t('common.removeFilter', { filter: cat })}>✕</button>
            </span>
          ))}
          {selectedTags.map((tag) => (
            <span key={tag} className="fc-filter-chip">
              #{tag}
              <button onClick={() => onSelectedTagsChange(selectedTags.filter((t) => t !== tag))} aria-label={t('common.removeFilter', { filter: tag })}>✕</button>
            </span>
          ))}
          {(selectedCategories.length + selectedTags.length) > 1 && (
            <button className="fc-filter-clear" onClick={() => { onSelectedCategoriesChange([]); onSelectedTagsChange([]); }}>
              {t('common.clearAll')}
            </button>
          )}
        </div>
      )}

      {kindFilteredCards.length === 0 ? (
        <div className="empty">
          {kindFilter
            ? t('flashcards.noKindCards', { kind: KIND_LABEL[kindFilter] })
            : notes.length
              ? t('flashcards.noFilterCards')
              : t('flashcards.noCards')}
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
                {t('flashcards.clearFilter')}
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
                {t('common.clear')} ✕
              </button>
            )}
          </div>

          <div className="fc-grid">
            {kindFilteredCards.map((card) => {
              const kc = KIND_COLOR[card.kind] || 'var(--accent)';
              const rating = ratings[card.id];
              const due = isCardDue(card);
              return (
                <div key={card.id} className={`fc-tile-wrap${rating ? ` r-${rating}` : ''}`}>
                  <button
                    className={`fc-tile${rating ? ` r-${rating}` : ''}`}
                    onClick={() => { setPreviewCard(card); setPreviewFlipped(false); }}
                    style={{ '--kc': kc } as React.CSSProperties}
                  >
                    <div className="fc-tile-kind">
                      <span className="fc-dot" style={{ background: kc }} />
                      <span style={{ color: kc }}>{KIND_LABEL[card.kind] || card.kind}</span>
                      {card.isUserCreated && <span className="fc-user-badge" title={t('flashcards.userCreated')}>✎</span>}
                      {rating && <span className={`fc-tile-r ${rating}`}>{RATING_LABEL[rating] || rating}</span>}
                      {(() => { const lbl = getDueLabel(card, t); return lbl && <span className={`fc-due-badge ${due ? 'overdue' : ''}`}>{lbl}</span>; })()}
                    </div>
                    <div className="fc-tile-q">{card.prompt}</div>
                    <div className="fc-tile-src">{card.noteTitle}</div>
                  </button>
                  {onDeleteFlashcard && (
                    <button
                      className="fc-tile-remove"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: card.id, prompt: card.prompt }); }}
                      title={t('flashcards.removeFlashcard')}
                      aria-label={t('flashcards.removeFlashcard')}
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
            {adding ? t('common.cancel') : t('flashcards.addFlashcard')}
          </button>
        )}
      </div>

      {adding && onAddFlashcard && (
        <div className="fc-add-modal">
          <h3>{t('flashcards.newFlashcard')}</h3>
          <select value={addNoteId} onChange={(e) => setAddNoteId(e.target.value)} className="fc-add-select">
            <option value="">{t('flashcards.selectNote')}</option>
            {notes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
          </select>
          <select value={addKind} onChange={(e) => setAddKind(e.target.value)} className="fc-add-select">
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input
            className="fc-add-input"
            placeholder={t('flashcards.promptPlaceholder')}
            value={addPrompt}
            onChange={(e) => setAddPrompt(e.target.value)}
          />
          <textarea
            className="fc-add-textarea"
            placeholder={t('flashcards.lessonPlaceholder')}
            value={addLesson}
            onChange={(e) => setAddLesson(e.target.value)}
            rows={3}
          />
          <button className="fc-start-btn" onClick={handleCreateFlashcard} disabled={!addPrompt.trim() || !addLesson.trim()}>
            {t('flashcards.saveFlashcard')}
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
            <h2 className="fc-dialog-title">{t('flashcards.deleteFlashcard')}</h2>
            <p className="fc-delete-prompt">{deleteTarget.prompt}</p>
            <div className="fc-dialog-footer">
              <div />
              <div className="fc-dialog-actions">
                <button className="fc-btn-ghost" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</button>
                <button className="fc-delete-btn" onClick={() => { onDeleteFlashcard(deleteTarget.id); setDeleteTarget(null); }}>{t('common.delete')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewCard && (
        <CardPreviewModal
          card={previewCard}
          flipped={previewFlipped}
          existingRating={ratings[previewCard.id]}
          onFlip={() => setPreviewFlipped(true)}
          onRate={async (rating) => {
            await reviewFlashcard(previewCard.id, {
              rating,
              noteId: previewCard.noteId,
              isUserCard: previewCard.isUserCreated,
            }).catch((e) => console.error('Review failed', e));
            onRated(previewCard.id, rating);
            setPreviewCard(null);
          }}
          onClose={() => setPreviewCard(null)}
          onOpenNote={onOpenNote}
        />
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
  const { t } = useTranslation();
  const [dueOnly, setDueOnly] = useState(true);
  const [shouldShuffle, setShouldShuffle] = useState(true);
  const [limit, setLimit] = useState(0);

  const sessionCount = dueOnly ? dueCount : totalCards;
  const capped = limit > 0 && limit < sessionCount ? limit : sessionCount;

  return (
    <div className="fc-dialog-overlay" onClick={onCancel}>
      <div className="fc-dialog" onClick={(e) => e.stopPropagation()}>
        <h2 className="fc-dialog-title">{t('flashcards.sessionOptions')}</h2>

        <div className="fc-dialog-section">
          <div className="fc-dialog-scope">{scopeDescription}</div>
        </div>

        <div className="fc-dialog-section">
          <label className="fc-dialog-row">
            <span className="fc-dialog-label">{t('flashcards.dueOnly')}</span>
            <span className="fc-dialog-hint">{t('flashcards.dueNeedReview', { count: dueCount })}</span>
            <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
            <span className="fc-toggle-track" />
          </label>
        </div>

        <div className="fc-dialog-section">
          <label className="fc-dialog-row">
            <span className="fc-dialog-label">{t('flashcards.randomize')}</span>
            <span className="fc-dialog-hint">{t('flashcards.shuffleHint')}</span>
            <input type="checkbox" checked={shouldShuffle} onChange={(e) => setShouldShuffle(e.target.checked)} />
            <span className="fc-toggle-track" />
          </label>
        </div>

        <div className="fc-dialog-section">
          <span className="fc-dialog-label">{t('flashcards.cardsToStudy')}</span>
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
              {t('common.all')}
            </button>
          </div>
        </div>

        <div className="fc-dialog-footer">
          <span className="fc-dialog-count">
            {t('flashcards.sessionSummary', { count: capped, scope: '' }).split(' · ')[0]}
          </span>
          <div className="fc-dialog-actions">
            <button className="fc-btn-ghost" onClick={onCancel}>{t('common.cancel')}</button>
            <button className="fc-start-btn" onClick={() => onStart({ dueOnly, shouldShuffle, limit })}>
              {t('common.start')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardPreviewModal({
  card,
  flipped,
  existingRating,
  onFlip,
  onRate,
  onClose,
  onOpenNote,
}: {
  card: Flashcard;
  flipped: boolean;
  existingRating?: Rating;
  onFlip: () => void;
  onRate: (r: Rating) => void;
  onClose: () => void;
  onOpenNote: (id: string) => void;
}) {
  const { t } = useTranslation();
  const kindColor = KIND_COLOR[card.kind] || 'var(--accent)';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if ((e.key === ' ' || e.key === 'Enter') && !flipped) { e.preventDefault(); onFlip(); return; }
      if (flipped) {
        if (e.key === '1') { e.preventDefault(); onRate('again'); }
        if (e.key === '2') { e.preventDefault(); onRate('hard'); }
        if (e.key === '3') { e.preventDefault(); onRate('good'); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, onFlip, onRate, onClose]);

  return (
    <div className="fc-dialog-overlay" onClick={onClose}>
      <div className="fc-preview-modal" onClick={(e) => e.stopPropagation()}>
        <button className="fc-preview-close" onClick={onClose} aria-label={t('common.close')}>✕</button>

        <div className="fc-preview-stage">
          <div className="fc-scene">
            <div
              className={`fc-card${flipped ? ' flipped' : ''}`}
              onClick={() => { if (!flipped) onFlip(); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!flipped) onFlip(); } }}
            >
              <div className="fc-face fc-front">
                <div className="fc-kind-row" style={{ color: kindColor }}>
                  <span className="fc-dot" style={{ background: kindColor }} />
                  {KIND_LABEL[card.kind] || card.kind}
                  {card.isUserCreated && <span className="fc-user-badge" title={t('flashcards.userCreated')}>✎</span>}
                </div>
                <div className="fc-front-body">
                  <h2 className="fc-prompt">{card.prompt}</h2>
                </div>
                <div className="fc-front-foot">
                  <div className="fc-note-ref">{card.noteTitle} · {card.category}</div>
                  <div className="fc-hint-pill">
                    <kbd>Space</kbd> {t('flashcards.revealCard').toLowerCase()}
                  </div>
                </div>
              </div>

              <div className="fc-face fc-back" aria-hidden={!flipped}>
                <div className="fc-kind-row" style={{ color: kindColor }}>
                  <span className="fc-dot" style={{ background: kindColor }} />
                  {KIND_LABEL[card.kind] || card.kind}
                </div>
                <div className="fc-back-body">
                  <h3 className="fc-back-q">{card.prompt}</h3>
                  <div className="fc-sep" />
                  <p className="fc-lesson">{card.lesson}</p>
                </div>
                <div className="fc-back-foot">
                  <button
                    className="fc-note-link"
                    onClick={(e) => { e.stopPropagation(); onOpenNote(card.noteId); onClose(); }}
                  >
                    {card.noteTitle} ↗
                  </button>
                  <span className="fc-note-cat">{card.category}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="fc-preview-actions">
          {!flipped ? (
            <div className="fc-reveal-area">
              {existingRating && (
                <div className={`fc-prev-badge ${existingRating}`}>
                  {t('flashcards.previously', { rating: RATING_LABEL[existingRating] || existingRating })}
                </div>
              )}
              <button className="fc-reveal-btn" onClick={onFlip}>
                {t('flashcards.revealCard')} <kbd>Space</kbd>
              </button>
            </div>
          ) : (
            <div className="fc-rating-area" aria-live="polite">
              <span className="fc-rate-prompt">{t('flashcards.howWell')}</span>
              <div className="fc-rate-row">
                <button className="fc-rate again" onClick={() => onRate('again')}>
                  <span>{RATING_LABEL['again']}</span>
                  <kbd>1</kbd>
                </button>
                <button className="fc-rate hard" onClick={() => onRate('hard')}>
                  <span>{RATING_LABEL['hard']}</span>
                  <kbd>2</kbd>
                </button>
                <button className="fc-rate good" onClick={() => onRate('good')}>
                  <span>{RATING_LABEL['good']}</span>
                  <kbd>3</kbd>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
