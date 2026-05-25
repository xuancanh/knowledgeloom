import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Flashcard } from '../../types';
import { KIND_COLOR, KIND_LABEL, RATING_LABEL } from './constants';
import type { Rating } from './types';
import { reviewFlashcard } from '../../api';

export function FlashcardStudy({
  cards,
  index,
  flipped,
  slideDir,
  ratings,
  ratingCounts,
  progress,
  onFlip,
  onRate,
  onGoToCard,
  onExit,
  onFinishEarly,
  onOpenNote,
}: {
  cards: Flashcard[];
  index: number;
  flipped: boolean;
  slideDir: 'left' | 'right' | null;
  ratings: Record<string, Rating>;
  ratingCounts: { again: number; hard: number; good: number };
  progress: number;
  onFlip: () => void;
  onRate: (rating: Rating) => void;
  onGoToCard: (index: number, dir: 'left' | 'right') => void;
  onExit: () => void;
  onFinishEarly?: () => void;
  onOpenNote: (id: string) => void;
}) {
  const { t } = useTranslation();
  const activeCard = cards[index] ?? null;
  const touchStartX = useRef<number | null>(null);

  function formatNextReview(nextReviewAt: string | null): string {
    if (!nextReviewAt) return '';
    const due = new Date(nextReviewAt);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);
    if (diffHours <= 0) return t('flashcards.dueNow');
    if (diffHours < 24) return t('flashcards.nextHours', { count: diffHours });
    return t('flashcards.nextDays', { count: diffDays });
  }

  const rateAndAdvance = useCallback(
    (rating: Rating) => {
      // Submit review to backend for spaced repetition
      if (activeCard) {
        reviewFlashcard(activeCard.id, {
          rating,
          noteId: activeCard.noteId,
          isUserCard: activeCard.isUserCreated,
        }).catch((e) => console.error('Review submission failed', e));
      }
      onRate(rating);
    },
    [onRate, activeCard],
  );

  const goTo = useCallback(
    (nextIndex: number, dir: 'left' | 'right') => {
      onGoToCard(nextIndex, dir);
    },
    [onGoToCard],
  );

  useEffect(() => {
    if (!activeCard) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.key === ' ' || e.key === 'Enter') && !flipped) {
        e.preventDefault();
        onFlip();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onExit();
        return;
      }
      if (flipped) {
        if (e.key === '1') { e.preventDefault(); rateAndAdvance('again'); return; }
        if (e.key === '2') { e.preventDefault(); rateAndAdvance('hard'); return; }
        if (e.key === '3') { e.preventDefault(); rateAndAdvance('good'); return; }
      }
      if (e.key === 'ArrowRight' && index < cards.length - 1) {
        e.preventDefault();
        goTo(index + 1, 'left');
      }
      if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        goTo(index - 1, 'right');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, index, cards.length, activeCard, onFlip, onExit, rateAndAdvance, goTo]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || !activeCard) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 20) {
      if (!flipped) onFlip();
      return;
    }
    if (dx < -50 && index < cards.length - 1) goTo(index + 1, 'left');
    else if (dx > 50 && index > 0) goTo(index - 1, 'right');
  }

  if (!activeCard) return null;

  const kindColor = KIND_COLOR[activeCard.kind] || 'var(--accent)';
  const existingRating = ratings[activeCard.id];
  const nextReviewLabel = formatNextReview(activeCard.reviewData?.nextReviewAt ?? null);

  return (
    <div className="fc-page fc-study">
      <div className="fc-study-bar">
        <button className="fc-back-btn" onClick={onExit}>{t('flashcards.backCollection')}</button>
        <div className="fc-bar-center">
          <div className="fc-bar-track">
            <div className="fc-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="fc-bar-label">{index + 1} / {cards.length}</span>
        </div>
        <div className="fc-live-counts">
          {ratingCounts.again > 0 && <span className="fc-lc again">{ratingCounts.again}</span>}
          {ratingCounts.hard > 0 && <span className="fc-lc hard">{ratingCounts.hard}</span>}
          {ratingCounts.good > 0 && <span className="fc-lc good">{ratingCounts.good}</span>}
        </div>
      </div>

      <div className="fc-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {index + 2 < cards.length && <div className="fc-ghost g2" aria-hidden />}
        {index + 1 < cards.length && <div className="fc-ghost g1" aria-hidden />}

        <div key={activeCard.id} className={`fc-scene${slideDir ? ` slide-${slideDir}` : ''}`}>
          <div
            className={`fc-card${flipped ? ' flipped' : ''}`}
            onClick={() => { if (!flipped) onFlip(); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!flipped) onFlip(); } }}
            aria-label={flipped ? t('flashcards.revealCard') : t('flashcards.revealCard')}
          >
            <div className="fc-face fc-front">
              <div className="fc-kind-row" style={{ color: kindColor }}>
                <span className="fc-dot" style={{ background: kindColor }} />
                {KIND_LABEL[activeCard.kind] || activeCard.kind}
                {activeCard.isUserCreated && <span className="fc-user-badge" title={t('flashcards.userCreated')}>✎</span>}
                {nextReviewLabel && <span className={`fc-next-review ${activeCard.reviewData?.nextReviewAt && new Date(activeCard.reviewData.nextReviewAt) <= new Date() ? 'overdue' : ''}`}>{nextReviewLabel}</span>}
              </div>
              <div className="fc-front-body">
                <h2 className="fc-prompt">{activeCard.prompt}</h2>
              </div>
              <div className="fc-front-foot">
                <div className="fc-note-ref">
                  {activeCard.noteTitle} · {activeCard.category}
                </div>
                <div className="fc-hint-pill">
                  <kbd>Space</kbd> {t('flashcards.revealCard').toLowerCase()}
                </div>
              </div>
            </div>

            <div className="fc-face fc-back" aria-hidden={!flipped}>
              <div className="fc-kind-row" style={{ color: kindColor }}>
                <span className="fc-dot" style={{ background: kindColor }} />
                {KIND_LABEL[activeCard.kind] || activeCard.kind}
              </div>
              <div className="fc-back-body">
                <h3 className="fc-back-q">{activeCard.prompt}</h3>
                <div className="fc-sep" />
                <p className="fc-lesson">{activeCard.lesson}</p>
              </div>
              <div className="fc-back-foot">
                <button
                  className="fc-note-link"
                  onClick={(e) => { e.stopPropagation(); onOpenNote(activeCard.noteId); }}
                >
                  {activeCard.noteTitle} ↗
                </button>
                <span className="fc-note-cat">{activeCard.category}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="fc-actions">
          {!flipped ? (
            <div className="fc-reveal-area">
              {existingRating && (
                <div className={`fc-prev-badge ${existingRating}`}>
                  {t('flashcards.previously', { rating: RATING_LABEL[existingRating] || existingRating })}
                </div>
              )}
              {activeCard.reviewData && (
                <div className="fc-sr-info">
                  <span>EF {activeCard.reviewData.easeFactor}</span>
                  <span>·</span>
                  <span>Interval {activeCard.reviewData.interval}d</span>
                  <span>·</span>
                  <span>Reps {activeCard.reviewData.repetitions}</span>
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
                <button className="fc-rate again" onClick={() => rateAndAdvance('again')}>
                  <span>{RATING_LABEL['again']}</span>
                  <kbd>1</kbd>
                </button>
                <button className="fc-rate hard" onClick={() => rateAndAdvance('hard')}>
                  <span>{RATING_LABEL['hard']}</span>
                  <kbd>2</kbd>
                </button>
                <button className="fc-rate good" onClick={() => rateAndAdvance('good')}>
                  <span>{RATING_LABEL['good']}</span>
                  <kbd>3</kbd>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="fc-nav-row">
          <button className="fc-nav-btn" onClick={() => goTo(index - 1, 'right')} disabled={index === 0}>
            {t('flashcards.prevCard')}
          </button>
          <span className="fc-nav-hint">
            {t('flashcards.navigate')}
          </span>
          <span className="fc-nav-end">
            {onFinishEarly && (
              <button className="fc-nav-finish" onClick={onFinishEarly}>
                {t('flashcards.finishEarly')}
              </button>
            )}
          </span>
          <button className="fc-nav-btn" onClick={() => goTo(index + 1, 'left')} disabled={index === cards.length - 1}>
            {t('flashcards.nextCard')}
          </button>
        </div>
      </div>
    </div>
  );
}
