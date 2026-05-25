import { useMemo, useState } from 'react';
import type { NoteUpdate } from '../../api';
import type { KnowledgeNote } from '../../types';
import type { UiCategory } from '../../lib/view';
import NoteEditor, { type NoteEditorHandle } from './NoteEditor';
import MetaFields from './MetaFields';
import { LinkEditor } from './LinkEditor';

export type { NoteEditorHandle };

export interface NoteEditorFormProps {
  noteId: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  links: string[];
  initialBody: string;
  notes: KnowledgeNote[];
  categories: UiCategory[];
  editorRef: React.RefObject<NoteEditorHandle | null>;
  readOnly?: boolean;
  saving?: boolean;
  canSave?: boolean;
  saveLabel?: string;
  aiSuccess?: string;
  saveError?: string;
  onTitleChange: (v: string) => void;
  onSummaryChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onTagsChange: (v: string[]) => void;
  onToggleLink: (id: string) => void;
  getDraft: () => NoteUpdate;
  onAiAssist?: (prompt: string, draft: NoteUpdate) => Promise<NoteUpdate>;
  onAiApplied?: (update: NoteUpdate) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function NoteEditorForm({
  noteId, title, summary, category, tags, links, initialBody,
  notes, categories, editorRef,
  readOnly = false, saving = false, canSave = true,
  saveLabel = 'Save note', aiSuccess, saveError,
  onTitleChange, onSummaryChange, onCategoryChange, onTagsChange, onToggleLink,
  getDraft, onAiAssist, onAiApplied, onCancel, onSave,
}: NoteEditorFormProps) {
  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [notes]);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState('');

  async function runAi() {
    if (!onAiAssist || !aiPrompt.trim()) return;
    setAiRunning(true);
    setAiError('');
    try {
      const update = await onAiAssist(aiPrompt.trim(), getDraft());
      onAiApplied?.(update);
      setAiPrompt('');
      setAiOpen(false);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI request failed');
    } finally {
      setAiRunning(false);
    }
  }

  function handleAiKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') { e.preventDefault(); setAiOpen(false); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runAi(); }
  }

  return (
    <div className="note-edit-view">
      <input
        className="edit-title"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Note title"
        disabled={readOnly}
        autoFocus
      />

      <textarea
        className="edit-summary"
        value={summary}
        onChange={(e) => onSummaryChange(e.target.value)}
        rows={2}
        placeholder="One-line summary…"
        disabled={readOnly}
      />

      <div className="edit-body">
        <NoteEditor
          ref={editorRef}
          initialValue={initialBody}
          placeholder="Start writing… Drag or paste images to upload. Use the toolbar for formatting."
          disabled={readOnly}
        />
      </div>

      <div className="edit-footer-meta">
        <div className="edit-footer-section">
          <div className="edit-section-label">Links to other notes</div>
          <LinkEditor
            notes={notes}
            noteId={noteId}
            links={links}
            onToggleLink={onToggleLink}
          />
        </div>
        <div className="edit-footer-section">
          <div className="edit-section-label">Category &amp; tags</div>
          <MetaFields
            category={category}
            onCategoryChange={onCategoryChange}
            tags={tags}
            onTagsChange={onTagsChange}
            categories={categories}
            tagOptions={tagOptions}
            disabled={readOnly}
          />
        </div>
      </div>

      {aiSuccess && <div className="edit-success">{aiSuccess}</div>}
      {saveError && <div className="edit-error">{saveError}</div>}

      <div className="edit-actions">
        {onAiAssist && (
          <button
            className="ai-tab-btn"
            onClick={() => setAiOpen(true)}
            disabled={readOnly || saving}
          >
            ✦ AI assist
          </button>
        )}
        <span className="edit-actions-gap" />
        <button onClick={onCancel} disabled={saving}>Cancel</button>
        <button
          className="save-note"
          onClick={onSave}
          disabled={!canSave || saving}
        >
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>

      {aiOpen && onAiAssist && (
        <div className="ai-modal-backdrop" onClick={() => !aiRunning && setAiOpen(false)}>
          <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-head">
              <span className="ai-modal-title">✦ AI Assist</span>
              <button className="ai-modal-close" onClick={() => setAiOpen(false)} disabled={aiRunning} aria-label="Close">✕</button>
            </div>
            <p className="ai-modal-desc">
              Describe what Codex should do with the current draft. Title, summary, tags, and body will all be updated — Save still controls when changes are persisted.
            </p>
            <textarea
              className="ai-modal-input"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={handleAiKeyDown}
              placeholder="Tighten the structure, add clearer headings, preserve all facts, and suggest better tags."
              rows={6}
              autoFocus
              disabled={aiRunning}
            />
            <div className="ai-modal-target">
              Working on: <b>{title || 'Untitled note'}</b>
              <span className="ai-modal-hint">⌘↵ to run</span>
            </div>
            {aiError && <div className="edit-error">{aiError}</div>}
            <div className="ai-modal-actions">
              <button className="ai-modal-cancel" onClick={() => setAiOpen(false)} disabled={aiRunning}>Cancel</button>
              <button
                className="ai-modal-run"
                onClick={runAi}
                disabled={aiRunning || !aiPrompt.trim()}
              >
                {aiRunning ? 'Running Codex…' : '✦ Apply AI draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
