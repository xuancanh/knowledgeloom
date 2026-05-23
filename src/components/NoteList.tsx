import type { KnowledgeNote } from '../types';
import { categoryId, formatCreated, type UiCategory } from '../lib/view';

/**
 * Tiny category color marker used inside note list metadata.
 */
function CategoryDot({ catId, categories }: { catId: string; categories: UiCategory[] }) {
  const cat = categories.find((item) => item.id === catId);
  return <span className={`dot ${cat?.color || 'oxblood'}`} />;
}

/**
 * Clickable row for one note in recent/category lists.
 */
function NoteRow({
  note,
  categories,
  onOpen,
  onOpenTag,
}: {
  note: KnowledgeNote;
  categories: UiCategory[];
  onOpen: (id: string) => void;
  onOpenTag?: (tag: string) => void;
}) {
  const catId = categoryId(note.category);
  const cat = categories.find((item) => item.id === catId);
  return (
    <div className="note-row" onClick={() => onOpen(note.id)}>
      <div className="date mono">{formatCreated(note.createdAt).replace(/-/g, '.')}</div>
      <div className="body">
        <div className="title">{note.title}</div>
        <div className="summary">{note.summary || 'No summary yet.'}</div>
        {!!note.tags.length && onOpenTag && (
          <div className="row-tags">
            {note.tags.slice(0, 4).map((tag) => (
              <button
                key={tag}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenTag(tag);
                }}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="meta">
        <span className="cat">
          <CategoryDot catId={catId} categories={categories} />
          {cat?.name || note.category}
        </span>
        <span>{note.tags.length} tags · {note.links.length} links</span>
      </div>
    </div>
  );
}

/**
 * Shared note list used by the home desk and category pages.
 */
export default function NoteList({
  notes,
  categories,
  onOpen,
  onOpenTag,
}: {
  notes: KnowledgeNote[];
  categories: UiCategory[];
  onOpen: (id: string) => void;
  onOpenTag?: (tag: string) => void;
}) {
  return (
    <div className="note-list">
      {notes.map((note) => (
        <NoteRow key={note.id} note={note} categories={categories} onOpen={onOpen} onOpenTag={onOpenTag} />
      ))}
      {!notes.length && <div className="empty">No notes in this view yet.</div>}
    </div>
  );
}
