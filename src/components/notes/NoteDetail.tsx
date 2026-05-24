import { useMemo, useRef, useState } from 'react';
import type { NoteUpdate } from '../../api';
import type { KnowledgeNote, Reminder } from '../../types';
import {
  categoryId,
  formatCreated,
  parseMarkdownBlocks,
  stripFrontmatter,
  type UiCategory,
} from '../../lib/view';
import LiveEditor, { type LiveEditorHandle } from '../LiveEditor';
import { AiAssistPanel } from './AiAssistPanel';
import { ReminderSection } from './ReminderSection';
import { LinkEditor } from './LinkEditor';

/**
 * Note reader and editor. Edits are saved back to the markdown source file,
 * then the backend rebuilds derived category and search indexes.
 */
export default function NoteDetail({
  note,
  notes,
  categories,
  markdown,
  onOpenCategory,
  onOpenTag,
  onDelete,
  onAssist,
  onCreateReminder,
  onCompleteReminder,
  onDeleteReminder,
  onSave,
  reminders,
  readOnly,
}: {
  note: KnowledgeNote;
  notes: KnowledgeNote[];
  categories: UiCategory[];
  markdown: string;
  onOpenCategory: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onDelete: () => void;
  onAssist: (id: string, prompt: string, draft: NoteUpdate) => Promise<NoteUpdate>;
  onCreateReminder: (noteId: string, remindAt: string, message: string) => Promise<void>;
  onCompleteReminder: (id: string) => Promise<void>;
  onDeleteReminder: (id: string) => Promise<void>;
  onSave: (id: string, update: NoteUpdate) => Promise<void>;
  reminders: Reminder[];
  readOnly: boolean;
}) {
  const editorRef = useRef<LiveEditorHandle>(null);

  const [showSource, setShowSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [category, setCategory] = useState(note.category);
  const [summary, setSummary] = useState(note.summary);
  const [tagsText, setTagsText] = useState(note.tags.join(', '));
  const [links, setLinks] = useState<string[]>(note.links);
  const [saveError, setSaveError] = useState('');
  const [editTab, setEditTab] = useState<'manual' | 'ai'>('manual');
  const [aiSuccess, setAiSuccess] = useState('');

  const catId = categoryId(note.category);
  const cat = categories.find((item) => item.id === catId) || categories[0];
  const outgoing = note.links.map((id) => notes.find((item) => item.id === id)).filter(Boolean);
  const backlinks = notes.filter((item) => item.links.includes(note.id));
  const blocks = useMemo(() => parseMarkdownBlocks(markdown), [markdown]);

  /*
   * Opening the editor copies the latest note props and markdown body into
   * local draft state. This avoids stale drafts when background polling refreshes
   * the selected note while the reader is open.
   */
  function openEditor() {
    setTitle(note.title);
    setCategory(note.category);
    setSummary(note.summary);
    setTagsText(note.tags.join(', '));
    setLinks(note.links);
    setSaveError('');
    setAiSuccess('');
    setEditTab('manual');
    setEditing(true);
  }

  function toggleLink(id: string) {
    setLinks((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function currentDraft(): NoteUpdate {
    return {
      title,
      category,
      summary,
      tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
      links,
      body: editorRef.current?.getValue() ?? '',
    };
  }

  async function saveEdit() {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(note.id, currentDraft());
      setEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  }

  function applyAiUpdate(update: NoteUpdate) {
    setTitle(update.title);
    setCategory(update.category);
    setSummary(update.summary);
    setTagsText(update.tags.join(', '));
    setLinks(update.links);
    editorRef.current?.setValue(update.body);
    setAiSuccess('AI draft applied. Review the changes, then save the note.');
  }

  return (
    <div className="note-detail">
      <div className="crumbs">
        <button onClick={() => onOpenCategory(catId)}>{cat?.name || note.category}</button>
        <span className="sep">/</span>
        <span>{note.id}.md</span>
      </div>

      <div className="head">
        <div className="h-meta">
          <span>{formatCreated(note.createdAt)}</span>
          <span>· {outgoing.length}↗ {backlinks.length}↘</span>
          <button className="edit-inline" onClick={() => editing ? setEditing(false) : openEditor()} disabled={readOnly}>{editing ? 'Cancel' : 'Edit'}</button>
          <button className="delete-inline" onClick={onDelete} disabled={readOnly}>Delete</button>
        </div>
        {readOnly && <div className="read-only-banner">Read-only mode: editing, deletion, and Codex jobs are disabled in this deployment.</div>}
        {!editing && (
          <>
            <h1>{note.title}</h1>
            <p className="lede">{note.summary || 'No summary yet.'}</p>
            <div className="tags">
              <span className="tags-label">{note.tags.length} tag{note.tags.length !== 1 ? 's' : ''}</span>
              {note.tags.map((tag) => <button key={tag} className="tag" onClick={() => onOpenTag(tag)}>#{tag}</button>)}
            </div>
            {(note.sourceUrl || note.originalRequest) && (
              <div className="source-note">
                {note.sourceUrl && (
                  <a href={note.sourceUrl} target="_blank" rel="noreferrer">
                    Original link
                  </a>
                )}
                {note.originalRequest && <span>{note.originalRequest}</span>}
              </div>
            )}
          </>
        )}
      </div>

      {editing ? (
        <div className="edit-card">
          <div className="edit-tabs" role="tablist" aria-label="Edit mode">
            <button
              className={editTab === 'manual' ? 'active' : ''}
              onClick={() => setEditTab('manual')}
              role="tab"
              aria-selected={editTab === 'manual'}
            >
              Normal edit
            </button>
            <button
              className={editTab === 'ai' ? 'active' : ''}
              onClick={() => setEditTab('ai')}
              role="tab"
              aria-selected={editTab === 'ai'}
            >
              AI prompt
            </button>
          </div>

          {editTab === 'manual' ? (
            <div className="manual-edit" role="tabpanel">
              <label>
                <span>Title</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label>
                <span>Summary</span>
                <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} />
              </label>
              <div className="edit-grid">
                <label>
                  <span>Category</span>
                  <input value={category} onChange={(event) => setCategory(event.target.value)} list="category-options" placeholder="Folder/Subfolder" />
                  <datalist id="category-options">
                    {categories.map((item) => <option key={item.id} value={item.name} />)}
                  </datalist>
                </label>
                <label>
                  <span>Tags</span>
                  <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="tag-one, tag-two" />
                </label>
              </div>
              <div className="markdown-editor">
                <div className="edit-label">Markdown body</div>
                <LiveEditor
                  ref={editorRef}
                  initialValue={stripFrontmatter(markdown)}
                  placeholder="Type markdown directly. Headings, quotes, lists, and code markers are styled as you write."
                  disabled={readOnly}
                />
                <div className="fine">Type markdown directly. Headings, quotes, lists, and code markers are styled as you write.</div>
              </div>

              <LinkEditor
                notes={notes}
                noteId={note.id}
                links={links}
                onToggleLink={toggleLink}
              />
            </div>
          ) : (
            <AiAssistPanel
              title={title}
              onAssist={(prompt) => onAssist(note.id, prompt, currentDraft())}
              getDraft={currentDraft}
              applyUpdate={applyAiUpdate}
              onSwitchTab={() => setEditTab('manual')}
            />
          )}
          {aiSuccess && <div className="edit-success">{aiSuccess}</div>}
          {saveError && <div className="edit-error">{saveError}</div>}
          <div className="edit-actions">
            <button onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            <button className="save-note" onClick={saveEdit} disabled={saving || !title.trim()}>{saving ? 'Saving...' : 'Save note'}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="note-body">
            {blocks.map((block, index) => {
              if (block.type === 'h') return <h3 key={index}>{block.text}</h3>;
              if (block.type === 'q') return <blockquote key={index}>{block.text}</blockquote>;
              return <p key={index}>{block.text}</p>;
            })}
          </div>

          <div className="source-toggle">
            <div className="head" onClick={() => setShowSource((value) => !value)}>
              <span>{showSource ? '▾' : '▸'} Source · {note.id}.md</span>
              <span>{markdown.length} chars · markdown</span>
            </div>
            {showSource && <pre>{markdown}</pre>}
          </div>

          <ReminderSection
            noteId={note.id}
            reminders={reminders}
            readOnly={readOnly}
            onCreateReminder={onCreateReminder}
            onCompleteReminder={onCompleteReminder}
            onDeleteReminder={onDeleteReminder}
          />
        </>
      )}
    </div>
  );
}
