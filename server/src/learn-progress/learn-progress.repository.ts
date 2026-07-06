import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_DB, LEARN_PROGRESS_TABLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { applyDayRollover } from './progress-rollover';

export interface LearnProgress {
  xp: number;
  todayXp: number;
  dailyGoalXp: number;
  streak: number;
  mastery: Record<string, 'mastered'>;
}

@Injectable()
export class LearnProgressRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(LEARN_PROGRESS_TABLE) private readonly table: any,
  ) {}

  async get(userId: string): Promise<LearnProgress> {
    if (!this.db) return this.empty();
    const rows = await this.db.select().from(this.table).where(eq(this.table.userId, userId));
    if (!rows.length) return this.empty();
    const row = rows[0];
    let mastery: Record<string, 'mastered'> = {};
    try { mastery = JSON.parse(row.mastery); } catch { /* ignore */ }
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const rolled = applyDayRollover(
      { todayXp: row.todayXp ?? 0, streak: row.streak ?? 0, lastActiveDate: row.lastActiveDate ?? null },
      today,
      yesterday,
    );
    return {
      xp: row.xp ?? 0,
      todayXp: rolled.todayXp,
      dailyGoalXp: row.dailyGoalXp ?? 100,
      streak: rolled.streak,
      mastery,
    };
  }

  async award(userId: string, amount: number): Promise<LearnProgress> {
    if (!this.db) return this.empty();
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.db.select().from(this.table).where(eq(this.table.userId, userId));

    if (!rows.length) {
      const row = { userId, xp: amount, todayXp: amount, dailyGoalXp: 100, streak: 1, lastActiveDate: today, mastery: '{}' };
      await this.db.insert(this.table).values(row).run();
      return { xp: amount, todayXp: amount, dailyGoalXp: 100, streak: 1, mastery: {} };
    }

    const cur = rows[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Single source of truth for day boundaries: roll the stored row forward,
    // then apply today's activity on top (get() uses the same helper, so the
    // two paths can no longer drift).
    const rolled = applyDayRollover(
      { todayXp: cur.todayXp ?? 0, streak: cur.streak ?? 0, lastActiveDate: cur.lastActiveDate ?? null },
      today,
      yesterday,
    );
    const todayXp = rolled.todayXp + amount;
    const streak = cur.lastActiveDate === today ? rolled.streak : rolled.streak + 1;

    const xp = (cur.xp ?? 0) + amount;
    await this.db.update(this.table)
      .set({ xp, todayXp, streak, lastActiveDate: today })
      .where(eq(this.table.userId, userId))
      .run();

    let mastery: Record<string, 'mastered'> = {};
    try { mastery = JSON.parse(cur.mastery); } catch { /* ignore */ }
    return { xp, todayXp, dailyGoalXp: cur.dailyGoalXp ?? 100, streak, mastery };
  }

  async master(userId: string, noteId: string): Promise<LearnProgress> {
    if (!this.db) return this.empty();
    const rows = await this.db.select().from(this.table).where(eq(this.table.userId, userId));
    if (!rows.length) {
      const mastery = JSON.stringify({ [noteId]: 'mastered' });
      await this.db.insert(this.table).values({ userId, xp: 0, todayXp: 0, dailyGoalXp: 100, streak: 0, mastery }).run();
      return { xp: 0, todayXp: 0, dailyGoalXp: 100, streak: 0, mastery: { [noteId]: 'mastered' } };
    }

    const cur = rows[0];
    let mastery: Record<string, 'mastered'> = {};
    try { mastery = JSON.parse(cur.mastery); } catch { /* ignore */ }
    mastery[noteId] = 'mastered';
    await this.db.update(this.table)
      .set({ mastery: JSON.stringify(mastery) })
      .where(eq(this.table.userId, userId))
      .run();

    return {
      xp: cur.xp ?? 0,
      todayXp: cur.todayXp ?? 0,
      dailyGoalXp: cur.dailyGoalXp ?? 100,
      streak: cur.streak ?? 0,
      mastery,
    };
  }

  private empty(): LearnProgress {
    return { xp: 0, todayXp: 0, dailyGoalXp: 100, streak: 0, mastery: {} };
  }
}
