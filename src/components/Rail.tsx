import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { categoryLabel, type CategoryTreeNode, type UiCategory } from '../lib/view';
import LanguageSwitcher from './LanguageSwitcher';

const CAT_INITIAL_LIMIT = 5;
const TAG_INITIAL_LIMIT = 5;

function CategoryNode({
  node,
  activeCategoryId,
  openCategory,
  closeRail,
}: {
  node: CategoryTreeNode;
  activeCategoryId: string | null;
  openCategory: (id: string) => void;
  closeRail: () => void;
}) {
  const hasKids = node.children.length > 0;
  const isActive = activeCategoryId === node.id;
  const isAncestor = activeCategoryId !== null && activeCategoryId.startsWith(node.id + '/');
  const [expanded, setExpanded] = useState(() => node.depth === 0 || isActive || isAncestor);

  return (
    <div key={node.id} className="category-tree-node">
      <div className="cat-row">
        {hasKids ? (
          <button className="cat-toggle" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            <span className={`cat-arrow ${expanded ? 'expanded' : ''}`}>▸</span>
          </button>
        ) : (
          <span className="cat-spacer" />
        )}
        <button
          className={`nav-item category-nav${isActive ? ' active' : ''}`}
          onClick={() => { openCategory(node.id); closeRail(); }}
          title={node.id}
        >
          <span className={`dot ${node.color}`} />
          <span className="cat-label">{node.label}</span>
          <span className="count">{node.count}</span>
        </button>
      </div>
      {hasKids && expanded && (
        <div className="category-tree-children">
          {node.children.map((child) => (
            <CategoryNode
              key={child.id}
              node={child}
              activeCategoryId={activeCategoryId}
              openCategory={openCategory}
              closeRail={closeRail}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Rail({
  categories,
  categoryTree,
  flashcardCount,
  quizCount,
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
  onQuiz,
  onGraph,
  onLearn,
  onToday,
  onSettings,
  openCategory,
  openTag,
  closeRail,
  onViewAllCategories,
  onViewAllTags,
}: {
  categories: UiCategory[];
  categoryTree: CategoryTreeNode[];
  flashcardCount: number;
  quizCount: number;
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
  onQuiz: () => void;
  onGraph: () => void;
  onLearn: () => void;
  onToday: () => void;
  onSettings: () => void;
  openCategory: (id: string) => void;
  openTag: (tag: string) => void;
  closeRail: () => void;
  onViewAllCategories: () => void;
  onViewAllTags: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const path = location.pathname;

  const isHome = path === '/';
  const isActivity = path === '/activity';
  const isFlashcards = path.startsWith('/flashcards');
  const isQuiz = path.startsWith('/quiz');
  const isSettings = path === '/settings';
  const isGraph = path === '/graph';
  const isLearn = path === '/learn';
  const isToday = path === '/today';
  const activeCategoryId = path.startsWith('/categories/')
    ? path.slice('/categories/'.length).split('/').map(decodeURIComponent).join('/')
    : null;
  const activeTag = path.startsWith('/tags/')
    ? decodeURIComponent(path.slice('/tags/'.length))
    : null;

  const [catExpanded, setCatExpanded] = useState(false);
  const [tagExpanded, setTagExpanded] = useState(false);

  const filteredCategories = (() => {
    const q = catSearch.trim().toLowerCase();
    if (!q) return null;
    return categories.filter((cat) => cat.id.toLowerCase().includes(q));
  })();

  const filteredTags = tagSearch
    ? tagCounts.filter(([tag]) => tag.toLowerCase().includes(tagSearch.trim().toLowerCase()))
    : tagCounts;
  const visibleTags = tagSearch ? filteredTags : filteredTags.slice(0, tagExpanded ? undefined : TAG_INITIAL_LIMIT);
  const hiddenTagCount = tagSearch ? 0 : Math.max(0, tagCounts.length - TAG_INITIAL_LIMIT);

  const visibleCategoryTree = catSearch || catExpanded
    ? categoryTree
    : categoryTree.slice(0, CAT_INITIAL_LIMIT);
  const hiddenCatCount = catSearch
    ? 0
    : Math.max(0, categoryTree.length - CAT_INITIAL_LIMIT);

  return (
    <aside className={`rail${railOpen ? ' rail-open' : ''}`}>
      <div className="rail-head">
        <div className="wordmark">
          <span className="mark" />
          <span className="name">Knowledge <em>Loom</em></span>
        </div>
        <div className="rail-sub">{t('nav.tagline')}</div>
        <button className="rail-close" onClick={closeRail} aria-label={t('nav.closeMenu')}>✕</button>
      </div>

      <nav className="rail-nav">
        <div className="rail-nav-group">
          <button className={`nav-item${isHome ? ' active' : ''}`} onClick={() => { onHome(); closeRail(); }}>
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>✦</span> {t('nav.capture')}
            <span className="kbd">/</span>
          </button>
          <button className="nav-item" onClick={() => { onSearch(); closeRail(); }}>
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>⌕</span> {t('nav.search')}
            <span className="kbd">⌘K</span>
          </button>
          <button
            className={`nav-item activity-nav${isActivity ? ' active' : ''}${inFlightCount ? ' researching' : ''}`}
            onClick={() => { onActivity(); closeRail(); }}
          >
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>◷</span> {t('nav.activity')}
            <span className="count">{inFlightCount}</span>
          </button>
          <button className={`nav-item${isToday ? ' active' : ''}`} onClick={() => { onToday(); closeRail(); }}>
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>☀</span> Today
          </button>
          <button className={`nav-item${isFlashcards ? ' active' : ''}`} onClick={() => { onFlashcards(); closeRail(); }}>
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>▧</span> {t('nav.flashcards')}
            <span className="count">{flashcardCount}</span>
          </button>
          <button className={`nav-item${isQuiz ? ' active' : ''}`} onClick={() => { onQuiz(); closeRail(); }}>
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>?</span> {t('nav.quiz')}
            <span className="count">{quizCount}</span>
          </button>
          <button className={`nav-item${isGraph ? ' active' : ''}`} onClick={() => { onGraph(); closeRail(); }}>
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>◈</span> {t('nav.graph')}
          </button>
          <button className={`nav-item${isLearn ? ' active' : ''}`} onClick={() => { onLearn(); closeRail(); }}>
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>◷</span> Learn
          </button>
          <button className={`nav-item${isSettings ? ' active' : ''}`} onClick={() => { onSettings(); closeRail(); }}>
            <span style={{ width: 14, color: 'var(--accent)', flexShrink: 0 }}>⚙</span> {t('nav.settings')}
          </button>
        </div>

        <button className="rail-section-head" onClick={() => { onViewAllCategories(); closeRail(); }}>
          <span className="rail-section-label">{t('nav.categories')}</span>
          <span className="rail-section-count">{categories.length}</span>
          <span className="rail-section-arrow">→</span>
        </button>
        <div className="rail-filter-wrap">
          <span className="rail-filter-icon">⌕</span>
          <input
            className="rail-filter"
            placeholder={t('nav.filterCategories')}
            value={catSearch}
            onChange={(e) => onCatSearchChange(e.target.value)}
            spellCheck={false}
          />
          {catSearch && (
            <button className="rail-filter-clear" onClick={() => onCatSearchChange('')} aria-label={t('common.clear')}>✕</button>
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
            <div className="rail-empty">{t('nav.noCategoriesMatch')}</div>
          )
        ) : (
          <>
            {visibleCategoryTree.map((node) => (<CategoryNode key={node.id} node={node} activeCategoryId={activeCategoryId} openCategory={openCategory} closeRail={closeRail} />))}
            {hiddenCatCount > 0 && !catExpanded && (
              <button className="nav-item rail-expand" onClick={() => setCatExpanded(true)}>
                {t('common.moreCount', { count: hiddenCatCount })}
              </button>
            )}
            {catExpanded && !catSearch && (
              <button className="nav-item rail-expand" onClick={() => setCatExpanded(false)}>{t('common.showLess')}</button>
            )}
          </>
        )}

        <button className="rail-section-head" onClick={() => { onViewAllTags(); closeRail(); }}>
          <span className="rail-section-label">{t('nav.tags')}</span>
          <span className="rail-section-count">{tagCounts.length}</span>
          <span className="rail-section-arrow">→</span>
        </button>
        <div className="rail-filter-wrap">
          <span className="rail-filter-icon">⌕</span>
          <input
            className="rail-filter"
            placeholder={t('nav.filterTags')}
            value={tagSearch}
            onChange={(e) => onTagSearchChange(e.target.value)}
            spellCheck={false}
          />
          {tagSearch && (
            <button className="rail-filter-clear" onClick={() => onTagSearchChange('')} aria-label={t('common.clear')}>✕</button>
          )}
        </div>

        {filteredTags.length === 0 && tagSearch ? (
          <div className="rail-empty">{t('nav.noTagsMatch')}</div>
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
        {hiddenTagCount > 0 && !tagExpanded && (
          <button className="nav-item rail-expand" onClick={() => setTagExpanded(true)}>
            {t('common.moreCount', { count: hiddenTagCount })}
          </button>
        )}
        {tagExpanded && !tagSearch && (
          <button className="nav-item rail-expand" onClick={() => setTagExpanded(false)}>{t('common.showLess')}</button>
        )}

        <div className="rail-lang-wrap">
          <LanguageSwitcher compact />
        </div>
      </nav>
    </aside>
  );
}
