import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { KnowledgeState, KnowledgeNote } from '../../types';
import type { UiCategory } from '../../lib/view';
import { backfillBilinks } from '../../api';
import { MultiSelectDropdown } from '../MultiSelectDropdown';

const NODE_W = 224, NODE_H = 92, GAP_X = 156, GAP_Y = 40;
const POS_KEY = 'kl-graph-pos-v1';

const CAT_VAR: Record<string, string> = {
  oxblood: 'var(--accent)', moss: 'var(--moss)', indigo: 'var(--indigo)',
  ochre: 'var(--ochre)', teal: 'var(--teal)', rust: 'var(--rust)',
};
const MARKER_IDS = ['oxblood', 'moss', 'indigo', 'ochre', 'teal', 'rust', 'dim', 'hi'] as const;
const MARKER_COLORS: Record<string, string> = {
  oxblood: 'var(--accent)', moss: 'var(--moss)', indigo: 'var(--indigo)',
  ochre: 'var(--ochre)', teal: 'var(--teal)', rust: 'var(--rust)',
  dim: 'var(--rule-2)', hi: 'var(--accent)',
};

type Pos = { x: number; y: number };
type Edge = { a: string; b: string; bi: boolean };
type SelEdge = Edge | null;

function borderPoint(cx: number, cy: number, tx: number, ty: number, hw: number, hh: number): Pos {
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const s = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: cx + dx * s, y: cy + dy * s };
}

function computeLayout(notes: KnowledgeNote[]): Record<string, Pos> {
  const byId: Record<string, KnowledgeNote> = Object.fromEntries(notes.map((n) => [n.id, n]));
  const incoming: Record<string, string[]> = {};
  notes.forEach((n) => { incoming[n.id] = []; });
  notes.forEach((n) => n.links.forEach((l) => { if (byId[l]) incoming[l].push(n.id); }));

  const layer: Record<string, number> = {};
  const stack = new Set<string>();
  function L(id: string): number {
    if (layer[id] !== undefined) return layer[id];
    if (stack.has(id)) return 0;
    stack.add(id);
    let v = 0;
    for (const p of incoming[id]) v = Math.max(v, L(p) + 1);
    stack.delete(id);
    return (layer[id] = v);
  }
  notes.forEach((n) => L(n.id));

  const layers: Record<number, string[]> = {};
  notes.forEach((n) => {
    const l = layer[n.id] ?? 0;
    (layers[l] = layers[l] || []).push(n.id);
  });

  const counts = Object.values(layers).map((a) => a.length);
  const maxC = counts.length ? Math.max(...counts) : 1;
  const step = NODE_H + GAP_Y;
  const pos: Record<string, Pos> = {};

  Object.keys(layers).map(Number).sort((a, b) => a - b).forEach((l) => {
    const ids = layers[l].slice().sort((a, b) =>
      byId[a].category.localeCompare(byId[b].category) || a.localeCompare(b)
    );
    ids.forEach((id, i) => {
      pos[id] = {
        x: 60 + l * (NODE_W + GAP_X),
        y: 60 + i * step + (maxC - ids.length) * step / 2,
      };
    });
  });
  return pos;
}

function closure(start: string, adj: Record<string, string[]>): Set<string> {
  const seen = new Set<string>(), q = [start];
  while (q.length) {
    const id = q.pop()!;
    for (const nb of (adj[id] || [])) {
      if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
    }
  }
  return seen;
}

export default function GraphPage({
  state,
  categories,
  tagCounts,
  onAddLink,
  onRemoveLink,
  onAddNote,
  onDeleteNote,
  onRenameNote,
  onSetCategory,
}: {
  state: KnowledgeState;
  categories: UiCategory[];
  tagCounts: Array<[string, number]>;
  onAddLink: (fromId: string, toId: string) => Promise<void>;
  onRemoveLink: (fromId: string, toId: string) => Promise<void>;
  onAddNote: (title: string) => Promise<string>;
  onDeleteNote: (id: string) => Promise<void>;
  onRenameNote: (id: string, title: string) => Promise<void>;
  onSetCategory: (id: string, category: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const notes = state.notes;

  const byId = useMemo(() => Object.fromEntries(notes.map((n) => [n.id, n])), [notes]);
  const catById = useMemo<Record<string, UiCategory>>(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories]
  );

  const outAdj = useMemo(() => {
    const m: Record<string, string[]> = {};
    notes.forEach((n) => { m[n.id] = [...new Set([...n.links, ...(n.bilinks ?? [])])].filter((l) => byId[l]); });
    return m;
  }, [notes, byId]);

  const inAdj = useMemo(() => {
    const m: Record<string, string[]> = {};
    notes.forEach((n) => { m[n.id] = []; });
    notes.forEach((n) => {
      [...new Set([...n.links, ...(n.bilinks ?? [])])].forEach((l) => {
        if (m[l]) m[l].push(n.id);
      });
    });
    return m;
  }, [notes]);

  const [transform, setTransform] = useState({ x: 80, y: 40, k: 0.85 });
  const [positions, setPositions] = useState<Record<string, Pos>>(() => {
    let saved: Record<string, Pos> = {};
    try { saved = JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch { /* ignore */ }
    return { ...computeLayout(notes), ...saved };
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<SelEdge>(null);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pathMode, setPathMode] = useState(false);
  const [edgeStyle, setEdgeStyle] = useState<'straight' | 'curved'>('straight');
  const [showMinimap, setShowMinimap] = useState(true);
  const [linkDrag, setLinkDrag] = useState<{ from: string; x: number; y: number; over: string | null } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [inspectorTitle, setInspectorTitle] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<{ x: number; y: number } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: 'pan' | 'node' | 'link';
    id?: string;
    sx: number; sy: number;
    ox: number; oy: number;
    moved?: boolean;
  } | null>(null);

  // Sync inspector title when selection changes
  useEffect(() => {
    if (selected && byId[selected]) setInspectorTitle(byId[selected].title);
  }, [selected, byId]);

  // Ensure new notes get positions
  useEffect(() => {
    setPositions((prev) => {
      const missing = notes.filter((n) => !prev[n.id]);
      if (!missing.length) return prev;
      const base = computeLayout(notes);
      const next = { ...prev };
      missing.forEach((n) => { next[n.id] = prev[n.id] || base[n.id] || { x: 80, y: 80 }; });
      return next;
    });
  }, [notes]);

  // Persist positions
  useEffect(() => {
    try { localStorage.setItem(POS_KEY, JSON.stringify(positions)); } catch { /* ignore */ }
  }, [positions]);

  const catOptions = useMemo(
    () => categories.map((c) => ({
      id: c.id,
      label: c.name.split('/').pop() ?? c.name,
      count: notes.filter((n) => n.category === c.id).length,
    })),
    [categories, notes]
  );
  const tagOptions = useMemo(
    () => tagCounts.map(([tag, count]) => ({ id: tag, label: tag, count })),
    [tagCounts]
  );

  const visible = useMemo(
    () => notes.filter((n) => {
      if (selectedCats.length > 0 && !selectedCats.includes(n.category)) return false;
      if (selectedTags.length > 0 && !n.tags.some((t) => selectedTags.includes(t))) return false;
      return true;
    }),
    [notes, selectedCats, selectedTags]
  );
  const visibleIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);

  // Highlight sets for selected node
  const hi = useMemo(() => {
    if (!selected) return null;
    const up = closure(selected, inAdj);
    const down = closure(selected, outAdj);
    return { up, down, all: new Set([selected, ...up, ...down]) };
  }, [selected, inAdj, outAdj]);

  // Build edge list — one-directional by default, bidirectional only if mutual or bilinks
  const edges = useMemo<Edge[]>(() => {
    const seen = new Set<string>(), list: Edge[] = [];
    notes.forEach((n) => {
      if (!visibleIds.has(n.id)) return;
      // mono links
      n.links.forEach((l) => {
        if (!visibleIds.has(l)) return;
        const mutual = (byId[l].links || []).includes(n.id);
        const viaB = (byId[l].bilinks || []).includes(n.id) || (n.bilinks || []).includes(l);
        const bi = mutual || viaB;
        if (bi) {
          const key = [n.id, l].sort().join('|');
          if (seen.has(key)) return;
          seen.add(key);
          const [a, b] = [n.id, l].sort();
          list.push({ a, b, bi: true });
        } else {
          list.push({ a: n.id, b: l, bi: false });
        }
      });
      // explicit bilinks (may not be in links)
      (n.bilinks ?? []).forEach((l) => {
        if (!visibleIds.has(l) || n.links.includes(l)) return;
        const key = [n.id, l].sort().join('|');
        if (seen.has(key)) return;
        seen.add(key);
        const [a, b] = [n.id, l].sort();
        list.push({ a, b, bi: true });
      });
    });
    return list;
  }, [notes, visibleIds, byId]);

  const toWorld = useCallback((clientX: number, clientY: number): Pos => {
    const r = stageRef.current!.getBoundingClientRect();
    return {
      x: (clientX - r.left - transform.x) / transform.k,
      y: (clientY - r.top - transform.y) / transform.k,
    };
  }, [transform]);

  // Mouse interactions
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      if (d.mode === 'pan') {
        setTransform((t) => ({ ...t, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
      } else if (d.mode === 'node') {
        const dx = (e.clientX - d.sx) / transform.k, dy = (e.clientY - d.sy) / transform.k;
        setPositions((p) => ({ ...p, [d.id!]: { x: d.ox + dx, y: d.oy + dy } }));
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
      } else if (d.mode === 'link') {
        const w = toWorld(e.clientX, e.clientY);
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const nodeEl = el?.closest('[data-node]') as HTMLElement | null;
        const over = nodeEl?.getAttribute('data-node') ?? null;
        setLinkDrag({ from: d.id!, x: w.x, y: w.y, over: over && over !== d.id ? over : null });
      }
    };
    const onUp = (e: MouseEvent) => {
      const d = drag.current;
      if (d?.mode === 'link') {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const nodeEl = el?.closest('[data-node]') as HTMLElement | null;
        const target = nodeEl?.getAttribute('data-node') ?? null;
        if (target && target !== d.id) onAddLink(d.id!, target);
        setLinkDrag(null);
      }
      if (d?.mode === 'node' && !d.moved) { setSelected(d.id!); setSelEdge(null); }
      drag.current = null;
      setPanning(false); setDraggingId(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [transform.k, toWorld, onAddLink]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = ['TEXTAREA', 'INPUT'].includes((document.activeElement as HTMLElement)?.tagName ?? '');
      if (inField) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selEdge) { e.preventDefault(); removeEdge(selEdge); setSelEdge(null); }
      }
      if (e.key === 'Escape') { setSelected(null); setSelEdge(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selEdge]);

  const onNodeEnter = useCallback((e: React.MouseEvent, id: string) => {
    if (drag.current) return;
    const p = positions[id] || { x: 0, y: 0 };
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return;
    setHoveredId(id);
    setHoverAnchor({
      x: r.left + p.x * transform.k + transform.x,
      y: r.top + p.y * transform.k + transform.y,
    });
  }, [positions, transform]);

  const onNodeLeave = useCallback(() => {
    setHoveredId(null);
    setHoverAnchor(null);
  }, []);

  const startPan = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-node]') ||
        (e.target as Element).closest('.graph-inspector') ||
        (e.target as Element).closest('.graph-minimap')) return;
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: transform.x, oy: transform.y };
    setPanning(true);
    setSelected(null); setSelEdge(null);
    setHoveredId(null);
  };

  const startNodeDrag = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    drag.current = { mode: 'node', id, sx: e.clientX, sy: e.clientY, ox: positions[id]?.x ?? 0, oy: positions[id]?.y ?? 0, moved: false };
    setDraggingId(id);
    setHoveredId(null);
  };

  const startLink = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const w = toWorld(e.clientX, e.clientY);
    drag.current = { mode: 'link', id, sx: e.clientX, sy: e.clientY, ox: w.x, oy: w.y };
    setLinkDrag({ from: id, x: w.x, y: w.y, over: null });
  };

  // Zoom — cursor-relative
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const r = stageRef.current!.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setTransform((t) => {
      const k = Math.min(2.2, Math.max(0.25, t.k * factor));
      const wx = (sx - t.x) / t.k, wy = (sy - t.y) / t.k;
      return { k, x: sx - wx * k, y: sy - wy * k };
    });
  };

  const zoomBy = (f: number) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return;
    const sx = r.width / 2, sy = r.height / 2;
    setTransform((t) => {
      const k = Math.min(2.2, Math.max(0.25, t.k * f));
      const wx = (sx - t.x) / t.k, wy = (sy - t.y) / t.k;
      return { k, x: sx - wx * k, y: sy - wy * k };
    });
  };

  const fit = useCallback(() => {
    if (!stageRef.current || !visible.length) return;
    const xs = visible.map((n) => positions[n.id]?.x ?? 0);
    const ys = visible.map((n) => positions[n.id]?.y ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys), maxY = Math.max(...ys) + NODE_H;
    const r = stageRef.current.getBoundingClientRect();
    const pad = 80;
    // fewer nodes → higher minimum zoom so they're readable, not tiny
    const minK = visible.length <= 4 ? 1.1 : visible.length <= 10 ? 0.75 : visible.length <= 20 ? 0.5 : 0.32;
    const k = Math.min(1.6, Math.max(minK,
      Math.min((r.width - pad * 2) / (maxX - minX || 1), (r.height - pad * 2) / (maxY - minY || 1))
    ));
    setTransform({
      k,
      x: pad - minX * k + (r.width - pad * 2 - (maxX - minX) * k) / 2,
      y: pad - minY * k + (r.height - pad * 2 - (maxY - minY) * k) / 2,
    });
  }, [visible, positions]);

  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current || !visible.length || !stageRef.current) return;
    const el = stageRef.current;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) { obs.disconnect(); didFit.current = true; fit(); }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible.length, fit]);

  const tidy = useCallback(() => {
    setPositions((prev) => ({ ...prev, ...computeLayout(visible) }));
    setTimeout(fit, 40);
  }, [visible, fit]);

  const [autoOrganize, setAutoOrganize] = useState(false);

  // Re-tidy visible nodes whenever filters change while auto is on
  const autoOrganizeRef = useRef(autoOrganize);
  useEffect(() => { autoOrganizeRef.current = autoOrganize; }, [autoOrganize]);
  useEffect(() => {
    if (!autoOrganizeRef.current || visible.length === 0) return;
    setPositions((prev) => ({ ...prev, ...computeLayout(visible) }));
    setTimeout(fit, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCats, selectedTags]);

  const [backfilling, setBackfilling] = useState(false);
  const doBackfill = async () => {
    if (backfilling) return;
    setBackfilling(true);
    try { await backfillBilinks(); } finally { setBackfilling(false); }
  };

  // Edge geometry
  const center = (id: string): Pos => ({
    x: (positions[id]?.x ?? 0) + NODE_W / 2,
    y: (positions[id]?.y ?? 0) + NODE_H / 2,
  });

  const edgePath = (eg: Edge) => {
    const A = center(eg.a), B = center(eg.b);
    const pa = borderPoint(A.x, A.y, B.x, B.y, NODE_W / 2 + 4, NODE_H / 2 + 4);
    const pb = borderPoint(B.x, B.y, A.x, A.y, NODE_W / 2 + 4, NODE_H / 2 + 4);
    if (edgeStyle === 'curved') {
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy) || 1;
      const off = Math.min(38, len * 0.18);
      const cx = mx - (dy / len) * off, cy = my + (dx / len) * off;
      return {
        d: `M ${pa.x} ${pa.y} Q ${cx} ${cy} ${pb.x} ${pb.y}`,
        mid: { x: (pa.x + 2 * cx + pb.x) / 4, y: (pa.y + 2 * cy + pb.y) / 4 },
      };
    }
    return { d: `M ${pa.x} ${pa.y} L ${pb.x} ${pb.y}`, mid: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } };
  };

  const edgeState = (eg: Edge) => {
    if (selEdge && selEdge.a === eg.a && selEdge.b === eg.b) return 'sel';
    if (!hi) return 'normal';
    const inHood = pathMode
      ? (hi.all.has(eg.a) && hi.all.has(eg.b) &&
         ((hi.up.has(eg.a) || eg.a === selected) && (hi.up.has(eg.b) || eg.b === selected) ||
          (hi.down.has(eg.a) || eg.a === selected) && (hi.down.has(eg.b) || eg.b === selected)))
      : (eg.a === selected || eg.b === selected);
    return inHood ? 'hi' : 'dim';
  };

  const removeEdge = (eg: Edge) => {
    onRemoveLink(eg.a, eg.b);
    if (eg.bi) onRemoveLink(eg.b, eg.a);
  };

  // Stats
  const orphanCount = useMemo(
    () => notes.filter((n) => n.links.length === 0 && (n.bilinks ?? []).length === 0 && inAdj[n.id]?.length === 0).length,
    [notes, inAdj]
  );
  const totalLinks = useMemo(() => notes.reduce((s, n) => s + n.links.length, 0), [notes]);

  // Minimap
  const mm = useMemo(() => {
    if (!visible.length) return null;
    const xs = visible.map((n) => positions[n.id]?.x ?? 0);
    const ys = visible.map((n) => positions[n.id]?.y ?? 0);
    const minX = Math.min(...xs) - 40, maxX = Math.max(...xs) + NODE_W + 40;
    const minY = Math.min(...ys) - 40, maxY = Math.max(...ys) + NODE_H + 40;
    const W = 184, H = 124;
    const s = Math.min(W / ((maxX - minX) || 1), H / ((maxY - minY) || 1));
    return { minX, minY, s, W, H };
  }, [visible, positions]);

  const mmRect = () => {
    if (!mm || !stageRef.current) return null;
    const r = stageRef.current.getBoundingClientRect();
    const vx = (-transform.x / transform.k - mm.minX) * mm.s;
    const vy = (-transform.y / transform.k - mm.minY) * mm.s;
    const vw = (r.width / transform.k) * mm.s;
    const vh = (r.height / transform.k) * mm.s;
    return { vx, vy, vw, vh };
  };

  const onMinimap = (e: React.MouseEvent) => {
    if (!mm || !stageRef.current) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const wx = (e.clientX - r.left) / mm.s + mm.minX;
    const wy = (e.clientY - r.top) / mm.s + mm.minY;
    const sr = stageRef.current.getBoundingClientRect();
    setTransform((t) => ({ ...t, x: sr.width / 2 - wx * t.k, y: sr.height / 2 - wy * t.k }));
  };

  const sel = selected ? byId[selected] : null;
  const arrow = mmRect();

  const addNodeCenter = async () => {
    if (!stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const w = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const id = await onAddNote(t('graph.untitled'));
    if (id) setPositions((p) => ({ ...p, [id]: { x: w.x - NODE_W / 2, y: w.y - NODE_H / 2 } }));
    setSelected(id);
  };

  const onStageDblClick = async (e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-node]') ||
        (e.target as Element).closest('.graph-inspector') ||
        (e.target as Element).closest('.graph-minimap')) return;
    const w = toWorld(e.clientX, e.clientY);
    const id = await onAddNote(t('graph.untitled'));
    if (id) setPositions((p) => ({ ...p, [id]: { x: w.x - NODE_W / 2, y: w.y - NODE_H / 2 } }));
    setSelected(id);
  };

  return (
    <div className="graph-view">
      {/* Toolbar */}
      <div className="graph-toolbar">
        <span className="tb-title"><span className="glyph">⊹</span> {t('graph.title')}</span>
        <span className="tb-stats">
          <span>{t('graph.nodes', { count: visible.length })}</span>
          <span>{t('graph.edges', { count: edges.length })}</span>
          <span>{t('graph.links', { count: totalLinks })}</span>
          {orphanCount > 0 && <span>{t('graph.orphans', { count: orphanCount })}</span>}
        </span>

        <span className="tb-spacer" />

        <div className="tb-group">
          <MultiSelectDropdown
            label={t('common.categories')}
            items={catOptions}
            selected={selectedCats}
            onChange={setSelectedCats}
          />
          <MultiSelectDropdown
            label={t('common.tags')}
            items={tagOptions}
            selected={selectedTags}
            onChange={setSelectedTags}
          />
        </div>

        <span className="tb-rule" />

        <div className="tb-group">
          <button className={'tb-btn' + (pathMode ? ' on' : '')} onClick={() => setPathMode((p) => !p)} title={t('graph.pathTitle')}>
            <span className="glyph">⥱</span> {t('graph.path')}
          </button>
          <button className={'tb-btn' + (edgeStyle === 'curved' ? ' on' : '')} onClick={() => setEdgeStyle((s) => s === 'curved' ? 'straight' : 'curved')} title={t('graph.curveTitle')}>
            <span className="glyph">~</span> {t('graph.curve')}
          </button>
          <button className="tb-btn" onClick={tidy} title={t('graph.tidyTitle')}><span className="glyph">⌗</span> {t('graph.tidy')}</button>
          <button className={'tb-btn' + (autoOrganize ? ' on' : '')} onClick={() => setAutoOrganize((v) => !v)} title={t('graph.autoTitle')}>{t('graph.auto')}</button>
          <button className="tb-btn" onClick={addNodeCenter} title={t('graph.addNode')}><span className="glyph">+</span> {t('graph.node')}</button>
          <button className="tb-btn" onClick={doBackfill} disabled={backfilling} title={t('graph.backfillTitle')}>
            {backfilling ? '…' : <><span className="glyph">⇄</span> {t('graph.backfill')}</>}
          </button>
        </div>

        <span className="tb-rule" />

        <div className="tb-group">
          <button className="tb-btn icon" onClick={() => zoomBy(1 / 1.2)} title={t('graph.zoomOut')} aria-label={t('graph.zoomOut')}>−</button>
          <span className="zoom-readout">{Math.round(transform.k * 100)}%</span>
          <button className="tb-btn icon" onClick={() => zoomBy(1.2)} title={t('graph.zoomIn')} aria-label={t('graph.zoomIn')}>+</button>
          <button className="tb-btn" onClick={fit} title={t('graph.fitTitle')}><span className="glyph">⤢</span> {t('graph.fit')}</button>
          <button className={'tb-btn' + (showMinimap ? ' on' : '')} onClick={() => setShowMinimap((v) => !v)} title={t('graph.mapTitle')}>{t('graph.map')}</button>
        </div>
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        className={'graph-stage' + (panning ? ' panning' : '') + (linkDrag ? ' linking' : '')}
        onMouseDown={startPan}
        onDoubleClick={onStageDblClick}
        onWheel={onWheel}
      >
        <div className="graph-world" style={{ transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.k})` }}>
          {/* Edges SVG */}
          <svg className="graph-edges" width="8000" height="6000">
            <defs>
              {MARKER_IDS.map((k) => (
                <marker key={k} id={'arrow-' + k} viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 1 L 9 5 L 0 9 z" fill={MARKER_COLORS[k]} />
                </marker>
              ))}
            </defs>

            {edges.map((eg) => {
              const { d } = edgePath(eg);
              const st = edgeState(eg);
              const catColor = (st === 'hi' || st === 'sel')
                ? 'var(--accent)'
                : st === 'dim'
                  ? MARKER_COLORS.dim
                  : CAT_VAR[(catById[byId[eg.a]?.category ?? ''])?.color ?? ''] || 'var(--rule-2)';
              const mk = (st === 'hi' || st === 'sel') ? 'hi' : st === 'dim' ? 'dim' : ((catById[byId[eg.a]?.category ?? ''])?.color ?? 'dim');
              return (
                <g key={eg.a + '>' + eg.b}>
                  <path className="edge-hit" d={d} onClick={(ev) => { ev.stopPropagation(); setSelEdge(eg); setSelected(null); }} />
                  <path
                    className={'edge-line ' + st}
                    d={d}
                    stroke={catColor}
                    strokeWidth={1.5}
                    markerEnd={`url(#arrow-${mk})`}
                    markerStart={eg.bi ? `url(#arrow-${mk})` : undefined}
                  />
                </g>
              );
            })}

            {/* Delete affordance on selected edge */}
            {selEdge && (() => {
              const { mid } = edgePath(selEdge);
              return (
                <g className="edge-del" transform={`translate(${mid.x} ${mid.y})`}
                  role="button" tabIndex={0} aria-label={t('graph.removeSelectedEdge')}
                  onClick={(e) => { e.stopPropagation(); removeEdge(selEdge); setSelEdge(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { removeEdge(selEdge); setSelEdge(null); } }}>
                  <circle r="9" />
                  <line x1="-3.5" y1="-3.5" x2="3.5" y2="3.5" />
                  <line x1="3.5" y1="-3.5" x2="-3.5" y2="3.5" />
                </g>
              );
            })()}

            {/* Temp link being drawn */}
            {linkDrag && (() => {
              const A = center(linkDrag.from);
              const pa = borderPoint(A.x, A.y, linkDrag.x, linkDrag.y, NODE_W / 2 + 4, NODE_H / 2 + 4);
              return <path className="edge-temp" d={`M ${pa.x} ${pa.y} L ${linkDrag.x} ${linkDrag.y}`} markerEnd="url(#arrow-hi)" />;
            })()}
          </svg>

          {/* Nodes */}
          {visible.map((n) => {
            const p = positions[n.id] || { x: 0, y: 0 };
            const cat = catById[n.category] as (UiCategory & { color?: string }) | undefined;
            const deg = (outAdj[n.id]?.length ?? 0) + (inAdj[n.id]?.length ?? 0);
            let cls = 'gnode';
            if (draggingId === n.id) cls += ' dragging';
            if (selected === n.id) cls += ' selected';
            else if (hi) {
              if (hi.up.has(n.id)) cls += ' prereq';
              else if (hi.down.has(n.id)) cls += ' unlocks';
              else cls += ' dim';
            }
            if (linkDrag?.over === n.id) cls += ' link-target';
            return (
              <div
                key={n.id}
                data-node={n.id}
                className={cls}
                style={{
                  left: p.x, top: p.y,
                  borderLeftColor: (selected === n.id || (hi && hi.up.has(n.id)))
                    ? undefined
                    : CAT_VAR[cat?.color ?? ''],
                }}
                onMouseDown={(e) => startNodeDrag(e, n.id)}
                onMouseEnter={(e) => onNodeEnter(e, n.id)}
                onMouseLeave={onNodeLeave}
                onDoubleClick={(e) => { e.stopPropagation(); navigate(`/notes/${encodeURIComponent(n.id)}`); }}
                role="button"
                tabIndex={0}
                aria-label={t('graph.selectNode', { title: n.title })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/notes/${encodeURIComponent(n.id)}`);
                  if (e.key === ' ') { e.preventDefault(); setSelected(n.id); setSelEdge(null); }
                }}
              >
                <div className="gn-cat">
                  <span className={'dot ' + (cat?.color ?? '')} />
                  {cat ? (cat.name.split('/').pop() ?? cat.name) : n.category}
                  <span className="deg">{deg}</span>
                </div>
                <div className="gn-title">{n.title}</div>
                <button type="button" className="gport" title={t('graph.dragToLink')} aria-label={t('graph.dragToLinkFrom', { title: n.title })} onMouseDown={(e) => startLink(e, n.id)} />
              </div>
            );
          })}
        </div>

        {/* Inspector */}
        {sel && (
          <div className="graph-inspector" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ins-head">
              <div className="ins-cat">
                <span className={'dot ' + ((catById[sel.category] as UiCategory & { color?: string })?.color ?? '')} />
                {(catById[sel.category] as UiCategory | undefined)?.name || sel.category}
                <button type="button" className="close" onClick={() => setSelected(null)} aria-label={t('common.close')}>×</button>
              </div>
              <textarea
                className="ins-title"
                rows={2}
                value={inspectorTitle}
                onChange={(e) => setInspectorTitle(e.target.value)}
                onBlur={() => { if (inspectorTitle.trim() && inspectorTitle !== sel.title) onRenameNote(sel.id, inspectorTitle.trim()); }}
              />
              <div className="ins-catpick">
                {categories.map((c) => (
                  <button type="button" key={c.id} className={'cp' + (c.id === sel.category ? ' active' : '')} title={c.name} aria-label={t('graph.setCategory', { category: c.name })}
                    onClick={() => onSetCategory(sel.id, c.id)}>
                    <span className={'dot ' + (c as UiCategory & { color?: string }).color} />
                  </button>
                ))}
              </div>
            </div>

            <div className="ins-body">
              {sel.summary && <p className="ins-summary">{sel.summary}</p>}

              <div className="ins-block">
                <div className="ins-sec"><span className="ar">←</span> {t('graph.prerequisites')} <span className="n">· {inAdj[sel.id]?.length ?? 0}</span></div>
                {(!inAdj[sel.id]?.length) && <div className="ins-empty">{t('graph.noPrerequisites')}</div>}
                {(inAdj[sel.id] ?? []).map((id) => byId[id] && (
                  <div key={id} className="ins-link" role="button" tabIndex={0} onClick={() => setSelected(id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelected(id); }}>
                    <span className={'il-dot dot ' + ((catById[byId[id].category] as UiCategory & { color?: string })?.color ?? '')} />
                    <span className="il-title">{byId[id].title}</span>
                    <button type="button" className="il-x" title={t('graph.removeLink')} aria-label={t('graph.removeLinkTo', { title: byId[id].title })} onClick={(e) => { e.stopPropagation(); onRemoveLink(id, sel.id); }}>×</button>
                  </div>
                ))}
              </div>

              <div className="ins-block">
                <div className="ins-sec">{t('graph.unlocks')} <span className="ar">→</span> <span className="n">· {sel.links.length}</span></div>
                {sel.links.filter((l) => byId[l]).length === 0 && <div className="ins-empty">{t('graph.noUnlocks')}</div>}
                {sel.links.filter((l) => byId[l]).map((id) => (
                  <div key={id} className="ins-link" role="button" tabIndex={0} onClick={() => setSelected(id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelected(id); }}>
                    <span className={'il-dot dot ' + ((catById[byId[id].category] as UiCategory & { color?: string })?.color ?? '')} />
                    <span className="il-title">{byId[id].title}</span>
                    <button type="button" className="il-x" title={t('graph.removeLink')} aria-label={t('graph.removeLinkTo', { title: byId[id].title })} onClick={(e) => { e.stopPropagation(); onRemoveLink(sel.id, id); }}>×</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="ins-foot">
              <button className="open-btn" onClick={() => navigate(`/notes/${encodeURIComponent(sel.id)}`)}>{t('graph.openNote')} →</button>
              <button className="del-btn" onClick={() => { onDeleteNote(sel.id); setSelected(null); }}>{t('common.delete')}</button>
            </div>
          </div>
        )}

        {/* Minimap */}
        {showMinimap && mm && (
          <div className="graph-minimap" onMouseDown={onMinimap} aria-hidden="true">
            <span className="mm-label">{t('graph.map')}</span>
            <svg viewBox={`0 0 ${mm.W} ${mm.H}`}>
              {edges.map((eg) => {
                const A = center(eg.a), B = center(eg.b);
                return <line key={'m' + eg.a + eg.b}
                  x1={(A.x - mm.minX) * mm.s} y1={(A.y - mm.minY) * mm.s}
                  x2={(B.x - mm.minX) * mm.s} y2={(B.y - mm.minY) * mm.s}
                  stroke="var(--rule-2)" strokeWidth="0.6" />;
              })}
              {visible.map((n) => {
                const p = positions[n.id] || { x: 0, y: 0 };
                const cat = catById[n.category] as (UiCategory & { color?: string }) | undefined;
                return <rect key={'mn' + n.id}
                  x={(p.x - mm.minX) * mm.s} y={(p.y - mm.minY) * mm.s}
                  width={NODE_W * mm.s} height={NODE_H * mm.s} rx="1.5"
                  fill={selected === n.id ? 'var(--accent)' : CAT_VAR[cat?.color ?? ''] || 'var(--rule-2)'}
                  opacity={selected === n.id ? 1 : 0.8} />;
              })}
              {arrow && <rect className="mm-vp" x={arrow.vx} y={arrow.vy} width={arrow.vw} height={arrow.vh} />}
            </svg>
          </div>
        )}

        {/* Hint */}
        <div className="graph-hint">
          <span>{t('graph.hintMove')}</span>
          <span>{t('graph.hintLink')}</span>
          <span>{t('graph.hintCut')}</span>
          <span>{t('graph.hintAdd')}</span>
        </div>

        {/* Hover popup */}
        {hoveredId && hoverAnchor && byId[hoveredId] && hoveredId !== selected && (() => {
          const note = byId[hoveredId];
          const cat = catById[note.category];
          const nodeW = NODE_W * transform.k;
          const nodeH = NODE_H * transform.k;
          const vw = window.innerWidth;
          const popW = 260;
          const left = hoverAnchor.x + nodeW + 10;
          const x = left + popW > vw ? hoverAnchor.x - popW - 10 : left;
          const y = Math.max(8, Math.min(hoverAnchor.y + nodeH / 2 - 40, window.innerHeight - 240));
          return (
            <div className="g-hover-popup" style={{ left: x, top: y }}>
              <div className="ghp-cat">
                <span className={'dot ' + (cat?.color ?? '')} />
                {cat?.name ?? note.category}
              </div>
              <div className="ghp-title">{note.title}</div>
              {note.summary && <p className="ghp-summary">{note.summary}</p>}
              {note.tags.length > 0 && (
                <div className="ghp-tags">
                  {note.tags.map((t) => <span key={t} className="ghp-tag">#{t}</span>)}
                </div>
              )}
              <div className="ghp-stats">
                <span>{t('graph.prerequisiteCount', { count: inAdj[note.id]?.length ?? 0 })}</span>
                <span>{t('graph.unlockCount', { count: outAdj[note.id]?.length ?? 0 })}</span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
