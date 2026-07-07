/**
 * Marketplace listings — published shares anyone can browse and import.
 * Listings are soft-unpublished; content is served through the underlying
 * share, so revoking the share also kills the listing.
 */
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, or, isNull, like, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, MARKETPLACE_LISTINGS_TABLE } from '../database/database.constants';

export interface ListingRow {
  id: string;
  shareId: string;
  userId: string;
  title: string;
  description: string;
  kind: 'note' | 'category';
  tags: string[];
  author: string;
  imports: number;
  publishedAt: string;
  unpublishedAt: string | null;
}

function fromRow(r: any): ListingRow {
  let tags: string[] = [];
  try { tags = JSON.parse(r.tags || '[]'); } catch { /* ignore */ }
  return { ...r, tags, imports: r.imports ?? 0, unpublishedAt: r.unpublishedAt ?? null };
}

@Injectable()
export class MarketplaceRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(MARKETPLACE_LISTINGS_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  private get pg(): boolean {
    return (this.config.get<string>('databaseDialect') || 'sqlite') === 'postgres';
  }

  async create(input: Omit<ListingRow, 'id' | 'imports' | 'publishedAt' | 'unpublishedAt'>): Promise<ListingRow> {
    const row = {
      id: randomBytes(12).toString('base64url'),
      shareId: input.shareId,
      userId: input.userId,
      title: input.title,
      description: input.description,
      kind: input.kind,
      tags: JSON.stringify(input.tags),
      author: input.author,
      imports: 0,
      publishedAt: new Date().toISOString(),
      unpublishedAt: null as string | null,
    };
    if (this.pg) await this.db.insert(this.table).values(row);
    else this.db.insert(this.table).values(row).run();
    return fromRow(row);
  }

  async findActive(id: string): Promise<ListingRow | null> {
    const rows = await this.db.select().from(this.table)
      .where(and(eq(this.table.id, id), isNull(this.table.unpublishedAt)));
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async activeByShare(shareId: string): Promise<ListingRow | null> {
    const rows = await this.db.select().from(this.table)
      .where(and(eq(this.table.shareId, shareId), isNull(this.table.unpublishedAt)));
    return rows[0] ? fromRow(rows[0]) : null;
  }

  /** All active listings, newest first (filtering/search happens in JS — volumes are small). */
  async listActive(): Promise<ListingRow[]> {
    const rows = await this.db.select().from(this.table).where(isNull(this.table.unpublishedAt));
    return rows.map(fromRow).sort((a: ListingRow, b: ListingRow) => b.publishedAt.localeCompare(a.publishedAt));
  }

  /**
   * Active listings owned by a user across all of their spaces. The stored
   * userId is the scope key — either the bare userId (default space) or
   * `userId~spaceId` — so we match the exact id plus that prefix. Uses the
   * userId index instead of scanning every listing in the gallery.
   * (User ids are 'local' or UUIDs, so they carry no LIKE wildcards.)
   */
  async listByOwner(userId: string): Promise<ListingRow[]> {
    const rows = await this.db.select().from(this.table).where(
      and(
        isNull(this.table.unpublishedAt),
        or(eq(this.table.userId, userId), like(this.table.userId, `${userId}~%`)),
      ),
    );
    return rows.map(fromRow).sort((a: ListingRow, b: ListingRow) => b.publishedAt.localeCompare(a.publishedAt));
  }

  async incrementImports(id: string): Promise<void> {
    const update = this.db.update(this.table)
      .set({ imports: sql`${this.table.imports} + 1` })
      .where(eq(this.table.id, id));
    if (this.pg) await update;
    else update.run();
  }

  /** Owner-scoped unpublish. Returns false when not found. */
  async unpublish(userId: string, id: string): Promise<boolean> {
    const rows = await this.db.select().from(this.table)
      .where(and(eq(this.table.id, id), eq(this.table.userId, userId), isNull(this.table.unpublishedAt)));
    if (!rows.length) return false;
    const update = this.db.update(this.table)
      .set({ unpublishedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, id), eq(this.table.userId, userId)));
    if (this.pg) await update;
    else update.run();
    return true;
  }
}
