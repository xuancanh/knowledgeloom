import { useSearchParams } from 'react-router-dom';
import type { QuizQuestion } from '../../types';
import type { UiCategory } from '../../lib/view';
import QuizPage from '../quiz/QuizPage';

export function QuizRoute({
  questions,
  categories,
  tagCounts,
  onScopeChange,
}: {
  questions: QuizQuestion[];
  categories: UiCategory[];
  tagCounts: [string, number][];
  onScopeChange?: (scope: 'all' | 'category' | 'tag', value?: string) => void;
}) {
  const [params] = useSearchParams();
  const initialCategory = params.get('category') ?? undefined;
  const initialTag = params.get('tag') ?? undefined;

  return (
    <QuizPage
      questions={questions}
      categories={categories}
      tagCounts={tagCounts}
      initialCategory={initialCategory}
      initialTag={initialTag}
      onScopeChange={onScopeChange}
    />
  );
}
