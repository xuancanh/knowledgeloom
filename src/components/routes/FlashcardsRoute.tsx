import { useSearchParams, useParams } from 'react-router-dom';
import type { Flashcard, KnowledgeNote } from '../../types';
import type { UiCategory } from '../../lib/view';
import FlashcardsPage from '../flashcards/FlashcardsPage';
import { deleteFlashcard } from '../../api';

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
  const { '*': wildcardPath } = useParams();
  const category = searchParams.get('category') || '';
  const tag = searchParams.get('tag') || '';
  const cardIdFromUrl = wildcardPath || '';
  const scope: 'all' | 'category' | 'tag' = category ? 'category' : tag ? 'tag' : 'all';

  const handleDeleteFlashcard = async (cardId: string) => {
    try {
      await deleteFlashcard(cardId);
    } catch (e) {
      console.error('Failed to delete flashcard', e);
    }
  };

  return (
    <FlashcardsPage
      flashcards={flashcards}
      notes={notes}
      categories={categories}
      tagCounts={tagCounts}
      scope={scope}
      value={category || tag || ''}
      cardIdFromUrl={cardIdFromUrl || undefined}
      onScopeChange={onScopeChange}
      onOpenNote={onOpenNote}
      onDeleteFlashcard={handleDeleteFlashcard}
    />
  );
}
