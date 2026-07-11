/**
 * Public share links: unguessable id → one note. Rows are soft-revoked so a
 * recreated share never resurrects an old URL.
 */
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, SHARES_TABLE, SHARE_ACCESSES_TABLE } from '../database/database.constants';

export type ShareKind = 'note' | 'category';

export interface ShareRow {
  id: string;
  userId: string;
  /** Target: a note id (kind='note') or a category path (kind='category'). */
  noteId: string;
  kind: ShareKind;
  createdAt: string;
  revokedAt: string | null;
  /** Optional ISO expiry; null = never expires. */
  expiresAt: string | null;
  passwordHash: string | null;
}

export interface ShareAccessRow {
  id: string;
  shareId: string;
  userId: string;
  accessedAt: string;
}

@Injectable()
export class SharesRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(SHARES_TABLE) private readonly table: any,
    @Inject(SHARE_ACCESSES_TABLE) private readonly accessesTable: any,
    private readonly config: ConfigService,
  ) {}

  private get dialect(): string {
    return this.config.get<string>('databaseDialect') || 'sqlite';
  }

  async create(userId: string, target: string, kind: ShareKind = 'note', expiresAt: string | null = null, passwordHash: string | null = null): Promise<ShareRow> {
    const row: ShareRow = {
      id: randomBytes(16).toString('base64url'), // 128 bits, unguessable
      userId,
      noteId: target,
      kind,
      createdAt: new Date().toISOString(),
      revokedAt: null,
      expiresAt,
      passwordHash,
    };
    if (this.dialect === 'postgres') await this.db.insert(this.table).values(row);
    else this.db.insert(this.table).values(row).run();
    return row;
  }

  /** Active (non-revoked, non-expired) share by id — the public lookup. */
  async findActive(id: string): Promise<ShareRow | null> {
    const rows = await this.db.select().from(this.table)
      .where(and(eq(this.table.id, id), isNull(this.table.revokedAt)));
    const row = (rows[0] as ShareRow) ?? null;
    // Expiry is ISO-8601, so a lexicographic compare is a correct time compare.
    if (row?.expiresAt && row.expiresAt <= new Date().toISOString()) return null;
    return row;
  }

  async listByUser(userId: string): Promise<ShareRow[]> {
    const rows = await this.db.select().from(this.table)
      .where(and(eq(this.table.userId, userId), isNull(this.table.revokedAt)));
    return rows as ShareRow[];
  }

  async recordAccess(share: ShareRow): Promise<void> {
    const row: ShareAccessRow = {
      id: randomBytes(16).toString('base64url'),
      shareId: share.id,
      userId: share.userId,
      accessedAt: new Date().toISOString(),
    };
    if (this.dialect === 'postgres') await this.db.insert(this.accessesTable).values(row);
    else this.db.insert(this.accessesTable).values(row).run();
  }

  async listAccesses(userId: string, shareId: string, limit = 100): Promise<ShareAccessRow[] | null> {
    const owned = await this.db.select({ id: this.table.id }).from(this.table)
      .where(and(eq(this.table.id, shareId), eq(this.table.userId, userId)));
    if (!owned.length) return null;
    const rows = await this.db.select().from(this.accessesTable)
      .where(and(eq(this.accessesTable.shareId, shareId), eq(this.accessesTable.userId, userId)))
      .orderBy(desc(this.accessesTable.accessedAt))
      .limit(Math.max(1, Math.min(limit, 100)));
    return rows as ShareAccessRow[];
  }

  /** Revokes a share; scoped to the owner. Returns false when not found. */
  async revoke(userId: string, id: string): Promise<boolean> {
    const existing = await this.db.select().from(this.table)
      .where(and(eq(this.table.id, id), eq(this.table.userId, userId), isNull(this.table.revokedAt)));
    if (!existing.length) return false;
    const update = this.db.update(this.table)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, id), eq(this.table.userId, userId)));
    if (this.dialect === 'postgres') await update;
    else update.run();
    return true;
  }
}
