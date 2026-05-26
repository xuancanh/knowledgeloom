import { useParams } from 'react-router-dom';
import type { Flashcard, KnowledgeNote } from '../../types';
import type { CategoryTreeNode, UiCategory } from '../../lib/view';
import CategoryIndex from '../categories/CategoryIndex';

/**
 * Route wrapper for `/categories/*`.
 *
 * Reads the splat parameter as a category id, looks it up in the pre-built
 * category tree, and passes the resolved category to `<CategoryIndex>`.
 * Returns null for unknown ids.
 */
export function CategoryRoute({
  notes, categories, categoryById, flashcards, readNoteIds,
  onOpen, onOpenTag, onOpenCategory, onOpenFlashcards,
}: {
  notes: KnowledgeNote[];
  categories: UiCategory[];
  categoryById: Map<string, CategoryTreeNode>;
  flashcards: Flashcard[];
  readNoteIds?: string[];
  onOpen: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onOpenCategory: (id: string) => void;
  onOpenFlashcards: (cat: string) => void;
}) {
  const params = useParams<{ '*': string }>();
  const id = params['*'] ?? '';
  const node = categoryById.get(id) ?? null;
  if (!node) return null;

  const category = {
    ...(node.category ?? {
      slug: node.id, summaries: [], notes: [],
      summary: `Folder containing ${node.count} notes across nested categories.`,
    }),
    id: node.id,
    name: node.id,
    count: node.count,
    color: node.color,
    summary: node.category?.summary ?? `Folder containing ${node.count} notes across nested categories.`,
  };

  return (
    <CategoryIndex
      category={category}
      notes={notes}
      categories={categories}
      flashcards={flashcards}
      readNoteIds={readNoteIds}
      onOpen={onOpen}
      onOpenTag={onOpenTag}
      onOpenCategory={onOpenCategory}
      onOpenFlashcards={onOpenFlashcards}
    />
  );
}
