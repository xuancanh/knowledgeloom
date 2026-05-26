import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateNoteRequest, Flashcard, KnowledgeNote, Reminder } from '../types';
import { formatCreated, type UiCategory } from '../lib/view';
import type { GuidanceTemplate } from '../lib/guidance';
import CaptureBox from './capture/CaptureBox';
import NoteList from './NoteList';

type HomeWidgets = { daily: boolean; discover: boolean; recent: boolean };
const DEFAULT_WIDGETS: HomeWidgets = { daily: true, discover: true, recent: true };

function loadWidgets(): HomeWidgets {
  try { return { ...DEFAULT_WIDGETS, ...JSON.parse(localStorage.getItem('kl:home-widgets') || '{}') }; }
  catch { return DEFAULT_WIDGETS; }
}

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
  const [customizing, setCustomizing] = useState(false);
  const [widgets, setWidgets] = useState<HomeWidgets>(loadWidgets);

  function toggleWidget(key: keyof HomeWidgets) {
    setWidgets((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('kl:home-widgets', JSON.stringify(next));
      return next;
    });
  }

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

  const widgetDefs: { key: keyof HomeWidgets; label: string }[] = [
    { key: 'daily',    label: t('home.widgetDaily') },
    { key: 'discover', label: t('home.widgetDiscover') },
    { key: 'recent',   label: t('home.widgetRecent') },
  ];

  return (
    <div className="home">
      <div className="crumbs">
        <span>{t('home.crumb')}</span>
        <button
          className={`home-customize-btn${customizing ? ' active' : ''}`}
          onClick={() => setCustomizing((v) => !v)}
        >
          {t('home.customize')}
        </button>
      </div>

      {customizing && (
        <div className="home-customize-bar">
          {widgetDefs.map(({ key, label }) => (
            <button
              key={key}
              className={`home-widget-chip${widgets[key] ? ' active' : ''}`}
              onClick={() => toggleWidget(key)}
            >
              <span className="home-widget-chip-dot" />
              {label}
            </button>
          ))}
        </div>
      )}

      <CaptureBox onSubmit={onSubmit} readOnly={readOnly} templates={templates} />

      {/* ── Daily panel: overdue + upcoming ── */}
      {widgets.daily && (hasReviewItems || upcomingReminders.length > 0) && (
        <div className="daily-panel">
          <div className="daily-panel-head">
            <span className="daily-panel-title">{t('home.reviewQueue')}</span>
            {(overdueReminders.length + dueFlashcards.length) > 0 && (
              <span className="daily-badge">
                {t('home.itemsDue', { count: overdueReminders.length + dueFlashcards.length })}
              </span>
            )}
          </div>

          {hasReviewItems && (
            <div className="daily-due">
              {dueFlashcards.length > 0 && (
                <div className="daily-row daily-row--flash">
                  <span className="daily-row-icon">⟁</span>
                  <div className="daily-row-body">
                    <span className="daily-row-title">{t('home.flashcardsDue')}</span>
                    <span className="daily-row-sub">{t('home.flashcardsReady', { count: dueFlashcards.length })}</span>
                  </div>
                  <button className="daily-cta" onClick={() => onOpenFlashcards('all')}>
                    {t('home.reviewCta')}
                  </button>
                </div>
              )}
              {overdueReminders.map((reminder) => {
                const note = notes.find((item) => item.id === reminder.noteId);
                return (
                  <div key={reminder.id} className="daily-row daily-row--overdue">
                    <span className="daily-row-icon">◎</span>
                    <div className="daily-row-body">
                      <span className="daily-row-title">{note?.title || reminder.noteId}</span>
                      <span className="daily-row-sub">{reminder.message || t('reminders.dueNow')}</span>
                    </div>
                    <div className="daily-row-end">
                      {note && <button className="daily-cta daily-cta--muted" onClick={() => onOpen(note.id)}>{t('home.openNote')}</button>}
                      <button className="daily-done" onClick={() => onCompleteReminder(reminder.id)}>{t('common.done')}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {upcomingReminders.length > 0 && (
            <div className={`daily-upcoming${hasReviewItems ? ' daily-upcoming--divided' : ''}`}>
              <span className="daily-upcoming-label">
                {t('home.upcoming')} · {t('home.scheduledCount', { count: dueReminders.length - overdueReminders.length })}
              </span>
              {upcomingReminders.map((reminder) => {
                const note = notes.find((item) => item.id === reminder.noteId);
                return (
                  <div key={reminder.id} className="daily-upcoming-row">
                    <span className="daily-upcoming-time">
                      {new Date(reminder.remindAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <button className="daily-upcoming-main" onClick={() => note && onOpen(note.id)}>
                      <span className="daily-upcoming-title">{note?.title || reminder.noteId}</span>
                      {reminder.message && <span className="daily-upcoming-msg">{reminder.message}</span>}
                    </button>
                    <button className="daily-done daily-done--sm" onClick={() => onCompleteReminder(reminder.id)}>{t('common.done')}</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Discover: unread notes ── */}
      {widgets.discover && notes.length > 0 && (
        <div className="discover-section">
          <div className="discover-header">
            <span className="discover-heading">{t('home.discover')}</span>
            {discoverNotes.length > 0 && (
              <button className="discover-shuffle" onClick={() => setDiscoverSeed(Math.random())} title={t('home.discoverShuffle')}>
                ↺ {t('home.discoverShuffle')}
              </button>
            )}
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
        </div>
      )}

      {/* Recent notes */}
      {widgets.recent && (
        <>
          <div className="section-label">
            <h2>{t('home.recentlyAdded')}</h2>
            <span className="meta">{t('home.totalNotes', { count: notes.length })}</span>
          </div>
          {recent.length === 0 ? (
            <div className="empty">{t('home.noNotes')}</div>
          ) : (
            <NoteList notes={recent} categories={categories} onOpen={onOpen} onOpenTag={onOpenTag} />
          )}
        </>
      )}
    </div>
  );
}
