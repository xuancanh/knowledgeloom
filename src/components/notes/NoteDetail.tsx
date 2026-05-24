import { useEffect, useRef, useState, useCallback } from 'react';
import type { NoteUpdate } from '../../api';
import type { KnowledgeNote, Reminder } from '../../types';
import {
  categoryId,
  formatCreated,
  stripFrontmatter,
  type UiCategory,
} from '../../lib/view';
import NoteEditor, { type NoteEditorHandle } from './NoteEditor';
import NoteViewer from './NoteViewer';
import MetaFields from './MetaFields';
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
  const editorRef = useRef<NoteEditorHandle>(null);

  const [showSource, setShowSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reading, setReading] = useState(false);
  const [readTheme, setReadTheme] = useState<'light' | 'white' | 'dark' | 'midnight'>(() => {
    const v = localStorage.getItem('kl:read-theme');
    return v === 'white' || v === 'dark' || v === 'midnight' ? v : 'light';
  });
  const [readWidth, setReadWidth] = useState<'narrow' | 'medium' | 'wide'>(() => {
    const v = localStorage.getItem('kl:read-width');
    return v === 'narrow' || v === 'wide' ? v : 'medium';
  });
  const [readSize, setReadSize] = useState<'s' | 'm' | 'l'>(() => {
    const v = localStorage.getItem('kl:read-size');
    return v === 's' || v === 'l' ? v : 'm';
  });
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const savedTheme = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [category, setCategory] = useState(note.category);
  const [summary, setSummary] = useState(note.summary);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [links, setLinks] = useState<string[]>(note.links);
  const [saveError, setSaveError] = useState('');
  const [editTab, setEditTab] = useState<'manual' | 'ai'>('manual');
  const [aiSuccess, setAiSuccess] = useState('');

  const catId = categoryId(note.category);
  const cat = categories.find((item) => item.id === catId) || categories[0];
  const outgoing = note.links.map((id) => notes.find((item) => item.id === id)).filter(Boolean);
  const backlinks = notes.filter((item) => item.links.includes(note.id));

  useEffect(() => {
    const styleId = 'kl-reading-style';
    const existing = document.getElementById(styleId);
    if (existing) existing.remove();
    document.body.classList.toggle('reading', reading);
    document.body.dataset.readWidth = reading ? readWidth : '';
    document.body.dataset.readSize = reading ? readSize : '';
    if (!reading) {
      if (savedTheme.current) document.documentElement.dataset.theme = savedTheme.current;
      savedTheme.current = null;
      return;
    }
    savedTheme.current = document.documentElement.dataset.theme || 'light';
    document.documentElement.dataset.theme = readTheme;
    const w = readWidth === 'narrow' ? 560 : readWidth === 'wide' ? 1080 : 800;
    const fs = readSize === 's' ? 0.88 : readSize === 'l' ? 1.25 : 1.05;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      main{max-width:${w}px!important;background:transparent!important}
      body.reading .note-detail .ne-view-content .tiptap{font-size:${fs}rem!important;line-height:1.8!important}
      body.reading .note-detail .ne-view-content .tiptap h3{font-size:0.72em!important}
      body.reading .note-detail .ne-view-content .tiptap blockquote{font-size:0.97em!important}
      body.reading .note-detail h1{font-size:${readSize==='s'?1.8:readSize==='l'?2.6:2.2}rem!important}
    `;
    document.head.appendChild(style);
    return () => {
      if (savedTheme.current) document.documentElement.dataset.theme = savedTheme.current;
      savedTheme.current = null;
      const s = document.getElementById(styleId);
      if (s) s.remove();
    };
  }, [reading, readTheme, readWidth, readSize]);

  useEffect(() => {
    if (!reading) return;
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(h > 0 ? Math.round((window.scrollY / h) * 100) : 100);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [reading]);

  const setReadThemeAndSave = useCallback((t: typeof readTheme) => { setReadTheme(t); localStorage.setItem('kl:read-theme', t); }, []);
  const setReadWidthState = useCallback((w: typeof readWidth) => { setReadWidth(w); localStorage.setItem('kl:read-width', w); }, []);
  const setReadSizeState = useCallback((s: typeof readSize) => { setReadSize(s); localStorage.setItem('kl:read-size', s); }, []);

  /*
   * Opening the editor copies the latest note props and markdown body into
   * local draft state. This avoids stale drafts when background polling refreshes
   * the selected note while the reader is open.
   */
  function openEditor() {
    setTitle(note.title);
    setCategory(note.category);
    setSummary(note.summary);
    setTags(note.tags);
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
      tags,
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
    setTags(update.tags);
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
          <button className="read-inline" onClick={() => setReading(!reading)}>{reading ? '✕ Exit' : editing ? '⊙ Focus' : '⊡ Read'}</button>
          <button className="edit-inline" onClick={() => editing ? setEditing(false) : openEditor()} disabled={readOnly}>{editing ? '✕ Cancel' : '✎ Edit'}</button>
          <button className="delete-inline" onClick={onDelete} disabled={readOnly}>✕ Delete</button>
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
        <div className="note-edit-view">
          {editTab === 'manual' ? (
            <>
              <input
                className="edit-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Note title"
                disabled={readOnly}
              />
              <textarea
                className="edit-summary"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                rows={2}
                placeholder="One-line summary…"
                disabled={readOnly}
              />
              <div className="edit-body">
                <NoteEditor
                  ref={editorRef}
                  initialValue={stripFrontmatter(markdown)}
                  placeholder="Start writing… Drag or paste images to upload. Use the toolbar for formatting."
                  disabled={readOnly}
                />
              </div>
              <div className="edit-footer-meta">
                <LinkEditor
                  notes={notes}
                  noteId={note.id}
                  links={links}
                  onToggleLink={toggleLink}
                />
                <MetaFields
                  category={category}
                  onCategoryChange={setCategory}
                  tags={tags}
                  onTagsChange={setTags}
                  categories={categories}
                  disabled={readOnly}
                />
              </div>
            </>
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
            <button
              className={`ai-tab-btn${editTab === 'ai' ? ' active' : ''}`}
              onClick={() => setEditTab(editTab === 'ai' ? 'manual' : 'ai')}
              disabled={saving}
            >
              {editTab === 'ai' ? '← Back to edit' : '✦ AI assist'}
            </button>
            <span className="edit-actions-gap" />
            <button onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            <button className="save-note" onClick={saveEdit} disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save note'}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="note-body">
            <NoteViewer markdown={stripFrontmatter(markdown)} />
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

      {reading && (
        <>
          <div className={`read-toolbar${toolbarOpen ? ' open' : ''}`}>
            <button className="read-toolbar-toggle" onClick={() => setToolbarOpen(!toolbarOpen)}>
              {toolbarOpen ? '▾' : '▸'} Options
            </button>
            {toolbarOpen && (
              <>
                <span className="read-toolbar-group">
                  <button onClick={() => setReadSizeState('s')} className={readSize === 's' ? 'active' : ''}>A</button>
                  <button onClick={() => setReadSizeState('m')} className={readSize === 'm' ? 'active' : ''} style={{ fontSize: '1.15em' }}>A</button>
                  <button onClick={() => setReadSizeState('l')} className={readSize === 'l' ? 'active' : ''} style={{ fontSize: '1.3em' }}>A</button>
                </span>
                <span className="read-toolbar-group">
                  <button onClick={() => setReadWidthState('narrow')} className={readWidth === 'narrow' ? 'active' : ''}>Narrow</button>
                  <button onClick={() => setReadWidthState('medium')} className={readWidth === 'medium' ? 'active' : ''}>Medium</button>
                  <button onClick={() => setReadWidthState('wide')} className={readWidth === 'wide' ? 'active' : ''}>Wide</button>
                </span>
                <span className="read-toolbar-group">
                  <button onClick={() => setReadThemeAndSave('light')} className={readTheme === 'light' ? 'active' : ''}>Warm</button>
                  <button onClick={() => setReadThemeAndSave('white')} className={readTheme === 'white' ? 'active' : ''}>White</button>
                  <button onClick={() => setReadThemeAndSave('dark')} className={readTheme === 'dark' ? 'active' : ''}>Dark</button>
                  <button onClick={() => setReadThemeAndSave('midnight')} className={readTheme === 'midnight' ? 'active' : ''}>Night</button>
                </span>
              </>
            )}
            <button className="read-toolbar-exit" onClick={() => setReading(false)}>✕ Exit</button>
          </div>
          <div className="read-progress" style={{ width: `${progress}%` }} />
        </>
      )}
    </div>
  );
}
