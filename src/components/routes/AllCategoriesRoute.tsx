import type { UiCategory } from '../../lib/view';

export function AllCategoriesRoute({
  categories, onOpenCategory,
}: {
  categories: UiCategory[];
  onOpenCategory: (id: string) => void;
}) {
  return (
    <div className="categories-page">
      <div className="crumbs">
        <span>Desk</span><span className="sep">/</span><span>Categories</span>
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 500, margin: '10px 0 6px' }}>All categories</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24 }}>{categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onOpenCategory(cat.id)}
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 8,
              background: 'var(--surface)',
              padding: '14px 16px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              transition: 'border-color 120ms',
            }}
            className="cat-index-card"
          >
            <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink)' }}>{cat.name}</span>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cat.count} note{cat.count !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: 13, color: 'var(--muted-2)', lineHeight: 1.4 }}>
              {cat.summary || 'View notes in this category'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
