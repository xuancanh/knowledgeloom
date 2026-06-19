import { useMemo } from 'react';
import type { KnowledgeNote } from '../types';

/**
 * Small local graph for the selected note's outgoing links and backlinks.
 */
export default function MiniGraph({
  note,
  notes,
  onOpen,
}: {
  note: KnowledgeNote;
  notes: KnowledgeNote[];
  onOpen: (id: string) => void;
}) {
  const related = useMemo(() => {
    const biSet = new Set(note.bilinks ?? []);
    const monoLinks = note.links.filter((id) => !biSet.has(id));
    const outgoing = monoLinks
      .map((id) => notes.find((item) => item.id === id))
      .filter((item): item is KnowledgeNote => Boolean(item));
    const bilinked = [...biSet]
      .map((id) => notes.find((item) => item.id === id))
      .filter((item): item is KnowledgeNote => Boolean(item));
    const back = notes.filter(
      (item) => item.links.includes(note.id) && !note.links.includes(item.id) && !biSet.has(item.id),
    );
    return [
      ...outgoing.map((item) => ({ note: item, kind: 'out' as const })),
      ...bilinked.map((item) => ({ note: item, kind: 'bi' as const })),
      ...back.map((item) => ({ note: item, kind: 'back' as const })),
    ];
  }, [note, notes]);

  const width = 280;
  const height = 200;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 76;
  const angleStep = (Math.PI * 2) / Math.max(related.length, 1);

  return (
    <div className="mini-graph">
      <svg viewBox={`0 0 ${width} ${height}`}>
        {related.map(({ note: item }, index) => {
          const angle = -Math.PI / 2 + index * angleStep;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          return <line key={`edge-${item.id}`} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--rule-2)" strokeWidth="1" />;
        })}
        <circle cx={cx} cy={cy} r="8" fill="var(--accent)" />
        <circle cx={cx} cy={cy} r="13" fill="none" stroke="var(--accent)" strokeOpacity="0.3" strokeWidth="1" />
        {related.map(({ note: item, kind }, index) => {
          const angle = -Math.PI / 2 + index * angleStep;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          return (
            <g key={item.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(item.id)}>
              <circle cx={x} cy={y} r="5" fill={kind === 'out' ? 'var(--ink-2)' : kind === 'bi' ? 'var(--teal)' : 'var(--ochre)'} />
              <title>{item.title}</title>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span>● <span style={{ color: 'var(--accent)' }}>here</span></span>
        <span>● <span style={{ color: 'var(--ink-2)' }}>links to</span></span>
        <span>● <span style={{ color: 'var(--teal)' }}>bidirectional</span></span>
        <span>● <span style={{ color: 'var(--ochre)' }}>linked from</span></span>
      </div>
    </div>
  );
}
