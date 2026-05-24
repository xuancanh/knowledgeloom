import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CreateNoteRequest } from '../../types';
import { templatesForMode, type GuidanceTemplate } from '../../lib/guidance';
import { NEW_NOTE_DRAFT_KEY } from '../routes/NewNoteRoute';
import NoteEditor, { type NoteEditorHandle } from '../notes/NoteEditor';
import MetaFields from '../notes/MetaFields';
import styles from './CaptureBox.module.css';

/** Note capture mode: research, link (URL→note), or write (direct input). */
type CaptureMode = 'research' | 'link' | 'write';

function splitList(value: string) {
  return [...new Set(value.split(',').map((s) => s.trim()).filter(Boolean))];
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

export default function CaptureBox({
  onSubmit,
  readOnly,
  templates,
}: {
  onSubmit: (payload: CreateNoteRequest) => void;
  readOnly: boolean;
  templates: GuidanceTemplate[];
}) {
  const navigate = useNavigate();
  const editorRef = useRef<NoteEditorHandle>(null);

  const [mode, setMode] = useState<CaptureMode>('research');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [guidance, setGuidance] = useState(() => localStorage.getItem('kl:cap-research') || '');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [seed, setSeed] = useState('');
  const [ctx, setCtx] = useState('');
  const [summary, setSummary] = useState('');
  const [links, setLinks] = useState('');
  const [aiPolish, setAiPolish] = useState(false);

  const modeTemplates = mode !== 'write'
    ? templatesForMode(templates, mode === 'link' ? 'link' : 'research')
    : [];

  const guidanceLabel = guidance
    ? modeTemplates.find((t) => t.text === guidance)?.label ?? truncate(guidance, 50)
    : '';

  const primaryRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (e.key === '/' && tag !== 'TEXTAREA' && tag !== 'INPUT' && (e.target as HTMLElement)?.getAttribute('contenteditable') !== 'true') {
        e.preventDefault();
        if (mode === 'write') editorRef.current?.focus();
        else primaryRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'write') localStorage.setItem(`kl:cap-${mode}`, guidance);
  }, [guidance, mode]);

  function onKey(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }

  function reset() {
    setTitle(''); setUrl(''); setGuidance(''); setCategory(''); setTags([]);
    setSeed(''); setCtx(''); setSummary(''); setLinks(''); setAiPolish(false);
    setShowMore(false);
    editorRef.current?.clear();
  }

  function openFullEditor() {
    if (mode === 'write') {
      sessionStorage.setItem(NEW_NOTE_DRAFT_KEY, JSON.stringify({
        title,
        body: editorRef.current?.getValue() ?? '',
        category,
        tags,
        summary,
      }));
    }
    navigate('/new');
  }

  function submit() {
    const t = title.trim();
    const u = url.trim();
    const body = mode === 'write' ? editorRef.current?.getValue().trim() ?? '' : seed.trim();

    if (mode === 'research' && !t) return;
    if (mode === 'link' && !u) return;
    if (mode === 'write' && !t) return;

    onSubmit({
      mode: mode === 'link' ? 'link' : mode === 'research' ? 'research' : aiPolish ? 'polish' : 'write',
      title: t || u,
      url: u,
      body,
      context: ctx.trim(),
      category: category.trim(),
      tags,
      summary: summary.trim(),
      links: splitList(links),
      guidance: guidance.trim(),
    });
    reset();
  }

  const canSubmit = !readOnly && (
    (mode === 'research' && title.trim().length > 0) ||
    (mode === 'link' && url.trim().length > 0) ||
    (mode === 'write' && title.trim().length > 0)
  );

  const submitLabel = mode === 'link'
    ? 'Generate from link'
    : mode === 'research'
    ? 'Research with Codex'
    : aiPolish ? 'Polish with AI' : 'Save note';



  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={`${styles.capture} ${styles[`mode-${mode}`]}`}>

      {/* Header */}
      <div className={styles.header}>
        <span className={styles.prompt}>
          <span className={styles.promptStar}>✦</span>
          {readOnly ? 'Read-only archive' : 'What did you learn?'}
        </span>
        <div className={styles.headerRight}>
          <button
            type="button"
            className={styles.fullEditorBtn}
            onClick={openFullEditor}
            disabled={readOnly}
            title="Open full editor"
          >
            ⊕ Full editor
          </button>
          <div className={styles.modeSwitcher}>
            {(['research', 'link', 'write'] as CaptureMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`${styles.modeBtn} ${styles[`modeBtn-${m}`]}${mode === m ? ` ${styles.modeBtnActive}` : ''}`}
                onClick={() => { setMode(m); setGuidance(localStorage.getItem(`kl:cap-${m}`) || ''); setShowMore(false); }}
                disabled={readOnly}
              >
                {m === 'research' ? '⌕ Research' : m === 'link' ? '↗ Link' : '✎ Write'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Research mode ─────────────────────────────────────────────────── */}
      {mode === 'research' && (
        <div className={styles.body}>
          <div className={styles.primaryZone}>
            <input
              ref={primaryRef}
              className={styles.primary}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={onKey}
              placeholder="What do you want to learn? e.g. CRDT merge semantics"
              disabled={readOnly}
              autoComplete="off"
              spellCheck={false}
              autoFocus={!readOnly}
            />
          </div>
          <div className={styles.moreRow}>
          <button
            type="button"
            className={`${styles.moreToggle}${showMore ? ` ${styles.moreOpen}` : ''}`}
            onClick={() => setShowMore((v) => !v)}
          >
            <span className={styles.moreArrow}>{showMore ? '▾' : '▸'}</span>
            {showMore ? 'Fewer options' : 'More options'}
          </button>
            {!showMore && guidance && (
              <span className={styles.guidancePreview}>Writing instruction: {guidanceLabel}</span>
            )}
          </div>
          {showMore && (
            <div className={styles.moreBody}>
              <div className={styles.guidance}>
                <div className={styles.guidanceTop}>
                  <span className={styles.guidanceLabel}>Writing instructions</span>
                  <div className={styles.guidanceLine} />
                  <button type="button" className={styles.guidanceManage} onClick={() => navigate('/settings')}>
                    Manage
                  </button>
                </div>
                {modeTemplates.length > 0 && (
                  <div className={styles.chips}>
                    {modeTemplates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        className={`${styles.chip}${guidance === tpl.text ? ` ${styles.chipActive}` : ''}`}
                        style={guidance === tpl.text && tpl.color ? { color: `var(--${tpl.color})`, borderColor: `var(--${tpl.color})`, background: `color-mix(in srgb, var(--${tpl.color}) 8%, var(--surface))` } : undefined}
                        onClick={() => setGuidance((v) => v === tpl.text ? '' : tpl.text)}
                        disabled={readOnly}
                      >
                        {tpl.color && <span className={styles.chipDot} style={{ background: `var(--${tpl.color})` }} />}
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className={styles.guidanceInputWrap}>
                  <span className={styles.guidanceInputIcon}>✎</span>
                  <input
                    className={styles.guidanceInput}
                    value={guidance}
                    onChange={(e) => setGuidance(e.target.value)}
                    onKeyDown={onKey}
                    placeholder="Custom instructions — depth, format, audience, code style…"
                    disabled={readOnly}
                  />
                </div>
              </div>
              <label className={styles.fieldLabel}>What you already know</label>
              <textarea
                className={styles.seedArea}
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                onKeyDown={onKey}
                placeholder="Paste a quote, rough bullets, or notes you've already collected…"
                rows={3}
                disabled={readOnly}
              />
              <MetaFields
                category={category}
                onCategoryChange={setCategory}
                tags={tags}
                onTagsChange={setTags}
                disabled={readOnly}
                compact
              />
              <input className={styles.ctxInput} value={ctx} onChange={(e) => setCtx(e.target.value)} onKeyDown={onKey} placeholder="Context — why you're learning this, where you found it…" disabled={readOnly} />
            </div>
          )}
        </div>
      )}

      {/* ── Link mode ─────────────────────────────────────────────────────── */}
      {mode === 'link' && (
        <div className={styles.body}>
          <div className={styles.primaryZone}>
            <div className={styles.urlRow}>
              <span className={styles.urlGlyph}>↗</span>
            <input
              ref={primaryRef}
              className={styles.urlInput}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={onKey}
              placeholder="https://example.com/article"
              disabled={readOnly}
              autoComplete="off"
              spellCheck={false}
              type="url"
            />
          </div>
          </div>
          <div className={styles.moreRow}>
          <button
            type="button"
            className={`${styles.moreToggle}${showMore ? ` ${styles.moreOpen}` : ''}`}
            onClick={() => setShowMore((v) => !v)}
          >
            <span className={styles.moreArrow}>{showMore ? '▾' : '▸'}</span>
            {showMore ? 'Fewer options' : 'More options'}
          </button>
            {!showMore && guidance && (
              <span className={styles.guidancePreview}>Writing instruction: {guidanceLabel}</span>
            )}
          </div>
          {showMore && (
            <div className={styles.moreBody}>
              <div className={styles.guidance}>
                <div className={styles.guidanceTop}>
                  <span className={styles.guidanceLabel}>Writing instructions</span>
                  <div className={styles.guidanceLine} />
                  <button type="button" className={styles.guidanceManage} onClick={() => navigate('/settings')}>
                    Manage
                  </button>
                </div>
                {modeTemplates.length > 0 && (
                  <div className={styles.chips}>
                    {modeTemplates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        className={`${styles.chip}${guidance === tpl.text ? ` ${styles.chipActive}` : ''}`}
                        style={guidance === tpl.text && tpl.color ? { color: `var(--${tpl.color})`, borderColor: `var(--${tpl.color})`, background: `color-mix(in srgb, var(--${tpl.color}) 8%, var(--surface))` } : undefined}
                        onClick={() => setGuidance((v) => v === tpl.text ? '' : tpl.text)}
                        disabled={readOnly}
                      >
                        {tpl.color && <span className={styles.chipDot} style={{ background: `var(--${tpl.color})` }} />}
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className={styles.guidanceInputWrap}>
                  <span className={styles.guidanceInputIcon}>✎</span>
                  <input
                    className={styles.guidanceInput}
                    value={guidance}
                    onChange={(e) => setGuidance(e.target.value)}
                    onKeyDown={onKey}
                    placeholder="Custom instructions — focus area, audience, format…"
                    disabled={readOnly}
                  />
                </div>
              </div>
              <label className={styles.fieldLabel}>What to focus on</label>
              <textarea
                className={styles.seedArea}
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                onKeyDown={onKey}
                placeholder="Specific sections, aspects, or angle to extract from this page…"
                rows={2}
                disabled={readOnly}
              />
              <MetaFields
                category={category}
                onCategoryChange={setCategory}
                tags={tags}
                onTagsChange={setTags}
                disabled={readOnly}
                compact
              />
              <input className={styles.ctxInput} value={ctx} onChange={(e) => setCtx(e.target.value)} onKeyDown={onKey} placeholder="Context — why this link matters…" disabled={readOnly} />
            </div>
          )}
        </div>
      )}

      {/* ── Write mode ────────────────────────────────────────────────────── */}
      {mode === 'write' && (
        <div className={styles.body}>
          <div className={styles.primaryZone}>
            <input
              className={styles.writeTitle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={onKey}
              placeholder="Note title"
              disabled={readOnly}
            />
          </div>
          <div className={styles.captureEditor}>
            <NoteEditor
              ref={editorRef}
              placeholder="Start writing… use the toolbar for formatting, drag images to upload."
              disabled={readOnly}
            />
          </div>
          <MetaFields
            category={category}
            onCategoryChange={setCategory}
            tags={tags}
            onTagsChange={setTags}
            disabled={readOnly}
            compact
          />
          <label className={styles.polishToggle}>
            <input type="checkbox" checked={aiPolish} onChange={(e) => setAiPolish(e.target.checked)} disabled={readOnly} />
            <span className={styles.polishLabel}>
              Polish with AI
              <em>Improve structure and clarity without adding new facts</em>
            </span>
          </label>
          <button
            type="button"
            className={`${styles.moreToggle}${showMore ? ` ${styles.moreOpen}` : ''}`}
            onClick={() => setShowMore((v) => !v)}
          >
            <span className={styles.moreArrow}>{showMore ? '▾' : '▸'}</span>
            {showMore ? 'Fewer options' : 'More options'}
          </button>
          {showMore && (
            <div className={styles.moreBody}>
              <div className={styles.metaRow}>
                <input className={styles.metaInput} value={summary} onChange={(e) => setSummary(e.target.value)} onKeyDown={onKey} placeholder="One-line summary" disabled={readOnly} />
                <input className={styles.metaInput} value={links} onChange={(e) => setLinks(e.target.value)} onKeyDown={onKey} placeholder="Linked note ids, comma-separated" disabled={readOnly} />
              </div>
              <input className={styles.ctxInput} value={ctx} onChange={(e) => setCtx(e.target.value)} onKeyDown={onKey} placeholder={aiPolish ? 'Polish instructions — tone, audience, sections to keep…' : 'Context — notes for future reference…'} disabled={readOnly} />
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.hint}>
          {readOnly
            ? 'Cloud deployment is browsing-only.'
            : <><kbd>/</kbd> focus · <kbd>⌘↵</kbd> submit</>}
        </span>
        <button className={styles.submit} onClick={submit} disabled={!canSubmit}>
          {submitLabel} →
        </button>
      </div>
    </div>
  );
}
