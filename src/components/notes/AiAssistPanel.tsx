import { useState } from 'react';
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
      setSuccess('AI draft applied. Review the changes, then save the note.');
      onSwitchTab();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run AI edit');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="ai-edit-panel" role="tabpanel">
      <p>Ask Codex to revise the current draft. It updates the editable fields only; Save still controls when the note is written.</p>
      <label>
        <span>Instruction</span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Tighten the note, add clearer headings, preserve all facts, and suggest better tags."
          rows={8}
        />
      </label>
      {error && <div className="edit-error">{error}</div>}
      <button className="ai-run" onClick={run} disabled={running || !prompt.trim()}>
        {running ? 'Running Codex...' : 'Apply AI draft'}
      </button>
      {success && <div className="edit-success">{success}</div>}
      <div className="ai-draft-note">
        Current draft target: <b>{title || 'Untitled note'}</b>
      </div>
    </div>
  );
}
