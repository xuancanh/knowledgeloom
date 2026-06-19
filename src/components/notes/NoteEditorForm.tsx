import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  bilinks?: string[];
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
  onToggleBilink?: (id: string) => void;
  getDraft: () => NoteUpdate;
  onAiAssist?: (prompt: string, draft: NoteUpdate) => Promise<NoteUpdate>;
  onAiApplied?: (update: NoteUpdate) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function NoteEditorForm({
  noteId, title, summary, category, tags, links, bilinks, initialBody,
  notes, categories, editorRef,
  readOnly = false, saving = false, canSave = true,
  saveLabel, aiSuccess, saveError,
  onTitleChange, onSummaryChange, onCategoryChange, onTagsChange, onToggleLink, onToggleBilink,
  getDraft, onAiAssist, onAiApplied, onCancel, onSave,
}: NoteEditorFormProps) {
  const { t } = useTranslation();
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
        placeholder={t('notes.noteTitlePlaceholder')}
        disabled={readOnly}
        autoFocus
      />

      <textarea
        className="edit-summary"
        value={summary}
        onChange={(e) => onSummaryChange(e.target.value)}
        rows={2}
        placeholder={t('notes.summaryPlaceholder')}
        disabled={readOnly}
      />

      <div className="edit-body">
        <NoteEditor
          ref={editorRef}
          initialValue={initialBody}
          placeholder={t('notes.editorPlaceholder')}
          disabled={readOnly}
        />
      </div>

      <div className="edit-footer-meta">
        <div className="edit-footer-section">
          <div className="edit-section-label">{t('notes.linksToNotes')}</div>
          <LinkEditor
            notes={notes}
            noteId={noteId}
            links={links}
            bilinks={bilinks}
            onToggleLink={onToggleLink}
            onToggleBilink={onToggleBilink}
          />
        </div>
        <div className="edit-footer-section">
          <div className="edit-section-label">{t('notes.categoryAndTags')}</div>
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
            {t('notes.aiAssist')}
          </button>
        )}
        <span className="edit-actions-gap" />
        <button onClick={onCancel} disabled={saving}>{t('common.cancel')}</button>
        <button
          className="save-note"
          onClick={onSave}
          disabled={!canSave || saving}
        >
          {saving ? t('notes.savingNote') : (saveLabel ?? t('notes.saveNote'))}
        </button>
      </div>

      {aiOpen && onAiAssist && (
        <div className="ai-modal-backdrop" onClick={() => !aiRunning && setAiOpen(false)}>
          <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-head">
              <span className="ai-modal-title">{t('notes.aiAssistTitle')}</span>
              <button className="ai-modal-close" onClick={() => setAiOpen(false)} disabled={aiRunning} aria-label={t('common.close')}>✕</button>
            </div>
            <p className="ai-modal-desc">{t('notes.aiAssistDesc')}</p>
            <textarea
              className="ai-modal-input"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={handleAiKeyDown}
              placeholder={t('notes.aiAssistPlaceholder')}
              rows={6}
              autoFocus
              disabled={aiRunning}
            />
            <div className="ai-modal-target">
              {t('notes.workingOn', { title: title || t('notes.noteTitlePlaceholder') })}
              <span className="ai-modal-hint">{t('notes.runHint')}</span>
            </div>
            {aiError && <div className="edit-error">{aiError}</div>}
            <div className="ai-modal-actions">
              <button className="ai-modal-cancel" onClick={() => setAiOpen(false)} disabled={aiRunning}>{t('common.cancel')}</button>
              <button
                className="ai-modal-run"
                onClick={runAi}
                disabled={aiRunning || !aiPrompt.trim()}
              >
                {aiRunning ? t('notes.runningCodex') : t('notes.applyAi')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
