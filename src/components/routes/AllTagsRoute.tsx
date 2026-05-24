export function AllTagsRoute({
  tagCounts, onOpenTag,
}: {
  tagCounts: [string, number][];
  onOpenTag: (tag: string) => void;
}) {
  return (
    <div className="categories-page">
      <div className="crumbs">
        <span>Desk</span><span className="sep">/</span><span>Tags</span>
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 500, margin: '10px 0 6px' }}>All tags</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24 }}>{tagCounts.length} tag{tagCounts.length !== 1 ? 's' : ''}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tagCounts.map(([tag, count]) => (
          <button
            key={tag}
            onClick={() => onOpenTag(tag)}
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 5,
              background: 'var(--surface)',
              padding: '8px 14px',
              cursor: 'pointer',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ink-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'border-color 120ms, color 120ms',
            }}
          >
            <span style={{ color: 'var(--accent)' }}>#</span>
            <span>{tag}</span>
            <span style={{ color: 'var(--muted)', fontSize: 10.5 }}>{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
