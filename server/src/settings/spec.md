# Settings Module — Spec

**Location**: `server/src/settings/`
**NestJS module**: `SettingsModule`

---

## Purpose

Per-user key-value settings stored in the `user_settings` table. Each user has
one row; the `settings` column is a JSON blob. Settings are read on every
`/api/knowledge` poll and written via a partial-merge PATCH.

---

## UserSettingsRepository

### `get(userId) → Record<string, unknown>`

1. Queries the `user_settings` table for the row matching `userId`.
2. Returns `{}` if the database is unavailable (read-only mode), the row is
   missing, or the JSON is malformed.
3. Parses the `settings` column as JSON and returns the object.

### `patch(userId, partial) → Record<string, unknown>`

1. Reads the existing settings via `get()`.
2. Shallow-merges the patch values (`{ ...existing, ...patch }`).
3. Upserts the row: updates if the row exists, inserts if it doesn't
   (`onConflictDoNothing` on insert for safety).
4. Returns the merged settings object.

---

## SettingsController

```
GET   /api/settings   → { ...settings }         @UseGuards(ApiAuthGuard)
PATCH /api/settings   → { ...merged }            @UseGuards(ApiAuthGuard)
```

### GET `/api/settings`

Returns the current user's settings object. Returns `{}` for new users.

### PATCH `/api/settings`

Accepts a partial JSON object. Merges it with existing settings and returns the
result. The request body is `Record<string, unknown>` — no DTO validation because
settings are open-ended by design.

---

## How settings flow to the frontend

1. `KnowledgeService.getState()` always reads the latest settings from
   `UserSettingsRepository` and includes them in the `KnowledgeState` response.
   This bypasses the 30-second rebuild cooldown — settings changes are visible
   on the next poll.
2. The frontend reads `state.userSettings` from the `KnowledgeState` and passes
   relevant properties to components (e.g., `Home` reads `userSettings.homeWidgets`).
3. Components call `PATCH /api/settings` directly (fire-and-forget) to save
   preference changes.

---

## Module wiring

`SettingsModule` provides `UserSettingsRepository` and declares
`SettingsController`. It exports `UserSettingsRepository` so `KnowledgeModule`
can inject it to read settings during state rebuilds.

---

## BDD Spec

### Feature: Get user settings

**Scenario: Get settings for an existing user**
- GIVEN user `alice` has settings `{ homeWidgets: { daily: true } }`
- WHEN they GET `/api/settings`
- THEN the response is `{ homeWidgets: { daily: true } }`

**Scenario: Get settings for a new user**
- GIVEN user `bob` has no row in `user_settings`
- WHEN they GET `/api/settings`
- THEN the response is `{}`

**Scenario: Get settings when DB is unavailable**
- GIVEN the database is in read-only mode (`!this.db`)
- WHEN the repository tries to read settings
- THEN it returns `{}` without throwing

**Scenario: Corrupt settings JSON**
- GIVEN user `carol` has a row where `settings` is not valid JSON
- WHEN `get()` is called
- THEN it returns `{}` (catches the JSON parse error)

### Feature: Patch user settings

**Scenario: Patch merges with existing settings**
- GIVEN user `alice` has settings `{ theme: "dark", font: "mono" }`
- WHEN they PATCH `/api/settings` with `{ font: "sans" }`
- THEN the stored settings become `{ theme: "dark", font: "sans" }`
- AND the response is `{ theme: "dark", font: "sans" }`

**Scenario: Patch creates settings for new user**
- GIVEN user `bob` has no settings row
- WHEN they PATCH `/api/settings` with `{ homeWidgets: { daily: false } }`
- THEN a new row is inserted
- AND the response is `{ homeWidgets: { daily: false } }`

**Scenario: Patch preserves unmentioned keys**
- GIVEN user `alice` has settings `{ a: 1, b: 2, c: 3 }`
- WHEN they PATCH `/api/settings` with `{ b: 99 }`
- THEN `a` and `c` are preserved
- AND `b` is updated to 99

### Feature: Settings in knowledge state

**Scenario: Settings are included in knowledge response**
- GIVEN user `alice` has settings `{ homeWidgets: { daily: true } }`
- WHEN `KnowledgeService.getState()` builds the state
- THEN `state.userSettings` equals `{ homeWidgets: { daily: true } }`

**Scenario: Settings changes are visible without rebuild cooldown**
- GIVEN a recent rebuild happened (within 30 seconds)
- WHEN the user PATCHes their settings and then polls `/api/knowledge`
- THEN the new settings are returned immediately (not stale cached settings)
