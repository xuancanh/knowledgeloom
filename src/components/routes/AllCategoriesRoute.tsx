import { useMemo, useState } from 'react';
import type { CategoryTreeNode, UiCategory } from '../../lib/view';

type ViewMode = 'tree' | 'columns';

function getColorVar(color: string): string {
  const map: Record<string, string> = {
    oxblood: 'var(--accent)', moss: 'var(--moss)',
    indigo: 'var(--indigo)', ochre: 'var(--ochre)',
    teal: 'var(--teal)', rust: 'var(--rust)',
  };
  return map[color] || 'var(--accent)';
}

// ── Tree view ──────────────────────────────────────────────────────────────────

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

// ── Column view ────────────────────────────────────────────────────────────────

function ColumnsView({ categoryTree, onOpenCategory }: {
  categoryTree: CategoryTreeNode[];
  onOpenCategory: (id: string) => void;
}) {
  // selectedPath[i] = the node.id selected in column i
  const [selectedPath, setSelectedPath] = useState<string[]>([]);

  const columns = useMemo(() => {
    const cols: CategoryTreeNode[][] = [categoryTree];
    for (let i = 0; i < selectedPath.length; i++) {
      const selectedId = selectedPath[i];
      const node = cols[i].find((n) => n.id === selectedId);
      if (node && node.children.length > 0) {
        cols.push(node.children);
      } else {
        break;
      }
    }
    return cols;
  }, [categoryTree, selectedPath]);

  function handleClick(colIndex: number, node: CategoryTreeNode) {
    // Update selected path up to this column
    setSelectedPath((prev) => [...prev.slice(0, colIndex), node.id]);
    // If leaf, navigate
    if (node.children.length === 0) {
      onOpenCategory(node.id);
    }
  }

  return (
    <div className="cat-columns">
      {columns.map((col, ci) => (
        <div key={ci} className="cat-col">
          {col.map((node) => {
            const color = getColorVar(node.color);
            const isSelected = selectedPath[ci] === node.id;
            return (
              <button
                key={node.id}
                className={`cat-col-row${isSelected ? ' selected' : ''}`}
                onClick={() => handleClick(ci, node)}
              >
                <span className="cat-col-dot" style={{ background: color }} />
                <span className="cat-col-name">{node.label}</span>
                <span className="cat-col-right">
                  <span className="cat-col-count">{node.count}</span>
                  {node.children.length > 0 && <span className="cat-col-arrow">▸</span>}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
          <h1>Categories</h1>
          <p>{categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} · {categoryTree.length} root folder{categoryTree.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="cat-view-toggle">
          <button className={viewMode === 'tree' ? 'active' : ''} onClick={() => setViewMode('tree')} title="Tree view">
            ▸ Tree
          </button>
          <button className={viewMode === 'columns' ? 'active' : ''} onClick={() => setViewMode('columns')} title="Columns view">
            ⊟ Columns
          </button>
        </div>
      </div>

      {viewMode === 'tree' ? (
        <div className="cat-tree">
          {categoryTree.map((node) => (
            <TreeNode key={node.id} node={node} depth={0} onOpenCategory={onOpenCategory} />
          ))}
        </div>
      ) : (
        <ColumnsView categoryTree={categoryTree} onOpenCategory={onOpenCategory} />
      )}
    </div>
  );
}
