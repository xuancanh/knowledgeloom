import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CreateNoteRequest, KnowledgeNote } from '../../types';
import { assistDraft, type NoteUpdate } from '../../api';
import type { UiCategory } from '../../lib/view';
import { NoteEditorForm, type NoteEditorHandle } from '../notes/NoteEditorForm';
import styles from './NewNoteRoute.module.css';

export const NEW_NOTE_DRAFT_KEY = 'kl:new-note-draft';

type Draft = { title?: string; body?: string; category?: string; tags?: string[]; summary?: string };

function popDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(NEW_NOTE_DRAFT_KEY);
    if (raw) { sessionStorage.removeItem(NEW_NOTE_DRAFT_KEY); return JSON.parse(raw); }
  } catch {}
  return {};
}

export function NewNoteRoute({
  notes,
  categories,
  onSubmit,
  readOnly,
}: {
  notes: KnowledgeNote[];
  categories: UiCategory[];
  onSubmit: (payload: CreateNoteRequest) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const editorRef = useRef<NoteEditorHandle>(null);

  const [draft] = useState<Draft>(popDraft);
  const [title, setTitle] = useState(draft.title ?? '');
  const [summary, setSummary] = useState(draft.summary ?? '');
  const [category, setCategory] = useState(draft.category ?? '');
  const [tags, setTags] = useState<string[]>(draft.tags ?? []);
  const [links, setLinks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [aiSuccess, setAiSuccess] = useState('');

  function currentDraft(): NoteUpdate {
    return { title, category, summary, tags, links, body: editorRef.current?.getValue() ?? '' };
  }

  function applyAiUpdate(update: NoteUpdate) {
    setTitle(update.title);
    setCategory(update.category);
    setSummary(update.summary);
    setTags(update.tags);
    setLinks(update.links);
    editorRef.current?.setValue(update.body);
    setAiSuccess(t('notes.aiApplied'));
  }

  function toggleLink(id: string) {
    setLinks((prev) => prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]);
  }

  function save() {
    if (readOnly || !title.trim()) return;
    setSaving(true);
    onSubmit({
      mode: 'write',
      title: title.trim(),
      body: editorRef.current?.getValue() ?? '',
      category: category.trim(),
      summary: summary.trim(),
      tags,
      links,
    });
  }

  return (
    <div className={styles.page}>
      <div className="crumbs">
        <button onClick={() => navigate('/home')}>{t('common.desk')}</button>
        <span className="sep">/</span>
        {category && <><span>{category}</span><span className="sep">/</span></>}
        <span>{t('categories.newNote')}</span>
      </div>

      <NoteEditorForm
        noteId=""
        title={title}
        summary={summary}
        category={category}
        tags={tags}
        links={links}
        initialBody={draft.body ?? ''}
        notes={notes}
        categories={categories}
        editorRef={editorRef}
        readOnly={readOnly}
        saving={saving}
        canSave={!readOnly && title.trim().length > 0}
        saveLabel={t('notes.saveNote') + ' →'}
        aiSuccess={aiSuccess}
        onTitleChange={setTitle}
        onSummaryChange={setSummary}
        onCategoryChange={setCategory}
        onTagsChange={setTags}
        onToggleLink={toggleLink}
        getDraft={currentDraft}
        onAiAssist={async (prompt, d) => {
          const { update } = await assistDraft(
            { title: d.title, body: d.body, category: d.category, summary: d.summary, tags: d.tags },
            prompt,
          );
          return update;
        }}
        onAiApplied={applyAiUpdate}
        onCancel={() => navigate(-1)}
        onSave={save}
      />
    </div>
  );
}
