/**
 * Marketplace ratings — one 1–5-star rating (+ optional comment) per user per
 * listing; re-rating replaces the previous value.
 */
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, inArray } from 'drizzle-orm';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, MARKETPLACE_RATINGS_TABLE } from '../database/database.constants';

export interface RatingAggregate {
  avgStars: number;
  ratingCount: number;
}

@Injectable()
export class MarketplaceRatingsRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(MARKETPLACE_RATINGS_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  private get pg(): boolean {
    return (this.config.get<string>('databaseDialect') || 'sqlite') === 'postgres';
  }

  async rate(listingId: string, userId: string, stars: number, comment: string): Promise<void> {
    const values = { listingId, userId, stars, comment, createdAt: new Date().toISOString() };
    const set = { stars, comment, createdAt: values.createdAt };
    const upsert = this.db.insert(this.table).values(values).onConflictDoUpdate({
      target: [this.table.listingId, this.table.userId],
      set,
    });
    if (this.pg) await upsert;
    else upsert.run();
  }

  async userRating(listingId: string, userId: string): Promise<number | null> {
    const rows = await this.db.select().from(this.table)
      .where(and(eq(this.table.listingId, listingId), eq(this.table.userId, userId)));
    return rows[0]?.stars ?? null;
  }

  /** Aggregates for a set of listings in one query. */
  async aggregates(listingIds: string[]): Promise<Map<string, RatingAggregate>> {
    const out = new Map<string, RatingAggregate>();
    if (!listingIds.length) return out;
    const rows = await this.db.select().from(this.table)
      .where(inArray(this.table.listingId, listingIds));
    const grouped = new Map<string, number[]>();
    for (const r of rows) {
      const list = grouped.get(r.listingId) || [];
      list.push(r.stars);
      grouped.set(r.listingId, list);
    }
    for (const [id, stars] of grouped) {
      out.set(id, {
        avgStars: Number((stars.reduce((a, b) => a + b, 0) / stars.length).toFixed(2)),
        ratingCount: stars.length,
      });
    }
    return out;
  }

  /** Recent comments for a listing (non-empty only). */
  async comments(listingId: string, limit = 10): Promise<{ stars: number; comment: string; createdAt: string }[]> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.listingId, listingId));
    return rows
      .filter((r: any) => r.comment)
      .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((r: any) => ({ stars: r.stars, comment: r.comment, createdAt: r.createdAt }));
  }
}
