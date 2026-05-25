import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Reminder } from '../../types';
import { toLocalDateTimeInputValue } from '../../lib/format';

const INITIAL_CLOCK_TIME = Date.now();

/**
 * Reminder scheduling form and active reminder list for a single note.
 *
 * Shows a datetime-local picker, optional message input, and a "Schedule"
 * button. Below it lists all active reminders for this note with "Due now"
 * detection (updated every 60 seconds) and Done/Delete actions.
 */
export function ReminderSection({
  noteId,
  reminders,
  readOnly,
  onCreateReminder,
  onCompleteReminder,
  onDeleteReminder,
}: {
  noteId: string;
  reminders: Reminder[];
  readOnly: boolean;
  onCreateReminder: (noteId: string, remindAt: string, message: string) => Promise<void>;
  onCompleteReminder: (id: string) => Promise<void>;
  onDeleteReminder: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [remindAt, setRemindAt] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(INITIAL_CLOCK_TIME);
  const [minimumTime, setMinimumTime] = useState(
    toLocalDateTimeInputValue(new Date(INITIAL_CLOCK_TIME + 60_000)),
  );

  useEffect(() => {
    function refreshClock() {
      const currentTime = Date.now();
      setNow(currentTime);
      setMinimumTime(toLocalDateTimeInputValue(new Date(currentTime + 60_000)));
    }
    const timer = window.setInterval(refreshClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function schedule() {
    if (!remindAt) return;
    const selectedDate = new Date(remindAt);
    if (Number.isNaN(selectedDate.getTime())) {
      setError(t('reminders.invalidDate'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onCreateReminder(noteId, selectedDate.toISOString(), message);
      setRemindAt('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reminders.invalidDate'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="reminder-card">
      <div className="section-label">
        <h2>{t('reminders.title')}</h2>
        <span className="meta">{t('reminders.active', { count: reminders.length })}</span>
      </div>
      <div className="reminder-form">
        <input
          type="datetime-local"
          value={remindAt}
          onChange={(event) => setRemindAt(event.target.value)}
          min={minimumTime}
          disabled={readOnly}
        />
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t('reminders.optionalMessage')}
          disabled={readOnly}
        />
        <button onClick={schedule} disabled={readOnly || saving || !remindAt}>
          {saving ? t('common.saving') : t('reminders.schedule')}
        </button>
      </div>
      {error && <div className="edit-error">{error}</div>}
      <div className="reminder-list note-reminders">
        {reminders.map((reminder) => {
          const due = Date.parse(reminder.remindAt) <= now;
          return (
            <div key={reminder.id} className={`reminder-row${due ? ' due' : ''}`}>
              <div className="reminder-main as-text">
                <span>{due ? t('reminders.dueNow') : new Date(reminder.remindAt).toLocaleString()}</span>
                <b>{reminder.message || t('reminders.defaultMessage')}</b>
              </div>
              <button className="reminder-done" onClick={() => onCompleteReminder(reminder.id)} disabled={readOnly}>{t('common.done')}</button>
              <button className="reminder-delete" onClick={() => onDeleteReminder(reminder.id)} disabled={readOnly}>{t('common.delete')}</button>
            </div>
          );
        })}
        {!reminders.length && <div className="fine">{t('reminders.noReminders')}</div>}
      </div>
    </div>
  );
}
