import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuizQuestion } from '../../types';
import { QUIZ_TYPE_LABELS, QUIZ_TYPE_COLORS } from './constants';
import { FillBlankQuestion, MultipleChoiceQuestion, ShortAnswerQuestion } from './QuizQuestionRenderers';
import { useNow } from '../../hooks/useNow';

type Rating = 'correct' | 'wrong';

export default function QuizStudy({
  questions,
  onRate,
  onExit,
}: {
  questions: QuizQuestion[];
  onRate: (question: QuizQuestion, rating: Rating) => void;
  onExit: () => void;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const now = useNow();

  function nextReviewLabel(nextReviewAt: string | null | undefined): string {
    if (!nextReviewAt) return '';
    const diff = Date.parse(nextReviewAt) - now;
    if (diff <= 0) return t('quiz.dueNow');
    const days = Math.ceil(diff / 86_400_000);
    return days === 1 ? t('quiz.tomorrow') : t('quiz.daysAhead', { count: days });
  }
  const [userInput, setUserInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [done, setDone] = useState(false);

  const question = questions[index];
  const progress = Math.round(((index) / questions.length) * 100);
  const typeColor = question ? QUIZ_TYPE_COLORS[question.type] : 'var(--accent)';

  useEffect(() => {
    setRevealed(false);
    setUserInput('');
    setSelectedIndex(null);
  }, [index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done) return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === 'Escape') { e.preventDefault(); onExit(); return; }

      if (!revealed) {
        if (e.key === 'Enter' && !isInput) { e.preventDefault(); reveal(); }
        if (e.key === ' ' && !isInput) { e.preventDefault(); reveal(); }
        // Multiple choice keyboard shortcuts 1-4
        if (question?.type === 'multiple-choice') {
          const n = parseInt(e.key);
          if (n >= 1 && n <= (question.choices?.length ?? 0)) {
            e.preventDefault();
            selectChoice(n - 1);
          }
        }
      } else {
        if (e.key === 'ArrowLeft' || e.key === '1') { e.preventDefault(); rate('wrong'); }
        if (e.key === 'ArrowRight' || e.key === '2') { e.preventDefault(); rate('correct'); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function reveal() {
    if (revealed) return;
    if (question.type === 'multiple-choice' && selectedIndex === null) return;
    setRevealed(true);
  }

  function selectChoice(i: number) {
    if (revealed) return;
    setSelectedIndex(i);
  }

  function rate(rating: Rating) {
    if (!revealed) return;
    setRatings((prev) => ({ ...prev, [question.id]: rating }));
    onRate(question, rating);
    if (index + 1 >= questions.length) {
      setDone(true);
    } else {
      setIndex((i) => i + 1);
    }
  }

  function autoRevealOnMcSelect(i: number) {
    setSelectedIndex(i);
    // auto-reveal for MC after pick
    setTimeout(() => setRevealed(true), 300);
  }

  if (done) {
    const correct = Object.values(ratings).filter((r) => r === 'correct').length;
    const total = questions.length;
    return (
      <div className="qz-done">
        <div className="qz-done-icon">✓</div>
        <h2 className="qz-done-title">{t('quiz.sessionComplete')}</h2>
        <p className="qz-done-score">{t('quiz.scoreCorrect', { correct, total })}</p>
        <div className="qz-done-bar-wrap">
          <div className="qz-done-bar" style={{ width: `${Math.round((correct / total) * 100)}%` }} />
        </div>
        <p className="qz-done-sub">
          {correct === total ? t('quiz.perfectScore') : t('quiz.questionsForReview', { count: total - correct })}
        </p>
        <button className="qz-done-exit" onClick={onExit}>{t('quiz.backDeck2')}</button>
      </div>
    );
  }

  if (!question) return null;

  const canReveal = question.type === 'fill-blank'
    ? true
    : question.type === 'multiple-choice'
    ? selectedIndex !== null
    : true;

  const isAutoRevealed = question.type === 'multiple-choice';

  return (
    <div className="qz-study">
      {/* Progress bar */}
      <div className="qz-study-bar">
        <button className="fc-back-btn" onClick={onExit}>{t('quiz.backDeck')}</button>
        <div className="qz-bar-center">
          <div className="qz-bar-track">
            <div className="qz-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="qz-bar-label">{index + 1} / {questions.length}</span>
        </div>
        <div className="qz-live-counts">
          {Object.values(ratings).filter((r) => r === 'correct').length > 0 && (
            <span className="qz-lc correct">{Object.values(ratings).filter((r) => r === 'correct').length}</span>
          )}
          {Object.values(ratings).filter((r) => r === 'wrong').length > 0 && (
            <span className="qz-lc wrong">{Object.values(ratings).filter((r) => r === 'wrong').length}</span>
          )}
        </div>
      </div>

      {/* Card */}
      <div className="qz-stage">
        <div className="qz-card">
          <div className="qz-card-head">
            <div className="qz-type-row" style={{ color: typeColor }}>
              <span className="qz-dot" style={{ background: typeColor }} />
              <span className="qz-type-label">{QUIZ_TYPE_LABELS[question.type]}</span>
              {question.reviewData?.nextReviewAt && (
                <span className="qz-next-review">{nextReviewLabel(question.reviewData.nextReviewAt)}</span>
              )}
            </div>
            <div className="qz-note-ref">
              <span className="qz-note-title">{question.noteTitle}</span>
              <span className="qz-category">{question.category}</span>
            </div>
          </div>

          <div className="qz-card-body">
            {question.type === 'fill-blank' && (
              <FillBlankQuestion
                question={question}
                revealed={revealed}
                userInput={userInput}
                onInput={setUserInput}
              />
            )}
            {question.type === 'multiple-choice' && (
              <MultipleChoiceQuestion
                question={question}
                revealed={revealed}
                selectedIndex={selectedIndex}
                onSelect={autoRevealOnMcSelect}
              />
            )}
            {question.type === 'short-answer' && (
              <ShortAnswerQuestion
                question={question}
                revealed={revealed}
                userInput={userInput}
                onInput={setUserInput}
              />
            )}

            {revealed && question.type !== 'multiple-choice' && question.explanation && (
              <div className="qz-explanation">
                <span className="qz-expl-label">{t('quiz.keyPoint')}</span>
                <p>{question.explanation}</p>
              </div>
            )}
            {revealed && question.type === 'multiple-choice' && question.explanation && (
              <div className="qz-explanation">
                <span className="qz-expl-label">{t('quiz.explanation')}</span>
                <p>{question.explanation}</p>
              </div>
            )}
          </div>

          <div className="qz-card-foot">
            {!revealed ? (
              <button
                className="qz-reveal-btn"
                onClick={reveal}
                disabled={!canReveal}
              >
                {isAutoRevealed ? t('quiz.selectAnswer') : t('quiz.revealAnswer')}
                {!isAutoRevealed && <span className="qz-hint">Space</span>}
              </button>
            ) : (
              <div className="qz-rate-row">
                {question.type === 'short-answer' ? (
                  <span className="qz-rate-prompt">{t('quiz.howDidYouDo')}</span>
                ) : (
                  <span className="qz-rate-prompt">
                    {question.type === 'fill-blank'
                      ? (userInput.trim().toLowerCase() === question.answer.trim().toLowerCase() ? t('quiz.correct') : t('quiz.incorrect'))
                      : (selectedIndex === question.correctIndex ? t('quiz.correct') : t('quiz.incorrect'))}
                  </span>
                )}
                <button className="qz-wrong-btn" onClick={() => rate('wrong')}>
                  {t('quiz.markWrong')}
                  <span className="qz-hint">←</span>
                </button>
                <button className="qz-correct-btn" onClick={() => rate('correct')}>
                  {t('quiz.markCorrect')}
                  <span className="qz-hint">→</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
