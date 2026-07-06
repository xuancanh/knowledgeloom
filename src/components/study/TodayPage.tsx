/**
 * TodayPage — the unified daily study queue (GET /api/study/today).
 *
 * One screen that merges everything due right now: flashcards (SM-2 due +
 * capped new), quiz questions, and reminders. Reviews are submitted through
 * the same endpoints the flashcards/quiz pages use, so schedules stay
 * consistent no matter where the user studies.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Flashcard, QuizQuestion, Reminder } from '../../types';
import { fetchStudyToday, fetchStudyStats, reviewFlashcard, reviewQuiz, updateReminder, type StudyQueue, type StudyStats } from '../../api';

type Phase = 'loading' | 'ready' | 'error';

export default function TodayPage({ onOpenNote }: { onOpenNote: (id: string) => void }) {
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
    reviewFlashcard(card.id, { rating, noteId: card.noteId, isUserCard: (card as any).isUserCreated })
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

  if (phase === 'loading') return <div className="today-page"><div className="today-empty">Loading today’s queue…</div></div>;
  if (phase === 'error' || !queue) {
    return (
      <div className="today-page">
        <div className="today-empty">
          Couldn’t load the study queue.
          <button className="today-btn" onClick={() => void load()}>Retry</button>
        </div>
      </div>
    );
  }

  const allDone = fcIndex >= cards.length && quizIndex >= questions.length;

  return (
    <div className="today-page">
      <header className="today-head">
        <h1>Today</h1>
        <div className="today-counts">
          <span className="today-chip fc">{queue.counts.dueFlashcards} due · {queue.counts.newFlashcards} new cards</span>
          <span className="today-chip qz">{queue.counts.quiz} quiz</span>
          <span className="today-chip rm">{remaining.length} reminders</span>
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
          <h2>{totalItems ? 'Queue cleared — nice work.' : 'Nothing due today.'}</h2>
          <p>{totalItems ? `${doneItems} item${doneItems === 1 ? '' : 's'} reviewed.` : 'Capture something new or come back tomorrow.'}</p>
          <button className="today-btn" onClick={() => void load()}>Refresh queue</button>
        </section>
      ) : card ? (
        <section className="today-card-zone">
          <div className="today-zone-label">Flashcard {fcIndex + 1} of {cards.length}</div>
          <div
            className={`today-card${flipped ? ' flipped' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setFlipped(true)}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(true); } }}
          >
            <div className="today-card-prompt">{card.prompt}</div>
            {flipped
              ? <div className="today-card-lesson">{card.lesson}</div>
              : <div className="today-card-hint">Tap to reveal</div>}
            <button
              className="today-note-ref"
              onClick={(e) => { e.stopPropagation(); onOpenNote(card.noteId); }}
            >
              {card.noteTitle} ↗
            </button>
          </div>
          {flipped && (
            <div className="today-rate-row">
              <button className="today-rate again" onClick={() => rateCard('again')}>Again</button>
              <button className="today-rate hard" onClick={() => rateCard('hard')}>Hard</button>
              <button className="today-rate good" onClick={() => rateCard('good')}>Good</button>
            </div>
          )}
        </section>
      ) : question ? (
        <section className="today-card-zone">
          <div className="today-zone-label">Quiz {quizIndex + 1} of {questions.length}</div>
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
                      Next
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
                        <button className="today-rate again" onClick={() => answerQuiz(false)}>Missed it</button>
                        <button className="today-rate good" onClick={() => answerQuiz(true)}>Got it</button>
                      </div>
                    </>
                  )
                  : <button className="today-btn" onClick={() => setRevealed(true)}>Show answer</button>}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {stats && stats.totals.reviews > 0 && (
        <section className="today-stats">
          <h3>Last {stats.windowDays} days</h3>
          <div className="today-stat-row">
            <div className="today-stat">
              <span className="today-stat-num">{stats.totals.reviews}</span>
              <span className="today-stat-label">reviews</span>
            </div>
            <div className="today-stat">
              <span className="today-stat-num">{stats.totals.successRate != null ? `${Math.round(stats.totals.successRate * 100)}%` : '—'}</span>
              <span className="today-stat-label">overall success</span>
            </div>
            <div className="today-stat">
              <span className="today-stat-num">{stats.totals.retention1d != null ? `${Math.round(stats.totals.retention1d * 100)}%` : '—'}</span>
              <span className="today-stat-label">recall after 1d+</span>
            </div>
            <div className="today-stat">
              <span className="today-stat-num">{stats.totals.retention7d != null ? `${Math.round(stats.totals.retention7d * 100)}%` : '—'}</span>
              <span className="today-stat-label">recall after 7d+</span>
            </div>
          </div>
          {stats.weakestTopics.length > 0 && (
            <>
              <h4>Weakest topics</h4>
              {stats.weakestTopics.slice(0, 5).map((t) => (
                <button key={t.noteId} className="today-weak-topic" onClick={() => onOpenNote(t.noteId)}>
                  <span className="today-weak-rate">{Math.round(t.successRate * 100)}%</span>
                  <span className="today-weak-title">{t.title}</span>
                  <span className="today-weak-meta">{t.category} · {t.attempts} attempts</span>
                </button>
              ))}
            </>
          )}
        </section>
      )}

      {remaining.length > 0 && (
        <section className="today-reminders">
          <h3>Reminders</h3>
          {remaining.map((r) => (
            <div key={r.id} className="today-reminder">
              <button className="today-reminder-check" onClick={() => completeReminder(r)} aria-label="Complete reminder">○</button>
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
