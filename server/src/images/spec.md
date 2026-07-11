# Images Module — Spec

**Location**: `server/src/images/`
**NestJS module**: `ImagesModule`

---

## Purpose

Upload and serve note images. Images are stored on the local filesystem under
`knowledge/images/`. Upload requires authentication; serving is public (images
may be embedded in markdown notes).

---

## ImagesController

```
POST /api/images        — upload an image (multipart/form-data, field: "file")
GET  /api/images/:name  — serve a stored image file
```

### Upload (`POST /api/images`)

Guards: `@UseGuards(ApiAuthGuard, WritableGuard)`.

1. Validates a file was uploaded (`file` is present).
2. Checks the MIME type against the allowlist:
   `image/jpeg`, `image/png`, `image/gif`, `image/webp`. SVG is rejected
   because active XML content must not be served from the application origin.
3. Delegates to `ImagesService.save()`.
4. Returns `{ url: string, filename: string }`.

### Serve (`GET /api/images/:name`)

Public — no guards.

1. Sanitizes the name with `basename()` to prevent path traversal.
2. Delegates to `ImagesService.resolve()`.
3. Returns 404 if the file is not found.
4. Sets `Content-Type` and `Cache-Control: public, max-age=31536000, immutable`.
5. Sends the file with `res.sendFile()`.

---

## ImagesService

### `save(file) → { url, filename }`

1. Creates the images directory (`mkdir recursive: true`).
2. Sanitizes the original filename: strips non-alphanumeric characters,
   lowercases, prepends `Date.now()` for uniqueness.
3. Writes the buffer to disk.
4. Returns the URL path (`/api/images/<filename>`) and the filename.

### `resolve(name) → { path, mimeType }`

1. Sanitizes the name with `basename()`.
2. Checks if the file exists with `access()`.
3. Returns `{ path: null, mimeType: 'application/octet-stream' }` if not found.
4. Resolves the MIME type from the file extension via `MIME_MAP`:
   `.jpg/.jpeg → image/jpeg`, `.png → image/png`, `.gif → image/gif`,
   `.webp → image/webp`, `.svg → image/svg+xml`.
   Falls back to `application/octet-stream` for unknown extensions.

---

## Module wiring

`ImagesModule` imports `MulterModule` configured with `memoryStorage()` (files
are held in memory as Buffers, not written to a temp directory).

---

## BDD Spec

### Feature: Image upload

**Scenario: Upload a valid image**
- GIVEN an authenticated user
- WHEN they POST to `/api/images` with a JPEG file in the `file` field
- THEN the image is saved to `knowledge/images/`
- AND the response is `{ url: "/api/images/<filename>", filename }`
- AND the filename starts with a Unix timestamp and contains the sanitized original name

**Scenario: Upload with no file**
- GIVEN an authenticated user
- WHEN they POST to `/api/images` with no `file` field
- THEN the response is HTTP 400 `"No file uploaded"`

**Scenario: Upload disallowed file type**
- GIVEN an authenticated user
- WHEN they POST to `/api/images` with an `application/pdf` file
- THEN the response is HTTP 400 `"File type not allowed: application/pdf"`

**Scenario: Upload without authentication**
- GIVEN no valid JWT is provided
- WHEN a POST is made to `/api/images`
- THEN the response is HTTP 401

**Scenario: Upload in read-only mode**
- GIVEN `KNOWLEDGE_READ_ONLY=1`
- WHEN an authenticated user POSTs to `/api/images`
- THEN the response is HTTP 403

### Feature: Image serving

**Scenario: Serve an existing image**
- GIVEN an image was previously uploaded as `12345-my-image.png`
- WHEN a GET request is made to `/api/images/12345-my-image.png`
- THEN the response has `Content-Type: image/png`
- AND `Cache-Control: public, max-age=31536000, immutable`
- AND the file is sent as the response body

**Scenario: Serve a non-existent image**
- GIVEN no image named `nonexistent.jpg` exists
- WHEN a GET request is made to `/api/images/nonexistent.jpg`
- THEN the response is HTTP 404

**Scenario: Path traversal attempt**
- GIVEN a file exists at `knowledge/images/legit.png`
- WHEN a GET request is made to `/api/images/../../../etc/passwd`
- THEN `basename()` sanitizes it to `passwd`
- AND the response is HTTP 404 (file not found in images directory)
