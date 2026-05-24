import { useRef, useState, KeyboardEvent } from 'react';
import type { UiCategory } from '../../lib/view';

// ── Tag chip input ─────────────────────────────────────────────────────────────

function TagChipInput({
  tags,
  onChange,
  disabled,
  placeholder = 'Add tag…',
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  function handleBlur() {
    if (input.trim()) addTag(input);
  }

  return (
    <div
      className="mf-tag-wrap"
      onClick={() => inputRef.current?.focus()}
      role="group"
      aria-label="Tags"
    >
      <span className="mf-field-icon">🏷</span>
      <div className="mf-chips">
        {tags.map((tag) => (
          <span key={tag} className="mf-chip">
            #{tag}
            {!disabled && (
              <button
                type="button"
                className="mf-chip-remove"
                onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                aria-label={`Remove tag ${tag}`}
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
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            onBlur={handleBlur}
            placeholder={tags.length === 0 ? placeholder : ''}
            aria-label="New tag"
          />
        )}
      </div>
    </div>
  );
}

// ── MetaFields ─────────────────────────────────────────────────────────────────

export default function MetaFields({
  category,
  onCategoryChange,
  tags,
  onTagsChange,
  categories = [],
  disabled = false,
  compact = false,
}: {
  category: string;
  onCategoryChange: (v: string) => void;
  tags: string[];
  onTagsChange: (v: string[]) => void;
  categories?: UiCategory[];
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`meta-fields${compact ? ' meta-fields--compact' : ''}`}>
      <div className="mf-category">
        <span className="mf-field-icon">📁</span>
        <input
          className="mf-cat-input"
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          list="mf-category-list"
          placeholder="Category / Subcategory"
          disabled={disabled}
          aria-label="Category"
          spellCheck={false}
        />
        <datalist id="mf-category-list">
          {categories.map((c) => <option key={c.id} value={c.name} />)}
        </datalist>
      </div>

      <div className="mf-divider" />

      <TagChipInput
        tags={tags}
        onChange={onTagsChange}
        disabled={disabled}
        placeholder="Add tag…"
      />
    </div>
  );
}

/** Parse a comma-separated tag string into a clean array. */
export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean))];
}

/** Serialise a tag array back to comma-separated string. */
export function tagsToString(tags: string[]): string {
  return tags.join(', ');
}
