import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiError, NoteTransferMode } from '../../api';
import type { Space } from '../../lib/spaces';
import styles from './NoteTransferDialog.module.css';

export function NoteTransferDialog({ currentSpaceId, onListSpaces, onClose, onTransfer }: {
  currentSpaceId: string;
  onListSpaces: () => Promise<Space[]>;
  onClose: () => void;
  onTransfer: (toSpaceId: string, mode: NoteTransferMode) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [destination, setDestination] = useState('');
  const [mode, setMode] = useState<NoteTransferMode>('copy');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    onListSpaces()
      .then((items) => {
        if (!active) return;
        const available = items.filter((space) => space.id !== currentSpaceId);
        setSpaces(available);
        setDestination(available[0]?.id ?? '');
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : t('notes.transferLoadFailed'));
      });
    return () => { active = false; };
  }, [currentSpaceId, onListSpaces, t]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!destination) return;
    setWorking(true);
    setError('');
    try {
      await onTransfer(destination, mode);
    } catch (cause) {
      const status = cause && typeof cause === 'object' && 'status' in cause
        ? (cause as ApiError).status
        : undefined;
      setError(status === 409 ? t('notes.transferConflict') : t('notes.transferFailed'));
      setWorking(false);
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !working) onClose();
    }}>
      <form className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="transfer-title" onSubmit={submit}>
        <header className={styles.header}>
          <h2 id="transfer-title">{t('notes.transferTitle')}</h2>
          <button type="button" className={styles.close} onClick={onClose} disabled={working} aria-label={t('common.close')}>×</button>
        </header>

        <div className={styles.modes}>
          <button type="button" className={mode === 'copy' ? styles.active : ''} onClick={() => setMode('copy')} disabled={working}>
            {t('notes.copyMode')}
          </button>
          <button type="button" className={mode === 'move' ? styles.active : ''} onClick={() => setMode('move')} disabled={working}>
            {t('notes.moveMode')}
          </button>
        </div>

        <label className={styles.field}>
          <span>{t('notes.destinationSpace')}</span>
          <select value={destination} onChange={(event) => setDestination(event.target.value)} disabled={working || !spaces.length}>
            {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
          </select>
        </label>
        {!spaces.length && !error && <p className={styles.hint}>{t('notes.noDestinationSpace')}</p>}
        <p className={styles.hint}>{t('notes.transferLinksWarning')}</p>
        {error && <div className={styles.error} role="alert">{error}</div>}

        <footer className={styles.actions}>
          <button type="button" onClick={onClose} disabled={working}>{t('common.cancel')}</button>
          <button type="submit" className={styles.primary} disabled={working || !destination}>
            {working ? t('notes.transferring') : mode === 'copy' ? t('notes.copyMode') : t('notes.moveMode')}
          </button>
        </footer>
      </form>
    </div>
  );
}
