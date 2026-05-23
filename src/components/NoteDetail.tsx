import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { NoteUpdate } from '../api';
import type { KnowledgeNote, Reminder } from '../types';
import {
  categoryId,
  formatCreated,
  parseMarkdownBlocks,
  stripFrontmatter,
  type UiCategory,
} from '../lib/view';

const INITIAL_CLOCK_TIME = Date.now();

/**
 * Note reader and editor. Edits are saved back to the markdown source file,
 * then the backend rebuilds derived category and search indexes.
 */
export default function NoteDetail({
  note,
  notes,
  categories,
  markdown,
  onOpenCategory,
  onOpenTag,
  onDelete,
  onAssist,
  onCreateReminder,
  onCompleteReminder,
  onDeleteReminder,
  onSave,
  reminders,
  readOnly,
}: {
  note: KnowledgeNote;
  notes: KnowledgeNote[];
  categories: UiCategory[];
  markdown: string;
  onOpenCategory: (id: string) => void;
  onOpenTag: (tag: string) => void;
  onDelete: () => void;
  onAssist: (id: string, prompt: string, draft: NoteUpdate) => Promise<NoteUpdate>;
  onCreateReminder: (noteId: string, remindAt: string, message: string) => Promise<void>;
  onCompleteReminder: (id: string) => Promise<void>;
  onDeleteReminder: (id: string) => Promise<void>;
  onSave: (id: string, update: NoteUpdate) => Promise<void>;
  reminders: Reminder[];
  readOnly: boolean;
}) {
  // Edit mode writes frontmatter plus markdown body back to the source file.
  // Derived category indexes and search documents are rebuilt by the backend.
  const [showSource, setShowSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [category, setCategory] = useState(note.category);
  const [summary, setSummary] = useState(note.summary);
  const [tagsText, setTagsText] = useState(note.tags.join(', '));
  const [links, setLinks] = useState<string[]>(note.links);
  const [linkQuery, setLinkQuery] = useState('');
  const [body, setBody] = useState(stripFrontmatter(markdown));
  const [saveError, setSaveError] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuccess, setAiSuccess] = useState('');
  const [editTab, setEditTab] = useState<'manual' | 'ai'>('manual');
  const [remindAt, setRemindAt] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderError, setReminderError] = useState('');
  const [now, setNow] = useState(INITIAL_CLOCK_TIME);
  const [minimumReminderTime, setMinimumReminderTime] = useState(
    toLocalDateTimeInputValue(new Date(INITIAL_CLOCK_TIME + 60_000)),
  );
  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [caretRestore, setCaretRestore] = useState<{ line: number; offset: number } | null>(null);

  const catId = categoryId(note.category);
  const cat = categories.find((item) => item.id === catId) || categories[0];
  const outgoing = note.links.map((id) => notes.find((item) => item.id === id)).filter(Boolean);
  const backlinks = notes.filter((item) => item.links.includes(note.id));
  const blocks = useMemo(() => parseMarkdownBlocks(markdown), [markdown]);
  const bodyLines = useMemo(() => body.split('\n'), [body]);
  const candidateLinks = useMemo(() => notes.filter((item) => item.id !== note.id), [note.id, notes]);
  const selectedLinkNotes = links
    .map((id) => notes.find((item) => item.id === id))
    .filter((item): item is KnowledgeNote => Boolean(item));
  const filteredCandidateLinks = useMemo(() => {
    const query = linkQuery.trim().toLowerCase();
    if (!query) return candidateLinks.filter((item) => links.includes(item.id)).slice(0, 8);
    return candidateLinks
      .filter((item) => {
        const haystack = `${item.title} ${item.category} ${item.summary} ${item.tags.join(' ')} ${item.id}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => Number(links.includes(b.id)) - Number(links.includes(a.id)))
      .slice(0, 12);
  }, [candidateLinks, linkQuery, links]);

  useEffect(() => {
    function refreshClock() {
      const currentTime = Date.now();
      setNow(currentTime);
      setMinimumReminderTime(toLocalDateTimeInputValue(new Date(currentTime + 60_000)));
    }
    const timer = window.setInterval(refreshClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    if (!caretRestore) return;
    const target = lineRefs.current[caretRestore.line];
    if (!target) return;
    const selection = window.getSelection();
    const range = document.createRange();
    const textNode = target.firstChild || target;
    const offset = Math.min(caretRestore.offset, textNode.textContent?.length || 0);
    range.setStart(textNode, offset);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    target.focus();
    setCaretRestore(null);
  }, [body, caretRestore]);

  /*
   * Opening the editor copies the latest note props and markdown body into
   * local draft state. This avoids stale drafts when background polling refreshes
   * the selected note while the reader is open.
   */
  function openEditor() {
    setTitle(note.title);
    setCategory(note.category);
    setSummary(note.summary);
    setTagsText(note.tags.join(', '));
    setLinks(note.links);
    setLinkQuery('');
    setBody(stripFrontmatter(markdown));
    setSaveError('');
    setAiError('');
    setAiSuccess('');
    setAiPrompt('');
    setEditTab('manual');
    setEditing(true);
  }

  /**
   * Toggles one outbound note link in the local edit draft.
   */
  function toggleLink(id: string) {
    setLinks((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  /**
   * Saves the edit draft through the backend so markdown, category indexes, and
   * Meilisearch all update together.
   */
  async function saveEdit() {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(note.id, {
        title,
        category,
        summary,
        tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
        links,
        body,
      });
      setEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Builds the canonical editor draft used by both manual save and AI assist.
   * Keeping this in one place prevents the AI path from drifting away from the
   * fields that the normal save route persists.
   */
  function currentDraft(): NoteUpdate {
    return {
      title,
      category,
      summary,
      tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
      links,
      body,
    };
  }

  /**
   * Returns the cursor offset inside one editable markdown line.
   */
  function caretOffset(element: HTMLElement) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return element.textContent?.length || 0;
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(element);
    range.setEnd(selection.anchorNode || element, selection.anchorOffset);
    return range.toString().length;
  }

  /**
   * Replaces the body line array and asks the next render to restore the caret.
   */
  function updateBodyLines(lines: string[], line: number, offset: number) {
    setBody(lines.join('\n'));
    setCaretRestore({ line: Math.max(0, Math.min(lines.length - 1, line)), offset });
  }

  /**
   * Classifies one markdown line so the editor can style the line as it is
   * written while still storing plain markdown text.
   */
  function markdownLineClass(line: string) {
    if (/^#\s+/.test(line)) return 'md-line md-h1';
    if (/^##\s+/.test(line)) return 'md-line md-h2';
    if (/^###\s+/.test(line)) return 'md-line md-h3';
    if (/^>\s?/.test(line)) return 'md-line md-quote';
    if (/^-\s+/.test(line)) return 'md-line md-list';
    if (/^```/.test(line)) return 'md-line md-code';
    return 'md-line';
  }

  /**
   * Updates one markdown line after normal typing.
   */
  function updateMarkdownLine(index: number, value: string) {
    const next = [...bodyLines];
    next[index] = value.replace(/\u200b/g, '');
    updateBodyLines(next, index, caretOffset(lineRefs.current[index] || document.body));
  }

  /**
   * Handles line-level editing keys so the live markdown editor behaves like a
   * single document instead of disconnected contenteditable fragments.
   */
  function handleMarkdownKey(event: React.KeyboardEvent<HTMLDivElement>, index: number) {
    const current = bodyLines[index] || '';
    const offset = caretOffset(event.currentTarget);
    if (event.key === 'Enter') {
      event.preventDefault();
      const next = [...bodyLines];
      next.splice(index, 1, current.slice(0, offset), current.slice(offset));
      updateBodyLines(next, index + 1, 0);
      return;
    }
    if (event.key === 'Backspace' && offset === 0 && index > 0) {
      event.preventDefault();
      const previous = bodyLines[index - 1] || '';
      const next = [...bodyLines];
      next.splice(index - 1, 2, `${previous}${current}`);
      updateBodyLines(next, index - 1, previous.length);
      return;
    }
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      setCaretRestore({ line: index - 1, offset });
      return;
    }
    if (event.key === 'ArrowDown' && index < bodyLines.length - 1) {
      event.preventDefault();
      setCaretRestore({ line: index + 1, offset });
    }
  }

  /**
   * Inserts pasted markdown as plain text and preserves multi-line structure.
   */
  function pasteMarkdown(event: React.ClipboardEvent<HTMLDivElement>, index: number) {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text/plain');
    const offset = caretOffset(event.currentTarget);
    const current = bodyLines[index] || '';
    const pastedLines = pasted.split(/\r?\n/);
    const next = [...bodyLines];
    const replacement = [
      `${current.slice(0, offset)}${pastedLines[0] || ''}`,
      ...pastedLines.slice(1, -1),
      `${pastedLines[pastedLines.length - 1] || ''}${current.slice(offset)}`,
    ];
    next.splice(index, 1, ...replacement);
    updateBodyLines(next, index + replacement.length - 1, pastedLines[pastedLines.length - 1]?.length || 0);
  }

  /**
   * Runs Codex against the current unsaved draft and applies the returned
   * proposal to the form. The note is not written until the user reviews the
   * changed fields and clicks the normal Save button.
   */
  async function runAiAssist() {
    const prompt = aiPrompt.trim();
    if (!prompt) return;
    setAiRunning(true);
    setAiError('');
    setAiSuccess('');
    try {
      const update = await onAssist(note.id, prompt, currentDraft());
      setTitle(update.title);
      setCategory(update.category);
      setSummary(update.summary);
      setTagsText(update.tags.join(', '));
      setLinks(update.links);
      setBody(update.body);
      setAiPrompt('');
      setAiSuccess('AI draft applied. Review the changes, then save the note.');
      setEditTab('manual');
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Failed to run AI edit');
    } finally {
      setAiRunning(false);
    }
  }

  /**
   * Schedules a future review reminder for this note. `datetime-local` returns
   * a local timestamp without timezone data, so the Date constructor converts it
   * into the user's local timezone before the API receives canonical UTC.
   */
  async function scheduleReminder() {
    if (!remindAt) return;
    const selectedDate = new Date(remindAt);
    if (Number.isNaN(selectedDate.getTime())) {
      setReminderError('Choose a valid reminder date and time.');
      return;
    }
    setReminderSaving(true);
    setReminderError('');
    try {
      await onCreateReminder(note.id, selectedDate.toISOString(), reminderMessage);
      setRemindAt('');
      setReminderMessage('');
    } catch (error) {
      setReminderError(error instanceof Error ? error.message : 'Failed to schedule reminder');
    } finally {
      setReminderSaving(false);
    }
  }

  return (
    <div className="note-detail">
      <div className="crumbs">
        <button onClick={() => onOpenCategory(catId)}>{cat?.name || note.category}</button>
        <span className="sep">/</span>
        <span>{note.id}.md</span>
      </div>

      <div className="head">
        <div className="h-meta">
          <span className="cat-pill" onClick={() => onOpenCategory(catId)}>
            <span className={`dot ${cat?.color || 'oxblood'}`} />{cat?.name || note.category}
          </span>
          <span>· {formatCreated(note.createdAt)}</span>
          <span>· {note.tags.length} tags · {outgoing.length}↗ {backlinks.length}↘</span>
          <button className="edit-inline" onClick={() => editing ? setEditing(false) : openEditor()} disabled={readOnly}>{editing ? 'Cancel' : 'Edit'}</button>
          <button className="delete-inline" onClick={onDelete} disabled={readOnly}>Delete</button>
        </div>
        {readOnly && <div className="read-only-banner">Read-only mode: editing, deletion, and Codex jobs are disabled in this deployment.</div>}
        {!editing && (
          <>
            <h1>{note.title}</h1>
            <p className="lede">{note.summary || 'No summary yet.'}</p>
            <div className="tags">
              {note.tags.map((tag) => <button key={tag} className="tag" onClick={() => onOpenTag(tag)}>#{tag}</button>)}
            </div>
            {(note.sourceUrl || note.originalRequest) && (
              <div className="source-note">
                {note.sourceUrl && (
                  <a href={note.sourceUrl} target="_blank" rel="noreferrer">
                    Original link
                  </a>
                )}
                {note.originalRequest && <span>{note.originalRequest}</span>}
              </div>
            )}
          </>
        )}
      </div>

      {editing ? (
        <div className="edit-card">
          <div className="edit-tabs" role="tablist" aria-label="Edit mode">
            <button
              className={editTab === 'manual' ? 'active' : ''}
              onClick={() => setEditTab('manual')}
              role="tab"
              aria-selected={editTab === 'manual'}
            >
              Normal edit
            </button>
            <button
              className={editTab === 'ai' ? 'active' : ''}
              onClick={() => setEditTab('ai')}
              role="tab"
              aria-selected={editTab === 'ai'}
            >
              AI prompt
            </button>
          </div>

          {editTab === 'manual' ? (
            <div className="manual-edit" role="tabpanel">
              <label>
                <span>Title</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label>
                <span>Summary</span>
                <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} />
              </label>
              <div className="edit-grid">
                <label>
                  <span>Category</span>
                  <input value={category} onChange={(event) => setCategory(event.target.value)} list="category-options" placeholder="Folder/Subfolder" />
                  <datalist id="category-options">
                    {categories.map((item) => <option key={item.id} value={item.name} />)}
                  </datalist>
                </label>
                <label>
                  <span>Tags</span>
                  <input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="tag-one, tag-two" />
                </label>
              </div>
              <div className="markdown-editor">
                <div className="edit-label">Markdown body</div>
                <div className="live-md-editor" aria-label="Markdown body editor">
                  {bodyLines.map((line, index) => (
                    <div
                      key={index}
                      ref={(element) => { lineRefs.current[index] = element; }}
                      className={markdownLineClass(line)}
                      contentEditable
                      suppressContentEditableWarning
                      spellCheck
                      onInput={(event) => updateMarkdownLine(index, event.currentTarget.textContent || '')}
                      onKeyDown={(event) => handleMarkdownKey(event, index)}
                      onPaste={(event) => pasteMarkdown(event, index)}
                    >
                      {line || '\u200b'}
                    </div>
                  ))}
                </div>
                <div className="fine">Type markdown directly. Headings, quotes, lists, and code markers are styled as you write.</div>
              </div>
            </div>
          ) : (
            <div className="ai-edit-panel" role="tabpanel">
              <p>Ask Codex to revise the current draft. It updates the editable fields only; Save still controls when the note is written.</p>
              <label>
                <span>Instruction</span>
                <textarea
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  placeholder="Tighten the note, add clearer headings, preserve all facts, and suggest better tags."
                  rows={8}
                />
              </label>
              {aiError && <div className="edit-error">{aiError}</div>}
              <button className="ai-run" onClick={runAiAssist} disabled={aiRunning || !aiPrompt.trim()}>
                {aiRunning ? 'Running Codex...' : 'Apply AI draft'}
              </button>
              <div className="ai-draft-note">
                Current draft target: <b>{title || 'Untitled note'}</b>
              </div>
            </div>
          )}

          {editTab === 'manual' && (
            <div className="link-editor">
              <div className="link-editor-head">
                <div className="edit-label">Links to other notes</div>
                <span>{links.length} selected</span>
              </div>
              <input
                className="link-search"
                value={linkQuery}
                onChange={(event) => setLinkQuery(event.target.value)}
                placeholder="Search by title, category, tag, summary, or id..."
              />
              {selectedLinkNotes.length > 0 && (
                <div className="selected-links">
                  {selectedLinkNotes.map((item) => (
                    <button key={item.id} onClick={() => toggleLink(item.id)} title="Remove link">
                      {item.title}
                      <span>x</span>
                    </button>
                  ))}
                </div>
              )}
              {candidateLinks.length === 0 && <div className="fine">No other notes to link yet.</div>}
              {candidateLinks.length > 0 && filteredCandidateLinks.length === 0 && (
                <div className="fine">{linkQuery.trim() ? 'No notes match that search.' : 'Search to add more linked notes.'}</div>
              )}
              {filteredCandidateLinks.map((item) => (
                <label key={item.id} className="link-choice">
                  <input type="checkbox" checked={links.includes(item.id)} onChange={() => toggleLink(item.id)} />
                  <span>{item.title}</span>
                  <em>{item.category}</em>
                </label>
              ))}
            </div>
          )}
          {aiSuccess && <div className="edit-success">{aiSuccess}</div>}
          {saveError && <div className="edit-error">{saveError}</div>}
          <div className="edit-actions">
            <button onClick={() => setEditing(false)} disabled={saving || aiRunning}>Cancel</button>
            <button className="save-note" onClick={saveEdit} disabled={saving || aiRunning || !title.trim()}>{saving ? 'Saving...' : 'Save note'}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="note-body">
            {blocks.map((block, index) => {
              if (block.type === 'h') return <h3 key={index}>{block.text}</h3>;
              if (block.type === 'q') return <blockquote key={index}>{block.text}</blockquote>;
              return <p key={index}>{block.text}</p>;
            })}
          </div>

          <div className="source-toggle">
            <div className="head" onClick={() => setShowSource((value) => !value)}>
              <span>{showSource ? '▾' : '▸'} Source · {note.id}.md</span>
              <span>{markdown.length} chars · markdown</span>
            </div>
            {showSource && <pre>{markdown}</pre>}
          </div>

          <div className="reminder-card">
            <div className="section-label">
              <h2>Reminder</h2>
              <span className="meta">{reminders.length} active</span>
            </div>
            <div className="reminder-form">
              <input
                type="datetime-local"
                value={remindAt}
                onChange={(event) => setRemindAt(event.target.value)}
                min={minimumReminderTime}
                disabled={readOnly}
              />
              <input
                value={reminderMessage}
                onChange={(event) => setReminderMessage(event.target.value)}
                placeholder="Optional reminder note"
                disabled={readOnly}
              />
              <button onClick={scheduleReminder} disabled={readOnly || reminderSaving || !remindAt}>
                {reminderSaving ? 'Saving...' : 'Schedule'}
              </button>
            </div>
            {reminderError && <div className="edit-error">{reminderError}</div>}
            <div className="reminder-list note-reminders">
              {reminders.map((reminder) => {
                const due = Date.parse(reminder.remindAt) <= now;
                return (
                  <div key={reminder.id} className={`reminder-row${due ? ' due' : ''}`}>
                    <div className="reminder-main as-text">
                      <span>{due ? 'Due now' : new Date(reminder.remindAt).toLocaleString()}</span>
                      <b>{reminder.message || 'Review this article'}</b>
                    </div>
                    <button className="reminder-done" onClick={() => onCompleteReminder(reminder.id)} disabled={readOnly}>Done</button>
                    <button className="reminder-delete" onClick={() => onDeleteReminder(reminder.id)} disabled={readOnly}>Delete</button>
                  </div>
                );
              })}
              {!reminders.length && <div className="fine">No reminders for this article yet.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Formats a Date for an HTML `datetime-local` input. Native inputs expect a
 * local wall-clock value, so the timezone offset is removed before slicing the
 * ISO string.
 */
function toLocalDateTimeInputValue(date: Date) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
}
