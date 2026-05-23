import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Flashcard, KnowledgeNote } from '../../types';
import type { UiCategory } from '../../lib/view';
import { FlashcardBrowse } from './FlashcardBrowse';
import { FlashcardStudy } from './FlashcardStudy';
import { FlashcardDone } from './FlashcardDone';
import type { Rating } from './types';

/**
 * Flashcards page coordinator — manages study session state.
 *
 * Three render branches (browse / study / done) are delegated to
 * sub-components: FlashcardBrowse, FlashcardStudy, FlashcardDone.
 * State: study session index, ratings, flip state, slide animation.
 */
export default function FlashcardsPage({
  flashcards,
  notes,
  categories,
  tagCounts,
  scope,
  value,
  onScopeChange,
  onOpenNote,
}: {
  flashcards: Flashcard[];
  notes: KnowledgeNote[];
  categories: UiCategory[];
  tagCounts: Array<[string, number]>;
  scope: 'all' | 'category' | 'tag';
  value: string;
  onScopeChange: (scope: 'all' | 'category' | 'tag', value?: string) => void;
  onOpenNote: (id: string) => void;
}) {
  const [studying, setStudying] = useState(false);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [studyIndex, setStudyIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [sessionDone, setSessionDone] = useState(false);
  const slideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scopedCards = useMemo(() => {
    if (scope === 'category' && value) return flashcards.filter((c) => c.category === value);
    if (scope === 'tag' && value) return flashcards.filter((c) => c.tags.includes(value));
    return flashcards;
  }, [flashcards, scope, value]);

  const safeIndex = Math.min(studyIndex, Math.max(0, scopedCards.length - 1));

  const reviewed = useMemo(
    () => scopedCards.filter((c) => ratings[c.id]).length,
    [scopedCards, ratings],
  );
  const progress = scopedCards.length ? Math.round((reviewed / scopedCards.length) * 100) : 0;

  const ratingCounts = useMemo(() => {
    const c = { again: 0, hard: 0, good: 0 };
    for (const r of Object.values(ratings)) if (r in c) c[r as Rating]++;
    return c;
  }, [ratings]);

  const scopeLabel =
    scope === 'category' && value
      ? value
      : scope === 'tag' && value
        ? `#${value}`
        : 'All cards';

  useEffect(() => {
    // Reset study state when scope or filter value changes (reacts to URL navigation)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStudying(false);
    setStudyIndex(0);
    setFlipped(false);
    setSlideDir(null);
    setSessionDone(false);
    setRatings({});
  }, [scope, value]);

  const clearTimer = useCallback(() => {
    if (slideTimer.current) clearTimeout(slideTimer.current);
  }, []);

  const goToCard = useCallback((index: number, dir: 'left' | 'right') => {
    clearTimer();
    setSlideDir(dir);
    slideTimer.current = setTimeout(() => {
      setStudyIndex(index);
      setFlipped(false);
      setSlideDir(null);
    }, 250);
  }, [clearTimer]);

  const rateAndAdvance = useCallback(
    (rating: Rating) => {
      const curIndex = safeIndex;
      const total = scopedCards.length;
      const activeCard = scopedCards[curIndex];
      if (!activeCard) return;
      clearTimer();
      setRatings((prev) => ({ ...prev, [activeCard.id]: rating }));
      if (curIndex + 1 >= total) {
        setSlideDir('left');
        slideTimer.current = setTimeout(() => {
          setSessionDone(true);
          setSlideDir(null);
        }, 280);
      } else {
        setSlideDir('left');
        slideTimer.current = setTimeout(() => {
          setStudyIndex(curIndex + 1);
          setFlipped(false);
          setSlideDir(null);
        }, 250);
      }
    },
    [safeIndex, scopedCards, clearTimer],
  );

  function startStudy(fromIndex = 0) {
    setStudyIndex(fromIndex);
    setFlipped(false);
    setSlideDir(null);
    setSessionDone(false);
    setStudying(true);
  }

  function exitStudy() {
    setStudying(false);
    setFlipped(false);
    setSlideDir(null);
  }

  function restartSession() {
    setRatings({});
    setStudyIndex(0);
    setFlipped(false);
    setSlideDir(null);
    setSessionDone(false);
  }

  if (studying && sessionDone) {
    return (
      <FlashcardDone
        filteredLength={scopedCards.length}
        scopeLabel={scopeLabel}
        ratingCounts={ratingCounts}
        onRestart={restartSession}
        onExit={exitStudy}
      />
    );
  }

  if (studying) {
    return (
      <FlashcardStudy
        cards={scopedCards}
        index={safeIndex}
        flipped={flipped}
        slideDir={slideDir}
        ratings={ratings}
        ratingCounts={ratingCounts}
        progress={progress}
        onFlip={() => setFlipped(true)}
        onRate={rateAndAdvance}
        onGoToCard={goToCard}
        onExit={exitStudy}
        onOpenNote={onOpenNote}
      />
    );
  }

  return (
    <FlashcardBrowse
      flashcards={flashcards}
      notes={notes}
      categories={categories}
      tagCounts={tagCounts}
      scope={scope}
      value={value}
      ratings={ratings}
      onScopeChange={onScopeChange}
      onStartStudy={startStudy}
    />
  );
}
