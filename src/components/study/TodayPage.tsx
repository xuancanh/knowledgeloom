/**
 * TodayPage — the unified daily study queue (GET /api/study/today).
 *
 * One screen that merges everything due right now: flashcards (SM-2 due +
 * capped new), quiz questions, and reminders. Reviews are submitted through
 * the same endpoints the flashcards/quiz pages use, so schedules stay
 * consistent no matter where the user studies.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Flashcard, QuizQuestion, Reminder } from '../../types';
import { fetchStudyToday, fetchStudyStats, createExamPlan, reviewFlashcard, reviewQuiz, updateReminder, type StudyQueue, type StudyStats, type ExamPlanDto } from '../../api';

const EXAM_STORAGE_KEY = 'kl:exam-config';

function ExamPlanner() {
  const { t } = useTranslation();
  const [examDate, setExamDate] = useState('');
  const [category, setCategory] = useState('');
  const [plan, setPlan] = useState<ExamPlanDto | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(EXAM_STORAGE_KEY) || 'null');
      if (saved?.examDate && saved.examDate >= new Date().toISOString().slice(0, 10)) {
        setExamDate(saved.examDate);
        setCategory(saved.category || '');
        createExamPlan(saved.examDate, saved.category ? { category: saved.category } : undefined)
          .then(setPlan)
          .catch(() => {});
      }
    } catch { /* ignore */ }
  }, []);

  const build = async () => {
    if (!examDate) return;
    setBusy(true);
    setError('');
    try {
      const p = await createExamPlan(examDate, category.trim() ? { category: category.trim() } : undefined);
      setPlan(p);
      localStorage.setItem(EXAM_STORAGE_KEY, JSON.stringify({ examDate, category: category.trim() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('today.exam.buildError'));
      setPlan(null);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setPlan(null);
    setExamDate('');
    setCategory('');
    localStorage.removeItem(EXAM_STORAGE_KEY);
  };

  const today = new Date().toISOString().slice(0, 10);
  const todayInPlan = plan?.days.find((d) => d.date === today);
  const focusLabel: Record<ExamPlanDto['days'][number]['focus'], string> = {
    learn: t('today.exam.focus.learn'),
    consolidate: t('today.exam.focus.consolidate'),
    'final-review': t('today.exam.focus.finalReview'),
    exam: t('today.exam.focus.exam'),
  };

  return (
    <section className="today-exam">
      <h3>{t('today.exam.title')}</h3>
      {!plan ? (
        <div className="today-exam-form">
          <input aria-label={t('today.exam.dateLabel')} type="date" value={examDate} min={today} onChange={(e) => setExamDate(e.target.value)} disabled={busy} />
          <input aria-label={t('today.exam.categoryLabel')} placeholder={t('today.exam.categoryPlaceholder')} value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy} />
          <button className="today-btn" onClick={() => void build()} disabled={busy || !examDate}>
            {busy ? t('today.exam.planning') : t('today.exam.build')}
          </button>
          {error && <span className="import-status error" role="alert">{error}</span>}
        </div>
      ) : (
        <>
          <div className="today-exam-summary">
            <strong>{plan.daysUntilExam === 0 ? t('today.exam.today') : t('today.exam.daysUntil', { count: plan.daysUntilExam })}</strong>
            {' '}{t('today.exam.planSummary', { items: plan.totalItems, reviews: plan.totalReviews })}
            {todayInPlan && todayInPlan.items.length > 0 && (
              <> {t('today.exam.todayPrefix')} <strong>{t('today.items', { count: todayInPlan.items.length })}</strong> ({focusLabel[todayInPlan.focus]}).</>
            )}
          </div>
          <div className="today-exam-days">
            {plan.days.map((d) => (
              <div key={d.date} className={`today-exam-day ${d.focus}${d.date === today ? ' current' : ''}`} title={`${d.date}: ${focusLabel[d.focus]} — ${d.items.length} items`}>
                <span className="today-exam-day-count">{d.focus === 'exam' ? '★' : d.items.length}</span>
                <span className="today-exam-day-date">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <button className="today-btn" onClick={clear}>{t('today.exam.clear')}</button>
        </>
      )}
    </section>
  );
}

type Phase = 'loading' | 'ready' | 'error';

export default function TodayPage({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<StudyQueue | null>(null);
  const [fcIndex, setFcIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [fcDone, setFcDone] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [quizDone, setQuizDone] = useState(0);
  const [completedReminders, setCompletedReminders] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<StudyStats | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const q = await fetchStudyToday();
      setQueue(q);
      setFcIndex(0); setFlipped(false); setFcDone(0);
      setQuizIndex(0); setChoice(null); setRevealed(false); setQuizDone(0);
      setCompletedReminders(new Set());
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { fetchStudyStats(30).then(setStats).catch(() => {}); }, []);

  const cards = queue?.flashcards ?? [];
  const questions = queue?.quiz ?? [];
  const reminders = queue?.reminders ?? [];
  const card: Flashcard | undefined = cards[fcIndex];
  const question: QuizQuestion | undefined = questions[quizIndex];

  const totalItems = cards.length + questions.length;
  const doneItems = fcDone + quizDone;
  const progress = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

  const rateCard = useCallback((rating: 'again' | 'hard' | 'good') => {
    if (!card) return;
    reviewFlashcard(card.id, { rating, noteId: card.noteId, isUserCard: card.isUserCreated })
      .catch((e) => console.error('Review failed', e));
    setFcDone((n) => n + 1);
    setFcIndex((i) => i + 1);
    setFlipped(false);
  }, [card]);

  const answerQuiz = useCallback((correct: boolean) => {
    if (!question) return;
    reviewQuiz(question.id, {
      rating: correct ? 'correct' : 'wrong',
      noteId: question.noteId,
      currentStreak: question.reviewData?.streak ?? 0,
    }).catch((e) => console.error('Quiz review failed', e));
    setQuizDone((n) => n + 1);
    setQuizIndex((i) => i + 1);
    setChoice(null);
    setRevealed(false);
  }, [question]);

  const completeReminder = useCallback((r: Reminder) => {
    updateReminder(r.id, { completed: true }).catch((e) => console.error('Reminder update failed', e));
    setCompletedReminders((prev) => new Set(prev).add(r.id));
  }, []);

  const remaining = useMemo(
    () => reminders.filter((r) => !completedReminders.has(r.id)),
    [reminders, completedReminders],
  );

  if (phase === 'loading') return <div className="today-page"><div className="today-empty" role="status">{t('today.loading')}</div></div>;
  if (phase === 'error' || !queue) {
    return (
      <div className="today-page">
        <div className="today-empty">
          <span role="alert">{t('today.loadError')}</span>
          <button className="today-btn" onClick={() => void load()}>{t('today.retry')}</button>
        </div>
      </div>
    );
  }

  const allDone = fcIndex >= cards.length && quizIndex >= questions.length;

  return (
    <div className="today-page">
      <header className="today-head">
        <h1>{t('today.title')}</h1>
        <div className="today-counts">
          <span className="today-chip fc">{t('today.cardCounts', { due: queue.counts.dueFlashcards, new: queue.counts.newFlashcards })}</span>
          <span className="today-chip qz">{t('today.quizCount', { count: queue.counts.quiz })}</span>
          <span className="today-chip rm">{t('today.reminderCount', { count: remaining.length })}</span>
        </div>
        {totalItems > 0 && (
          <div className="today-progress">
            <div className="today-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </header>

      {allDone ? (
        <section className="today-done">
          <div className="today-done-mark">✓</div>
          <h2>{totalItems ? t('today.done.title') : t('today.done.emptyTitle')}</h2>
          <p>{totalItems ? t('today.done.reviewed', { count: doneItems }) : t('today.done.emptyBody')}</p>
          <button className="today-btn" onClick={() => void load()}>{t('today.refresh')}</button>
        </section>
      ) : card ? (
        <section className="today-card-zone">
          <div className="today-zone-label">{t('today.flashcardProgress', { current: fcIndex + 1, total: cards.length })}</div>
          <div
            className={`today-card${flipped ? ' flipped' : ''}`}
            role="button"
            aria-label={flipped ? undefined : t('today.revealCard')}
            tabIndex={0}
            onClick={() => setFlipped(true)}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(true); } }}
          >
            <div className="today-card-prompt">{card.prompt}</div>
            {flipped
              ? <div className="today-card-lesson">{card.lesson}</div>
              : <div className="today-card-hint">{t('today.tapToReveal')}</div>}
            <button
              className="today-note-ref"
              onClick={(e) => { e.stopPropagation(); onOpenNote(card.noteId); }}
            >
              {card.noteTitle} ↗
            </button>
          </div>
          {flipped && (
            <div className="today-rate-row">
              <button className="today-rate again" onClick={() => rateCard('again')}>{t('today.rating.again')}</button>
              <button className="today-rate hard" onClick={() => rateCard('hard')}>{t('today.rating.hard')}</button>
              <button className="today-rate good" onClick={() => rateCard('good')}>{t('today.rating.good')}</button>
            </div>
          )}
        </section>
      ) : question ? (
        <section className="today-card-zone">
          <div className="today-zone-label">{t('today.quizProgress', { current: quizIndex + 1, total: questions.length })}</div>
          <div className="today-card static">
            <div className="today-card-prompt">{question.question}</div>
            {question.type === 'multiple-choice' && question.choices ? (
              <div className="today-choices">
                {question.choices.map((c, i) => {
                  const isCorrect = revealed && i === question.correctIndex;
                  const isWrong = revealed && choice === i && i !== question.correctIndex;
                  return (
                    <button
                      key={i}
                      className={`today-choice${isCorrect ? ' correct' : ''}${isWrong ? ' wrong' : ''}${choice === i ? ' picked' : ''}`}
                      disabled={revealed}
                      onClick={() => { setChoice(i); setRevealed(true); }}
                    >
                      {c}
                    </button>
                  );
                })}
                {revealed && (
                  <div className="today-quiz-actions">
                    {question.explanation && <p className="today-explain">{question.explanation}</p>}
                    <button className="today-btn" onClick={() => answerQuiz(choice === question.correctIndex)}>
                      {t('common.next')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="today-choices">
                {revealed
                  ? (
                    <>
                      <p className="today-answer">{question.answer}</p>
                      {question.explanation && <p className="today-explain">{question.explanation}</p>}
                      <div className="today-rate-row">
                        <button className="today-rate again" onClick={() => answerQuiz(false)}>{t('today.missed')}</button>
                        <button className="today-rate good" onClick={() => answerQuiz(true)}>{t('today.correct')}</button>
                      </div>
                    </>
                  )
                  : <button className="today-btn" onClick={() => setRevealed(true)}>{t('today.showAnswer')}</button>}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <ExamPlanner />

      {stats && stats.totals.reviews > 0 && (
        <section className="today-stats">
          <h3>{t('today.stats.lastDays', { count: stats.windowDays })}</h3>
          <div className="today-stat-row">
            <div className="today-stat">
              <span className="today-stat-num">{stats.totals.reviews}</span>
              <span className="today-stat-label">{t('today.stats.reviews')}</span>
            </div>
            <div className="today-stat">
              <span className="today-stat-num">{stats.totals.successRate != null ? `${Math.round(stats.totals.successRate * 100)}%` : '—'}</span>
              <span className="today-stat-label">{t('today.stats.success')}</span>
            </div>
            <div className="today-stat">
              <span className="today-stat-num">{stats.totals.retention1d != null ? `${Math.round(stats.totals.retention1d * 100)}%` : '—'}</span>
              <span className="today-stat-label">{t('today.stats.recall1d')}</span>
            </div>
            <div className="today-stat">
              <span className="today-stat-num">{stats.totals.retention7d != null ? `${Math.round(stats.totals.retention7d * 100)}%` : '—'}</span>
              <span className="today-stat-label">{t('today.stats.recall7d')}</span>
            </div>
          </div>
          {stats.weakestTopics.length > 0 && (
            <>
              <h4>{t('today.stats.weakest')}</h4>
              {stats.weakestTopics.slice(0, 5).map((topic) => (
                <button key={topic.noteId} className="today-weak-topic" onClick={() => onOpenNote(topic.noteId)}>
                  <span className="today-weak-rate">{Math.round(topic.successRate * 100)}%</span>
                  <span className="today-weak-title">{topic.title}</span>
                  <span className="today-weak-meta">{topic.category} · {t('today.stats.attempts', { count: topic.attempts })}</span>
                </button>
              ))}
            </>
          )}
        </section>
      )}

      {remaining.length > 0 && (
        <section className="today-reminders">
          <h3>{t('today.reminders')}</h3>
          {remaining.map((r) => (
            <div key={r.id} className="today-reminder">
              <button className="today-reminder-check" onClick={() => completeReminder(r)} aria-label={t('today.completeReminder')}>○</button>
              <button className="today-reminder-body" onClick={() => onOpenNote(r.noteId)}>
                <span className="today-reminder-msg">{r.message || r.noteId}</span>
                <span className="today-reminder-when">{new Date(r.remindAt).toLocaleString()}</span>
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
