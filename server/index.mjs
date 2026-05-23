import express from 'express';
import { PORT, READ_ONLY_MODE } from './lib/config.mjs';
import { assistNoteEdit } from './lib/codex.mjs';
import { ensureApplicationDatabase } from './lib/database.mjs';
import { enqueueLearning, jobs, loadJobs, recordCompletedLearning, scheduleQueue } from './lib/jobs.mjs';
import { searchMeilisearch } from './lib/meili.mjs';
import {
  createKnowledgeNoteFromDraft,
  deleteKnowledgeNote,
  ensureStore,
  readNoteMarkdown,
  rebuildIndexes,
  updateKnowledgeNote,
} from './lib/notes.mjs';
import {
  createReminder,
  deleteReminder,
  ensureReminderStore,
  listReminders,
  updateReminder,
} from './lib/reminders.mjs';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use((request, response, next) => {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  if (request.method === 'OPTIONS') return response.status(204).end();
  return next();
});

/**
 * Rejects mutation routes in read-only deployments. This is used for
 * Cloudflare-style hosting where the service can read generated artifacts but
 * cannot write markdown, run Codex, or update Meilisearch.
 */
function requireWritable(_request, response, next) {
  if (!READ_ONLY_MODE) return next();
  return response.status(403).json({ error: 'service is running in read-only mode' });
}

app.get('/api/status', (_request, response) => {
  response.json({ readOnly: READ_ONLY_MODE });
});

app.get('/api/knowledge', async (_request, response, next) => {
  try {
    response.json(await rebuildIndexes());
  } catch (error) {
    next(error);
  }
});

app.get('/api/search', async (request, response, next) => {
  const query = String(request.query.q || '');
  const category = String(request.query.category || 'All');
  try {
    response.json({ engine: 'meilisearch', hits: await searchMeilisearch(query, category) });
  } catch (error) {
    try {
      const state = await rebuildIndexes();
      const normalized = query.toLowerCase();
      const hits = state.notes.filter((note) => {
        const inCategory = category === 'All' || note.category === category;
        const haystack = `${note.title} ${note.summary} ${note.tags.join(' ')}`.toLowerCase();
        return inCategory && (!normalized || haystack.includes(normalized));
      });
      response.json({ engine: 'fallback', warning: error.message, hits });
    } catch (fallbackError) {
      next(fallbackError);
    }
  }
});

app.get('/api/reminders', (request, response, next) => {
  try {
    response.json({
      reminders: listReminders({
        noteId: request.query.noteId,
        status: request.query.status,
      }),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/reminders', requireWritable, (request, response, next) => {
  try {
    response.status(201).json({ reminder: createReminder(request.body || {}) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/reminders/:id', requireWritable, (request, response, next) => {
  try {
    response.json({ reminder: updateReminder(request.params.id, request.body || {}) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/reminders/:id', requireWritable, (request, response, next) => {
  try {
    response.json(deleteReminder(request.params.id));
  } catch (error) {
    next(error);
  }
});

app.get('/api/notes/:id', async (request, response, next) => {
  try {
    response.json({ markdown: await readNoteMarkdown(request.params.id) });
  } catch (error) {
    next(error);
  }
});

app.put('/api/notes/:id', requireWritable, async (request, response, next) => {
  try {
    response.json(await updateKnowledgeNote(request.params.id, request.body || {}));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/notes/:id', requireWritable, async (request, response, next) => {
  try {
    response.json(await updateKnowledgeNote(request.params.id, request.body || {}));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/notes/:id', requireWritable, async (request, response, next) => {
  try {
    response.json(await deleteKnowledgeNote(request.params.id));
  } catch (error) {
    next(error);
  }
});

app.post('/api/notes/:id/assist', requireWritable, async (request, response, next) => {
  try {
    const body = request.body || {};
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) return response.status(400).json({ error: 'prompt is required' });

    /*
     * The assistant produces an edit proposal only. It does not write markdown;
     * the client applies the proposal to the normal editor fields and the user
     * saves through PUT /api/notes/:id after reviewing the result.
     */
    response.json(await assistNoteEdit(request.params.id, body.draft || {}, prompt));
  } catch (error) {
    next(error);
  }
});

app.post('/api/learn', requireWritable, async (request, response, next) => {
  try {
    const body = request.body || {};
    const mode = body.mode === 'write' || body.mode === 'polish' || body.mode === 'research' || body.mode === 'link' ? body.mode : 'research';
    const topic = typeof body.title === 'string' ? body.title.trim() : typeof body.topic === 'string' ? body.topic.trim() : '';
    const draftBody = typeof body.body === 'string' ? body.body.trim() : '';
    const url = typeof body.url === 'string' ? body.url.trim() : '';

    if (!topic && mode !== 'link') {
      return response.status(400).json({ error: 'title is required' });
    }
    if (mode === 'link') {
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') throw new Error('unsupported protocol');
      } catch {
        return response.status(400).json({ error: 'valid http(s) url is required for link mode' });
      }
    }

    /*
     * Creation modes intentionally split here:
     * - write is synchronous and never invokes Codex;
     * - polish/research/link are durable queue jobs, so they retry after
     *   failures and resume if the server restarts mid-run.
     */
    if (mode === 'write') {
      if (!draftBody) return response.status(400).json({ error: 'body is required for direct notes' });
      const result = await createKnowledgeNoteFromDraft({ ...body, title: topic, body: draftBody });
      const job = await recordCompletedLearning({ ...body, mode, topic, title: topic }, result);
      return response.status(201).json({ jobId: job.id, job, ...result });
    }

    if (mode === 'polish' && !draftBody) {
      return response.status(400).json({ error: 'body is required for polish mode' });
    }

    const job = await enqueueLearning({ ...body, mode, topic: topic || url, title: topic || url, body: draftBody, url });
    return response.status(202).json({ jobId: job.id, job });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/jobs', (_request, response) => {
  response.json({ jobs: [...jobs.values()] });
});

app.get('/api/jobs/:id', (request, response) => {
  const job = jobs.get(request.params.id);
  response.status(job ? 200 : 404).json(job || { error: 'job not found' });
});

app.use((request, response) => {
  response.status(404).json({ error: `not found: ${request.method} ${request.path}` });
});

app.use((error, _request, response, _next) => {
  response.status(error.status || 500).json({ error: error.message });
});

await ensureStore();
await ensureApplicationDatabase();
await ensureReminderStore();
await loadJobs();
await rebuildIndexes();
scheduleQueue();
app.listen(PORT, () => {
  console.log(`Knowledge API listening on http://localhost:${PORT}`);
  if (READ_ONLY_MODE) console.log('Knowledge API is running in read-only mode');
});
