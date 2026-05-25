import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { CreateNoteRequest } from '../../types';
import { templatesForMode, type GuidanceTemplate } from '../../lib/guidance';
import { NEW_NOTE_DRAFT_KEY } from '../routes/NewNoteRoute';
import { assistDraft } from '../../api';
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const editorRef = useRef<NoteEditorHandle>(null);

  const [mode, setMode] = useState<CaptureMode>(() => {
    const draft = sessionStorage.getItem('kl:landing-draft');
    if (draft && /^https?:\/\//.test(draft.trim())) return 'link';
    return 'research';
  });
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState(() => {
    const draft = sessionStorage.getItem('kl:landing-draft');
    if (draft && /^https?:\/\//.test(draft.trim())) {
      sessionStorage.removeItem('kl:landing-draft');
      return draft.trim();
    }
    return '';
  });
  const [guidance, setGuidance] = useState(() => {
    const draft = sessionStorage.getItem('kl:landing-draft');
    if (draft && !/^https?:\/\//.test(draft.trim())) {
      sessionStorage.removeItem('kl:landing-draft');
      return draft;
    }
    return localStorage.getItem('kl:cap-research') || '';
  });
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [seed, setSeed] = useState('');
  const [ctx, setCtx] = useState('');
  const [summary, setSummary] = useState('');
  const [links, setLinks] = useState('');
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState('');

  const modeTemplates = mode !== 'write'
    ? templatesForMode(templates, mode === 'link' ? 'link' : 'research')
    : [];

  const guidanceLabel = guidance
    ? modeTemplates.find((tpl) => tpl.text === guidance)?.label ?? truncate(guidance, 50)
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
    setSeed(''); setCtx(''); setSummary(''); setLinks('');
    setAiAssistOpen(false); setAiPrompt(''); setAiError('');
    setShowMore(false);
    editorRef.current?.clear();
  }

  async function runAiAssist() {
    const p = aiPrompt.trim();
    if (!p) return;
    setAiRunning(true);
    setAiError('');
    try {
      const { update } = await assistDraft({
        title,
        body: editorRef.current?.getValue() ?? '',
        category,
        summary,
        tags,
      }, p);
      setTitle(update.title);
      setCategory(update.category);
      setSummary(update.summary);
      setTags(update.tags);
      editorRef.current?.setValue(update.body);
      setAiAssistOpen(false);
      setAiPrompt('');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI Assist failed');
    } finally {
      setAiRunning(false);
    }
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
      mode: mode === 'link' ? 'link' : mode === 'research' ? 'research' : 'write',
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
    ? t('capture.submitLink')
    : mode === 'research'
    ? t('capture.submitResearch')
    : t('capture.submitWrite');



  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={`${styles.capture} ${styles[`mode-${mode}`]}`}>

      {/* Header */}
      <div className={styles.header}>
        <span className={styles.prompt}>
          <span className={styles.promptStar}>✦</span>
          {readOnly ? t('capture.readOnlyBanner') : t('capture.promptQuestion')}
        </span>
        <div className={styles.modeSwitcher}>
          {(['research', 'link', 'write'] as CaptureMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`${styles.modeBtn} ${styles[`modeBtn-${m}`]}${mode === m ? ` ${styles.modeBtnActive}` : ''}`}
              onClick={() => { setMode(m); setGuidance(localStorage.getItem(`kl:cap-${m}`) || ''); setShowMore(false); }}
              disabled={readOnly}
            >
              {m === 'research' ? t('capture.btnResearch') : m === 'link' ? t('capture.btnLink') : t('capture.btnWrite')}
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
              placeholder={t('capture.researchPlaceholder')}
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
            {showMore ? t('capture.fewerOptions') : t('capture.moreOptions')}
          </button>
            {!showMore && guidance && (
              <span className={styles.guidancePreview}>{t('capture.writingInstructionPreview', { label: guidanceLabel })}</span>
            )}
          </div>
          {showMore && (
            <div className={styles.moreBody}>
              <div className={styles.guidance}>
                <div className={styles.guidanceTop}>
                  <span className={styles.guidanceLabel}>{t('capture.writingInstructions')}</span>
                  <div className={styles.guidanceLine} />
                  <button type="button" className={styles.guidanceManage} onClick={() => navigate('/settings')}>
                    {t('common.manage')}
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
                    placeholder={t('capture.customInstructionsResearch')}
                    disabled={readOnly}
                  />
                </div>
              </div>
              <label className={styles.fieldLabel}>{t('capture.whatYouKnow')}</label>
              <textarea
                className={styles.seedArea}
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                onKeyDown={onKey}
                placeholder={t('capture.seedPlaceholder')}
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
              <input className={styles.ctxInput} value={ctx} onChange={(e) => setCtx(e.target.value)} onKeyDown={onKey} placeholder={t('capture.contextResearch')} disabled={readOnly} />
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
              placeholder={t('capture.urlPlaceholder')}
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
            {showMore ? t('capture.fewerOptions') : t('capture.moreOptions')}
          </button>
            {!showMore && guidance && (
              <span className={styles.guidancePreview}>{t('capture.writingInstructionPreview', { label: guidanceLabel })}</span>
            )}
          </div>
          {showMore && (
            <div className={styles.moreBody}>
              <div className={styles.guidance}>
                <div className={styles.guidanceTop}>
                  <span className={styles.guidanceLabel}>{t('capture.writingInstructions')}</span>
                  <div className={styles.guidanceLine} />
                  <button type="button" className={styles.guidanceManage} onClick={() => navigate('/settings')}>
                    {t('common.manage')}
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
                    placeholder={t('capture.customInstructionsLink')}
                    disabled={readOnly}
                  />
                </div>
              </div>
              <label className={styles.fieldLabel}>{t('capture.whatToFocus')}</label>
              <textarea
                className={styles.seedArea}
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                onKeyDown={onKey}
                placeholder={t('capture.focusPlaceholder')}
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
              <input className={styles.ctxInput} value={ctx} onChange={(e) => setCtx(e.target.value)} onKeyDown={onKey} placeholder={t('capture.contextLink')} disabled={readOnly} />
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
              placeholder={t('capture.noteTitlePlaceholder')}
              disabled={readOnly}
            />
          </div>
          <div className={styles.captureEditor}>
            <NoteEditor
              ref={editorRef}
              placeholder={t('capture.writePlaceholder')}
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
          <div className={styles.writeActions}>
            <button
              type="button"
              className={styles.aiAssistBtn}
              onClick={() => { setAiAssistOpen(true); setAiError(''); }}
              disabled={readOnly}
            >
              {t('capture.aiAssist')}
            </button>
            <button
              type="button"
              className={styles.fullEditorBtn}
              onClick={openFullEditor}
              disabled={readOnly}
            >
              {t('capture.fullEditor')}
            </button>
          </div>
          <button
            type="button"
            className={`${styles.moreToggle}${showMore ? ` ${styles.moreOpen}` : ''}`}
            onClick={() => setShowMore((v) => !v)}
          >
            <span className={styles.moreArrow}>{showMore ? '▾' : '▸'}</span>
            {showMore ? t('capture.fewerOptions') : t('capture.moreOptions')}
          </button>
          {showMore && (
            <div className={styles.moreBody}>
              <div className={styles.metaRow}>
                <input className={styles.metaInput} value={summary} onChange={(e) => setSummary(e.target.value)} onKeyDown={onKey} placeholder={t('capture.summaryPlaceholder')} disabled={readOnly} />
                <input className={styles.metaInput} value={links} onChange={(e) => setLinks(e.target.value)} onKeyDown={onKey} placeholder={t('capture.linkedNotesPlaceholder')} disabled={readOnly} />
              </div>
              <input className={styles.ctxInput} value={ctx} onChange={(e) => setCtx(e.target.value)} onKeyDown={onKey} placeholder={t('capture.contextWrite')} disabled={readOnly} />
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.hint}>
          {readOnly
            ? t('capture.readOnlyHint')
            : <><kbd>/</kbd> {t('capture.keyboardHint')}</>}
        </span>
        <button className={styles.submit} onClick={submit} disabled={!canSubmit}>
          {submitLabel}
        </button>
      </div>

      {/* AI Assist popup */}
      {aiAssistOpen && (
        <div className={styles.aiAssistOverlay} onClick={(e) => { if (e.target === e.currentTarget) setAiAssistOpen(false); }}>
          <div className={styles.aiAssistModal}>
            <div className={styles.aiAssistHead}>
              <span className={styles.aiAssistTitle}>{t('capture.aiAssistTitle')}</span>
              <button className={styles.aiAssistClose} onClick={() => setAiAssistOpen(false)}>✕</button>
            </div>
            <p className={styles.aiAssistDesc}>{t('capture.aiAssistDesc')}</p>
            <textarea
              className={styles.aiAssistInput}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={t('capture.aiAssistPlaceholder')}
              rows={4}
              autoFocus
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runAiAssist(); } }}
            />
            {aiError && <p className={styles.aiAssistError}>{aiError}</p>}
            <div className={styles.aiAssistActions}>
              <button className={styles.aiAssistCancel} onClick={() => setAiAssistOpen(false)} disabled={aiRunning}>{t('common.cancel')}</button>
              <button className={styles.aiAssistApply} onClick={runAiAssist} disabled={aiRunning || !aiPrompt.trim()}>
                {aiRunning ? t('capture.aiWorking') : t('capture.aiApply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
