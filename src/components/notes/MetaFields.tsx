import { useRef, useState, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { UiCategory } from '../../lib/view';

// ── Category input with searchable dropdown ────────────────────────────────

function CategoryInput({
  category,
  onChange,
  categories,
  disabled,
}: {
  category: string;
  onChange: (v: string) => void;
  categories: UiCategory[];
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = categories
    .filter((c) => {
      if (!category.trim()) return true;
      const q = category.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
    })
    .slice(0, 10);

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    if (e.key === 'Enter' && suggestions.length === 1) { e.preventDefault(); pick(suggestions[0].name); }
  }

  return (
    <div className="mf-row mf-category-row">
      <span className="mf-row-icon" aria-hidden>⊟</span>
      <input
        ref={inputRef}
        className="mf-cat-input"
        value={category}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKey}
        placeholder={t('notes.categoryPlaceholder')}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
      />
      {open && !disabled && suggestions.length > 0 && (
        <div className="mf-dropdown">
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`mf-dropdown-item${c.name === category ? ' mf-dropdown-item--active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(c.name); }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tag chip input with suggestions ───────────────────────────────────────

function TagChipInput({
  tags,
  onChange,
  disabled,
  tagOptions = [],
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  tagOptions?: string[];
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = tagOptions
    .filter((t) => !tags.includes(t) && (input.trim() ? t.includes(input.trim().toLowerCase()) : true))
    .slice(0, 8);

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag || tags.includes(tag)) { setInput(''); return; }
    onChange([...tags, tag]);
    setInput('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input); }
    else if (e.key === 'Backspace' && input === '' && tags.length > 0) removeTag(tags[tags.length - 1]);
    else if (e.key === 'Escape') setSuggestOpen(false);
  }

  return (
    <div
      className="mf-row mf-tag-row"
      onClick={() => inputRef.current?.focus()}
    >
      <span className="mf-row-icon" aria-hidden>#</span>
      <div className="mf-chips">
        {tags.map((tag) => (
          <span key={tag} className="mf-chip">
            {tag}
            {!disabled && (
              <button
                type="button"
                className="mf-chip-remove"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); removeTag(tag); }}
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            ref={inputRef}
            className="mf-tag-input"
            value={input}
            onChange={(e) => { setInput(e.target.value); setSuggestOpen(true); }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => { if (input.trim()) addTag(input); setSuggestOpen(false); }, 120)}
            onKeyDown={handleKey}
            placeholder={tags.length === 0 ? t('notes.addTagPlaceholder') : ''}
            aria-label="New tag"
          />
        )}
      </div>
      {suggestOpen && !disabled && suggestions.length > 0 && (
        <div className="mf-dropdown">
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              className="mf-dropdown-item"
              onMouseDown={(e) => { e.preventDefault(); addTag(t); setSuggestOpen(false); }}
            >
              #{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MetaFields ─────────────────────────────────────────────────────────────

export default function MetaFields({
  category,
  onCategoryChange,
  tags,
  onTagsChange,
  categories = [],
  tagOptions = [],
  disabled = false,
  compact = false,
}: {
  category: string;
  onCategoryChange: (v: string) => void;
  tags: string[];
  onTagsChange: (v: string[]) => void;
  categories?: UiCategory[];
  tagOptions?: string[];
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`meta-fields${compact ? ' meta-fields--compact' : ''}`}>
      <CategoryInput
        category={category}
        onChange={onCategoryChange}
        categories={categories}
        disabled={disabled}
      />
      <TagChipInput
        tags={tags}
        onChange={onTagsChange}
        disabled={disabled}
        tagOptions={tagOptions}
      />
    </div>
  );
}

export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean))];
}

export function tagsToString(tags: string[]): string {
  return tags.join(', ');
}
