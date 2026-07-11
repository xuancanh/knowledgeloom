import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ShareDialog.module.css';

export interface ShareOptions {
  expiresInDays?: number;
  password?: string;
}

export function ShareDialog({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (options: ShareOptions) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [expiry, setExpiry] = useState('0');
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password && password.length < 8) {
      setError(t('share.passwordMin'));
      return;
    }
    setWorking(true);
    setError('');
    try {
      await onCreate({
        ...(expiry !== '0' ? { expiresInDays: Number(expiry) } : {}),
        ...(password ? { password } : {}),
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('share.createError'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !working) onClose();
    }}>
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        onSubmit={submit}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !working) onClose();
        }}
      >
        <header className={styles.header}>
          <h2 id="share-dialog-title">{t('share.dialogTitle')}</h2>
          <button type="button" className={styles.close} onClick={onClose} disabled={working} aria-label={t('common.close')}>×</button>
        </header>

        <label className={styles.field}>
          <span>{t('share.expiryLabel')}</span>
          <select value={expiry} onChange={(event) => setExpiry(event.target.value)} disabled={working}>
            <option value="0">{t('share.expiryNever')}</option>
            <option value="7">{t('share.expiryDays', { count: 7 })}</option>
            <option value="30">{t('share.expiryDays', { count: 30 })}</option>
            <option value="90">{t('share.expiryDays', { count: 90 })}</option>
            <option value="365">{t('share.expiryDays', { count: 365 })}</option>
          </select>
        </label>

        <label className={styles.field}>
          <span>{t('share.passwordLabel')}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t('share.passwordOptional')}
            autoComplete="new-password"
            maxLength={128}
            disabled={working}
          />
        </label>

        {error && <div className={styles.error} role="alert">{error}</div>}
        <footer className={styles.actions}>
          <button type="button" onClick={onClose} disabled={working}>{t('common.cancel')}</button>
          <button type="submit" className={styles.primary} disabled={working}>
            {working ? t('share.creating') : t('share.createAndCopy')}
          </button>
        </footer>
      </form>
    </div>
  );
}
