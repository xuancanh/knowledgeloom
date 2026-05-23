import { useEffect, useRef, useState } from 'react';
import type { CreateNoteRequest } from '../types';

type CaptureMode = 'draft' | 'research' | 'link';
const modes: Array<{
  id: CaptureMode;
  label: string;
  description: string;
}> = [
  {
    id: 'draft',
    label: 'Write note',
    description: 'Save your draft, optionally polished by AI.',
  },
  {
    id: 'research',
    label: 'Research & write',
    description: 'Codex researches, categorizes, and writes.',
  },
  {
    id: 'link',
    label: 'Generate from link',
    description: 'Codex retrieves a URL and turns it into a note.',
  },
];

/**
 * Capture form for creating notes through two paths.
 *
 * The write path covers direct saving and AI polishing through a checkbox.
 * Research creates from a topic, while link mode asks Codex to retrieve a URL
 * and convert the source into a normalized knowledge note.
 */
export default function CaptureBox({
  onSubmit,
  readOnly,
}: {
  onSubmit: (payload: CreateNoteRequest) => void;
  readOnly: boolean;
}) {
  const [mode, setMode] = useState<CaptureMode>('research');
  const [aiPolish, setAiPolish] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [ctx, setCtx] = useState('');
  const [category, setCategory] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');
  const [links, setLinks] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const draftMode = mode === 'draft';
  const linkMode = mode === 'link';
  const selectedMode = modes.find((item) => item.id === mode) || modes[0];
  const submitLabel = linkMode ? 'Generate from link' : mode === 'research' ? 'Research with Codex' : aiPolish ? 'Polish with Codex' : 'Save note';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (event.key === '/' && tag !== 'TEXTAREA' && tag !== 'INPUT') {
        event.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /**
   * Parses comma-separated metadata fields while preserving the API shape used
   * by the editor. The backend repeats this normalization for safety.
   */
  function splitList(value: string) {
    return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  }

  /**
   * Builds a mode-aware request. Full-draft mode requires body text, research
   * mode requires a topic, and link mode requires a URL. The AI polish checkbox
   * maps the write path onto the backend's existing polish job.
   */
  function submit() {
    const cleanTitle = title.trim();
    const cleanUrl = url.trim();
    const cleanBody = body.trim();
    if ((!cleanTitle && !linkMode) || (draftMode && !cleanBody) || (linkMode && !cleanUrl)) return;

    onSubmit({
      mode: linkMode ? 'link' : mode === 'research' ? 'research' : aiPolish ? 'polish' : 'write',
      title: cleanTitle || cleanUrl,
      context: ctx.trim(),
      body: cleanBody,
      url: cleanUrl,
      category: category.trim(),
      summary: summary.trim(),
      tags: splitList(tags),
      links: splitList(links),
    });
    setTitle('');
    setUrl('');
    setBody('');
    setCtx('');
    setCategory('');
    setSummary('');
    setTags('');
    setLinks('');
    setAiPolish(false);
  }

  /**
   * Preserves the keyboard workflow from the reference design. Command/Ctrl
   * Enter submits from any field in the capture surface.
   */
  function onKey(event: React.KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="capture">
      <div className="prompt">
        <span className="pen">✦</span> {readOnly ? 'Read-only archive' : 'What did you learn?'}
      </div>
      <div className="mode-tabs" aria-label="Creation mode">
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === mode ? 'active' : ''}
            onClick={() => setMode(item.id)}
            disabled={readOnly}
          >
            <span>{item.label}</span>
            <small>{item.description}</small>
          </button>
        ))}
      </div>
      <input
        className="title-input"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={onKey}
        placeholder={readOnly ? 'Capture is disabled in read-only deployments.' : linkMode ? 'Optional title hint' : draftMode ? 'Note title' : 'e.g. CRDT merge semantics'}
        disabled={readOnly}
      />
      {linkMode && (
        <input
          className="link-input"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={onKey}
          placeholder="https://example.com/article"
          disabled={readOnly}
        />
      )}
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={onKey}
        placeholder={readOnly ? 'Capture is disabled in read-only deployments.' : linkMode ? 'Optional: tell Codex what to focus on while reading this link.' : draftMode ? 'Write the full note here. Markdown is supported.' : 'Optional: paste the detail you already know, a quote, or rough bullets for Codex to research from.'}
        rows={draftMode ? 10 : 3}
        disabled={readOnly}
      />
      {draftMode && (
        <>
          <label className="ai-polish-option">
            <input
              type="checkbox"
              checked={aiPolish}
              onChange={(event) => setAiPolish(event.target.checked)}
              disabled={readOnly}
            />
            <span>
              <b>Allow AI polishing</b>
              <em>Codex can improve structure and wording without adding new facts.</em>
            </span>
          </label>
          <div className="metadata-grid">
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              onKeyDown={onKey}
              placeholder="Category or Folder/Subfolder"
              disabled={readOnly}
            />
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              onKeyDown={onKey}
              placeholder="Tags, comma-separated"
              disabled={readOnly}
            />
            <input
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              onKeyDown={onKey}
              placeholder="One-line summary"
              disabled={readOnly}
            />
            <input
              value={links}
              onChange={(event) => setLinks(event.target.value)}
              onKeyDown={onKey}
              placeholder="Linked note ids, comma-separated"
              disabled={readOnly}
            />
          </div>
        </>
      )}
      <input
        className="ctx"
        value={ctx}
        onChange={(event) => setCtx(event.target.value)}
        onKeyDown={onKey}
        placeholder={draftMode && aiPolish ? 'Optional polish instructions — tone, audience, sections to keep...' : linkMode ? 'Optional context — why this link matters, audience, or extraction goal...' : 'Optional context — where you read it, why it matters, what to chase next...'}
        disabled={readOnly}
      />
      <div className="row">
        <span className="hint">
          {readOnly ? 'Cloud deployment is browsing-only.' : <><kbd>/</kbd> focus · <kbd>⌘</kbd><kbd>↵</kbd> submit · {selectedMode.description}</>}
        </span>
        <button className="submit" onClick={submit} disabled={readOnly || (!title.trim() && !linkMode) || (draftMode && !body.trim()) || (linkMode && !url.trim())}>{submitLabel}</button>
      </div>
    </div>
  );
}
