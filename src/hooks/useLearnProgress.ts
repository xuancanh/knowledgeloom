import { useState, useCallback, useEffect } from 'react';
import { fetchLearnProgress, awardLearnXp, masterLearnNote } from '../api';
import type { LearnProgressDto } from '../api';

export type LearnProgress = LearnProgressDto;

const DEFAULT: LearnProgress = { xp: 0, todayXp: 0, dailyGoalXp: 100, streak: 0, mastery: {} };

export function useLearnProgress() {
  const [progress, setProgress] = useState<LearnProgress>(DEFAULT);

  useEffect(() => {
    fetchLearnProgress()
      .then(setProgress)
      .catch(() => {/* offline or unauthenticated */});
  }, []);

  const award = useCallback(async (xp: number) => {
    if (xp <= 0) return;
    // optimistic update
    setProgress(p => ({ ...p, xp: p.xp + xp, todayXp: p.todayXp + xp }));
    try {
      setProgress(await awardLearnXp(xp));
    } catch { /* keep optimistic value */ }
  }, []);

  const master = useCallback(async (noteId: string) => {
    setProgress(p => ({ ...p, mastery: { ...p.mastery, [noteId]: 'mastered' } }));
    try {
      setProgress(await masterLearnNote(noteId));
    } catch { /* keep optimistic value */ }
  }, []);

  return { progress, award, master };
}
