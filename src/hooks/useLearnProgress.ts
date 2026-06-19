import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../api';

export type LearnProgress = {
  xp: number;
  todayXp: number;
  dailyGoalXp: number;
  streak: number;
  mastery: Record<string, 'mastered'>;
};

const DEFAULT: LearnProgress = { xp: 0, todayXp: 0, dailyGoalXp: 100, streak: 0, mastery: {} };

export function useLearnProgress() {
  const [progress, setProgress] = useState<LearnProgress>(DEFAULT);

  useEffect(() => {
    apiFetch('/api/learn-progress')
      .then(r => r.ok ? r.json() : DEFAULT)
      .then(setProgress)
      .catch(() => {/* offline or unauthenticated */});
  }, []);

  const award = useCallback(async (xp: number) => {
    if (xp <= 0) return;
    // optimistic update
    setProgress(p => ({ ...p, xp: p.xp + xp, todayXp: p.todayXp + xp }));
    try {
      const r = await apiFetch('/api/learn-progress/award', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ xp }),
      });
      if (r.ok) setProgress(await r.json());
    } catch { /* noop */ }
  }, []);

  const master = useCallback(async (noteId: string) => {
    setProgress(p => ({ ...p, mastery: { ...p.mastery, [noteId]: 'mastered' } }));
    try {
      const r = await apiFetch(`/api/learn-progress/master/${encodeURIComponent(noteId)}`, { method: 'POST' });
      if (r.ok) setProgress(await r.json());
    } catch { /* noop */ }
  }, []);

  return { progress, award, master };
}
