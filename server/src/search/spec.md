# Search Module — Spec

**Location**: `server/src/search/`  
**NestJS module**: `SearchModule`  
**Injection token**: `SEARCH_PROVIDER` (string constant in `search-provider.interface.ts`)

---

## Purpose

Pluggable full-text search. The active backend is selected via `SEARCH_PROVIDER`.
`SearchService` is a thin façade so callers are insulated from the concrete
implementation.

---

## Interface

```typescript
interface SearchProvider {
  sync(notes: KnowledgeNote[]): Promise<{ mode: string; addedOrUpdated: number; deleted: number }>;
  deleteDocument(id: string): Promise<{ deleted: number }>;
  search(query: string, category?: string): Promise<SearchHit[]>;
}
```

`SearchDocument` extends `KnowledgeNote` with an optional `body` field (markdown
without front-matter), used for full-text indexing in Meilisearch.

---

## Implementations

### MeilisearchProvider (`SEARCH_PROVIDER=meilisearch`, default)

Incremental sync using a local manifest (`knowledge/meili-sync-<index>.json`).
The manifest records SHA-256 hashes of the last successfully indexed documents.

**sync flow**:
1. Ensures the Meilisearch index exists (creates if absent; ignores `index_already_exists`).
2. Applies `searchableAttributes`, `filterableAttributes`, `sortableAttributes`,
   and `displayedAttributes` settings.
3. Reads note markdown bodies via `NoteStorageProvider` (injected as `NOTE_STORAGE`).
4. On first run (empty manifest): seeds the manifest from the remote document id list.
5. Computes hashes; only sends changed documents (`PUT /indexes/<index>/documents`).
6. Deletes documents that are in the manifest but not in the current note set.
7. Saves the updated manifest.

**search**: Calls `POST /indexes/<index>/search` with an optional category filter.
Returns up to 50 hits including `_formatted` highlight snippets.

**Configuration**
| Env var | Default |
|---------|---------|
| `MEILI_HOST` | `http://localhost:7700` |
| `MEILI_MASTER_KEY` | — (omitted = no auth) |
| `MEILI_INDEX` | `knowledge_notes` |

### InMemorySearchProvider (`SEARCH_PROVIDER=inmemory`)

Zero-dependency fallback. Keeps a `notes[]` array updated on every `sync()` call.

**search**: Case-insensitive substring match across `title`, `summary`, and `tags`.
No typo tolerance, no body text search, no relevance ranking.

Suitable for development (no Meilisearch container required), read-only
deployments, and CI.

---

## SearchService

Thin façade. Injects `SEARCH_PROVIDER` and delegates all calls. Adding
cross-cutting concerns (logging, metrics) here does not require changes to the
provider implementations.

---

## SearchController

```
GET /api/search?q=<query>&category=<category>
```

Returns:
```json
{ "engine": "meilisearch", "hits": [...], "warning"?: "..." }
```

`SearchController` is declared in **`KnowledgeModule`**, not `SearchModule`. This
is necessary to break the `SearchModule → KnowledgeModule → SearchModule`
circular dependency that would arise if the controller were in `SearchModule`.

---

## Module wiring

`SearchModule` uses a factory provider:

```typescript
{
  provide: SEARCH_PROVIDER,
  inject: [ConfigService, NOTE_STORAGE],
  useFactory: (config, storage) => {
    const backend = config.get('searchProvider') || 'meilisearch';
    if (backend === 'inmemory') return new InMemorySearchProvider();
    return new MeilisearchProvider(config, storage);
  },
}
```

`SearchModule` imports `StorageModule` so `MeilisearchProvider` can inject
`NOTE_STORAGE` to read markdown bodies for indexing.

---

## Adding a new search provider

1. Create `your-provider.ts` implementing `SearchProvider`.
2. Add a branch to the factory in `search.module.ts`.
3. Document the new `SEARCH_PROVIDER` value in `AGENTS.md`.
