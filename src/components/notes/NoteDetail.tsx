import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { assistDraft, regenerateNote, type NoteUpdate } from '../../api';
import type { KnowledgeNote, Reminder } from '../../types';
import {
  categoryId,
  formatCreated,
  stripFrontmatter,
  type UiCategory,
} from '../../lib/view';
import { type NoteEditorHandle } from './NoteEditor';
import NoteViewer from './NoteViewer';
import { NoteEditorForm } from './NoteEditorForm';
import { ReminderSection } from './ReminderSection';

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
  readCount,
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
  readCount?: number;
}) {
  const editorRef = useRef<NoteEditorHandle>(null);

  const { t } = useTranslation();
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
  const [regenState, setRegenState] = useState<'idle' | 'loading' | 'queued'>('idle');
  const [regenDropOpen, setRegenDropOpen] = useState(false);
  const [genSize, setGenSize] = useState<'small' | 'medium' | 'large'>(() => {
    const v = localStorage.getItem('kl:gen-size');
    return v === 'medium' || v === 'large' ? v : 'small';
  });
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [category, setCategory] = useState(note.category);
  const [summary, setSummary] = useState(note.summary);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [links, setLinks] = useState<string[]>(note.links);
  const [saveError, setSaveError] = useState('');
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

  useEffect(() => {
    if (!regenDropOpen) return;
    function onDocClick(e: MouseEvent) {
      const wrap = document.querySelector('.regen-wrap');
      if (wrap && !wrap.contains(e.target as Node)) setRegenDropOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [regenDropOpen]);

  function setGenSizeAndSave(s: 'small' | 'medium' | 'large') {
    setGenSize(s);
    localStorage.setItem('kl:gen-size', s);
  }

  async function handleRegenerate(target: 'flashcards' | 'quiz' | 'all') {
    setRegenDropOpen(false);
    setRegenState('loading');
    try {
      await regenerateNote(note.id, target, genSize);
      setRegenState('queued');
      window.setTimeout(() => setRegenState('idle'), 4000);
    } catch {
      setRegenState('idle');
    }
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
          {readCount !== undefined && readCount > 0 && (
            <span className="read-count" title={t('notes.readCountTitle', { count: readCount })}>
              {t('notes.readCount', { count: readCount })}
            </span>
          )}
          <button className="read-inline" onClick={() => setReading(!reading)}>{reading ? t('notes.exitRead') : editing ? t('notes.focusMode') : t('notes.readMode')}</button>
          <button className="edit-inline" onClick={() => editing ? setEditing(false) : openEditor()} disabled={readOnly}>{editing ? t('notes.cancelEdit') : t('notes.editNote')}</button>
          <button className="delete-inline" onClick={onDelete} disabled={readOnly}>{t('notes.deleteNote')}</button>
          {!readOnly && (
            <span className="regen-wrap">
              <button
                className={`regen-trigger${regenDropOpen ? ' open' : ''}`}
                onClick={() => setRegenDropOpen((v) => !v)}
                disabled={regenState === 'loading'}
              >
                {regenState === 'loading' ? t('notes.regenLoading') : regenState === 'queued' ? t('notes.regenQueued') : t('notes.regen')}
              </button>
              {regenDropOpen && (
                <div className="regen-drop">
                  <div className="regen-size-row">
                    <button className={genSize === 'small' ? 'active' : ''} onClick={() => setGenSizeAndSave('small')}>S</button>
                    <button className={genSize === 'medium' ? 'active' : ''} onClick={() => setGenSizeAndSave('medium')}>M</button>
                    <button className={genSize === 'large' ? 'active' : ''} onClick={() => setGenSizeAndSave('large')}>L</button>
                  </div>
                  <button onClick={() => handleRegenerate('flashcards')}>{t('notes.regenFlashcards')}</button>
                  <button onClick={() => handleRegenerate('quiz')}>{t('notes.regenQuiz')}</button>
                  <button onClick={() => handleRegenerate('all')}>{t('notes.regenBoth')}</button>
                </div>
              )}
            </span>
          )}
        </div>
        {readOnly && <div className="read-only-banner">{t('notes.readOnlyBanner')}</div>}
        {!editing && (
          <>
            <h1>{note.title}</h1>
            <p className="lede">{note.summary || t('common.noSummary')}</p>
            <div className="tags">
              <span className="tags-label">{t('notes.tagCount', { count: note.tags.length })}</span>
              {note.tags.map((tag) => <button key={tag} className="tag" onClick={() => onOpenTag(tag)}>#{tag}</button>)}
            </div>
            {(note.sourceUrl || note.originalRequest) && (
              <div className="source-note">
                {note.sourceUrl && (
                  <a href={note.sourceUrl} target="_blank" rel="noreferrer">
                    {t('notes.originalLink')}
                  </a>
                )}
                {note.originalRequest && <span>{note.originalRequest}</span>}
              </div>
            )}
          </>
        )}
      </div>

      {editing ? (
        <NoteEditorForm
          noteId={note.id}
          title={title}
          summary={summary}
          category={category}
          tags={tags}
          links={links}
          initialBody={stripFrontmatter(markdown)}
          notes={notes}
          categories={categories}
          editorRef={editorRef}
          readOnly={readOnly}
          saving={saving}
          canSave={!!title.trim()}
          aiSuccess={aiSuccess}
          saveError={saveError}
          onTitleChange={setTitle}
          onSummaryChange={setSummary}
          onCategoryChange={setCategory}
          onTagsChange={setTags}
          onToggleLink={toggleLink}
          getDraft={currentDraft}
          onAiAssist={async (prompt, draft) => {
            const { update } = await assistDraft(
              { title: draft.title, body: draft.body, category: draft.category, summary: draft.summary, tags: draft.tags },
              prompt,
            );
            return update;
          }}
          onAiApplied={applyAiUpdate}
          onCancel={() => setEditing(false)}
          onSave={saveEdit}
        />
      ) : (
        <>
          <div className="note-body">
            <NoteViewer markdown={stripFrontmatter(markdown)} />
          </div>

          <div className="source-toggle">
            <div className="head" onClick={() => setShowSource((value) => !value)}>
              <span>{showSource ? t('notes.sourceToggle', { id: note.id }) : t('notes.sourceToggleClosed', { id: note.id })}</span>
              <span>{t('notes.sourceStats', { size: markdown.length })}</span>
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
              {toolbarOpen ? '▾' : '▸'} {t('notes.readingOptions')}
            </button>
            {toolbarOpen && (
              <>
                <span className="read-toolbar-group">
                  <button onClick={() => setReadSizeState('s')} className={readSize === 's' ? 'active' : ''}>A</button>
                  <button onClick={() => setReadSizeState('m')} className={readSize === 'm' ? 'active' : ''} style={{ fontSize: '1.15em' }}>A</button>
                  <button onClick={() => setReadSizeState('l')} className={readSize === 'l' ? 'active' : ''} style={{ fontSize: '1.3em' }}>A</button>
                </span>
                <span className="read-toolbar-group">
                  <button onClick={() => setReadWidthState('narrow')} className={readWidth === 'narrow' ? 'active' : ''}>{t('notes.widthNarrow')}</button>
                  <button onClick={() => setReadWidthState('medium')} className={readWidth === 'medium' ? 'active' : ''}>{t('notes.widthMedium')}</button>
                  <button onClick={() => setReadWidthState('wide')} className={readWidth === 'wide' ? 'active' : ''}>{t('notes.widthWide')}</button>
                </span>
                <span className="read-toolbar-group">
                  <button onClick={() => setReadThemeAndSave('light')} className={readTheme === 'light' ? 'active' : ''}>{t('notes.themeWarm')}</button>
                  <button onClick={() => setReadThemeAndSave('white')} className={readTheme === 'white' ? 'active' : ''}>{t('notes.themeWhite')}</button>
                  <button onClick={() => setReadThemeAndSave('dark')} className={readTheme === 'dark' ? 'active' : ''}>{t('notes.themeDark')}</button>
                  <button onClick={() => setReadThemeAndSave('midnight')} className={readTheme === 'midnight' ? 'active' : ''}>{t('notes.themeNight')}</button>
                </span>
              </>
            )}
            <button className="read-toolbar-exit" onClick={() => setReading(false)}>{t('notes.exitRead')}</button>
          </div>
          <div className="read-progress" style={{ width: `${progress}%` }} />
        </>
      )}
    </div>
  );
}
