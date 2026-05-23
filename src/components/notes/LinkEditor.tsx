import { useMemo, useState } from 'react';
import type { KnowledgeNote } from '../../types';

/**
 * Cross-note link manager shown in NoteDetail's manual edit tab.
 *
 * Displays already-selected links as removable chips, and a searchable
 * checkbox list of candidate notes. Search matches title, category, summary,
 * tags, and note id.
 */
export function LinkEditor({
  notes,
  noteId,
  links,
  onToggleLink,
}: {
  notes: KnowledgeNote[];
  noteId: string;
  links: string[];
  onToggleLink: (id: string) => void;
}) {
  const [query, setQuery] = useState('');

  const candidateLinks = useMemo(() => notes.filter((item) => item.id !== noteId), [noteId, notes]);
  const selectedLinkNotes = links
    .map((id) => notes.find((item) => item.id === id))
    .filter((item): item is KnowledgeNote => Boolean(item));

  const filteredCandidateLinks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidateLinks.filter((item) => links.includes(item.id)).slice(0, 8);
    return candidateLinks
      .filter((item) => {
        const hay = `${item.title} ${item.category} ${item.summary} ${item.tags.join(' ')} ${item.id}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => Number(links.includes(b.id)) - Number(links.includes(a.id)))
      .slice(0, 12);
  }, [candidateLinks, query, links]);

  return (
    <div className="link-editor">
      <div className="link-editor-head">
        <div className="edit-label">Links to other notes</div>
        <span>{links.length} selected</span>
      </div>
      <input
        className="link-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by title, category, tag, summary, or id..."
      />
      {selectedLinkNotes.length > 0 && (
        <div className="selected-links">
          {selectedLinkNotes.map((item) => (
            <button key={item.id} onClick={() => onToggleLink(item.id)} title="Remove link">
              {item.title}
              <span>x</span>
            </button>
          ))}
        </div>
      )}
      {candidateLinks.length === 0 && <div className="fine">No other notes to link yet.</div>}
      {candidateLinks.length > 0 && filteredCandidateLinks.length === 0 && (
        <div className="fine">{query.trim() ? 'No notes match that search.' : 'Search to add more linked notes.'}</div>
      )}
      {filteredCandidateLinks.map((item) => (
        <label key={item.id} className="link-choice">
          <input type="checkbox" checked={links.includes(item.id)} onChange={() => onToggleLink(item.id)} />
          <span>{item.title}</span>
          <em>{item.category}</em>
        </label>
      ))}
    </div>
  );
}
