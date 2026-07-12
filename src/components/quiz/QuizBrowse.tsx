import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuizQuestion, QuizQuestionType } from '../../types';
import type { UiCategory } from '../../lib/view';
import { QUIZ_TYPE_LABELS, QUIZ_TYPE_COLORS } from './constants';
import { MultiSelectDropdown } from '../MultiSelectDropdown';
import { FillBlankQuestion, MultipleChoiceQuestion, ShortAnswerQuestion } from './QuizQuestionRenderers';
import { useNow } from '../../hooks/useNow';

const ALL_TYPES: QuizQuestionType[] = ['fill-blank', 'multiple-choice', 'short-answer'];

type Rating = 'correct' | 'wrong';

export default function QuizBrowse({
  questions,
  categories,
  tagCounts,
  activeCategories,
  activeTags,
  activeTypes,
  search,
  onSearchChange,
  onCategoriesChange,
  onTagsChange,
  onToggleType,
  onStudy,
  onHide,
  onRate,
}: {
  questions: QuizQuestion[];
  categories: UiCategory[];
  tagCounts: [string, number][];
  activeCategories: string[];
  activeTags: string[];
  activeTypes: QuizQuestionType[];
  search: string;
  onSearchChange: (v: string) => void;
  onCategoriesChange: (ids: string[]) => void;
  onTagsChange: (ids: string[]) => void;
  onToggleType: (t: QuizQuestionType) => void;
  onStudy: () => void;
  onHide: (id: string) => void;
  onRate: (question: QuizQuestion, rating: Rating) => void;
}) {
  const { t } = useTranslation();
  const [confirmHide, setConfirmHide] = useState<string | null>(null);
  const [previewQuestion, setPreviewQuestion] = useState<QuizQuestion | null>(null);
  const now = useNow();

  function nextReviewLabel(nextReviewAt: string | null | undefined): string {
    if (!nextReviewAt) return t('quiz.new');
    const diff = Date.parse(nextReviewAt) - now;
    if (diff <= 0) return t('quiz.dueNow');
    const days = Math.ceil(diff / 86_400_000);
    return days === 1 ? t('quiz.tomorrow') : t('quiz.daysAhead', { count: days });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return questions.filter((qn) => {
      if (activeCategories.length && !activeCategories.includes(qn.category)) return false;
      if (activeTags.length && !activeTags.some((t) => qn.tags.includes(t))) return false;
      if (activeTypes.length && !activeTypes.includes(qn.type)) return false;
      if (!q) return true;
      return (qn.question + ' ' + qn.answer + ' ' + qn.noteTitle).toLowerCase().includes(q);
    });
  }, [questions, activeCategories, activeTags, activeTypes, search]);

  const dueCount = useMemo(() => filtered.filter((q) => {
    const n = q.reviewData?.nextReviewAt;
    return !n || Date.parse(n) <= now;
  }).length, [filtered, now]);

  const catOptions = useMemo(
    () => categories.map((c) => ({ id: c.name, label: c.name, count: questions.filter((q) => q.category === c.name).length })),
    [categories, questions],
  );
  const tagOptions = useMemo(
    () => tagCounts.map(([t]) => ({ id: t, label: t, count: questions.filter((q) => q.tags.includes(t)).length })),
    [tagCounts, questions],
  );

  return (
    <div className="qz-browse">
      <div className="qz-browse-head">
        <div className="qz-browse-title-row">
          <h1 className="qz-browse-title">{t('quiz.title')}</h1>
          <button className="qz-study-btn" onClick={onStudy} disabled={filtered.length === 0}>
            {dueCount > 0 ? t('quiz.studyDue', { count: dueCount }) : t('quiz.studyAll')}
          </button>
        </div>

        {/* Type toggles — always one row */}
        <div className="qz-filter-row qz-filter-row--types">
          {ALL_TYPES.map((t) => {
            const active = activeTypes.includes(t);
            return (
              <button
                key={t}
                className={`qz-filter-chip${active ? ' active' : ''}`}
                style={active ? { borderColor: QUIZ_TYPE_COLORS[t], color: QUIZ_TYPE_COLORS[t], background: `color-mix(in srgb, ${QUIZ_TYPE_COLORS[t]} 8%, var(--surface))` } : undefined}
                onClick={() => onToggleType(t)}
              >
                <span className="qz-chip-dot" style={{ background: QUIZ_TYPE_COLORS[t] }} />
                {QUIZ_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>

        {/* Search + category/tag dropdowns */}
        <div className="qz-scope-bar">
          <div className="qz-search-box">
            <span className="qz-search-icon">⌕</span>
            <input
              className="qz-search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('search.placeholder').split('...')[0] + '…'}
              spellCheck={false}
            />
            {search && (
              <button className="qz-search-clear" onClick={() => onSearchChange('')} aria-label={t('common.clear')}>✕</button>
            )}
          </div>
          <MultiSelectDropdown label={t('common.categories')} items={catOptions} selected={activeCategories} onChange={onCategoriesChange} />
          <MultiSelectDropdown label={t('common.tags')} items={tagOptions} selected={activeTags} onChange={onTagsChange} />
        </div>

        {/* Active filter chips */}
        {(activeCategories.length > 0 || activeTags.length > 0) && (
          <div className="fc-active-filters">
            {activeCategories.map((cat) => (
              <span key={cat} className="fc-filter-chip">
                {cat}
                <button onClick={() => onCategoriesChange(activeCategories.filter((c) => c !== cat))} aria-label={t('common.removeFilter', { filter: cat })}>✕</button>
              </span>
            ))}
            {activeTags.map((tag) => (
              <span key={tag} className="fc-filter-chip">
                #{tag}
                <button onClick={() => onTagsChange(activeTags.filter((t) => t !== tag))} aria-label={t('common.removeFilter', { filter: tag })}>✕</button>
              </span>
            ))}
            {(activeCategories.length + activeTags.length) > 1 && (
              <button className="fc-filter-clear" onClick={() => { onCategoriesChange([]); onTagsChange([]); }}>
                {t('common.clearAll')}
              </button>
            )}
          </div>
        )}

        <div className="qz-browse-meta">
          <span>{t('quiz.questionCount', { count: filtered.length })}</span>
          {dueCount > 0 && <span className="qz-due-badge">{t('quiz.dueBadge', { count: dueCount })}</span>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          {questions.length === 0
            ? t('quiz.noQuestionsYet')
            : t('quiz.noQuestionsFilter')}
        </div>
      ) : (
        <div className="qz-list">
          {filtered.map((q) => {
            const typeColor = QUIZ_TYPE_COLORS[q.type];
            const label = nextReviewLabel(q.reviewData?.nextReviewAt);
            const isDue = !q.reviewData?.nextReviewAt || Date.parse(q.reviewData.nextReviewAt) <= now;
            return (
              <div
                key={q.id}
                className="qz-row"
                onClick={() => setPreviewQuestion(q)}
              >
                <div className="qz-row-main">
                  <div className="qz-row-type" style={{ color: typeColor }}>
                    <span className="qz-dot" style={{ background: typeColor }} />
                    <span>{QUIZ_TYPE_LABELS[q.type]}</span>
                  </div>
                  <div className="qz-row-body">
                    <div className="qz-row-question">
                      {q.type === 'fill-blank' ? q.question.replace('___', '▢') : q.question}
                    </div>
                    <div className="qz-row-meta">
                      <span className="qz-row-note">{q.noteTitle}</span>
                      {q.category && <span className="qz-row-cat">{q.category}</span>}
                    </div>
                  </div>
                  <div className="qz-row-right" onClick={(e) => e.stopPropagation()}>
                    <span className={`qz-review-label${isDue ? ' due' : ''}`}>{label}</span>
                    {confirmHide === q.id ? (
                      <span className="qz-confirm-hide">
                        <button className="qz-confirm-yes" onClick={() => { onHide(q.id); setConfirmHide(null); }}>{t('quiz.hide')}</button>
                        <button className="qz-confirm-no" onClick={() => setConfirmHide(null)}>{t('common.cancel')}</button>
                      </span>
                    ) : (
                      <button className="qz-hide-btn" onClick={() => setConfirmHide(q.id)} title={t('quiz.hideQuestion')}>✕</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {previewQuestion && (
        <QuizPreviewModal
          question={previewQuestion}
          onRate={(q, rating) => { onRate(q, rating); setPreviewQuestion(null); }}
          onClose={() => setPreviewQuestion(null)}
        />
      )}
    </div>
  );
}

// ── Quiz preview modal ─────────────────────────────────────────────────────

function QuizPreviewModal({ question, onRate, onClose }: {
  question: QuizQuestion;
  onRate: (q: QuizQuestion, rating: Rating) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const typeColor = QUIZ_TYPE_COLORS[question.type];
  const canReveal = question.type === 'multiple-choice' ? selectedIndex !== null : true;
  const isAutoRevealed = question.type === 'multiple-choice';

  function reveal() {
    if (revealed || (question.type === 'multiple-choice' && selectedIndex === null)) return;
    setRevealed(true);
  }

  function autoRevealOnMcSelect(i: number) {
    setSelectedIndex(i);
    setTimeout(() => setRevealed(true), 300);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (!revealed) {
        if ((e.key === ' ' || e.key === 'Enter') && !isInput) { e.preventDefault(); reveal(); return; }
        if (question.type === 'multiple-choice') {
          const n = parseInt(e.key);
          if (n >= 1 && n <= (question.choices?.length ?? 0)) { e.preventDefault(); autoRevealOnMcSelect(n - 1); }
        }
      } else {
        if (e.key === 'ArrowLeft' || e.key === '1') { e.preventDefault(); onRate(question, 'wrong'); }
        if (e.key === 'ArrowRight' || e.key === '2') { e.preventDefault(); onRate(question, 'correct'); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fc-dialog-overlay" onClick={onClose}>
      <div className="qz-preview-modal" onClick={(e) => e.stopPropagation()}>
        <button className="fc-preview-close" onClick={onClose} aria-label={t('common.close')}>✕</button>

        <div className="qz-card">
          <div className="qz-card-head">
            <div className="qz-type-row" style={{ color: typeColor }}>
              <span className="qz-dot" style={{ background: typeColor }} />
              <span className="qz-type-label">{QUIZ_TYPE_LABELS[question.type]}</span>
            </div>
            <div className="qz-note-ref">
              <span className="qz-note-title">{question.noteTitle}</span>
              <span className="qz-category">{question.category}</span>
            </div>
          </div>

          <div className="qz-card-body">
            {question.type === 'fill-blank' && (
              <FillBlankQuestion question={question} revealed={revealed} userInput={userInput} onInput={setUserInput} />
            )}
            {question.type === 'multiple-choice' && (
              <MultipleChoiceQuestion question={question} revealed={revealed} selectedIndex={selectedIndex} onSelect={autoRevealOnMcSelect} />
            )}
            {question.type === 'short-answer' && (
              <ShortAnswerQuestion question={question} revealed={revealed} userInput={userInput} onInput={setUserInput} />
            )}
            {revealed && question.explanation && (
              <div className="qz-explanation">
                <span className="qz-expl-label">
                  {question.type === 'multiple-choice' ? t('quiz.explanation') : t('quiz.keyPoint')}
                </span>
                <p>{question.explanation}</p>
              </div>
            )}
          </div>

          <div className="qz-card-foot">
            {!revealed ? (
              <button className="qz-reveal-btn" onClick={reveal} disabled={!canReveal}>
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
                <button className="qz-wrong-btn" onClick={() => onRate(question, 'wrong')}>
                  {t('quiz.markWrong')} <span className="qz-hint">←</span>
                </button>
                <button className="qz-correct-btn" onClick={() => onRate(question, 'correct')}>
                  {t('quiz.markCorrect')} <span className="qz-hint">→</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
