/**
 * Public share links: unguessable id → one note. Rows are soft-revoked so a
 * recreated share never resurrects an old URL.
 */
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, isNull } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, SHARES_TABLE } from '../database/database.constants';

export type ShareKind = 'note' | 'category';

export interface ShareRow {
  id: string;
  userId: string;
  /** Target: a note id (kind='note') or a category path (kind='category'). */
  noteId: string;
  kind: ShareKind;
  createdAt: string;
  revokedAt: string | null;
}

@Injectable()
export class SharesRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(SHARES_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  private get dialect(): string {
    return this.config.get<string>('databaseDialect') || 'sqlite';
  }

  async create(userId: string, target: string, kind: ShareKind = 'note'): Promise<ShareRow> {
    const row: ShareRow = {
      id: randomBytes(16).toString('base64url'), // 128 bits, unguessable
      userId,
      noteId: target,
      kind,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    if (this.dialect === 'postgres') await this.db.insert(this.table).values(row);
    else this.db.insert(this.table).values(row).run();
    return row;
  }

  /** Active (non-revoked) share by id — the public lookup. */
  async findActive(id: string): Promise<ShareRow | null> {
    const rows = await this.db.select().from(this.table)
      .where(and(eq(this.table.id, id), isNull(this.table.revokedAt)));
    return (rows[0] as ShareRow) ?? null;
  }

  async listByUser(userId: string): Promise<ShareRow[]> {
    const rows = await this.db.select().from(this.table)
      .where(and(eq(this.table.userId, userId), isNull(this.table.revokedAt)));
    return rows as ShareRow[];
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
