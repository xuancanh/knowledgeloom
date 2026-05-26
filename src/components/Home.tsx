import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateNoteRequest, Flashcard, KnowledgeNote, Reminder } from '../types';
import { formatCreated, type UiCategory } from '../lib/view';
import type { GuidanceTemplate } from '../lib/guidance';
import CaptureBox from './capture/CaptureBox';
import NoteList from './NoteList';

export default function Home({
  notes,
  categories,
  flashcards,
  reminders,
  readNoteIds,
  onOpen,
  onOpenTag,
  onOpenFlashcards,
  onCompleteReminder,
  onSubmit,
  readOnly,
  templates,
}: {
  notes: KnowledgeNote[];
  categories: UiCategory[];
  flashcards: Flashcard[];
  reminders: Reminder[];
  readNoteIds?: string[];
  onOpen: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onOpenFlashcards: (scope?: 'all') => void;
  onCompleteReminder: (id: string) => void;
  onSubmit: (payload: CreateNoteRequest) => void;
  readOnly: boolean;
  templates: GuidanceTemplate[];
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const [discoverSeed, setDiscoverSeed] = useState(() => Math.random());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const recent = useMemo(
    () => [...notes].sort((a, b) => formatCreated(b.createdAt).localeCompare(formatCreated(a.createdAt))).slice(0, 6),
    [notes],
  );

  const discoverNotes = useMemo(() => {
    const readSet = new Set(readNoteIds || []);
    const unread = notes.filter((n) => !readSet.has(n.id));
    if (!unread.length) return [];
    if (unread.length <= 3) return unread;
    const scored = unread.map((n) => ({
      note: n,
      score: ((discoverSeed * 1000) | 0) * 31 + n.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0),
    }));
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, 3).map((x) => x.note);
  }, [notes, readNoteIds, discoverSeed]);

  const dueReminders = useMemo(
    () => [...reminders]
      .filter((r) => !r.completedAt)
      .sort((a, b) => a.remindAt.localeCompare(b.remindAt)),
    [reminders],
  );

  const overdueReminders = dueReminders.filter((r) => Date.parse(r.remindAt) <= now);
  const upcomingReminders = dueReminders.filter((r) => Date.parse(r.remindAt) > now).slice(0, 3);

  const dueFlashcards = useMemo(() => {
    return flashcards.filter((f) => {
      if (!f.reviewData?.nextReviewAt) return true;
      return Date.parse(f.reviewData.nextReviewAt) <= now;
    });
  }, [flashcards, now]);

  const hasReviewItems = overdueReminders.length > 0 || dueFlashcards.length > 0;

  return (
    <div className="home">
      <div className="crumbs"><span>{t('home.crumb')}</span></div>

      <CaptureBox onSubmit={onSubmit} readOnly={readOnly} templates={templates} />

      {/* Review queue */}
      {hasReviewItems && (
        <>
          <div className="section-label">
            <h2>{t('home.reviewQueue')}</h2>
            <span className="meta">
              {t('home.itemsDue', { count: overdueReminders.length + dueFlashcards.length })}
            </span>
          </div>

          <div className="review-queue">
            {dueFlashcards.length > 0 && (
              <div className="review-card flashcard-due">
                <div className="review-card-icon">⟁</div>
                <div className="review-card-body">
                  <div className="review-card-title">{t('home.flashcardsDue')}</div>
                  <div className="review-card-sub">{t('home.flashcardsReady', { count: dueFlashcards.length })}</div>
                </div>
                <button className="review-card-cta" onClick={() => onOpenFlashcards('all')}>
                  {t('home.reviewCta')}
                </button>
              </div>
            )}

            {overdueReminders.map((reminder) => {
              const note = notes.find((item) => item.id === reminder.noteId);
              return (
                <div key={reminder.id} className="review-card reminder-due">
                  <div className="review-card-icon">◎</div>
                  <div className="review-card-body">
                    <div className="review-card-title">{note?.title || reminder.noteId}</div>
                    <div className="review-card-sub">
                      {reminder.message || t('reminders.dueNow')}
                    </div>
                  </div>
                  <div className="review-card-actions">
                    {note && <button className="review-card-cta" onClick={() => onOpen(note.id)}>{t('home.openNote')}</button>}
                    <button className="review-card-done" onClick={() => onCompleteReminder(reminder.id)}>{t('common.done')}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Upcoming reminders (not yet due) */}
      {upcomingReminders.length > 0 && (
        <>
          <div className="section-label">
            <h2>{t('home.upcoming')}</h2>
            <span className="meta">{t('home.scheduledCount', { count: dueReminders.length - overdueReminders.length })}</span>
          </div>
          <div className="reminder-list">
            {upcomingReminders.map((reminder) => {
              const note = notes.find((item) => item.id === reminder.noteId);
              return (
                <div key={reminder.id} className="reminder-row">
                  <button className="reminder-main" onClick={() => note && onOpen(note.id)}>
                    <span>{new Date(reminder.remindAt).toLocaleString()}</span>
                    <b>{note?.title || reminder.noteId}</b>
                    {reminder.message && <em>{reminder.message}</em>}
                  </button>
                  <button className="reminder-done" onClick={() => onCompleteReminder(reminder.id)}>{t('common.done')}</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Discover — unread notes */}
      {notes.length > 0 && (
        <>
          <div className="section-label">
            <h2>{t('home.discover')}</h2>
            {discoverNotes.length > 0 ? (
              <button className="discover-shuffle" onClick={() => setDiscoverSeed(Math.random())} title={t('home.discoverShuffle')}>
                ↺ {t('home.discoverShuffle')}
              </button>
            ) : null}
          </div>
          {discoverNotes.length === 0 ? (
            <div className="discover-empty">{t('home.discoverEmpty')}</div>
          ) : (
            <div className="discover-grid">
              {discoverNotes.map((note) => (
                <button key={note.id} className="discover-card" onClick={() => onOpen(note.id)}>
                  <span className="discover-card-cat">{note.category}</span>
                  <span className="discover-card-title">{note.title}</span>
                  {note.summary && <span className="discover-card-summary">{note.summary}</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Recent notes */}
      <div className="section-label">
        <h2>{t('home.recentlyAdded')}</h2>
        <span className="meta">{t('home.totalNotes', { count: notes.length })}</span>
      </div>
      {recent.length === 0 ? (
        <div className="empty">{t('home.noNotes')}</div>
      ) : (
        <NoteList notes={recent} categories={categories} onOpen={onOpen} onOpenTag={onOpenTag} />
      )}
    </div>
  );
}
