import { useParams, useSearchParams } from 'react-router-dom';
import type { Flashcard, KnowledgeNote } from '../../types';
import type { UiCategory } from '../../lib/view';
import TagIndex from '../tags/TagIndex';

/**
 * Route wrapper for `/tags/:tag`.
 *
 * Extracts the tag from the URL (URI-decoded) and the optional `?page=N`
 * query parameter. Delegates rendering and pagination to `<TagIndex>`.
 */
export function TagRoute({
  notes, categories, flashcards, readNoteIds,
  onOpen, onOpenTag, onOpenFlashcards,
}: {
  notes: KnowledgeNote[];
  categories: UiCategory[];
  flashcards: Flashcard[];
  readNoteIds?: string[];
  onOpen: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onOpenFlashcards: (t: string) => void;
}) {
  const { tag } = useParams<{ tag: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') || '1');

  function handlePage(p: number) {
    if (p <= 1) setSearchParams({});
    else setSearchParams({ page: String(p) });
  }

  if (!tag) return null;
  return (
    <TagIndex
      tag={decodeURIComponent(tag)}
      notes={notes}
      categories={categories}
      flashcards={flashcards}
      readNoteIds={readNoteIds}
      page={page}
      onOpen={onOpen}
      onOpenTag={onOpenTag}
      onOpenFlashcards={onOpenFlashcards}
      onPage={handlePage}
    />
  );
}
