/**
 * Drizzle access for the spaces table.
 *
 * A space row is (id, userId, name, createdAt). The default space has no row —
 * it exists implicitly for every user (see scope.util.ts).
 *
 * findForUser() sits on the hot path (ApiAuthGuard resolves the x-space-id
 * header on every request), so ownership lookups are cached for a short TTL.
 * Mutations invalidate the owner's cache entry.
 */
import { Injectable, Inject } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE_DB, SPACES_TABLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';

export interface SpaceRow {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

const CACHE_TTL_MS = 30_000;
// Bound the owner cache so it can't grow without limit on a multi-user host.
// Keys only ever overwrite/delete otherwise, so distinct users would
// accumulate forever. When the cap is hit we drop expired entries first, then
// fall back to clearing the whole map (a cold rebuild is cheap: one indexed
// query per user).
const CACHE_MAX_ENTRIES = 10_000;

@Injectable()
export class SpacesRepository {
  private readonly cache = new Map<string, { rows: SpaceRow[]; expires: number }>();

  private evictIfFull(): void {
    if (this.cache.size < CACHE_MAX_ENTRIES) return;
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expires <= now) this.cache.delete(key);
    }
    if (this.cache.size >= CACHE_MAX_ENTRIES) this.cache.clear();
  }

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(SPACES_TABLE) private readonly table: any,
  ) {}

  async listForUser(userId: string): Promise<SpaceRow[]> {
    if (!this.db) return [];
    const cached = this.cache.get(userId);
    if (cached && cached.expires > Date.now()) return cached.rows;
    const rows = (await this.db.select().from(this.table).where(eq(this.table.userId, userId))) as SpaceRow[];
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    this.evictIfFull();
    this.cache.set(userId, { rows, expires: Date.now() + CACHE_TTL_MS });
    return rows;
  }

  async findForUser(userId: string, spaceId: string): Promise<SpaceRow | null> {
    const rows = await this.listForUser(userId);
    return rows.find((r) => r.id === spaceId) ?? null;
  }

  async insert(row: SpaceRow): Promise<void> {
    if (!this.db) return;
    await this.db.insert(this.table).values(row).run();
    this.cache.delete(row.userId);
  }

  async rename(userId: string, spaceId: string, name: string): Promise<void> {
    if (!this.db) return;
    await this.db
      .update(this.table)
      .set({ name })
      .where(and(eq(this.table.userId, userId), eq(this.table.id, spaceId)))
      .run();
    this.cache.delete(userId);
  }

  async delete(userId: string, spaceId: string): Promise<void> {
    if (!this.db) return;
    await this.db
      .delete(this.table)
      .where(and(eq(this.table.userId, userId), eq(this.table.id, spaceId)))
      .run();
    this.cache.delete(userId);
  }
}
