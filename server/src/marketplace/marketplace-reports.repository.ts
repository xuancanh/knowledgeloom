/**
 * Marketplace reports — one report per user per listing (dedup via the composite
 * primary key), so a single user can't inflate the count. Enough distinct
 * reports auto-unpublish a listing (see the controller's REPORT_THRESHOLD).
 */
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, MARKETPLACE_REPORTS_TABLE } from '../database/database.constants';

@Injectable()
export class MarketplaceReportsRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(MARKETPLACE_REPORTS_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  private get pg(): boolean {
    return (this.config.get<string>('databaseDialect') || 'sqlite') === 'postgres';
  }

  /** Record a report (idempotent per user); returns the listing's report count. */
  async report(listingId: string, userId: string, reason: string): Promise<number> {
    const values = { listingId, userId, reason, createdAt: new Date().toISOString() };
    const upsert = this.db.insert(this.table).values(values).onConflictDoUpdate({
      target: [this.table.listingId, this.table.userId],
      set: { reason, createdAt: values.createdAt },
    });
    if (this.pg) await upsert; else upsert.run();
    return this.count(listingId);
  }

  async count(listingId: string): Promise<number> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.listingId, listingId));
    return rows.length;
  }
}
