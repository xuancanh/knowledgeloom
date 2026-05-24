import { useState } from 'react';
import type { CategoryTreeNode, UiCategory } from '../../lib/view';

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
  const [expanded, setExpanded] = useState(depth < 2);
  const color = getColorVar(node.color);
  const hasChildren = node.children.length > 0;

  return (
    <div className="cat-tree-node">
      <div className="cat-tree-row" style={{ paddingLeft: 14 + depth * 20 }}>
        {hasChildren ? (
          <button
            className="cat-tree-toggle"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <span className={`cat-tree-arrow${expanded ? ' expanded' : ''}`}>▸</span>
          </button>
        ) : (
          <span className="cat-tree-spacer" />
        )}
        <button className="cat-tree-item" onClick={() => onOpenCategory(node.id)}>
          <span className="cat-tree-dot" style={{ background: color }} />
          <span className="cat-tree-name">{node.label}</span>
          <span className="cat-tree-count">{node.count}</span>
        </button>
      </div>
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

export function AllCategoriesRoute({
  categories,
  categoryTree,
  onOpenCategory,
}: {
  categories: UiCategory[];
  categoryTree: CategoryTreeNode[];
  onOpenCategory: (id: string) => void;
}) {
  return (
    <div className="cat-page">
      <div className="crumbs">
        <span>Desk</span><span className="sep">/</span><span>Categories</span>
      </div>

      <div className="cat-page-head">
        <h1>Categories</h1>
        <p>{categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} · {categoryTree.length} root folder{categoryTree.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="cat-tree">
        {categoryTree.map((node) => (
          <TreeNode key={node.id} node={node} depth={0} onOpenCategory={onOpenCategory} />
        ))}
      </div>
    </div>
  );
}
