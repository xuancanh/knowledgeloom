/** Public read-only view of a shared note or collection and its study deck. */
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchPublicShare, type ApiError, type PublicShare } from '../../api';
import { parseMarkdownBlocks } from '../../lib/view';
import styles from './SharePage.module.css';

type LoadError = 'notFound' | 'generic' | '';

export default function SharePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [share, setShare] = useState<PublicShare | null>(null);
  const [error, setError] = useState<LoadError>('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState(false);
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [picked, setPicked] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!id) {
      setError('notFound');
      return;
    }
    fetchPublicShare(id)
      .then(setShare)
      .catch((cause: ApiError) => {
        if (cause.status === 401 && cause.payload?.passwordRequired === true) {
          setPasswordRequired(true);
        } else {
          setError(cause.status === 404 ? 'notFound' : 'generic');
        }
      });
  }, [id]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!id || !password) return;
    setUnlocking(true);
    setUnlockError(false);
    try {
      setShare(await fetchPublicShare(id, password));
      setPasswordRequired(false);
      setPassword('');
    } catch (cause) {
      const apiError = cause as ApiError;
      if (apiError.status === 404) setError('notFound');
      else setUnlockError(true);
    } finally {
      setUnlocking(false);
    }
  }

  if (error) {
    return (
      <div className="today-page share-page">
        <div className="today-empty">{t(error === 'notFound' ? 'share.notFound' : 'share.loadError')}</div>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <main className={`today-page share-page ${styles.locked}`}>
        <form className={styles.unlock} onSubmit={unlock}>
          <h1>{t('share.protectedTitle')}</h1>
          <p>{t('share.protectedDescription')}</p>
          <label>
            <span>{t('share.passwordLabel')}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              disabled={unlocking}
            />
          </label>
          {unlockError && <div className={styles.error} role="alert">{t('share.invalidPassword')}</div>}
          <button type="submit" disabled={unlocking || !password}>
            {unlocking ? t('share.unlocking') : t('share.unlock')}
          </button>
        </form>
      </main>
    );
  }

  if (!share) {
    return <div className="today-page share-page"><div className="today-empty">{t('common.loading')}</div></div>;
  }

  const isCollection = share.kind === 'category';
  const headerNote = share.note;

  return (
    <main className="today-page share-page">
      <header className="today-head">
        <div className="share-badge">{t(isCollection ? 'share.collectionBadge' : 'share.noteBadge')}</div>
        {isCollection ? (
          <>
            <h1>{share.collection?.name}</h1>
            <div className="today-counts">
              <span className="today-chip">{t('share.notesCount', { count: share.collection?.noteCount ?? 0 })}</span>
              <span className="today-chip">{t('share.flashcardsCount', { count: share.flashcards.length })}</span>
              <span className="today-chip">{t('share.quizCount', { count: share.quiz.length })}</span>
            </div>
          </>
        ) : headerNote && (
          <>
            <h1>{headerNote.title}</h1>
            <div className="today-counts">
              <span className="today-chip">{headerNote.category}</span>
              {headerNote.tags.map((tag) => <span key={tag} className="today-chip">#{tag}</span>)}
            </div>
            {headerNote.summary && <p className="import-sub">{headerNote.summary}</p>}
          </>
        )}
      </header>

      {isCollection ? (
        <section>
          {(share.notes || []).map((note) => (
            <details key={`${note.title}-${note.createdAt}`} className="share-collection-note">
              <summary>
                <strong>{note.title}</strong>
                {note.summary && <span className="share-note-summary"> - {note.summary}</span>}
              </summary>
              <div className="share-body">
                {parseMarkdownBlocks(note.body).map((block, index) =>
                  block.type === 'h' ? <h3 key={index}>{block.text}</h3>
                  : block.type === 'q' ? <blockquote key={index}>{block.text}</blockquote>
                  : <p key={index}>{block.text}</p>,
                )}
              </div>
            </details>
          ))}
        </section>
      ) : headerNote && (
        <section className="share-body">
          {parseMarkdownBlocks(headerNote.body).map((block, index) =>
            block.type === 'h' ? <h3 key={index}>{block.text}</h3>
            : block.type === 'q' ? <blockquote key={index}>{block.text}</blockquote>
            : <p key={index}>{block.text}</p>,
          )}
        </section>
      )}

      {share.flashcards.length > 0 && (
        <section>
          <h2 className="share-section-title">{t('share.flashcardsHeading', { count: share.flashcards.length })}</h2>
          <div className="share-cards">
            {share.flashcards.map((card, index) => (
              <div
                key={`${card.prompt}-${index}`}
                className="today-card share-flash"
                role="button"
                tabIndex={0}
                aria-label={t('share.revealCard')}
                onClick={() => setFlipped((previous) => new Set(previous).add(index))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setFlipped((previous) => new Set(previous).add(index));
                  }
                }}
              >
                <div className="today-card-prompt">{card.prompt}</div>
                {flipped.has(index)
                  ? <div className="today-card-lesson">{card.lesson}</div>
                  : <div className="today-card-hint">{t('share.tapReveal')}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {share.quiz.length > 0 && (
        <section>
          <h2 className="share-section-title">{t('share.quizHeading', { count: share.quiz.length })}</h2>
          {share.quiz.map((question, index) => (
            <div key={`${question.question}-${index}`} className="today-card static share-quiz">
              <div className="today-card-prompt">{question.question}</div>
              {question.type === 'multiple-choice' && question.choices ? (
                <div className="today-choices">
                  {question.choices.map((choice, choiceIndex) => {
                    const revealed = picked[index] != null;
                    const isCorrect = revealed && choiceIndex === question.correctIndex;
                    const isWrong = revealed && picked[index] === choiceIndex && choiceIndex !== question.correctIndex;
                    return (
                      <button
                        key={choice}
                        className={`today-choice${isCorrect ? ' correct' : ''}${isWrong ? ' wrong' : ''}`}
                        disabled={revealed}
                        onClick={() => setPicked((previous) => ({ ...previous, [index]: choiceIndex }))}
                      >
                        {choice}
                      </button>
                    );
                  })}
                  {picked[index] != null && question.explanation && <p className="today-explain">{question.explanation}</p>}
                </div>
              ) : (
                <div className="today-choices">
                  {picked[index] != null
                    ? <p className="today-answer">{question.answer}</p>
                    : <button className="today-btn" onClick={() => setPicked((previous) => ({ ...previous, [index]: 0 }))}>{t('share.showAnswer')}</button>}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <footer className="share-footer">{t('share.footer')}</footer>
    </main>
  );
}
