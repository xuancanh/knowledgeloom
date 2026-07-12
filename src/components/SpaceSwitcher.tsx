/**
 * SpaceSwitcher — dropdown at the top of the rail for jumping between the
 * user's spaces (isolated sub-workspaces). Switching reloads the app so every
 * view refetches under the new scope. Creating a space is inline; rename and
 * delete live in Settings → Spaces.
 */
import { useEffect, useRef, useState } from 'react';
import { fetchSpaces, createSpace } from '../api';
import { currentSpaceId, switchSpace, DEFAULT_SPACE_ID, type Space } from '../lib/spaces';
import { useTranslation } from 'react-i18next';

export default function SpaceSwitcher() {
  const { t } = useTranslation();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeId = currentSpaceId();

  useEffect(() => {
    let alive = true;
    fetchSpaces()
      .then(({ spaces, limit }) => {
        if (!alive) return;
        setSpaces(spaces);
        setLimit(limit);
        // Stored space no longer exists (deleted elsewhere) — fall back.
        if (activeId !== DEFAULT_SPACE_ID && !spaces.some((s) => s.id === activeId)) {
          switchSpace(DEFAULT_SPACE_ID);
        }
      })
      .catch(() => { /* switcher is non-critical; the rail still renders */ });
    return () => { alive = false; };
  }, [activeId]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const active = spaces.find((s) => s.id === activeId);
  const atLimit = limit !== null && spaces.length >= limit;

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setError('');
    try {
      const space = await createSpace(name);
      switchSpace(space.id);
    } catch {
      setError(t('settings.operationFailed'));
    }
  };

  return (
    <div className="space-switcher" ref={wrapRef}>
      <button
        className="space-switcher-btn"
        onClick={() => { setOpen(!open); setCreating(false); setError(''); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('nav.switchSpace')}
      >
        <span className="space-switcher-icon">▣</span>
        <span className="space-switcher-name">{active?.name ?? t('settings.defaultSpace')}</span>
        <span className="space-switcher-caret">▾</span>
      </button>

      {open && (
        <div className="space-switcher-menu" role="listbox">
          {spaces.map((space) => (
            <button
              key={space.id}
              role="option"
              aria-selected={space.id === activeId}
              className={`space-switcher-item${space.id === activeId ? ' active' : ''}`}
              onClick={() => { setOpen(false); if (space.id !== activeId) switchSpace(space.id); }}
            >
              <span className="space-switcher-check">{space.id === activeId ? '✓' : ''}</span>
              <span className="space-switcher-label">{space.name}</span>
            </button>
          ))}

          <div className="space-switcher-divider" />

          {creating ? (
            <div className="space-switcher-create">
              <input
                autoFocus
                value={newName}
                placeholder={t('settings.newSpaceName')}
                maxLength={60}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitCreate();
                  if (e.key === 'Escape') { setCreating(false); setNewName(''); setError(''); }
                }}
              />
              <button className="space-switcher-create-go" onClick={() => void submitCreate()}>{t('settings.createSpace')}</button>
              {error && <div className="space-switcher-error">{error}</div>}
            </div>
          ) : (
            <button
              className="space-switcher-item space-switcher-new"
              disabled={atLimit}
              title={atLimit ? t('settings.spaceLimit', { count: limit }) : undefined}
              onClick={() => setCreating(true)}
            >
              <span className="space-switcher-check">＋</span>
              <span className="space-switcher-label">
                {t('nav.newSpace')}{atLimit ? ` (${limit})` : ''}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
