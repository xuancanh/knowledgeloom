import { useEffect, useMemo, useState } from 'react';
import type { CreateNoteRequest, KnowledgeNote, Reminder } from '../types';
import { formatCreated, type UiCategory } from '../lib/view';
import type { GuidanceTemplate } from '../lib/guidance';
import CaptureBox from './capture/CaptureBox';
import NoteList from './NoteList';

/**
 * Main desk view: capture input, reminders, and recent notes. Codex activity
 * lives on its own route so the home page stays focused on writing.
 */
export default function Home({
  notes,
  categories,
  reminders,
  onOpen,
  onOpenTag,
  onCompleteReminder,
  onSubmit,
  readOnly,
  templates,
}: {
  notes: KnowledgeNote[];
  categories: UiCategory[];
  reminders: Reminder[];
  onOpen: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onCompleteReminder: (id: string) => void;
  onSubmit: (payload: CreateNoteRequest) => void;
  readOnly: boolean;
  templates: GuidanceTemplate[];
}) {
  const recent = useMemo(
    () => [...notes].sort((a, b) => formatCreated(b.createdAt).localeCompare(formatCreated(a.createdAt))).slice(0, 8),
    [notes],
  );
  const [now, setNow] = useState(() => Date.now());
  const sortedReminders = [...reminders].sort((a, b) => a.remindAt.localeCompare(b.remindAt)).slice(0, 6);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
      <div className="home">
      <div className="crumbs"><span>Desk</span><span className="sep">/</span><span>Capture</span></div>
      <CaptureBox onSubmit={onSubmit} readOnly={readOnly} templates={templates} />

      <div className="section-label">
        <h2>Reminders</h2>
        <span className="meta">{reminders.length} scheduled</span>
      </div>
      {sortedReminders.length === 0 ? (
        <div className="empty">No reminders scheduled. Open a note and set one for a future review.</div>
      ) : (
        <div className="reminder-list">
          {sortedReminders.map((reminder) => {
            const note = notes.find((item) => item.id === reminder.noteId);
            const due = Date.parse(reminder.remindAt) <= now;
            return (
              <div key={reminder.id} className={`reminder-row${due ? ' due' : ''}`}>
                <button className="reminder-main" onClick={() => note && onOpen(note.id)}>
                  <span>{due ? 'Due now' : new Date(reminder.remindAt).toLocaleString()}</span>
                  <b>{note?.title || reminder.noteId}</b>
                  {reminder.message && <em>{reminder.message}</em>}
                </button>
                <button className="reminder-done" onClick={() => onCompleteReminder(reminder.id)}>Done</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-label">
        <h2>Recently learned</h2>
        <span className="meta">{notes.length} notes total · {categories.length} categories</span>
      </div>
      <NoteList notes={recent} categories={categories} onOpen={onOpen} onOpenTag={onOpenTag} />
    </div>
  );
}
