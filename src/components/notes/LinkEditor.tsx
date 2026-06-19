import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KnowledgeNote } from '../../types';

export function LinkEditor({
  notes,
  noteId,
  links,
  bilinks = [],
  onToggleLink,
  onToggleBilink,
}: {
  notes: KnowledgeNote[];
  noteId: string;
  links: string[];
  bilinks?: string[];
  onToggleLink: (id: string) => void;
  onToggleBilink?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const allLinked = useMemo(() => [...new Set([...links, ...bilinks])], [links, bilinks]);
  const candidates = useMemo(() => notes.filter((n) => n.id !== noteId), [noteId, notes]);

  const selectedNotes = useMemo(
    () => allLinked.map((id) => notes.find((n) => n.id === id)).filter((n): n is KnowledgeNote => Boolean(n)),
    [allLinked, notes],
  );

  const visibleCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.filter((n) => allLinked.includes(n.id)).slice(0, 8);
    return candidates
      .filter((n) => {
        const hay = `${n.title} ${n.category} ${n.summary} ${n.tags.join(' ')} ${n.id}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => Number(allLinked.includes(b.id)) - Number(allLinked.includes(a.id)))
      .slice(0, 12);
  }, [candidates, query, allLinked]);

  function toggleDirection(id: string) {
    if (!onToggleBilink) return;
    if (bilinks.includes(id)) {
      // bi → mono: remove from bilinks, add to links
      onToggleBilink(id);
      if (!links.includes(id)) onToggleLink(id);
    } else {
      // mono → bi: remove from links, add to bilinks
      onToggleBilink(id);
      if (links.includes(id)) onToggleLink(id);
    }
  }

  function handleCheck(id: string) {
    const inLinks = links.includes(id);
    const inBilinks = bilinks.includes(id);
    if (inLinks) {
      onToggleLink(id);
    } else if (inBilinks && onToggleBilink) {
      onToggleBilink(id);
    } else {
      // Not linked yet — add as mono
      onToggleLink(id);
    }
  }

  return (
    <div className="link-editor">
      <div className="link-search-row">
        <input
          className="link-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('notes.searchToLink')}
        />
        {allLinked.length > 0 && <span className="link-count">{allLinked.length}</span>}
      </div>

      {selectedNotes.length > 0 && (
        <div className="selected-links">
          {selectedNotes.map((n) => {
            const isBi = bilinks.includes(n.id);
            return (
              <span key={n.id} className="selected-link-chip-group">
                <button className="selected-link-chip" onClick={() => handleCheck(n.id)} title={t('notes.removeLink')}>
                  {n.title}
                  <span className="selected-link-remove">×</span>
                </button>
                {onToggleBilink && (
                  <button
                    className={`link-dir-btn${isBi ? ' link-dir-bi' : ''}`}
                    onClick={() => toggleDirection(n.id)}
                    title={isBi ? 'Bidirectional — click for mono' : 'Monodirectional — click for bidirectional'}
                  >
                    {isBi ? '↔' : '→'}
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {candidates.length === 0 && (
        <p className="link-empty">{t('notes.noNotesToLink')}</p>
      )}
      {candidates.length > 0 && visibleCandidates.length === 0 && (
        <p className="link-empty">{query.trim() ? t('notes.noNotesMatch') : t('notes.searchToFindNotes')}</p>
      )}

      {visibleCandidates.map((n) => (
        <label key={n.id} className="link-row">
          <input
            type="checkbox"
            className="link-checkbox"
            checked={allLinked.includes(n.id)}
            onChange={() => handleCheck(n.id)}
          />
          <span className="link-row-title">{n.title}</span>
          <span className="link-row-cat">{n.category}</span>
        </label>
      ))}
    </div>
  );
}
