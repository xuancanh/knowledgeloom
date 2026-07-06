/**
 * ImportPage — bring outside material into the vault.
 *
 * Accepts a PDF, plain-text/markdown file, audio recording, or pasted text.
 * POST /api/import extracts the text (transcribing audio when configured),
 * queues an AI job that structures it into a note, and this page polls the
 * job until the note lands, then offers to open it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { importSource, fetchJob } from '../../api';

type Phase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

const ACCEPT = '.pdf,.txt,.md,.markdown,.mp3,.m4a,.wav,.webm,.ogg,.flac,audio/*,application/pdf,text/plain,text/markdown';

export default function ImportPage({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => { if (pollRef.current) window.clearTimeout(pollRef.current); }, []);

  const pollJob = useCallback((jobId: string) => {
    const tick = async () => {
      try {
        const job = await fetchJob(jobId);
        if (job.status === 'done') {
          setPhase('done');
          setNoteId((job as any).note?.id ?? null);
          setMessage('Note created from the imported material.');
          return;
        }
        if (job.status === 'error') {
          setPhase('error');
          setMessage(job.error || 'The import job failed.');
          return;
        }
        setMessage(job.status === 'running' ? 'Structuring the material into a note…' : 'Queued…');
      } catch { /* transient poll error — keep trying */ }
      pollRef.current = window.setTimeout(tick, 1500);
    };
    void tick();
  }, []);

  const submit = useCallback(async () => {
    if (!file && !text.trim()) return;
    setPhase('uploading');
    setNoteId(null);
    setMessage(file ? `Extracting text from ${file.name}…` : 'Submitting text…');
    try {
      const result = await importSource({
        file: file ?? undefined,
        text: text.trim() || undefined,
        title: title.trim() || undefined,
        category: category.trim() || undefined,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      setPhase('processing');
      setMessage(`Extracted ${result.extractedChars.toLocaleString()} characters${result.truncated ? ' (truncated)' : ''}. Generating note…`);
      pollJob(result.jobId);
    } catch (err) {
      setPhase('error');
      setMessage(err instanceof Error ? err.message : 'Import failed.');
    }
  }, [file, text, title, category, tags, pollJob]);

  const busy = phase === 'uploading' || phase === 'processing';

  return (
    <div className="today-page import-page">
      <header className="today-head">
        <h1>Import</h1>
        <p className="import-sub">Turn a PDF, lecture recording, or pasted text into a knowledge note — flashcards and quiz questions follow automatically.</p>
      </header>

      <div
        className={`import-drop${dragOver ? ' over' : ''}${file ? ' has-file' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) { setFile(dropped); setText(''); }
        }}
      >
        {file ? (
          <>
            <span className="import-file-name">{file.name}</span>
            <span className="import-file-size">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
            <button className="today-btn" onClick={() => setFile(null)} disabled={busy}>Remove</button>
          </>
        ) : (
          <>
            <span>Drop a PDF, .md/.txt, or audio file here</span>
            <label className="today-btn import-browse">
              Browse…
              <input
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setText(''); } }}
              />
            </label>
          </>
        )}
      </div>

      {!file && (
        <textarea
          className="import-text"
          placeholder="…or paste source text here (article, lecture notes, transcript)"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
      )}

      <div className="import-meta">
        <input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        <input placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy} />
        <input placeholder="Tags, comma-separated (optional)" value={tags} onChange={(e) => setTags(e.target.value)} disabled={busy} />
      </div>

      <div className="import-actions">
        <button className="today-btn" onClick={() => void submit()} disabled={busy || (!file && !text.trim())}>
          {busy ? 'Importing…' : 'Import'}
        </button>
        {message && <span className={`import-status ${phase}`}>{message}</span>}
      </div>

      {phase === 'done' && noteId && (
        <button className="today-btn import-open" onClick={() => onOpenNote(noteId)}>Open the new note →</button>
      )}
    </div>
  );
}
