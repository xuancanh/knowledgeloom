/**
 * Session-complete screen shown after the last flashcard is rated.
 *
 * Displays a star icon, per-rating breakdown (Again / Hard / Good counts),
 * and options to review the same cards again or return to the collection.
 */
export function FlashcardDone({
  filteredLength,
  scopeLabel,
  ratingCounts,
  onRestart,
  onExit,
}: {
  filteredLength: number;
  scopeLabel: string;
  ratingCounts: { again: number; hard: number; good: number };
  onRestart: () => void;
  onExit: () => void;
}) {
  return (
    <div className="fc-page fc-center">
      <div className="fc-done" role="region" aria-label="Session complete">
        <div className="fc-done-star" aria-hidden>✦</div>
        <h2>Session complete</h2>
        <p className="fc-done-sub">
          {filteredLength} card{filteredLength !== 1 ? 's' : ''} · {scopeLabel}
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
          <button className="fc-btn-ghost" onClick={onRestart}>
            Review again
          </button>
          <button className="fc-btn-primary" onClick={onExit}>
            Back to collection
          </button>
        </div>
      </div>
    </div>
  );
}
