# Status Module — Spec

**Location**: `server/src/status/`  
**NestJS module**: `StatusModule`

---

## Purpose

Lightweight health and capability endpoint consumed by the frontend on every
page load to decide whether to enable or disable write actions.

---

## StatusController

```
GET /api/status → { readOnly: boolean }
```

No guards. Intentionally accessible in all deployment modes (including read-only)
so the frontend can determine the deployment capability before rendering the UI.

The frontend calls this on startup alongside `GET /api/knowledge` and
`GET /api/jobs`. The `readOnly` flag is stored in `App.tsx` state and passed as
a prop to every component that has write actions (CaptureBox, NoteDetail,
RemindersService calls, etc.).

---

## Module imports

`StatusModule` does not import any feature module. It injects `ConfigService`
directly from the global `ConfigModule`.
