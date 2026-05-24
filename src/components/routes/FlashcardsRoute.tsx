import { useSearchParams, useParams } from 'react-router-dom';
import type { Flashcard, KnowledgeNote } from '../../types';
import type { UiCategory } from '../../lib/view';
import FlashcardsPage from '../flashcards/FlashcardsPage';
import { deleteFlashcard } from '../../api';

function parseCsv(param: string | null): string[] {
  if (!param) return [];
  return decodeURIComponent(param).split(',').map((s) => s.trim()).filter(Boolean);
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { '*': wildcardPath } = useParams();

  const category = searchParams.get('category') || '';
  const tag = searchParams.get('tag') || '';
  const cardIdFromUrl = wildcardPath || '';
  const scope: 'all' | 'category' | 'tag' = category ? 'category' : tag ? 'tag' : 'all';
  const value = category || tag || '';

  const searchQuery = searchParams.get('search') || '';
  const kindFilter = searchParams.get('kind') || null;
  const ratingFilter = searchParams.get('rating') || null;
  const selectedCategories = parseCsv(searchParams.get('cats'));
  const selectedTags = parseCsv(searchParams.get('tags'));

  const handleDeleteFlashcard = async (cardId: string) => {
    try {
      await deleteFlashcard(cardId);
    } catch (e) {
      console.error('Failed to delete flashcard', e);
    }
  };

  const handleFiltersChange = (updates: {
    search?: string;
    kind?: string | null;
    rating?: string | null;
    cats?: string[];
    tags?: string[];
  }) => {
    const next = new URLSearchParams(searchParams);
    if (updates.search !== undefined) updates.search ? next.set('search', updates.search) : next.delete('search');
    if (updates.kind !== undefined) updates.kind ? next.set('kind', updates.kind) : next.delete('kind');
    if (updates.rating !== undefined) updates.rating ? next.set('rating', updates.rating) : next.delete('rating');
    if (updates.cats !== undefined) updates.cats.length ? next.set('cats', updates.cats.map(encodeURIComponent).join(',')) : next.delete('cats');
    if (updates.tags !== undefined) updates.tags.length ? next.set('tags', updates.tags.map(encodeURIComponent).join(',')) : next.delete('tags');
    // Preserve existing category/tag params
    if (category) next.set('category', category);
    if (tag) next.set('tag', tag);
    setSearchParams(next, { replace: true });
  };

  return (
    <FlashcardsPage
      flashcards={flashcards}
      notes={notes}
      categories={categories}
      tagCounts={tagCounts}
      scope={scope}
      value={value}
      cardIdFromUrl={cardIdFromUrl || undefined}
      searchQuery={searchQuery}
      kindFilter={kindFilter}
      ratingFilter={ratingFilter}
      selectedCategories={selectedCategories}
      selectedTags={selectedTags}
      onScopeChange={onScopeChange}
      onOpenNote={onOpenNote}
      onFiltersChange={handleFiltersChange}
      onDeleteFlashcard={handleDeleteFlashcard}
    />
  );
}
