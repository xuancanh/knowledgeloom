import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchNoteMarkdown, markNoteRead, type NoteUpdate } from '../../api';
import type { KnowledgeNote, Reminder } from '../../types';
import type { UiCategory } from '../../lib/view';
import NoteDetail from '../notes/NoteDetail';

/**
 * Route wrapper for `/notes/:id`.
 *
 * Extracts the note id from the URL, fetches the raw markdown source via API,
 * filters reminders for this note, and passes everything to `<NoteDetail>`.
 */
export function NoteRoute({
  notes, categories, readOnly, reminders, readCounts,
  onOpenCategory, onOpenTag,
  onSave, onAssist, onDelete,
  onCreateReminder, onCompleteReminder, onDeleteReminder,
}: {
  notes: KnowledgeNote[];
  categories: UiCategory[];
  readOnly: boolean;
  reminders: Reminder[];
  readCounts?: Record<string, number>;
  onOpenCategory: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onSave: (id: string, update: NoteUpdate) => Promise<void>;
  onAssist: (id: string, prompt: string, draft: NoteUpdate) => Promise<NoteUpdate>;
  onDelete: (note: KnowledgeNote) => Promise<void>;
  onCreateReminder: (noteId: string, remindAt: string, message: string) => Promise<void>;
  onCompleteReminder: (id: string) => Promise<void>;
  onDeleteReminder: (id: string) => Promise<void>;
}) {
  const { id } = useParams<{ id: string }>();
  const [markdown, setMarkdown] = useState('');
  const note = notes.find((n) => n.id === id) ?? null;

  useEffect(() => {
    if (!note) return;
    fetchNoteMarkdown(note.id).then(setMarkdown).catch(() => setMarkdown(''));
    markNoteRead(note.id).catch(() => {});
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!note) return null;
  return (
    <NoteDetail
      note={note}
      notes={notes}
      categories={categories}
      markdown={markdown}
      readOnly={readOnly}
      reminders={reminders.filter((r) => r.noteId === note.id)}
      readCount={readCounts?.[note.id]}
      onOpenCategory={onOpenCategory}
      onOpenTag={onOpenTag}
      onSave={onSave}
      onAssist={onAssist}
      onDelete={() => onDelete(note)}
      onCreateReminder={onCreateReminder}
      onCompleteReminder={onCompleteReminder}
      onDeleteReminder={onDeleteReminder}
    />
  );
}
