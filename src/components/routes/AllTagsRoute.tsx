import styles from './AllTagsRoute.module.css';

export function AllTagsRoute({
  tagCounts, onOpenTag,
}: {
  tagCounts: [string, number][];
  onOpenTag: (tag: string) => void;
}) {
  const maxCount = tagCounts[0]?.[1] || 1;

  return (
    <div className={styles.page}>
      <div className="crumbs">
        <span>Desk</span><span className="sep">/</span><span>Tags</span>
      </div>

      <div className={styles.head}>
        <h1 className={styles.title}>Tags</h1>
        <p className={styles.subtitle}>{tagCounts.length} tag{tagCounts.length !== 1 ? 's' : ''}</p>
      </div>

      <div className={styles.cloud}>
        {tagCounts.map(([tag, count]) => {
          const weight = count / maxCount;
          const fontSize = Math.round(10.5 + weight * 4);
          return (
            <button
              key={tag}
              className={styles.tag}
              style={{ fontSize }}
              onClick={() => onOpenTag(tag)}
            >
              <span className={styles.tagHash}>#</span>
              <span className={styles.tagName}>{tag}</span>
              <span className={styles.tagCount}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
