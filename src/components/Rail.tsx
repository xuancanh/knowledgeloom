import { useLocation } from 'react-router-dom';
import { categoryLabel, type CategoryTreeNode, type UiCategory } from '../lib/view';

const TAG_INITIAL_LIMIT = 18;

function renderCategoryNode(
  node: CategoryTreeNode,
  activeCategoryId: string | null,
  openCategory: (id: string) => void,
  closeRail: () => void,
): React.ReactNode {
  return (
    <div key={node.id} className="category-tree-node">
      <button
        className={`nav-item category-nav depth-${Math.min(node.depth, 4)}${activeCategoryId === node.id ? ' active' : ''}`}
        onClick={() => { openCategory(node.id); closeRail(); }}
        title={node.id}
      >
        <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>{node.children.length ? '▸' : '·'}</span>
        <span className={`dot ${node.color}`} />
        <span style={{ flex: 1, textAlign: 'left' }}>{node.label}</span>
        <span className="count">{node.count}</span>
      </button>
      {!!node.children.length && (
        <div className="category-tree-children">
          {node.children.map((child) => renderCategoryNode(child, activeCategoryId, openCategory, closeRail))}
        </div>
      )}
    </div>
  );
}

export default function Rail({
  categories,
  categoryTree,
  flashcardCount,
  inFlightCount,
  catSearch,
  tagSearch,
  tagCounts,
  railOpen,
  onCatSearchChange,
  onTagSearchChange,
  onHome,
  onSearch,
  onActivity,
  onFlashcards,
  onSettings,
  openCategory,
  openTag,
  closeRail,
}: {
  categories: UiCategory[];
  categoryTree: CategoryTreeNode[];
  flashcardCount: number;
  inFlightCount: number;
  catSearch: string;
  tagSearch: string;
  tagCounts: [string, number][];
  railOpen: boolean;
  onCatSearchChange: (v: string) => void;
  onTagSearchChange: (v: string) => void;
  onHome: () => void;
  onSearch: () => void;
  onActivity: () => void;
  onFlashcards: () => void;
  onSettings: () => void;
  openCategory: (id: string) => void;
  openTag: (tag: string) => void;
  closeRail: () => void;
}) {
  const location = useLocation();
  const path = location.pathname;

  const isHome = path === '/';
  const isActivity = path === '/activity';
  const isFlashcards = path.startsWith('/flashcards');
  const isSettings = path === '/settings';
  const activeCategoryId = path.startsWith('/categories/')
    ? path.slice('/categories/'.length).split('/').map(decodeURIComponent).join('/')
    : null;
  const activeTag = path.startsWith('/tags/')
    ? decodeURIComponent(path.slice('/tags/'.length))
    : null;

  const filteredCategories = (() => {
    const q = catSearch.trim().toLowerCase();
    if (!q) return null;
    return categories.filter((cat) => cat.id.toLowerCase().includes(q));
  })();

  const filteredTags = tagSearch
    ? tagCounts.filter(([tag]) => tag.toLowerCase().includes(tagSearch.trim().toLowerCase()))
    : tagCounts;
  const visibleTags = tagSearch ? filteredTags : filteredTags.slice(0, TAG_INITIAL_LIMIT);
  const hiddenTagCount = tagSearch ? 0 : Math.max(0, tagCounts.length - TAG_INITIAL_LIMIT);

  return (
    <aside className={`rail${railOpen ? ' rail-open' : ''}`}>
      <div className="rail-head">
        <div className="wordmark">
          <span className="mark" />
          <span className="name">Knowledge <em>Loom</em></span>
        </div>
        <div className="rail-sub">a desk for things you just learned</div>
        <button className="rail-close" onClick={closeRail} aria-label="Close menu">✕</button>
      </div>

      <nav className="rail-nav">
        <div className="rail-nav-group">
          <button className={`nav-item${isHome ? ' active' : ''}`} onClick={() => { onHome(); closeRail(); }}>
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>✦</span> Capture
            <span className="kbd">/</span>
          </button>
          <button className="nav-item" onClick={() => { onSearch(); closeRail(); }}>
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>⌕</span> Search
            <span className="kbd">⌘K</span>
          </button>
          <button
            className={`nav-item activity-nav${isActivity ? ' active' : ''}${inFlightCount ? ' researching' : ''}`}
            onClick={() => { onActivity(); closeRail(); }}
          >
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>◷</span> Activity
            <span className="count">{inFlightCount}</span>
          </button>
          <button className={`nav-item${isFlashcards ? ' active' : ''}`} onClick={() => { onFlashcards(); closeRail(); }}>
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>▧</span> Flashcards
            <span className="count">{flashcardCount}</span>
          </button>
          <button className={`nav-item${isSettings ? ' active' : ''}`} onClick={() => { onSettings(); closeRail(); }}>
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>⚙</span> Settings
          </button>
        </div>

        <div className="rail-section-head">
          <span className="rail-section-label">Categories</span>
          <span className="rail-section-count">{categories.length}</span>
        </div>
        <div className="rail-filter-wrap">
          <span className="rail-filter-icon">⌕</span>
          <input
            className="rail-filter"
            placeholder="Filter categories…"
            value={catSearch}
            onChange={(e) => onCatSearchChange(e.target.value)}
            spellCheck={false}
          />
          {catSearch && (
            <button className="rail-filter-clear" onClick={() => onCatSearchChange('')} aria-label="Clear">✕</button>
          )}
        </div>

        {filteredCategories ? (
          filteredCategories.length > 0 ? (
            filteredCategories.map((cat) => {
              const label = categoryLabel(cat.name);
              const parentPath = cat.id.includes('/') ? cat.id.slice(0, cat.id.lastIndexOf('/')) : '';
              return (
                <button
                  key={cat.id}
                  className={`nav-item${activeCategoryId === cat.id ? ' active' : ''}`}
                  onClick={() => { openCategory(cat.id); onCatSearchChange(''); closeRail(); }}
                  title={cat.id}
                >
                  <span className={`dot ${cat.color}`} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    {parentPath && <span className="rail-filter-path">{parentPath}</span>}
                  </span>
                  <span className="count">{cat.count}</span>
                </button>
              );
            })
          ) : (
            <div className="rail-empty">No categories match</div>
          )
        ) : (
          categoryTree.map((node) => renderCategoryNode(node, activeCategoryId, openCategory, closeRail))
        )}

        <div className="rail-section-head">
          <span className="rail-section-label">Tags</span>
          <span className="rail-section-count">{tagCounts.length}</span>
        </div>
        <div className="rail-filter-wrap">
          <span className="rail-filter-icon">⌕</span>
          <input
            className="rail-filter"
            placeholder="Filter tags…"
            value={tagSearch}
            onChange={(e) => onTagSearchChange(e.target.value)}
            spellCheck={false}
          />
          {tagSearch && (
            <button className="rail-filter-clear" onClick={() => onTagSearchChange('')} aria-label="Clear">✕</button>
          )}
        </div>

        {filteredTags.length === 0 && tagSearch ? (
          <div className="rail-empty">No tags match</div>
        ) : (
          visibleTags.map(([tag, count]) => (
            <button
              key={tag}
              className={`nav-item${activeTag === tag ? ' active' : ''}`}
              onClick={() => { openTag(tag); closeRail(); }}
            >
              <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0, fontFamily: 'monospace' }}>#</span>
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span>
              <span className="count">{count}</span>
            </button>
          ))
        )}
        {hiddenTagCount > 0 && (
          <div className="rail-more">+{hiddenTagCount} more — search to filter</div>
        )}
      </nav>
    </aside>
  );
}
