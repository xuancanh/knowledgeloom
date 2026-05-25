import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NoteUpdate } from '../../api';

/**
 * AI-assisted editing tab inside NoteDetail's editor.
 *
 * Sends the current unsaved draft together with a user instruction to
 * `POST /api/notes/:id/assist`. The returned proposal is applied to the
 * editor form state but not persisted — the user must review and click Save.
 */
export function AiAssistPanel({
  title,
  onAssist,
  getDraft,
  applyUpdate,
  onSwitchTab,
}: {
  title: string;
  onAssist: (prompt: string, draft: NoteUpdate) => Promise<NoteUpdate>;
  getDraft: () => NoteUpdate;
  applyUpdate: (update: NoteUpdate) => void;
  onSwitchTab: () => void;
}) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function run() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setRunning(true);
    setError('');
    setSuccess('');
    try {
      const update = await onAssist(trimmed, getDraft());
      applyUpdate(update);
      setPrompt('');
      setSuccess(t('notes.aiApplied'));
      onSwitchTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('notes.runningCodex'));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="ai-edit-panel" role="tabpanel">
      <p>{t('notes.aiAssistDesc')}</p>
      <label>
        <span>{t('notes.aiAssistTitle')}</span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('notes.aiAssistPlaceholder')}
          rows={8}
        />
      </label>
      {error && <div className="edit-error">{error}</div>}
      <button className="ai-run" onClick={run} disabled={running || !prompt.trim()}>
        {running ? t('notes.runningCodex') : t('notes.applyAi')}
      </button>
      {success && <div className="edit-success">{success}</div>}
      <div className="ai-draft-note">
        {t('notes.workingOn', { title: title || t('notes.noteTitlePlaceholder') })}
      </div>
    </div>
  );
}
