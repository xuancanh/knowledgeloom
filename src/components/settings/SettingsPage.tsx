import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { patchSettings } from '../../api';
import { getFeatures, DEFAULT_FEATURES, FEATURE_LABELS, type FeatureToggles } from '../../lib/features';
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

function FeatureTogglesSection({ userSettings }: { userSettings?: Record<string, unknown> }) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {(Object.keys(DEFAULT_FEATURES) as (keyof FeatureToggles)[]).map((key) => (
        <label
          key={key}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={local[key]}
            onChange={() => void toggle(key)}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>{FEATURE_LABELS[key].label}</strong>
            <br />
            <span style={{ fontSize: '0.85rem', color: 'var(--ink-soft, #777)' }}>
              {FEATURE_LABELS[key].description}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

// ── Web clipper bookmarklet ───────────────────────────────────────────────────

function ClipperBookmarklet() {
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
        title="Drag me to your bookmarks bar"
      >
        ✂ Clip to Loom
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
        {copied ? 'Copied ✓' : 'Copy bookmarklet code'}
      </button>
    </div>
  );
}

// ── Settings page ─────────────────────────────────────────────────────────────

type FilterMode = GuidanceMode | 'all';

export default function SettingsPage({
  templates,
  onTemplatesChange,
  userSettings,
}: {
  templates: GuidanceTemplate[];
  onTemplatesChange: (updated: GuidanceTemplate[]) => void;
  userSettings?: Record<string, unknown>;
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
            <h2 className={styles.sectionTitle}>Features</h2>
            <p className={styles.sectionDesc}>
              Turn off the learning features you don't use. Disabled features disappear
              from navigation, and turning off flashcards or quizzes also stops their AI
              generation for new notes (existing material is kept and comes back if you
              re-enable).
            </p>
          </div>
        </div>
        <FeatureTogglesSection userSettings={userSettings} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Web clipper</h2>
            <p className={styles.sectionDesc}>
              Drag this bookmarklet to your bookmarks bar. Clicking it on any page sends
              that page to Knowledge Loom as an AI link capture.
            </p>
          </div>
        </div>
        <ClipperBookmarklet />
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
