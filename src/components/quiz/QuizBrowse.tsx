import { useMemo, useState, useRef, useEffect } from 'react';
import type { QuizQuestion, QuizQuestionType } from '../../types';
import type { UiCategory } from '../../lib/view';
import { QUIZ_TYPE_LABELS, QUIZ_TYPE_COLORS } from './constants';

function nextReviewLabel(nextReviewAt: string | null | undefined): string {
  if (!nextReviewAt) return 'New';
  const diff = Date.parse(nextReviewAt) - Date.now();
  if (diff <= 0) return 'Due now';
  const days = Math.ceil(diff / 86_400_000);
  return days === 1 ? 'Tomorrow' : `${days}d`;
}

function MultiSelectDropdown({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: Array<{ id: string; label: string; count: number }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function toggle(itemId: string) {
    if (selected.includes(itemId)) onChange(selected.filter((id) => id !== itemId));
    else onChange([...selected, itemId]);
  }

  return (
    <div className="fc-multi" ref={ref}>
      <button className="fc-multi-trigger" onClick={() => setOpen(!open)}>
        {label}{selected.length > 0 ? ` (${selected.length})` : ''} ▾
      </button>
      {open && (
        <div className="fc-multi-dropdown">
          {items.length === 0 && <div className="fc-multi-empty">None</div>}
          {items.map((item) => (
            <label key={item.id} className="fc-multi-item">
              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
              <span className="fc-multi-name">{item.label}</span>
              <span className="fc-multi-count">{item.count}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const ALL_TYPES: QuizQuestionType[] = ['fill-blank', 'multiple-choice', 'short-answer'];

export default function QuizBrowse({
  questions,
  categories,
  tagCounts,
  activeCategories,
  activeTags,
  activeTypes,
  search,
  onSearchChange,
  onCategoriesChange,
  onTagsChange,
  onToggleType,
  onStudy,
  onHide,
}: {
  questions: QuizQuestion[];
  categories: UiCategory[];
  tagCounts: [string, number][];
  activeCategories: string[];
  activeTags: string[];
  activeTypes: QuizQuestionType[];
  search: string;
  onSearchChange: (v: string) => void;
  onCategoriesChange: (ids: string[]) => void;
  onTagsChange: (ids: string[]) => void;
  onToggleType: (t: QuizQuestionType) => void;
  onStudy: () => void;
  onHide: (id: string) => void;
}) {
  const [confirmHide, setConfirmHide] = useState<string | null>(null);

  const dueCount = useMemo(() => questions.filter((q) => {
    const n = q.reviewData?.nextReviewAt;
    return !n || Date.parse(n) <= Date.now();
  }).length, [questions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return questions.filter((qn) => {
      if (activeCategories.length && !activeCategories.includes(qn.category)) return false;
      if (activeTags.length && !activeTags.some((t) => qn.tags.includes(t))) return false;
      if (activeTypes.length && !activeTypes.includes(qn.type)) return false;
      if (!q) return true;
      return (qn.question + ' ' + qn.answer + ' ' + qn.noteTitle).toLowerCase().includes(q);
    });
  }, [questions, activeCategories, activeTags, activeTypes, search]);

  const catOptions = useMemo(
    () => categories.map((c) => ({ id: c.name, label: c.name, count: questions.filter((q) => q.category === c.name).length })),
    [categories, questions],
  );
  const tagOptions = useMemo(
    () => tagCounts.map(([t]) => ({ id: t, label: t, count: questions.filter((q) => q.tags.includes(t)).length })),
    [tagCounts, questions],
  );

  return (
    <div className="qz-browse">
      <div className="qz-browse-head">
        <div className="qz-browse-title-row">
          <h1 className="qz-browse-title">Quiz</h1>
          <button className="qz-study-btn" onClick={onStudy} disabled={filtered.length === 0}>
            {dueCount > 0 ? `Study ${dueCount} due` : 'Study all'}
          </button>
        </div>

        {/* Type toggles — always one row */}
        <div className="qz-filter-row qz-filter-row--types">
          {ALL_TYPES.map((t) => {
            const active = activeTypes.includes(t);
            return (
              <button
                key={t}
                className={`qz-filter-chip${active ? ' active' : ''}`}
                style={active ? { borderColor: QUIZ_TYPE_COLORS[t], color: QUIZ_TYPE_COLORS[t], background: `color-mix(in srgb, ${QUIZ_TYPE_COLORS[t]} 8%, var(--surface))` } : undefined}
                onClick={() => onToggleType(t)}
              >
                <span className="qz-chip-dot" style={{ background: QUIZ_TYPE_COLORS[t] }} />
                {QUIZ_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>

        {/* Search + category/tag dropdowns */}
        <div className="qz-scope-bar">
          <div className="qz-search-box">
            <span className="qz-search-icon">⌕</span>
            <input
              className="qz-search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search questions…"
              spellCheck={false}
            />
            {search && (
              <button className="qz-search-clear" onClick={() => onSearchChange('')} aria-label="Clear">✕</button>
            )}
          </div>
          <MultiSelectDropdown label="Category" items={catOptions} selected={activeCategories} onChange={onCategoriesChange} />
          <MultiSelectDropdown label="Tag" items={tagOptions} selected={activeTags} onChange={onTagsChange} />
        </div>

        {/* Active filter chips */}
        {(activeCategories.length > 0 || activeTags.length > 0) && (
          <div className="fc-active-filters">
            {activeCategories.map((cat) => (
              <span key={cat} className="fc-filter-chip">
                {cat}
                <button onClick={() => onCategoriesChange(activeCategories.filter((c) => c !== cat))}>✕</button>
              </span>
            ))}
            {activeTags.map((tag) => (
              <span key={tag} className="fc-filter-chip">
                #{tag}
                <button onClick={() => onTagsChange(activeTags.filter((t) => t !== tag))}>✕</button>
              </span>
            ))}
            {(activeCategories.length + activeTags.length) > 1 && (
              <button className="fc-filter-clear" onClick={() => { onCategoriesChange([]); onTagsChange([]); }}>
                Clear all
              </button>
            )}
          </div>
        )}

        <div className="qz-browse-meta">
          <span>{filtered.length} question{filtered.length !== 1 ? 's' : ''}</span>
          {dueCount > 0 && <span className="qz-due-badge">{dueCount} due</span>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          {questions.length === 0
            ? 'No quiz questions yet. Create or update a note to generate questions.'
            : 'No questions match your filters.'}
        </div>
      ) : (
        <div className="qz-list">
          {filtered.map((q) => {
            const typeColor = QUIZ_TYPE_COLORS[q.type];
            const label = nextReviewLabel(q.reviewData?.nextReviewAt);
            const isDue = !q.reviewData?.nextReviewAt || Date.parse(q.reviewData.nextReviewAt) <= Date.now();
            return (
              <div key={q.id} className="qz-row">
                <div className="qz-row-type" style={{ color: typeColor }}>
                  <span className="qz-dot" style={{ background: typeColor }} />
                  <span>{QUIZ_TYPE_LABELS[q.type]}</span>
                </div>
                <div className="qz-row-body">
                  <div className="qz-row-question">
                    {q.type === 'fill-blank'
                      ? q.question.replace('___', '▢')
                      : q.question}
                  </div>
                  <div className="qz-row-meta">
                    <span className="qz-row-note">{q.noteTitle}</span>
                    {q.category && <span className="qz-row-cat">{q.category}</span>}
                  </div>
                </div>
                <div className="qz-row-right">
                  <span className={`qz-review-label${isDue ? ' due' : ''}`}>{label}</span>
                  {confirmHide === q.id ? (
                    <span className="qz-confirm-hide">
                      <button className="qz-confirm-yes" onClick={() => { onHide(q.id); setConfirmHide(null); }}>Hide</button>
                      <button className="qz-confirm-no" onClick={() => setConfirmHide(null)}>Cancel</button>
                    </span>
                  ) : (
                    <button className="qz-hide-btn" onClick={() => setConfirmHide(q.id)} title="Hide question">✕</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
