/**
 * SharePage — public read-only view of a shared note + its study deck.
 * Reached via /share/:id with no authentication; the 128-bit id is the key.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchPublicShare, type PublicShare } from '../../api';
import { parseMarkdownBlocks } from '../../lib/view';

export default function SharePage() {
  const { id } = useParams<{ id: string }>();
  const [share, setShare] = useState<PublicShare | null>(null);
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [picked, setPicked] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!id) return;
    fetchPublicShare(id).then(setShare).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.'));
  }, [id]);

  if (error) {
    return (
      <div className="today-page share-page">
        <div className="today-empty">{error}</div>
      </div>
    );
  }
  if (!share) return <div className="today-page share-page"><div className="today-empty">Loading…</div></div>;

  const isCollection = share.kind === 'category';
  const headerNote = share.note;

  return (
    <div className="today-page share-page">
      <header className="today-head">
        <div className="share-badge">{isCollection ? 'Shared collection · read-only' : 'Shared note · read-only'}</div>
        {isCollection ? (
          <>
            <h1>{share.collection?.name}</h1>
            <div className="today-counts">
              <span className="today-chip">{share.collection?.noteCount} notes</span>
              <span className="today-chip">{share.flashcards.length} flashcards</span>
              <span className="today-chip">{share.quiz.length} quiz questions</span>
            </div>
          </>
        ) : headerNote && (
          <>
            <h1>{headerNote.title}</h1>
            <div className="today-counts">
              <span className="today-chip">{headerNote.category}</span>
              {headerNote.tags.map((t) => <span key={t} className="today-chip">#{t}</span>)}
            </div>
            {headerNote.summary && <p className="import-sub">{headerNote.summary}</p>}
          </>
        )}
      </header>

      {isCollection ? (
        <section>
          {(share.notes || []).map((n, ni) => (
            <details key={ni} className="share-collection-note">
              <summary>
                <strong>{n.title}</strong>
                {n.summary && <span className="share-note-summary"> — {n.summary}</span>}
              </summary>
              <div className="share-body">
                {parseMarkdownBlocks(n.body).map((b, i) =>
                  b.type === 'h' ? <h3 key={i}>{b.text}</h3>
                  : b.type === 'q' ? <blockquote key={i}>{b.text}</blockquote>
                  : <p key={i}>{b.text}</p>,
                )}
              </div>
            </details>
          ))}
        </section>
      ) : headerNote && (
        <section className="share-body">
          {parseMarkdownBlocks(headerNote.body).map((b, i) =>
            b.type === 'h' ? <h3 key={i}>{b.text}</h3>
            : b.type === 'q' ? <blockquote key={i}>{b.text}</blockquote>
            : <p key={i}>{b.text}</p>,
          )}
        </section>
      )}

      {share.flashcards.length > 0 && (
        <section>
          <h3 className="share-section-title">Flashcards ({share.flashcards.length})</h3>
          <div className="share-cards">
            {share.flashcards.map((c, i) => (
              <div
                key={i}
                className="today-card share-flash"
                role="button"
                tabIndex={0}
                onClick={() => setFlipped((prev) => new Set(prev).add(i))}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped((prev) => new Set(prev).add(i)); } }}
              >
                <div className="today-card-prompt">{c.prompt}</div>
                {flipped.has(i)
                  ? <div className="today-card-lesson">{c.lesson}</div>
                  : <div className="today-card-hint">Tap to reveal</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {share.quiz.length > 0 && (
        <section>
          <h3 className="share-section-title">Quiz ({share.quiz.length})</h3>
          {share.quiz.map((q, i) => (
            <div key={i} className="today-card static share-quiz">
              <div className="today-card-prompt">{q.question}</div>
              {q.type === 'multiple-choice' && q.choices ? (
                <div className="today-choices">
                  {q.choices.map((choice, ci) => {
                    const revealed = picked[i] != null;
                    const isCorrect = revealed && ci === q.correctIndex;
                    const isWrong = revealed && picked[i] === ci && ci !== q.correctIndex;
                    return (
                      <button
                        key={ci}
                        className={`today-choice${isCorrect ? ' correct' : ''}${isWrong ? ' wrong' : ''}`}
                        disabled={revealed}
                        onClick={() => setPicked((prev) => ({ ...prev, [i]: ci }))}
                      >
                        {choice}
                      </button>
                    );
                  })}
                  {picked[i] != null && q.explanation && <p className="today-explain">{q.explanation}</p>}
                </div>
              ) : (
                <div className="today-choices">
                  {picked[i] != null
                    ? <p className="today-answer">{q.answer}</p>
                    : <button className="today-btn" onClick={() => setPicked((prev) => ({ ...prev, [i]: 0 }))}>Show answer</button>}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <footer className="share-footer">
        Built with Knowledge Loom — a second brain that makes you learn.
      </footer>
    </div>
  );
}
