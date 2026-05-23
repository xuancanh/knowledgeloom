# Database Module — Spec

**Location**: `server/src/database/`  
**NestJS module**: `DatabaseModule` (decorated `@Global()`)  
**Injection token**: `DRIZZLE_DB` (string constant in `database.constants.ts`)  
**ORM**: Drizzle ORM + `better-sqlite3`

---

## Purpose

Provides a single Drizzle `db` instance as a global NestJS provider. Any module
can inject it via `@Inject(DRIZZLE_DB)`. No module needs to open SQLite directly.

The module is `@Global()` because it is infrastructure shared by all feature
modules (jobs, reminders, flashcard cache). Using `@Global()` here is intentional
and correct — it is not a shortcut for circular dependencies.

---

## Database file

Default path: `knowledge/app.sqlite` (overridden by `APP_DB_PATH` env var).

In read-only mode the provider returns `null` rather than opening the database.
All repositories guard against a `null` db and return empty results.

---

## DDL (schema.ts)

Three tables defined with Drizzle's `sqliteTable` helper:

### `jobs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | `<timestamp>-<slug>` |
| `status` | TEXT | `queued \| running \| done \| error` |
| `mode` | TEXT | `research \| link \| polish \| write` |
| `topic` | TEXT | |
| `attempts` | INTEGER | |
| `maxAttempts` | INTEGER | |
| `createdAt` | TEXT | ISO 8601 |
| `startedAt` | TEXT nullable | |
| `finishedAt` | TEXT nullable | |
| `nextRunAt` | TEXT nullable | Scheduler column for retry delay |
| `error` | TEXT nullable | |
| `payload` | TEXT | Full `Job` serialised as JSON |

Scheduler columns (`status`, `nextRunAt`, `attempts`) allow the queue processor
to query without JSON parsing. The `payload` blob provides forward compatibility
— new Job fields do not require schema migrations.

### `reminders`
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `noteId` | TEXT | Note the reminder belongs to |
| `remindAt` | TEXT | ISO 8601 |
| `message` | TEXT | |
| `createdAt` | TEXT | |
| `completedAt` | TEXT nullable | Set when the user clicks Done |

### `flashcard_cache`
| Column | Type | Notes |
|--------|------|-------|
| `noteId` | TEXT PK | One row per note |
| `hash` | TEXT | SHA-256 of note content; skip AI if unchanged |
| `cards` | TEXT | JSON array of `Flashcard` objects |
| `generatedAt` | TEXT | ISO 8601 |

---

## Boot-time migration

On first startup `DatabaseModule` checks for a legacy `reminders.sqlite`
sidecar (from the Express era). If found, it copies all rows into
`app.sqlite` and logs the count. Subsequent boots skip this step.

---

## Using the database in a new repository

```typescript
@Injectable()
export class MyRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  list() {
    if (!this.db) return [];
    return this.db.select().from(myTable).all();
  }
}
```

Always guard `if (!this.db)` — the db is `null` in read-only mode.
