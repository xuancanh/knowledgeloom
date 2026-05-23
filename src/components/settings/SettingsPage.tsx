import { useState } from 'react';
import {
  addTemplate,
  deleteTemplate,
  saveTemplates,
  updateTemplate,
  type GuidanceMode,
  type GuidanceTemplate,
} from '../../lib/guidance';
import styles from './SettingsPage.module.css';

/** Maps template modes to display labels for the settings UI. */
const MODE_LABELS: Record<GuidanceMode, string> = {
  research: 'Research',
  link: 'From Link',
  both: 'Both',
};

function modeCls(mode: GuidanceMode) {
  if (mode === 'research') return styles.modeResearch;
  if (mode === 'link') return styles.modeLink;
  return styles.modeBoth;
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
  return (
    <div className={styles.row}>
      <div className={styles.rowBody}>
        <div className={styles.rowHeader}>
          <span className={styles.rowLabel}>{template.label}</span>
          <span className={`${styles.rowMode} ${modeCls(template.mode)}`}>{MODE_LABELS[template.mode]}</span>
          {template.builtIn && <span className={styles.rowBuiltIn}>built-in</span>}
        </div>
        <div className={styles.rowText}>{template.text}</div>
      </div>
      <div className={styles.rowActions}>
        <button className={styles.rowBtn} onClick={onEdit}>Edit</button>
        <button className={`${styles.rowBtn} ${styles.rowBtnDelete}`} onClick={onDelete}>Delete</button>
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
  value: { label: string; text: string; mode: GuidanceMode };
  onChange: (patch: Partial<{ label: string; text: string; mode: GuidanceMode }>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const valid = value.label.trim().length > 0 && value.text.trim().length > 0;
  return (
    <div className={styles.editor}>
      <div className={styles.editorRow}>
        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Label</label>
          <input
            className={styles.editorInput}
            value={value.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="e.g. Deep reference"
            autoFocus
          />
        </div>
        <div className={styles.editorField}>
          <label className={styles.editorLabel}>Applies to</label>
          <div className={styles.editorModeGroup}>
            {(['research', 'link', 'both'] as GuidanceMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`${styles.editorModeBtn}${value.mode === m ? ` ${styles.active}` : ''}`}
                onClick={() => onChange({ mode: m })}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.editorField}>
        <label className={styles.editorLabel}>Instructions text</label>
        <textarea
          className={styles.editorTextarea}
          value={value.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="e.g. Write as an in-depth technical reference with implementation details and code examples."
          rows={3}
        />
      </div>
      <div className={styles.editorActions}>
        <button className={styles.editorCancel} onClick={onCancel}>Cancel</button>
        <button className={styles.editorSave} onClick={onSave} disabled={!valid}>Save template</button>
      </div>
    </div>
  );
}

// ── Settings page ─────────────────────────────────────────────────────────────

type FilterMode = GuidanceMode | 'all';

export default function SettingsPage({
  templates,
  onTemplatesChange,
}: {
  templates: GuidanceTemplate[];
  onTemplatesChange: (updated: GuidanceTemplate[]) => void;
}) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ label: string; text: string; mode: GuidanceMode } | null>(null);
  const [newDraft, setNewDraft] = useState<{ label: string; text: string; mode: GuidanceMode } | null>(null);

  function commit(updated: GuidanceTemplate[]) {
    saveTemplates(updated);
    onTemplatesChange(updated);
  }

  function startEdit(tpl: GuidanceTemplate) {
    setEditingId(tpl.id);
    setEditDraft({ label: tpl.label, text: tpl.text, mode: tpl.mode });
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
    setNewDraft({ label: '', text: '', mode: 'research' });
    setEditingId(null);
    setEditDraft(null);
  }

  function saveNew() {
    if (!newDraft || !newDraft.label.trim() || !newDraft.text.trim()) return;
    commit(addTemplate(templates, newDraft));
    setNewDraft(null);
  }

  function handleDelete(tpl: GuidanceTemplate) {
    if (!window.confirm(`Delete "${tpl.label}"?`)) return;
    commit(deleteTemplate(templates, tpl.id));
  }

  const visible = filter === 'all'
    ? templates
    : templates.filter((t) => t.mode === filter);

  const filters: { key: FilterMode; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'research', label: 'Research' },
    { key: 'link', label: 'From Link' },
    { key: 'both', label: 'Both' },
  ];

  return (
    <div className={styles.page}>
      <div className="crumbs"><span>Settings</span></div>

      <div className={styles.head}>
        <h1>Settings</h1>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Guidance Templates</h2>
            <p className={styles.sectionDesc}>
              Quick-select writing instructions for Codex. Appear as chips in the Research and Generate from Link capture forms.
            </p>
          </div>
          <button className={styles.addBtn} onClick={startNew}>+ Add template</button>
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
              No templates{filter !== 'all' ? ` for ${filter} mode` : ''}. Click "+ Add template" to create one.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
