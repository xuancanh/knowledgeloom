import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchNoteDocument, markNoteRead, type NoteTransferMode, type NoteTransferResult, type NoteUpdate, type NoteUpdateResult } from '../../api';
import type { Space } from '../../lib/spaces';
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
  onSave, onAssist, onListSpaces, onTransfer, onDelete,
  onCreateReminder, onCompleteReminder, onDeleteReminder,
}: {
  notes: KnowledgeNote[];
  categories: UiCategory[];
  readOnly: boolean;
  reminders: Reminder[];
  readCounts?: Record<string, number>;
  onOpenCategory: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onSave: (id: string, update: NoteUpdate, expectedVersion?: string) => Promise<NoteUpdateResult>;
  onAssist: (id: string, prompt: string, draft: NoteUpdate) => Promise<NoteUpdate>;
  onListSpaces: () => Promise<Space[]>;
  onTransfer: (id: string, toSpaceId: string, mode: NoteTransferMode) => Promise<NoteTransferResult>;
  onDelete: (note: KnowledgeNote) => Promise<void>;
  onCreateReminder: (noteId: string, remindAt: string, message: string) => Promise<void>;
  onCompleteReminder: (id: string) => Promise<void>;
  onDeleteReminder: (id: string) => Promise<void>;
}) {
  const { id } = useParams<{ id: string }>();
  const [markdown, setMarkdown] = useState('');
  const [version, setVersion] = useState<string>();
  const note = notes.find((n) => n.id === id) ?? null;

  useEffect(() => {
    if (!note) return;
    let active = true;
    fetchNoteDocument(note.id)
      .then((document) => {
        if (!active) return;
        setMarkdown(document.markdown);
        setVersion(document.version);
      })
      .catch(() => {
        if (!active) return;
        setMarkdown('');
        setVersion(undefined);
      });
    markNoteRead(note.id).catch(() => {});
    return () => { active = false; };
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveNote(noteId: string, update: NoteUpdate): Promise<void> {
    const result = await onSave(noteId, update, version);
    setMarkdown(result.markdown);
    setVersion(result.version);
  }

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
      onSave={saveNote}
      onAssist={onAssist}
      onListSpaces={onListSpaces}
      onTransfer={onTransfer}
      onDelete={() => onDelete(note)}
      onCreateReminder={onCreateReminder}
      onCompleteReminder={onCompleteReminder}
      onDeleteReminder={onDeleteReminder}
    />
  );
}
