/**
 * BDD-style integration tests for the reminders table.
 *
 * Tests the SQLite schema + Drizzle query layer directly (avoids NestJS
 * decorator compilation issues with tsx runner).
 *
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, isNull, and, lte } from 'drizzle-orm';
import { sqliteReminders } from '../server/src/database/schema';

const DDL = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY, noteId TEXT NOT NULL,
    remindAt TEXT NOT NULL, message TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL, completedAt TEXT,
    userId TEXT NOT NULL DEFAULT 'local'
  );
`;

function setupDb(): { sqlite: Database.Database; db: ReturnType<typeof drizzle>; tempDir: string } {
  const tempDir = mkdtempSync(join(tmpdir(), 'knowledge-reminders-'));
  const sqlite = new Database(join(tempDir, 'app.sqlite'));
  sqlite.exec(DDL);
  const db = drizzle(sqlite, { schema: { sqliteReminders } });
  return { tempDir, sqlite, db };
}

const userId = 'local';

// ── CRUD operations ──────────────────────────────────────────────────────────

test('insert: creates a reminder with UUID and all fields', async () => {
  const { db, sqlite, tempDir } = setupDb();
  try {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await db.insert(sqliteReminders).values({
      id, userId, noteId: 'note-1',
      remindAt: '2026-06-01T10:00:00.000Z',
      message: 'Review this note',
      createdAt,
    });

    const rows = await db.select().from(sqliteReminders).where(eq(sqliteReminders.userId, userId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id);
    assert.equal(rows[0].noteId, 'note-1');
    assert.equal(rows[0].message, 'Review this note');
    assert.equal(rows[0].completedAt, null);
  } finally {
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('list active: returns reminders where completedAt IS NULL', async () => {
  const { db, sqlite, tempDir } = setupDb();
  try {
    const now = new Date().toISOString();
    await db.insert(sqliteReminders).values([
      { id: randomUUID(), userId, noteId: 'n1', remindAt: '2026-06-01T00:00:00.000Z', message: 'Active', createdAt: now },
      { id: randomUUID(), userId, noteId: 'n2', remindAt: '2026-05-01T00:00:00.000Z', message: 'Done', createdAt: now, completedAt: now },
    ]);

    const active = await db.select().from(sqliteReminders)
      .where(and(eq(sqliteReminders.userId, userId), isNull(sqliteReminders.completedAt)));

    assert.equal(active.length, 1);
    assert.equal(active[0].noteId, 'n1');
  } finally {
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('list due: returns active reminders past their remindAt', async () => {
  const { db, sqlite, tempDir } = setupDb();
  try {
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const nextWeek = new Date(Date.now() + 86400000 * 7).toISOString();

    await db.insert(sqliteReminders).values([
      { id: randomUUID(), userId, noteId: 'n1', remindAt: yesterday, message: 'Overdue', createdAt: now },
      { id: randomUUID(), userId, noteId: 'n2', remindAt: nextWeek, message: 'Upcoming', createdAt: now },
    ]);

    const due = await db.select().from(sqliteReminders)
      .where(and(
        eq(sqliteReminders.userId, userId),
        isNull(sqliteReminders.completedAt),
        lte(sqliteReminders.remindAt, new Date().toISOString()),
      ));

    assert.equal(due.length, 1);
    assert.equal(due[0].noteId, 'n1');
  } finally {
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('list by noteId: filters reminders for a specific note', async () => {
  const { db, sqlite, tempDir } = setupDb();
  try {
    const now = new Date().toISOString();
    await db.insert(sqliteReminders).values([
      { id: randomUUID(), userId, noteId: 'n1', remindAt: '2026-06-01T00:00:00.000Z', message: 'A', createdAt: now },
      { id: randomUUID(), userId, noteId: 'n2', remindAt: '2026-06-01T00:00:00.000Z', message: 'B', createdAt: now },
    ]);

    const filtered = await db.select().from(sqliteReminders)
      .where(and(eq(sqliteReminders.userId, userId), eq(sqliteReminders.noteId, 'n1')));

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].noteId, 'n1');
  } finally {
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('update: patches remindAt and message', async () => {
  const { db, sqlite, tempDir } = setupDb();
  try {
    const id = randomUUID();
    await db.insert(sqliteReminders).values({
      id, userId, noteId: 'n1',
      remindAt: '2026-06-01T00:00:00.000Z', message: 'Old',
      createdAt: new Date().toISOString(),
    });

    await db.update(sqliteReminders)
      .set({ remindAt: '2026-07-01T00:00:00.000Z', message: 'New' })
      .where(and(eq(sqliteReminders.userId, userId), eq(sqliteReminders.id, id)));

    const rows = await db.select().from(sqliteReminders).where(eq(sqliteReminders.id, id));
    assert.equal(rows[0].remindAt, '2026-07-01T00:00:00.000Z');
    assert.equal(rows[0].message, 'New');
  } finally {
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('complete: sets completedAt timestamp', async () => {
  const { db, sqlite, tempDir } = setupDb();
  try {
    const id = randomUUID();
    await db.insert(sqliteReminders).values({
      id, userId, noteId: 'n1',
      remindAt: '2026-06-01T00:00:00.000Z', message: 'Test',
      createdAt: new Date().toISOString(),
    });

    const completedAt = new Date().toISOString();
    await db.update(sqliteReminders)
      .set({ completedAt })
      .where(and(eq(sqliteReminders.userId, userId), eq(sqliteReminders.id, id)));

    const rows = await db.select().from(sqliteReminders).where(eq(sqliteReminders.id, id));
    assert.ok(rows[0].completedAt);
  } finally {
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('uncomplete: clears completedAt back to null', async () => {
  const { db, sqlite, tempDir } = setupDb();
  try {
    const id = randomUUID();
    await db.insert(sqliteReminders).values({
      id, userId, noteId: 'n1',
      remindAt: '2026-06-01T00:00:00.000Z', message: 'Test',
      createdAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    });

    await db.update(sqliteReminders)
      .set({ completedAt: null })
      .where(and(eq(sqliteReminders.userId, userId), eq(sqliteReminders.id, id)));

    const rows = await db.select().from(sqliteReminders).where(eq(sqliteReminders.id, id));
    assert.equal(rows[0].completedAt, null);
  } finally {
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('delete: removes a reminder by id', async () => {
  const { db, sqlite, tempDir } = setupDb();
  try {
    const id = randomUUID();
    await db.insert(sqliteReminders).values({
      id, userId, noteId: 'n1',
      remindAt: '2026-06-01T00:00:00.000Z', message: 'Test',
      createdAt: new Date().toISOString(),
    });

    await db.delete(sqliteReminders)
      .where(and(eq(sqliteReminders.userId, userId), eq(sqliteReminders.id, id)));

    const rows = await db.select().from(sqliteReminders).where(eq(sqliteReminders.userId, userId));
    assert.equal(rows.length, 0);
  } finally {
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('delete by noteId: removes all reminders for a note', async () => {
  const { db, sqlite, tempDir } = setupDb();
  try {
    const now = new Date().toISOString();
    await db.insert(sqliteReminders).values([
      { id: randomUUID(), userId, noteId: 'n1', remindAt: '2026-06-01T00:00:00.000Z', message: 'A', createdAt: now },
      { id: randomUUID(), userId, noteId: 'n1', remindAt: '2026-06-02T00:00:00.000Z', message: 'B', createdAt: now },
      { id: randomUUID(), userId, noteId: 'n2', remindAt: '2026-06-03T00:00:00.000Z', message: 'C', createdAt: now },
    ]);

    await db.delete(sqliteReminders)
      .where(and(eq(sqliteReminders.userId, userId), eq(sqliteReminders.noteId, 'n1')));

    const remaining = await db.select().from(sqliteReminders).where(eq(sqliteReminders.userId, userId));
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].noteId, 'n2');
  } finally {
    sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
