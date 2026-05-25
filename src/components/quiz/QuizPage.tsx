import { useCallback, useMemo, useState } from 'react';
import type { QuizQuestion, QuizQuestionType } from '../../types';
import type { UiCategory } from '../../lib/view';
import { reviewQuiz, hideQuiz } from '../../api';
import QuizStudy from './QuizStudy';
import QuizBrowse from './QuizBrowse';

export default function QuizPage({
  questions,
  categories,
  tagCounts,
  initialCategory,
  initialTag,
  onScopeChange,
}: {
  questions: QuizQuestion[];
  categories: UiCategory[];
  tagCounts: [string, number][];
  initialCategory?: string;
  initialTag?: string;
  onScopeChange?: (scope: 'all' | 'category' | 'tag', value?: string) => void;
}) {
  const [studying, setStudying] = useState(false);
  const [activeCategories, setActiveCategories] = useState<string[]>(initialCategory ? [initialCategory] : []);
  const [activeTags, setActiveTags] = useState<string[]>(initialTag ? [initialTag] : []);
  const [activeTypes, setActiveTypes] = useState<QuizQuestionType[]>([]);
  const [search, setSearch] = useState('');
  const [localQuestions, setLocalQuestions] = useState(questions);

  // Keep localQuestions in sync when parent updates (polls), except streak/reviewData changes from sessions
  const questionsKey = questions.map((q) => q.id).join(',');
  const [lastKey, setLastKey] = useState(questionsKey);
  if (questionsKey !== lastKey) {
    setLastKey(questionsKey);
    setLocalQuestions(questions);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return localQuestions.filter((qn) => {
      if (activeCategories.length && !activeCategories.includes(qn.category)) return false;
      if (activeTags.length && !activeTags.some((t) => qn.tags.includes(t))) return false;
      if (activeTypes.length && !activeTypes.includes(qn.type)) return false;
      if (!q) return true;
      return (qn.question + ' ' + qn.answer + ' ' + qn.noteTitle).toLowerCase().includes(q);
    });
  }, [localQuestions, activeCategories, activeTags, activeTypes, search]);

  // Smart session: due-first, then new, then scheduled
  const sessionQuestions = useMemo(() => {
    const now = Date.now();
    const due = filtered.filter((q) => !q.reviewData?.nextReviewAt || Date.parse(q.reviewData.nextReviewAt) <= now);
    if (due.length > 0) return due;
    return filtered;
  }, [filtered]);

  const toggleType = useCallback((t: QuizQuestionType) => {
    setActiveTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }, []);

  async function handleRate(question: QuizQuestion, rating: 'correct' | 'wrong') {
    try {
      await reviewQuiz(question.id, {
        rating,
        noteId: question.noteId,
        currentStreak: question.reviewData?.streak ?? 0,
      });
      // Optimistically update local review state
      setLocalQuestions((prev) => prev.map((q) => {
        if (q.id !== question.id) return q;
        const newStreak = rating === 'correct' ? (q.reviewData?.streak ?? 0) + 1 : 0;
        const daysOut = rating === 'wrong' ? 1 : newStreak === 1 ? 3 : newStreak === 2 ? 7 : 14;
        const next = new Date();
        next.setDate(next.getDate() + daysOut);
        return {
          ...q,
          reviewData: {
            nextReviewAt: next.toISOString(),
            lastReviewAt: new Date().toISOString(),
            lastRating: rating,
            streak: newStreak,
          },
        };
      }));
    } catch {
      // silent — will be correct after next poll
    }
  }

  async function handleHide(id: string) {
    try {
      await hideQuiz(id);
      setLocalQuestions((prev) => prev.filter((q) => q.id !== id));
    } catch {
      // silent
    }
  }

  if (studying) {
    return (
      <QuizStudy
        questions={sessionQuestions}
        onRate={handleRate}
        onExit={() => setStudying(false)}
      />
    );
  }

  return (
    <QuizBrowse
      questions={localQuestions}
      categories={categories}
      tagCounts={tagCounts}
      activeCategories={activeCategories}
      activeTags={activeTags}
      activeTypes={activeTypes}
      search={search}
      onSearchChange={setSearch}
      onCategoriesChange={setActiveCategories}
      onTagsChange={setActiveTags}
      onToggleType={toggleType}
      onStudy={() => setStudying(true)}
      onHide={handleHide}
    />
  );
}
