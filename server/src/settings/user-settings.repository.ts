import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_DB, USER_SETTINGS_TABLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';

@Injectable()
export class UserSettingsRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(USER_SETTINGS_TABLE) private readonly table: any,
  ) {}

  async get(userId: string): Promise<Record<string, unknown>> {
    if (!this.db) return {};
    const rows = await this.db.select().from(this.table).where(eq(this.table.userId, userId));
    if (!rows.length) return {};
    try { return JSON.parse(rows[0].settings); } catch { return {}; }
  }

  async patch(userId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.db) return patch;
    const existing = await this.get(userId);
    const merged = { ...existing, ...patch };
    const json = JSON.stringify(merged);
    const rows = await this.db.select().from(this.table).where(eq(this.table.userId, userId));
    if (rows.length > 0) {
      await this.db.update(this.table).set({ settings: json }).where(eq(this.table.userId, userId)).run();
    } else {
      await this.db.insert(this.table).values({ userId, settings: json }).onConflictDoNothing().run();
    }
    return merged;
  }
}
