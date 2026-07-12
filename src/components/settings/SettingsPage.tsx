import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  patchSettings, fetchSpaces, createSpace, renameSpace, deleteSpace,
  exportVaultBackup, restoreVaultBackup, type RestoreConflictPolicy, type RestoreResult,
} from '../../api';
import { getFeatures, DEFAULT_FEATURES, type FeatureToggles } from '../../lib/features';
import { currentSpaceId, switchSpace, DEFAULT_SPACE_ID, type Space } from '../../lib/spaces';
import {
  addTemplate,
  deleteTemplate,
  saveTemplates,
  updateTemplate,
  type GuidanceMode,
  type GuidanceTemplate,
} from '../../lib/guidance';
import LanguageSwitcher from '../LanguageSwitcher';
import styles from './SettingsPage.module.css';

function useModeLabels(): Record<GuidanceMode, string> {
  const { t } = useTranslation();
  return {
    research: t('settings.modeResearch'),
    link: t('settings.modeLink'),
    both: t('settings.modeBoth'),
  };
}


function modeCls(mode: GuidanceMode) {
  if (mode === 'research') return styles.modeResearch;
  if (mode === 'link') return styles.modeLink;
  return styles.modeBoth;
}

function colorVar(color?: string) {
  if (!color) return 'var(--accent)';
  return `var(--${color})`;
}

// ── Template row ──────────────────────────────────────────────────────────────

function TemplateRow({
  template,
  onEdit,
  onDelete,
}: {
  template: GuidanceTemplate;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const modeLabels = useModeLabels();
  return (
    <div className={styles.row}>
      <div className={styles.rowBody}>
        <div className={styles.rowHeader}>
          <span className={styles.rowColorDot} style={{ background: colorVar(template.color) }} />
          <span className={styles.rowLabel}>{template.label}</span>
          <span className={`${styles.rowMode} ${modeCls(template.mode)}`}>{modeLabels[template.mode]}</span>
          {template.builtIn && <span className={styles.rowBuiltIn}>{t('settings.builtIn')}</span>}
        </div>
        <div className={styles.rowText}>{template.text}</div>
      </div>
      <div className={styles.rowActions}>
        <button className={styles.rowBtn} onClick={onEdit}>{t('common.edit')}</button>
        <button className={`${styles.rowBtn} ${styles.rowBtnDelete}`} onClick={onDelete}>{t('common.delete')}</button>
      </div>
    </div>
  );
}

// ── Template editor ───────────────────────────────────────────────────────────

function TemplateEditor({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: { label: string; text: string; mode: GuidanceMode; color?: string };
  onChange: (patch: Partial<{ label: string; text: string; mode: GuidanceMode; color: string }>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const modeLabels = useModeLabels();
  const templateColors: { name: string; label: string; cssVar: string }[] = [
    { name: '', label: t('settings.colorDefault'), cssVar: 'var(--accent)' },
    { name: 'moss', label: t('settings.colorGreen'), cssVar: 'var(--moss)' },
    { name: 'indigo', label: t('settings.colorBlue'), cssVar: 'var(--indigo)' },
    { name: 'teal', label: t('settings.colorTeal'), cssVar: 'var(--teal)' },
    { name: 'ochre', label: t('settings.colorAmber'), cssVar: 'var(--ochre)' },
    { name: 'rust', label: t('settings.colorRed'), cssVar: 'var(--rust)' },
  ];
  const valid = value.label.trim().length > 0 && value.text.trim().length > 0;
  return (
    <div className={styles.editor}>
      <div className={styles.editorRow}>
        <div className={styles.editorField}>
          <label className={styles.editorLabel}>{t('settings.labelField')}</label>
          <input
            className={styles.editorInput}
            value={value.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder={t('settings.labelPlaceholder')}
            autoFocus
          />
        </div>
        <div className={styles.editorField}>
          <label className={styles.editorLabel}>{t('settings.appliesTo')}</label>
          <div className={styles.editorModeGroup}>
            {(['research', 'link', 'both'] as GuidanceMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`${styles.editorModeBtn}${value.mode === m ? ` ${styles.active}` : ''}`}
                onClick={() => onChange({ mode: m })}
              >
                {modeLabels[m]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.editorField}>
        <label className={styles.editorLabel}>{t('settings.instructionsText')}</label>
        <textarea
          className={styles.editorTextarea}
          value={value.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder={t('settings.instructionsPlaceholder')}
          rows={3}
        />
      </div>
      <div className={styles.editorField}>
        <label className={styles.editorLabel}>{t('settings.color')}</label>
        <div className={styles.colorSwatches}>
          {templateColors.map(({ name, label, cssVar }) => (
            <button
              key={name}
              type="button"
              className={`${styles.colorSwatch}${(value.color ?? '') === name ? ` ${styles.colorSwatchActive}` : ''}`}
              style={{ '--swatch-color': cssVar } as React.CSSProperties}
              title={label}
              onClick={() => onChange({ color: name })}
              aria-label={label}
            />
          ))}
        </div>
      </div>
      <div className={styles.editorActions}>
        <button className={styles.editorCancel} onClick={onCancel}>{t('common.cancel')}</button>
        <button className={styles.editorSave} onClick={onSave} disabled={!valid}>{t('settings.saveTemplate')}</button>
      </div>
    </div>
  );
}

// ── Feature toggles ───────────────────────────────────────────────────────────

function FeatureTogglesSection({ userSettings, readOnly }: { userSettings?: Record<string, unknown>; readOnly: boolean }) {
  const { t } = useTranslation();
  const [local, setLocal] = useState<FeatureToggles>(() => getFeatures(userSettings));
  const [saving, setSaving] = useState(false);

  // Follow externally-refreshed settings (the knowledge poll) unless mid-save.
  useEffect(() => {
    if (!saving) setLocal(getFeatures(userSettings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify((userSettings as any)?.features ?? {})]);

  const toggle = async (key: keyof FeatureToggles) => {
    const next = { ...local, [key]: !local[key] };
    setLocal(next);
    setSaving(true);
    try {
      await patchSettings({ features: next });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.editorPrefs}>
      {(Object.keys(DEFAULT_FEATURES) as (keyof FeatureToggles)[]).map((key) => (
        <div key={key} className={styles.prefRow}>
          <div>
            <div className={styles.prefLabel}>{t(`settings.features.${key}.label`)}</div>
            <div className={styles.prefDesc}>{t(`settings.features.${key}.description`)}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={local[key]}
            aria-label={t(`settings.features.${key}.label`)}
            className={`${styles.toggle} ${local[key] ? styles.toggleOn : ''}`}
            onClick={() => void toggle(key)}
            disabled={readOnly || saving}
          >
            {local[key] ? t('settings.on') : t('settings.off')}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Spaces ────────────────────────────────────────────────────────────────────

function SpacesSection({ readOnly }: { readOnly: boolean }) {
  const { t } = useTranslation();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const activeId = currentSpaceId();

  const reload = () =>
    fetchSpaces().then(({ spaces, limit }) => { setSpaces(spaces); setLimit(limit); }).catch(() => {});

  useEffect(() => { void reload(); }, []);

  const atLimit = limit !== null && spaces.length >= limit;

  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try { await action(); await reload(); }
    catch (err) { setError(err instanceof Error ? err.message : t('settings.operationFailed')); }
  };

  const create = () => void run(async () => {
    const s = await createSpace(newName);
    switchSpace(s.id);
  });

  return (
    <>
      <div className={styles.templateList}>
        {spaces.map((space) => (
          <div key={space.id} className={styles.row}>
            <div className={styles.rowBody}>
              {renamingId === space.id ? (
                <input
                  className={styles.editorInput}
                  autoFocus
                  value={renameDraft}
                  maxLength={60}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void run(async () => { await renameSpace(space.id, renameDraft); setRenamingId(null); });
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                />
              ) : (
                <div className={styles.rowHeader}>
                  <span className={styles.rowColorDot} style={{ background: space.id === activeId ? 'var(--accent)' : 'var(--rule-2)' }} />
                  <span className={styles.rowLabel}>{space.name}</span>
                  {space.builtin && <span className={styles.rowBuiltIn}>{t('settings.defaultSpace')}</span>}
                  {space.id === activeId && <span className={styles.rowBuiltIn}>{t('settings.currentSpace')}</span>}
                </div>
              )}
            </div>
            <div className={styles.rowActions}>
              {renamingId === space.id ? (
                <>
                  <button className={styles.rowBtn} onClick={() => void run(async () => { await renameSpace(space.id, renameDraft); setRenamingId(null); })}>{t('common.save')}</button>
                  <button className={styles.rowBtn} onClick={() => setRenamingId(null)}>{t('common.cancel')}</button>
                </>
              ) : confirmDeleteId === space.id ? (
                <>
                  <button
                    className={`${styles.rowBtn} ${styles.rowBtnDelete}`}
                    onClick={() => void run(async () => {
                      await deleteSpace(space.id);
                      setConfirmDeleteId(null);
                      if (space.id === activeId) switchSpace(DEFAULT_SPACE_ID);
                    })}
                  >
                    {t('settings.deleteEverything')}
                  </button>
                  <button className={styles.rowBtn} onClick={() => setConfirmDeleteId(null)}>{t('settings.keepSpace')}</button>
                </>
              ) : (
                <>
                  {space.id !== activeId && (
                    <button className={styles.rowBtn} onClick={() => switchSpace(space.id)}>{t('settings.openSpace')}</button>
                  )}
                  {!space.builtin && (
                    <button className={styles.rowBtn} disabled={readOnly} onClick={() => { setRenamingId(space.id); setRenameDraft(space.name); setConfirmDeleteId(null); }}>{t('settings.renameSpace')}</button>
                  )}
                  {!space.builtin && (
                    <button className={`${styles.rowBtn} ${styles.rowBtnDelete}`} disabled={readOnly} onClick={() => { setConfirmDeleteId(space.id); setRenamingId(null); }}>{t('common.delete')}</button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.spaceCreate}>
        <input
          className={styles.editorInput}
          placeholder={t('settings.newSpaceName')}
          value={newName}
          maxLength={60}
          disabled={atLimit || readOnly}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) create(); }}
        />
        <button className={styles.addBtn} disabled={atLimit || readOnly || !newName.trim()} onClick={create}>
          {t('settings.createSpace')}
        </button>
      </div>
      {atLimit && (
        <p className={styles.sectionDesc} style={{ marginTop: 8 }}>
          {t('settings.spaceLimit', { count: limit })}
        </p>
      )}
      {error && <p className={styles.spaceError}>{error}</p>}
    </>
  );
}

// ── Web clipper bookmarklet ───────────────────────────────────────────────────

function ClipperBookmarklet() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const origin = window.location.origin;
  const code = `javascript:void(window.open('${origin}/clip?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank'))`;

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <a
        href={code}
        onClick={(e) => e.preventDefault()}
        draggable
        style={{
          padding: '8px 16px', border: '1px solid var(--accent)', borderRadius: 10,
          color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', cursor: 'grab',
        }}
        title={t('settings.clipperDrag')}
      >
        {t('settings.clipperName')}
      </a>
      <button
        style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line, #ddd)', background: 'none', cursor: 'pointer' }}
        onClick={() => {
          navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }).catch(() => {});
        }}
      >
        {copied ? t('settings.clipperCopied') : t('settings.clipperCopy')}
      </button>
    </div>
  );
}

// ── Backup and restore ───────────────────────────────────────────────────────

function DataBackupSection({ readOnly }: { readOnly: boolean }) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [policy, setPolicy] = useState<RestoreConflictPolicy>('skip');
  const [restoreSettings, setRestoreSettings] = useState(false);
  const [preview, setPreview] = useState<RestoreResult | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [working, setWorking] = useState<'export' | 'preview' | 'restore' | ''>('');
  const [error, setError] = useState('');

  const runRestore = async (dryRun: boolean) => {
    if (!file) return;
    setWorking(dryRun ? 'preview' : 'restore');
    setError('');
    try {
      const next = await restoreVaultBackup(file, { policy, dryRun, restoreSettings });
      if (dryRun) { setPreview(next); setResult(null); }
      else { setResult(next); setPreview(null); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.operationFailed'));
    } finally {
      setWorking('');
    }
  };

  const download = async () => {
    setWorking('export');
    setError('');
    try {
      const { blob, filename } = await exportVaultBackup();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('settings.operationFailed'));
    } finally {
      setWorking('');
    }
  };

  const summary = (value: RestoreResult) => t('settings.restoreSummary', {
    total: value.total,
    created: value.created,
    overwritten: value.overwritten,
    renamed: value.renamed,
    skipped: value.skipped,
  });

  return (
    <div className={styles.dataTools}>
      <div className={styles.dataExport}>
        <button className={styles.addBtn} onClick={() => void download()} disabled={!!working}>
          {working === 'export' ? t('settings.exporting') : t('settings.exportBackup')}
        </button>
        <span>{t('settings.exportBackupDesc')}</span>
      </div>
      <div className={styles.restoreGrid}>
        <label className={styles.editorField}>
          <span className={styles.editorLabel}>{t('settings.backupFile')}</span>
          <input
            className={styles.editorInput}
            type="file"
            accept="application/json,.json"
            disabled={readOnly || !!working}
            onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setResult(null); }}
          />
        </label>
        <label className={styles.editorField}>
          <span className={styles.editorLabel}>{t('settings.conflictPolicy')}</span>
          <select className={styles.editorInput} value={policy} disabled={readOnly || !!working} onChange={(event) => {
            setPolicy(event.target.value as RestoreConflictPolicy);
            setPreview(null);
          }}>
            <option value="skip">{t('settings.policySkip')}</option>
            <option value="rename">{t('settings.policyRename')}</option>
            <option value="overwrite">{t('settings.policyOverwrite')}</option>
          </select>
        </label>
      </div>
      <label className={styles.restoreSettings}>
        <input type="checkbox" checked={restoreSettings} disabled={readOnly || !!working} onChange={(event) => { setRestoreSettings(event.target.checked); setPreview(null); }} />
        <span>{t('settings.restoreSettings')}</span>
      </label>
      <div className={styles.dataActions}>
        <button className={styles.rowBtn} disabled={!file || readOnly || !!working} onClick={() => void runRestore(true)}>
          {working === 'preview' ? t('settings.previewing') : t('settings.previewRestore')}
        </button>
        <button className={`${styles.rowBtn} ${styles.restoreButton}`} disabled={!preview || readOnly || !!working} onClick={() => void runRestore(false)}>
          {working === 'restore' ? t('settings.restoring') : t('settings.restoreNow')}
        </button>
      </div>
      {preview && <p className={styles.restoreResult}>{t('settings.previewResult')}: {summary(preview)}</p>}
      {result && <p className={styles.restoreResult}>{t('settings.restoreComplete')}: {summary(result)}</p>}
      {error && <p className={styles.spaceError}>{error}</p>}
    </div>
  );
}

// ── Settings page ─────────────────────────────────────────────────────────────

type FilterMode = GuidanceMode | 'all';

export default function SettingsPage({
  templates,
  onTemplatesChange,
  userSettings,
  readOnly,
}: {
  templates: GuidanceTemplate[];
  onTemplatesChange: (updated: GuidanceTemplate[]) => void;
  userSettings?: Record<string, unknown>;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterMode>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ label: string; text: string; mode: GuidanceMode; color?: string } | null>(null);
  const [newDraft, setNewDraft] = useState<{ label: string; text: string; mode: GuidanceMode; color?: string } | null>(null);

  function commit(updated: GuidanceTemplate[]) {
    saveTemplates(updated);
    onTemplatesChange(updated);
  }

  function startEdit(tpl: GuidanceTemplate) {
    setEditingId(tpl.id);
    setEditDraft({ label: tpl.label, text: tpl.text, mode: tpl.mode, color: tpl.color ?? '' });
    setNewDraft(null);
  }

  function saveEdit() {
    if (!editingId || !editDraft) return;
    commit(updateTemplate(templates, editingId, editDraft));
    setEditingId(null);
    setEditDraft(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  function startNew() {
    setNewDraft({ label: '', text: '', mode: 'research', color: '' });
    setEditingId(null);
    setEditDraft(null);
  }

  function saveNew() {
    if (!newDraft || !newDraft.label.trim() || !newDraft.text.trim()) return;
    commit(addTemplate(templates, newDraft));
    setNewDraft(null);
  }

  function handleDelete(tpl: GuidanceTemplate) {
    if (!window.confirm(t('settings.deleteConfirm', { label: tpl.label }))) return;
    commit(deleteTemplate(templates, tpl.id));
  }

  const visible = filter === 'all'
    ? templates
    : templates.filter((tpl) => tpl.mode === filter);

  const filters: { key: FilterMode; label: string }[] = [
    { key: 'all', label: t('common.all') },
    { key: 'research', label: t('settings.modeResearch') },
    { key: 'link', label: t('settings.modeLink') },
    { key: 'both', label: t('settings.modeBoth') },
  ];

  return (
    <div className={styles.page}>
      <div className="crumbs"><span>{t('settings.title')}</span></div>

      <div className={styles.head}>
        <h1>{t('settings.title')}</h1>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>{t('settings.language')}</h2>
            <p className={styles.sectionDesc}>{t('settings.languageDesc')}</p>
          </div>
        </div>
        <LanguageSwitcher />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>{t('settings.featuresTitle')}</h2>
            <p className={styles.sectionDesc}>{t('settings.featuresDesc')}</p>
          </div>
        </div>
        <FeatureTogglesSection userSettings={userSettings} readOnly={readOnly} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>{t('settings.spacesTitle')}</h2>
            <p className={styles.sectionDesc}>{t('settings.spacesDesc')}</p>
          </div>
        </div>
        <SpacesSection readOnly={readOnly} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>{t('settings.clipperTitle')}</h2>
            <p className={styles.sectionDesc}>{t('settings.clipperDesc')}</p>
          </div>
        </div>
        <ClipperBookmarklet />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>{t('settings.dataTitle')}</h2>
            <p className={styles.sectionDesc}>{t('settings.dataDesc')}</p>
          </div>
        </div>
        <DataBackupSection readOnly={readOnly} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>{t('settings.guidanceTemplates')}</h2>
            <p className={styles.sectionDesc}>{t('settings.guidanceDesc')}</p>
          </div>
          <button className={styles.addBtn} onClick={startNew}>{t('settings.addTemplate')}</button>
        </div>

        <div className={styles.filterTabs}>
          {filters.map(({ key, label }) => (
            <button
              key={key}
              className={`${styles.filterTab}${filter === key ? ` ${styles.active}` : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={styles.templateList}>
          {newDraft !== null && (
            <TemplateEditor
              value={newDraft}
              onChange={(patch) => setNewDraft((d) => d ? { ...d, ...patch } : d)}
              onSave={saveNew}
              onCancel={() => setNewDraft(null)}
            />
          )}

          {visible.map((tpl) =>
            editingId === tpl.id && editDraft ? (
              <TemplateEditor
                key={tpl.id}
                value={editDraft}
                onChange={(patch) => setEditDraft((d) => d ? { ...d, ...patch } : d)}
                onSave={saveEdit}
                onCancel={cancelEdit}
              />
            ) : (
              <TemplateRow
                key={tpl.id}
                template={tpl}
                onEdit={() => startEdit(tpl)}
                onDelete={() => handleDelete(tpl)}
              />
            ),
          )}

          {visible.length === 0 && newDraft === null && (
            <div className={styles.empty}>
              {filter !== 'all'
                ? t('settings.noTemplatesFilter', { filter })
                : t('settings.noTemplates')}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
