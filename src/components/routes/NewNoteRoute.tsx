import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CreateNoteRequest } from '../../types';
import NoteEditor, { type NoteEditorHandle } from '../notes/NoteEditor';
import MetaFields from '../notes/MetaFields';
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
  onSubmit,
  readOnly,
}: {
  onSubmit: (payload: CreateNoteRequest) => void;
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const editorRef = useRef<NoteEditorHandle>(null);

  const [draft] = useState<Draft>(popDraft);
  const [title, setTitle] = useState(draft.title ?? '');
  const [category, setCategory] = useState(draft.category ?? '');
  const [tags, setTags] = useState<string[]>(draft.tags ?? []);
  const [summary, setSummary] = useState(draft.summary ?? '');

  const canSubmit = !readOnly && title.trim().length > 0;

  function save() {
    if (!canSubmit) return;
    onSubmit({
      mode: 'write',
      title: title.trim(),
      body: editorRef.current?.getValue() ?? '',
      category: category.trim(),
      summary: summary.trim(),
      tags,
    });
  }

  return (
    <div className={styles.page}>
      <div className="crumbs">
        <button onClick={() => navigate('/')}>Desk</button>
        <span className="sep">/</span>
        <span>New note</span>
      </div>

      <input
        className={styles.title}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title"
        autoFocus
        disabled={readOnly}
      />

      <textarea
        className={styles.summary}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="One-line summary…"
        rows={2}
        disabled={readOnly}
      />

      <div className={styles.editor}>
        <NoteEditor
          ref={editorRef}
          initialValue={draft.body ?? ''}
          placeholder="Start writing… Drag or paste images to upload. Use the toolbar for formatting."
          disabled={readOnly}
        />
      </div>

      <div className={styles.meta}>
        <MetaFields
          category={category}
          onCategoryChange={setCategory}
          tags={tags}
          onTagsChange={setTags}
          disabled={readOnly}
        />
      </div>

      <div className={styles.actions}>
        <button className={styles.cancel} type="button" onClick={() => navigate(-1)}>Cancel</button>
        <button
          className={styles.save}
          type="button"
          onClick={save}
          disabled={!canSubmit}
        >
          Save note →
        </button>
      </div>
    </div>
  );
}
