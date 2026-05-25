import { useTranslation } from 'react-i18next';
import type { KnowledgeNote } from '../types';
import { categoryId, formatCreated, type UiCategory } from '../lib/view';

/** Note list display mode: list rows, grid cards, or compact rows. */
export type ViewMode = 'list' | 'grid' | 'compact';

function CategoryDot({ catId, categories }: { catId: string; categories: UiCategory[] }) {
  const cat = categories.find((item) => item.id === catId);
  return <span className={`dot ${cat?.color || 'oxblood'}`} />;
}

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
  const { t } = useTranslation();
  const catId = categoryId(note.category);
  const cat = categories.find((item) => item.id === catId);
  return (
    <div className="note-row" onClick={() => onOpen(note.id)}>
      <div className="date mono">{formatCreated(note.createdAt).replace(/-/g, '.')}</div>
      <div className="body">
        <div className="title">{note.title}</div>
        <div className="summary">{note.summary || t('common.noSummary')}</div>
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
        <span>{t('common.tagsLinksCount', { tags: note.tags.length, links: note.links.length })}</span>
      </div>
    </div>
  );
}

function NoteCard({
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
  const { t } = useTranslation();
  const catId = categoryId(note.category);
  const cat = categories.find((item) => item.id === catId);
  return (
    <div className="note-card" onClick={() => onOpen(note.id)}>
      <div className="nc-meta">
        <span className="nc-cat">
          <CategoryDot catId={catId} categories={categories} />
          {cat?.name || note.category}
        </span>
        <span className="nc-date mono">{formatCreated(note.createdAt)}</span>
      </div>
      <div className="nc-title">{note.title}</div>
      {note.summary && <div className="nc-summary">{note.summary}</div>}
      {!!note.tags.length && onOpenTag && (
        <div className="nc-tags">
          {note.tags.slice(0, 3).map((tag) => (
            <button
              key={tag}
              onClick={(e) => { e.stopPropagation(); onOpenTag(tag); }}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
      <div className="nc-foot">
        <span>{note.links.length} {t('common.links')}</span>
      </div>
    </div>
  );
}

function NoteCompactRow({
  note,
  categories,
  onOpen,
}: {
  note: KnowledgeNote;
  categories: UiCategory[];
  onOpen: (id: string) => void;
}) {
  const catId = categoryId(note.category);
  const cat = categories.find((item) => item.id === catId);
  return (
    <div className="note-compact-row" onClick={() => onOpen(note.id)}>
      <span className="ncr-date mono">{formatCreated(note.createdAt).replace(/-/g, '.')}</span>
      <span className="ncr-title">{note.title}</span>
      <span className="ncr-cat">
        <CategoryDot catId={catId} categories={categories} />
        {cat?.name || note.category}
      </span>
    </div>
  );
}

export default function NoteList({
  notes,
  categories,
  onOpen,
  onOpenTag,
  viewMode = 'list',
}: {
  notes: KnowledgeNote[];
  categories: UiCategory[];
  onOpen: (id: string) => void;
  onOpenTag?: (tag: string) => void;
  viewMode?: ViewMode;
}) {
  if (!notes.length) return <div className="empty">No notes in this view yet.</div>;

  if (viewMode === 'grid') {
    return (
      <div className="note-grid">
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} categories={categories} onOpen={onOpen} onOpenTag={onOpenTag} />
        ))}
      </div>
    );
  }

  if (viewMode === 'compact') {
    return (
      <div className="note-compact-list">
        {notes.map((note) => (
          <NoteCompactRow key={note.id} note={note} categories={categories} onOpen={onOpen} />
        ))}
      </div>
    );
  }

  return (
    <div className="note-list">
      {notes.map((note) => (
        <NoteRow key={note.id} note={note} categories={categories} onOpen={onOpen} onOpenTag={onOpenTag} />
      ))}
    </div>
  );
}
