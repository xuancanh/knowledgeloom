import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const needsPractice = ratingCounts.again + ratingCounts.hard;

  return (
    <div className="fc-page fc-center">
      <div className="fc-done" role="region" aria-label={t('flashcards.sessionComplete')}>
        <div className="fc-done-star" aria-hidden>✦</div>
        <h2>{t('flashcards.sessionComplete')}</h2>
        <p className="fc-done-sub">
          {t('flashcards.sessionSummary', { count: filteredLength, scope: scopeLabel })}
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
            <strong>{ratingCounts.good}</strong> {t('flashcards.mastered')}
            {' · '}<strong>{needsPractice}</strong> {t('flashcards.needsPractice', { count: needsPractice })}
          </p>
        </div>
        {ratingCounts.again > 0 && (
          <p className="fc-done-hint">
            {t('flashcards.retentionHint', { count: ratingCounts.again, rating: RATING_LABEL['again'] })}
          </p>
        )}
        <div className="fc-done-btns">
          <button className="fc-btn-ghost" onClick={onRestart}>
            {t('flashcards.reviewAgain')}
          </button>
          <button className="fc-btn-primary" onClick={onExit}>
            {t('flashcards.backCollection2')}
          </button>
        </div>
      </div>
    </div>
  );
}
