import { useState } from 'react';
import type { CategoryTreeNode, UiCategory } from '../../lib/view';

type ViewMode = 'tree' | 'grid';

function getColorVar(color: string): string {
  const map: Record<string, string> = {
    oxblood: 'var(--accent)', moss: 'var(--moss)',
    indigo: 'var(--indigo)', ochre: 'var(--ochre)',
    teal: 'var(--teal)', rust: 'var(--rust)',
  };
  return map[color] || 'var(--accent)';
}

function TreeNode({ node, depth, onOpenCategory }: {
  node: CategoryTreeNode;
  depth: number;
  onOpenCategory: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const color = getColorVar(node.color);
  const hasChildren = node.children.length > 0;
  const padLeft = 14 + depth * 22;

  return (
    <div className="cat-tree-node" style={{ marginLeft: depth > 0 ? 0 : 0 }}>
      <button
        className="cat-tree-row"
        onClick={() => { hasChildren ? setExpanded(!expanded) : onOpenCategory(node.id); }}
        style={{ paddingLeft: padLeft }}
      >
        {hasChildren ? (
          <span className={`cat-tree-arrow ${expanded ? 'expanded' : ''}`}>▸</span>
        ) : (
          <span className="cat-tree-dot" style={{ color }}>·</span>
        )}
        <span className={`cat-tree-name ${!hasChildren ? 'leaf' : ''}`}
              onClick={hasChildren ? undefined : () => onOpenCategory(node.id)}>
          {node.label}
        </span>
        <span className="cat-tree-count">{node.count}</span>
      </button>
      {hasChildren && expanded && (
        <div className="cat-tree-children">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} onOpenCategory={onOpenCategory} />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderGrid({ categories, onOpenCategory }: {
  categories: UiCategory[];
  onOpenCategory: (id: string) => void;
}) {
  return (
    <div className="cat-grid">
      {categories.map((cat) => {
        const color = getColorVar(cat.color);
        const depth = cat.id.split('/').length - 1;
        const label = cat.id.split('/').pop() || cat.name;
        return (
          <button
            key={cat.id}
            className="cat-grid-card"
            onClick={() => onOpenCategory(cat.id)}
            style={{ '--cat-color': color } as React.CSSProperties}
          >
            <div className="cat-grid-icon" style={{ background: color }}>
              {depth > 0 ? '📁' : '🗂'}
            </div>
            <span className="cat-grid-name">{label}</span>
            {depth > 0 && <span className="cat-grid-path">{cat.id.replace(`/${label}`, '')}</span>}
            <span className="cat-grid-count">{cat.count} note{cat.count !== 1 ? 's' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AllCategoriesRoute({
  categories,
  categoryTree,
  onOpenCategory,
}: {
  categories: UiCategory[];
  categoryTree: CategoryTreeNode[];
  onOpenCategory: (id: string) => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('tree');

  return (
    <div className="cat-page">
      <div className="crumbs">
        <span>Desk</span><span className="sep">/</span><span>Categories</span>
      </div>

      <div className="cat-page-head">
        <div>
          <h1>All categories</h1>
          <p>{categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} — {categoryTree.length} root</p>
        </div>
        <div className="cat-view-toggle">
          <button className={viewMode === 'tree' ? 'active' : ''} onClick={() => setViewMode('tree')}>▸ Tree</button>
          <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>▦ Grid</button>
        </div>
      </div>

      {viewMode === 'tree' ? (
        <div className="cat-tree">
          {categoryTree.map((node) => (
            <TreeNode key={node.id} node={node} depth={0} onOpenCategory={onOpenCategory} />
          ))}
        </div>
      ) : (
        <FolderGrid categories={categories} onOpenCategory={onOpenCategory} />
      )}
    </div>
  );
}
