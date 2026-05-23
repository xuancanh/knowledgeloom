import { useSearchParams } from 'react-router-dom';
import type { Flashcard, KnowledgeNote } from '../../types';
import type { UiCategory } from '../../lib/view';
import FlashcardsPage from '../flashcards/FlashcardsPage';

/**
 * Route wrapper for `/flashcards`.
 *
 * Reads `?category=` or `?tag=` from the search params to determine the
 * active scope (all / category / tag) and passes it to `<FlashcardsPage>`.
 */
export function FlashcardsRoute({
  flashcards, notes, categories, tagCounts, onScopeChange, onOpenNote,
}: {
  flashcards: Flashcard[];
  notes: KnowledgeNote[];
  categories: UiCategory[];
  tagCounts: [string, number][];
  onScopeChange: (scope: 'all' | 'category' | 'tag', value?: string) => void;
  onOpenNote: (id: string) => void;
}) {
  const [searchParams] = useSearchParams();
  const category = searchParams.get('category') || '';
  const tag = searchParams.get('tag') || '';
  const scope: 'all' | 'category' | 'tag' = category ? 'category' : tag ? 'tag' : 'all';

  return (
    <FlashcardsPage
      flashcards={flashcards}
      notes={notes}
      categories={categories}
      tagCounts={tagCounts}
      scope={scope}
      value={category || tag || ''}
      onScopeChange={onScopeChange}
      onOpenNote={onOpenNote}
    />
  );
}
