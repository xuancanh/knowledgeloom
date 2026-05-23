import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Flashcard, KnowledgeNote } from '../types';
import type { UiCategory } from '../lib/view';

type Rating = 'again' | 'hard' | 'good';

const KIND_COLOR: Record<string, string> = {
  concept: 'var(--indigo)',
  question: 'var(--teal)',
  lesson: 'var(--moss)',
  tradeoff: 'var(--ochre)',
  pattern: 'var(--rust)',
};

const KIND_LABEL: Record<string, string> = {
  concept: 'Concept',
  question: 'Question',
  lesson: 'Lesson',
  tradeoff: 'Tradeoff',
  pattern: 'Pattern',
};

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
  const [query, setQuery] = useState('');
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [studyIndex, setStudyIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [sessionDone, setSessionDone] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const slideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived state (all hooks unconditionally at top) ──

  const scopedCards = useMemo(() => {
    if (scope === 'category' && value) return flashcards.filter((c) => c.category === value);
    if (scope === 'tag' && value) return flashcards.filter((c) => c.tags.includes(value));
    return flashcards;
  }, [flashcards, scope, value]);

  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return scopedCards;
    return scopedCards.filter((card) => {
      const hay = [card.prompt, card.lesson, card.noteTitle, card.category, card.kind, ...card.tags]
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [query, scopedCards]);

  const safeIndex = Math.min(studyIndex, Math.max(0, filtered.length - 1));
  const activeCard = filtered[safeIndex] ?? null;

  const reviewed = useMemo(
    () => filtered.filter((c) => ratings[c.id]).length,
    [filtered, ratings],
  );
  const progress = filtered.length ? Math.round((reviewed / filtered.length) * 100) : 0;

  const ratingCounts = useMemo(() => {
    const c = { again: 0, hard: 0, good: 0 };
    for (const r of Object.values(ratings)) if (r in c) c[r as Rating]++;
    return c;
  }, [ratings]);

  const kindGroups = useMemo(() => {
    const g: Record<string, number> = {};
    for (const card of filtered) g[card.kind] = (g[card.kind] || 0) + 1;
    return g;
  }, [filtered]);

  const scopeLabel =
    scope === 'category' && value
      ? value
      : scope === 'tag' && value
        ? `#${value}`
        : 'All cards';

  // Reset on scope change
  useEffect(() => {
    setStudying(false);
    setStudyIndex(0);
    setFlipped(false);
    setSlideDir(null);
    setSessionDone(false);
    setRatings({});
    setQuery('');
  }, [scope, value]);

  // ── Callbacks ──

  const clearTimer = () => {
    if (slideTimer.current) clearTimeout(slideTimer.current);
  };

  const goToCard = useCallback((index: number, dir: 'left' | 'right') => {
    clearTimer();
    setSlideDir(dir);
    slideTimer.current = setTimeout(() => {
      setStudyIndex(index);
      setFlipped(false);
      setSlideDir(null);
    }, 250);
  }, []);

  const rateAndAdvance = useCallback(
    (rating: Rating, curIndex: number, total: number, cardId: string) => {
      clearTimer();
      setRatings((prev) => ({ ...prev, [cardId]: rating }));
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
    [],
  );

  // Keyboard shortcuts in study mode
  useEffect(() => {
    if (!studying || sessionDone) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!activeCard) return;

      if ((e.key === ' ' || e.key === 'Enter') && !flipped) {
        e.preventDefault();
        setFlipped(true);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setStudying(false);
        setFlipped(false);
        setSlideDir(null);
        return;
      }
      if (flipped) {
        if (e.key === '1') { e.preventDefault(); rateAndAdvance('again', safeIndex, filtered.length, activeCard.id); return; }
        if (e.key === '2') { e.preventDefault(); rateAndAdvance('hard', safeIndex, filtered.length, activeCard.id); return; }
        if (e.key === '3') { e.preventDefault(); rateAndAdvance('good', safeIndex, filtered.length, activeCard.id); return; }
      }
      if (e.key === 'ArrowRight' && safeIndex < filtered.length - 1) {
        e.preventDefault();
        goToCard(safeIndex + 1, 'left');
      }
      if (e.key === 'ArrowLeft' && safeIndex > 0) {
        e.preventDefault();
        goToCard(safeIndex - 1, 'right');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [studying, sessionDone, flipped, safeIndex, filtered.length, activeCard, rateAndAdvance, goToCard]);

  // ── Helpers ──

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

  function selectScope(s: 'all' | 'category' | 'tag', v?: string) {
    onScopeChange(s, v);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || !activeCard) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 20) {
      if (!flipped) setFlipped(true);
      return;
    }
    if (dx < -50 && safeIndex < filtered.length - 1) goToCard(safeIndex + 1, 'left');
    else if (dx > 50 && safeIndex > 0) goToCard(safeIndex - 1, 'right');
  }

  // ── Render: session done ──

  if (studying && sessionDone) {
    return (
      <div className="fc-page fc-center">
        <div className="fc-done" role="region" aria-label="Session complete">
          <div className="fc-done-star" aria-hidden>✦</div>
          <h2>Session complete</h2>
          <p className="fc-done-sub">
            {filtered.length} card{filtered.length !== 1 ? 's' : ''} · {scopeLabel}
          </p>
          <div className="fc-done-breakdown">
            <div className="fc-done-cell again">
              <b>{ratingCounts.again}</b>
              <span>Again</span>
            </div>
            <div className="fc-done-cell hard">
              <b>{ratingCounts.hard}</b>
              <span>Hard</span>
            </div>
            <div className="fc-done-cell good">
              <b>{ratingCounts.good}</b>
              <span>Good</span>
            </div>
          </div>
          {ratingCounts.again > 0 && (
            <p className="fc-done-hint">
              {ratingCounts.again} card{ratingCounts.again !== 1 ? 's' : ''} marked "Again" — reviewing them again now will help retention.
            </p>
          )}
          <div className="fc-done-btns">
            <button className="fc-btn-ghost" onClick={restartSession}>
              Review again
            </button>
            <button className="fc-btn-primary" onClick={exitStudy}>
              Back to collection
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: study mode ──

  if (studying && activeCard) {
    const kindColor = KIND_COLOR[activeCard.kind] || 'var(--accent)';
    const existingRating = ratings[activeCard.id];

    return (
      <div className="fc-page fc-study">
        {/* Top bar */}
        <div className="fc-study-bar">
          <button className="fc-back-btn" onClick={exitStudy}>← Collection</button>
          <div className="fc-bar-center">
            <div className="fc-bar-track">
              <div className="fc-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="fc-bar-label">{safeIndex + 1} / {filtered.length}</span>
          </div>
          <div className="fc-live-counts">
            {ratingCounts.again > 0 && <span className="fc-lc again">{ratingCounts.again}</span>}
            {ratingCounts.hard > 0 && <span className="fc-lc hard">{ratingCounts.hard}</span>}
            {ratingCounts.good > 0 && <span className="fc-lc good">{ratingCounts.good}</span>}
          </div>
        </div>

        {/* Card area */}
        <div className="fc-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {/* Ghost stack depth cues */}
          {safeIndex + 2 < filtered.length && <div className="fc-ghost g2" aria-hidden />}
          {safeIndex + 1 < filtered.length && <div className="fc-ghost g1" aria-hidden />}

          {/* 3-D flip card — key forces re-mount (and entry animation) on card change */}
          <div key={activeCard.id} className={`fc-scene${slideDir ? ` slide-${slideDir}` : ''}`}>
            <div
              className={`fc-card${flipped ? ' flipped' : ''}`}
              onClick={() => { if (!flipped) setFlipped(true); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!flipped) setFlipped(true); } }}
              aria-label={flipped ? 'Card answer revealed' : 'Press Space to reveal answer'}
            >
              {/* FRONT */}
              <div className="fc-face fc-front">
                <div className="fc-kind-row" style={{ color: kindColor }}>
                  <span className="fc-dot" style={{ background: kindColor }} />
                  {KIND_LABEL[activeCard.kind] || activeCard.kind}
                </div>
                <div className="fc-front-body">
                  <h2 className="fc-prompt">{activeCard.prompt}</h2>
                </div>
                <div className="fc-front-foot">
                  <div className="fc-note-ref">
                    {activeCard.noteTitle} · {activeCard.category}
                  </div>
                  <div className="fc-hint-pill">
                    <kbd>Space</kbd> to reveal
                  </div>
                </div>
              </div>

              {/* BACK */}
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

          {/* Rating / reveal area */}
          <div className="fc-actions">
            {!flipped ? (
              <div className="fc-reveal-area">
                {existingRating && (
                  <div className={`fc-prev-badge ${existingRating}`}>
                    Previously: {existingRating}
                  </div>
                )}
                <button className="fc-reveal-btn" onClick={() => setFlipped(true)}>
                  Reveal answer <kbd>Space</kbd>
                </button>
              </div>
            ) : (
              <div className="fc-rating-area" aria-live="polite">
                <span className="fc-rate-prompt">How well did you recall it?</span>
                <div className="fc-rate-row">
                  <button
                    className="fc-rate again"
                    onClick={() => rateAndAdvance('again', safeIndex, filtered.length, activeCard.id)}
                  >
                    <span>Again</span>
                    <kbd>1</kbd>
                  </button>
                  <button
                    className="fc-rate hard"
                    onClick={() => rateAndAdvance('hard', safeIndex, filtered.length, activeCard.id)}
                  >
                    <span>Hard</span>
                    <kbd>2</kbd>
                  </button>
                  <button
                    className="fc-rate good"
                    onClick={() => rateAndAdvance('good', safeIndex, filtered.length, activeCard.id)}
                  >
                    <span>Good</span>
                    <kbd>3</kbd>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="fc-nav-row">
            <button
              className="fc-nav-btn"
              onClick={() => goToCard(safeIndex - 1, 'right')}
              disabled={safeIndex === 0}
            >
              ← Prev
            </button>
            <span className="fc-nav-hint">
              <kbd>←</kbd><kbd>→</kbd> navigate · <kbd>Esc</kbd> exit
            </span>
            <button
              className="fc-nav-btn"
              onClick={() => goToCard(safeIndex + 1, 'left')}
              disabled={safeIndex === filtered.length - 1}
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: browse mode ──

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
        {filtered.length > 0 && (
          <div className="fc-browse-meta">
            <div className="fc-browse-progress">
              <div className="fc-bar-track">
                <div className="fc-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <span>{reviewed}/{filtered.length} reviewed</span>
            </div>
            <button className="fc-start-btn" onClick={() => startStudy(0)}>
              Start session ▶
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="fc-scope-bar">
        <div className="fc-scope-pills">
          <button
            className={`fc-pill${scope === 'all' ? ' active' : ''}`}
            onClick={() => selectScope('all')}
          >
            All · {flashcards.length}
          </button>
        </div>
        <div className="fc-scope-selects">
          <select
            value={scope === 'category' ? value : ''}
            onChange={(e) => e.target.value ? selectScope('category', e.target.value) : selectScope('all')}
            aria-label="Filter by category"
          >
            <option value="">Category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <select
            value={scope === 'tag' ? value : ''}
            onChange={(e) => e.target.value ? selectScope('tag', e.target.value) : selectScope('all')}
            aria-label="Filter by tag"
          >
            <option value="">Tag</option>
            {tagCounts.map(([tag, count]) => (
              <option key={tag} value={tag}>{tag} ({count})</option>
            ))}
          </select>
        </div>
        <div className="fc-search-box">
          <span className="fc-search-icon">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards..."
            aria-label="Search flashcards"
          />
          {query && (
            <button className="fc-search-clear" onClick={() => setQuery('')}>×</button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          {notes.length
            ? query
              ? 'No cards match that search.'
              : 'No flashcards for this filter.'
            : 'Add notes first — flashcards are generated from saved notes.'}
        </div>
      ) : (
        <>
          {/* Kind breakdown chips */}
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

          {/* Card grid */}
          <div className="fc-grid">
            {filtered.map((card, index) => {
              const kc = KIND_COLOR[card.kind] || 'var(--accent)';
              const rating = ratings[card.id];
              return (
                <button
                  key={card.id}
                  className={`fc-tile${rating ? ` r-${rating}` : ''}`}
                  onClick={() => startStudy(index)}
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
