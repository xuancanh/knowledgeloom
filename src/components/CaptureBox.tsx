import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CreateNoteRequest } from '../types';
import { templatesForMode, type GuidanceTemplate } from '../lib/guidance';
import LiveEditor, { type LiveEditorHandle } from './LiveEditor';
import styles from './CaptureBox.module.css';

type CaptureMode = 'research' | 'link' | 'write';

function splitList(value: string) {
  return [...new Set(value.split(',').map((s) => s.trim()).filter(Boolean))];
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
  const editorRef = useRef<LiveEditorHandle>(null);

  const [mode, setMode] = useState<CaptureMode>('research');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [guidance, setGuidance] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [seed, setSeed] = useState('');
  const [ctx, setCtx] = useState('');
  const [summary, setSummary] = useState('');
  const [links, setLinks] = useState('');
  const [aiPolish, setAiPolish] = useState(false);

  const modeTemplates = mode !== 'write'
    ? templatesForMode(templates, mode === 'link' ? 'link' : 'research')
    : [];

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

  function onKey(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }

  function reset() {
    setTitle(''); setUrl(''); setGuidance(''); setCategory(''); setTags('');
    setSeed(''); setCtx(''); setSummary(''); setLinks(''); setAiPolish(false);
    setShowMore(false);
    editorRef.current?.clear();
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
      tags: splitList(tags),
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

  // ── Guidance section ────────────────────────────────────────────────────────
  const GuidanceSection = () => (
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
              onClick={() => setGuidance((v) => v === tpl.text ? '' : tpl.text)}
              disabled={readOnly}
            >
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
          placeholder={
            mode === 'link'
              ? 'Custom instructions — focus area, audience, format…'
              : 'Custom instructions — depth, format, audience, code style…'
          }
          disabled={readOnly}
        />
      </div>
    </div>
  );

  // ── More options toggle ─────────────────────────────────────────────────────
  const MoreToggle = () => (
    <button
      type="button"
      className={`${styles.moreToggle}${showMore ? ` ${styles.moreOpen}` : ''}`}
      onClick={() => setShowMore((v) => !v)}
    >
      <span className={styles.moreArrow}>{showMore ? '▾' : '▸'}</span>
      {showMore ? 'Fewer options' : 'More options'}
    </button>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={`${styles.capture} ${styles[`mode-${mode}`]}`}>

      {/* Header */}
      <div className={styles.header}>
        <span className={styles.prompt}>
          <span className={styles.promptStar}>✦</span>
          {readOnly ? 'Read-only archive' : 'What did you learn?'}
        </span>
        <div className={styles.modeSwitcher}>
          {(['research', 'link', 'write'] as CaptureMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`${styles.modeBtn} ${styles[`modeBtn-${m}`]}${mode === m ? ` ${styles.modeBtnActive}` : ''}`}
              onClick={() => { setMode(m); setGuidance(''); setShowMore(false); }}
              disabled={readOnly}
            >
              {m === 'research' ? '⌕ Research' : m === 'link' ? '↗ Link' : '✎ Write'}
            </button>
          ))}
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
          <GuidanceSection />
          <MoreToggle />
          {showMore && (
            <div className={styles.moreBody}>
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
              <div className={styles.metaRow}>
                <input className={styles.metaInput} value={category} onChange={(e) => setCategory(e.target.value)} onKeyDown={onKey} placeholder="Category hint" disabled={readOnly} />
                <input className={styles.metaInput} value={tags} onChange={(e) => setTags(e.target.value)} onKeyDown={onKey} placeholder="Tags hint, comma-separated" disabled={readOnly} />
              </div>
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
            <input
              className={styles.titleHint}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={onKey}
              placeholder="Optional title hint"
              disabled={readOnly}
            />
          </div>
          <GuidanceSection />
          <MoreToggle />
          {showMore && (
            <div className={styles.moreBody}>
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
              <div className={styles.metaRow}>
                <input className={styles.metaInput} value={category} onChange={(e) => setCategory(e.target.value)} onKeyDown={onKey} placeholder="Category hint" disabled={readOnly} />
                <input className={styles.metaInput} value={tags} onChange={(e) => setTags(e.target.value)} onKeyDown={onKey} placeholder="Tags hint, comma-separated" disabled={readOnly} />
              </div>
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
          <LiveEditor
            ref={editorRef}
            className="capture-editor"
            placeholder="Start writing… ## heading  **bold**  *italic*  - list  > quote"
            disabled={readOnly}
          />
          <div className={styles.metaRow}>
            <input className={styles.metaInput} value={category} onChange={(e) => setCategory(e.target.value)} onKeyDown={onKey} placeholder="Category" disabled={readOnly} />
            <input className={styles.metaInput} value={tags} onChange={(e) => setTags(e.target.value)} onKeyDown={onKey} placeholder="Tags, comma-separated" disabled={readOnly} />
          </div>
          <label className={styles.polishToggle}>
            <input type="checkbox" checked={aiPolish} onChange={(e) => setAiPolish(e.target.checked)} disabled={readOnly} />
            <span className={styles.polishLabel}>
              Polish with AI
              <em>Improve structure and clarity without adding new facts</em>
            </span>
          </label>
          <MoreToggle />
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
