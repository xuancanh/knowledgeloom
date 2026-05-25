import { useMemo, useState } from 'react';
import type { KnowledgeNote } from '../../types';

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

  const candidates = useMemo(() => notes.filter((n) => n.id !== noteId), [noteId, notes]);

  const selectedNotes = useMemo(
    () => links.map((id) => notes.find((n) => n.id === id)).filter((n): n is KnowledgeNote => Boolean(n)),
    [links, notes],
  );

  const visibleCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.filter((n) => links.includes(n.id)).slice(0, 8);
    return candidates
      .filter((n) => {
        const hay = `${n.title} ${n.category} ${n.summary} ${n.tags.join(' ')} ${n.id}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => Number(links.includes(b.id)) - Number(links.includes(a.id)))
      .slice(0, 12);
  }, [candidates, query, links]);

  return (
    <div className="link-editor">
      <div className="link-search-row">
        <input
          className="link-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes to link…"
        />
        {links.length > 0 && <span className="link-count">{links.length}</span>}
      </div>

      {selectedNotes.length > 0 && (
        <div className="selected-links">
          {selectedNotes.map((n) => (
            <button key={n.id} className="selected-link-chip" onClick={() => onToggleLink(n.id)} title="Remove link">
              {n.title}
              <span className="selected-link-remove">×</span>
            </button>
          ))}
        </div>
      )}

      {candidates.length === 0 && (
        <p className="link-empty">No other notes to link yet.</p>
      )}
      {candidates.length > 0 && visibleCandidates.length === 0 && (
        <p className="link-empty">{query.trim() ? 'No notes match.' : 'Search to find notes to link.'}</p>
      )}

      {visibleCandidates.map((n) => (
        <label key={n.id} className="link-row">
          <input
            type="checkbox"
            className="link-checkbox"
            checked={links.includes(n.id)}
            onChange={() => onToggleLink(n.id)}
          />
          <span className="link-row-title">{n.title}</span>
          <span className="link-row-cat">{n.category}</span>
        </label>
      ))}
    </div>
  );
}
