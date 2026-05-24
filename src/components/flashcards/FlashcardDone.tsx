import { RATING_LABEL } from './constants';

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
  const total = ratingCounts.again + ratingCounts.hard + ratingCounts.good;

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
            <span>{RATING_LABEL['again']}</span>
          </div>
          <div className="fc-done-cell hard">
            <b>{ratingCounts.hard}</b>
            <span>{RATING_LABEL['hard']}</span>
          </div>
          <div className="fc-done-cell good">
            <b>{ratingCounts.good}</b>
            <span>{RATING_LABEL['good']}</span>
          </div>
        </div>
        <div className="fc-sr-summary">
          <p>
            <strong>{ratingCounts.good}</strong> card{ratingCounts.good !== 1 ? 's' : ''} mastered
            · <strong>{ratingCounts.again + ratingCounts.hard}</strong> need{ratingCounts.again + ratingCounts.hard === 1 ? 's' : ''} practice
          </p>
        </div>
        {ratingCounts.again > 0 && (
          <p className="fc-done-hint">
            {ratingCounts.again} card{ratingCounts.again !== 1 ? 's' : ''} marked "{RATING_LABEL['again']}" will reappear sooner using spaced repetition to help retention.
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
