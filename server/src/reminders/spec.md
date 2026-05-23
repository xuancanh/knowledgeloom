# Reminders Module — Spec

**Location**: `server/src/reminders/`  
**NestJS module**: `RemindersModule`

---

## Purpose

Scheduled review reminders tied to individual notes. A reminder is created with a
future datetime; the frontend polls active reminders and shows "Due now" when the
time passes.

---

## RemindersService

Validates input and delegates persistence to `ReminderRepository`.

### `list(opts): Reminder[]`

Returns reminders filtered by optional `noteId` and `status`:
- `status: 'active'` — incomplete reminders (`completedAt IS NULL`)
- `status: 'done'` — completed reminders
- `status: 'due'` — active and past their `remindAt` time

The home page fetches `status: 'active'` every 2.5 s to show due badges.

### `create({ noteId, remindAt, message }): Reminder`

Validates:
- `noteId` is non-empty (sanitised with `basename` to prevent path traversal).
- `remindAt` parses to a valid `Date`.
- `remindAt` is in the future.

Assigns a UUID and calls `repo.insert()`.

### `patch(id, updates): Reminder`

Updates `remindAt`, `message`, or `completedAt`. `completed: true` sets
`completedAt` to the current ISO timestamp; `completed: false` clears it.

### `remove(id): { deleted: string }`

Throws 404 if the reminder is not found.

### `removeForNote(noteId): void`

Called by `NotesService.delete()` to clean up orphaned reminders when a note is
deleted. Silent no-op in read-only mode.

---

## ReminderRepository

Drizzle ORM access for the `reminders` table (in `app.sqlite`).

All methods are synchronous (better-sqlite3 is synchronous). The service layer
exposes async signatures for NestJS uniformity, but the actual operations complete
without awaiting.

The `list()` method applies Drizzle `eq`, `isNull`, `isNotNull`, `lte`, and `and`
conditions for the filter options. Results are sorted: active first (by
`completedAt IS NULL`), then by `remindAt` ascending.

---

## RemindersController

```
GET    /api/reminders           → { reminders }               query: noteId?, status?
POST   /api/reminders           → { reminder }                @UseGuards(WritableGuard)
PATCH  /api/reminders/:id       → { reminder }                @UseGuards(WritableGuard)
DELETE /api/reminders/:id       → { deleted }                 @UseGuards(WritableGuard)
```

The `GET` route is not guarded (read-only deployments can still show reminders).

---

## Module imports

`RemindersModule` does not import any feature module. `DatabaseModule` is
`@Global()` so `ReminderRepository` can inject `DRIZZLE_DB` without an explicit import.
