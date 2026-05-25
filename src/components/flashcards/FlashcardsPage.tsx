import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Flashcard, KnowledgeNote } from '../../types';
import type { UiCategory } from '../../lib/view';
import { FlashcardBrowse } from './FlashcardBrowse';
import { FlashcardStudy } from './FlashcardStudy';
import { FlashcardDone } from './FlashcardDone';
import type { Rating } from './types';

function isCardDue(card: Flashcard): boolean {
  if (!card.reviewData?.nextReviewAt) return true;
  return new Date(card.reviewData.nextReviewAt) <= new Date();
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function FlashcardsPage({
  flashcards,
  notes,
  categories,
  tagCounts,
  scope,
  value,
  cardIdFromUrl,
  searchQuery,
  kindFilter,
  ratingFilter,
  selectedCategories,
  selectedTags,
  onScopeChange,
  onOpenNote,
  onAddFlashcard,
  onDeleteFlashcard,
  onFiltersChange,
}: {
  flashcards: Flashcard[];
  notes: KnowledgeNote[];
  categories: UiCategory[];
  tagCounts: Array<[string, number]>;
  scope: 'all' | 'category' | 'tag';
  value: string;
  cardIdFromUrl?: string;
  searchQuery: string;
  kindFilter: string | null;
  ratingFilter: string | null;
  selectedCategories: string[];
  selectedTags: string[];
  onScopeChange: (scope: 'all' | 'category' | 'tag', value?: string) => void;
  onOpenNote: (id: string) => void;
  onAddFlashcard?: (noteId: string) => void;
  onDeleteFlashcard?: (cardId: string) => void;
  onFiltersChange?: (updates: {
    search?: string;
    kind?: string | null;
    rating?: string | null;
    cats?: string[];
    tags?: string[];
  }) => void;
}) {
  const { t } = useTranslation();
  const [studying, setStudying] = useState(false);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [studyIndex, setStudyIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [sessionDone, setSessionDone] = useState(false);
  const [smartMode, setSmartMode] = useState(false);
  const [randomize, setRandomize] = useState(false);
  const [cardLimit, setCardLimit] = useState(0);
  const [sessionCards, setSessionCards] = useState<Flashcard[]>([]);
  const slideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setUrlCardId = useCallback((id: string | null) => {
    const base = '/flashcards';
    const params: string[] = [];
    if (scope === 'category' && value) params.push(`category=${encodeURIComponent(value)}`);
    else if (scope === 'tag' && value) params.push(`tag=${encodeURIComponent(value)}`);
    const path = id ? `${base}/${encodeURIComponent(id)}` : base;
    window.history.replaceState(null, '', params.length ? `${path}?${params.join('&')}` : path);
  }, [scope, value]);

  const scopedCards = useMemo(() => {
    let filtered = flashcards;
    if (scope === 'category' && value) filtered = filtered.filter((c) => c.category === value);
    if (scope === 'tag' && value) filtered = filtered.filter((c) => c.tags.includes(value));
    if (selectedCategories.length > 0) filtered = filtered.filter((c) => selectedCategories.includes(c.category));
    if (selectedTags.length > 0) filtered = filtered.filter((c) => c.tags.some((t) => selectedTags.includes(t)));
    if (ratingFilter) filtered = filtered.filter((c) => c.reviewData?.lastRating === ratingFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((c) => c.prompt.toLowerCase().includes(q) || c.lesson.toLowerCase().includes(q));
    }
    return filtered;
  }, [flashcards, scope, value, selectedCategories, selectedTags, ratingFilter, searchQuery]);

  const dueCount = useMemo(() => scopedCards.filter(isCardDue).length, [scopedCards]);

  const autoStartCardId = useRef(cardIdFromUrl);
  useEffect(() => {
    if (!cardIdFromUrl || studying || scopedCards.length === 0) return;
    const idx = scopedCards.findIndex((c) => c.id === cardIdFromUrl);
    if (idx >= 0) { autoStartCardId.current = undefined; startStudy(idx, undefined, true); }
  }, [cardIdFromUrl, scopedCards, studying]);

  const studyCards = sessionCards.length > 0 ? sessionCards : (() => {
    let cards = scopedCards;
    if (smartMode) cards = cards.filter(isCardDue);
    if (randomize) cards = shuffleArray(cards);
    return cards;
  })();

  const safeIndex = Math.min(studyIndex, Math.max(0, studyCards.length - 1));

  const reviewed = useMemo(
    () => (sessionCards.length > 0 ? sessionCards : scopedCards).filter((c) => ratings[c.id]).length,
    [sessionCards, scopedCards, ratings],
  );
  const displayedCards = sessionCards.length > 0 ? sessionCards.length : scopedCards.length;
  const progress = displayedCards ? Math.round((reviewed / displayedCards) * 100) : 0;

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
        : t('flashcards.allCards');

  useEffect(() => {
    setStudying(false);
    setStudyIndex(0);
    setFlipped(false);
    setSlideDir(null);
    setSessionDone(false);
    setRatings({});
    setSmartMode(false);
    setRandomize(false);
    setCardLimit(0);
    setSessionCards([]);
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
      const card = studyCards[index];
      if (card) setUrlCardId(card.id);
    }, 250);
  }, [clearTimer, studyCards, setUrlCardId]);

  const rateAndAdvance = useCallback(
    (rating: Rating) => {
      const curIndex = safeIndex;
      const total = studyCards.length;
      const activeCard = studyCards[curIndex];
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
        const nextCard = studyCards[curIndex + 1];
        setSlideDir('left');
        slideTimer.current = setTimeout(() => {
          setStudyIndex(curIndex + 1);
          setFlipped(false);
          setSlideDir(null);
          if (nextCard) setUrlCardId(nextCard.id);
        }, 250);
      }
    },
    [safeIndex, studyCards, clearTimer, setUrlCardId],
  );

  function startStudy(fromIndex = 0, opts?: { dueOnly?: boolean; shouldShuffle?: boolean; limit?: number }, fromUrl = false) {
    const dueOnly = opts?.dueOnly ?? smartMode;
    const shouldShuffle = opts?.shouldShuffle ?? randomize;
    const limit = opts?.limit ?? cardLimit;
    if (opts) { setSmartMode(dueOnly); setRandomize(shouldShuffle); setCardLimit(limit); }
    let cards = scopedCards;
    if (kindFilter) cards = cards.filter((c) => c.kind === kindFilter);
    if (dueOnly) cards = cards.filter(isCardDue);
    if (shouldShuffle) cards = shuffleArray(cards);
    if (limit > 0) cards = cards.slice(0, limit);
    setSessionCards(cards);
    setStudyIndex(fromIndex);
    setFlipped(false);
    setSlideDir(null);
    setSessionDone(false);
    setStudying(true);
    if (!fromUrl) { const card = cards[fromIndex]; setUrlCardId(card?.id ?? null); }
  }

  function exitStudy() {
    setStudying(false);
    setFlipped(false);
    setSlideDir(null);
    setSessionCards([]);
    setUrlCardId(null);
  }

  function restartSession() {
    let cards = scopedCards;
    if (kindFilter) cards = cards.filter((c) => c.kind === kindFilter);
    if (smartMode) cards = cards.filter(isCardDue);
    if (randomize) cards = shuffleArray(cards);
    if (cardLimit > 0) cards = cards.slice(0, cardLimit);
    setSessionCards(cards);
    setRatings({});
    setStudyIndex(0);
    setFlipped(false);
    setSlideDir(null);
    setSessionDone(false);
    const firstCard = cards[0];
    if (firstCard) setUrlCardId(firstCard.id);
  }

  function handleSearchChange(q: string) { onFiltersChange?.({ search: q }); }
  function handleKindChange(k: string | null) { onFiltersChange?.({ kind: k }); }
  function handleRatingChange(r: string | null) { onFiltersChange?.({ rating: r }); }
  function handleCatsChange(ids: string[]) { onFiltersChange?.({ cats: ids }); }
  function handleTagsChange(ids: string[]) { onFiltersChange?.({ tags: ids }); }

  if (studying && sessionDone) {
    return (
      <FlashcardDone
        filteredLength={studyCards.length}
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
        cards={studyCards}
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
        onFinishEarly={() => setSessionDone(true)}
        onOpenNote={onOpenNote}
      />
    );
  }

  return (
    <FlashcardBrowse
      flashcards={flashcards}
      scopedCards={scopedCards}
      notes={notes}
      categories={categories}
      tagCounts={tagCounts}
      scope={scope}
      value={value}
      ratings={ratings}
      kindFilter={kindFilter}
      ratingFilter={ratingFilter}
      searchQuery={searchQuery}
      selectedCategories={selectedCategories}
      selectedTags={selectedTags}
      dueCount={dueCount}
      onScopeChange={onScopeChange}
      onStartSession={(opts) => startStudy(0, opts)}
      onRated={(cardId, rating) => setRatings((prev) => ({ ...prev, [cardId]: rating }))}
      onOpenNote={onOpenNote}
      onKindFilterChange={handleKindChange}
      onRatingFilterChange={handleRatingChange}
      onSearchChange={handleSearchChange}
      onSelectedCategoriesChange={handleCatsChange}
      onSelectedTagsChange={handleTagsChange}
      onAddFlashcard={onAddFlashcard}
      onDeleteFlashcard={onDeleteFlashcard}
    />
  );
}
