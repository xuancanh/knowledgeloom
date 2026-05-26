import { useTranslation } from 'react-i18next';
import type { QuizQuestion } from '../../types';

export function FillBlankQuestion({ question, revealed, userInput, onInput }: {
  question: QuizQuestion;
  revealed: boolean;
  userInput: string;
  onInput: (v: string) => void;
}) {
  const { t } = useTranslation();
  const parts = question.question.split('___');
  const isCorrect = revealed && userInput.trim().toLowerCase() === question.answer.trim().toLowerCase();

  return (
    <div className="qz-fill-blank">
      <p className="qz-sentence">
        {parts[0]}
        {revealed ? (
          <span className={`qz-blank-answer ${isCorrect ? 'correct' : 'wrong'}`}>{question.answer}</span>
        ) : (
          <input
            className="qz-blank-input"
            value={userInput}
            onChange={(e) => onInput(e.target.value)}
            placeholder={t('quiz.typeAnswer')}
            autoFocus
            spellCheck={false}
          />
        )}
        {parts[1] || ''}
      </p>
      {revealed && userInput.trim() && (
        <p className={`qz-your-answer ${isCorrect ? 'correct' : 'wrong'}`}>
          {t('quiz.yourAnswer')}: <em>{userInput.trim()}</em>
        </p>
      )}
    </div>
  );
}

export function MultipleChoiceQuestion({ question, revealed, selectedIndex, onSelect }: {
  question: QuizQuestion;
  revealed: boolean;
  selectedIndex: number | null;
  onSelect: (i: number) => void;
}) {
  const choices = question.choices ?? [];

  return (
    <div className="qz-mc">
      <p className="qz-mc-question">{question.question}</p>
      <div className="qz-choices">
        {choices.map((choice, i) => {
          let cls = 'qz-choice';
          if (revealed) {
            if (i === question.correctIndex) cls += ' correct';
            else if (i === selectedIndex) cls += ' wrong';
          } else if (i === selectedIndex) {
            cls += ' selected';
          }
          return (
            <button
              key={i}
              className={cls}
              onClick={() => !revealed && onSelect(i)}
              disabled={revealed}
            >
              <span className="qz-choice-letter">{String.fromCharCode(65 + i)}</span>
              <span className="qz-choice-text">{choice}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ShortAnswerQuestion({ question, revealed, userInput, onInput }: {
  question: QuizQuestion;
  revealed: boolean;
  userInput: string;
  onInput: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="qz-short">
      <p className="qz-short-question">{question.question}</p>
      {!revealed ? (
        <textarea
          className="qz-short-input"
          value={userInput}
          onChange={(e) => onInput(e.target.value)}
          placeholder={t('quiz.typeAnswer')}
          rows={4}
          autoFocus
        />
      ) : (
        <div className="qz-short-answers">
          {userInput.trim() && (
            <div className="qz-short-yours">
              <span className="qz-short-label">{t('quiz.yourAnswer')}</span>
              <p>{userInput.trim()}</p>
            </div>
          )}
          <div className="qz-short-ref">
            <span className="qz-short-label">{t('quiz.referenceAnswer')}</span>
            <p>{question.answer}</p>
          </div>
          {question.explanation && (
            <div className="qz-short-expl">
              <span className="qz-short-label">{t('quiz.keyPoint')}</span>
              <p>{question.explanation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
