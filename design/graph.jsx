/* Graph view — "the weave": a draggable, directed prerequisite graph.
   Edge A → B reads "A leads to B" (A is a prerequisite, B builds on A).
   Data: note.links = outgoing edges. Bidirectional pairs render once with
   arrowheads on both ends. */

const { useState: gS, useEffect: gE, useMemo: gM, useRef: gR, useCallback: gC } = React;

const NODE_W = 176, NODE_H = 66, GAP_X = 132, GAP_Y = 30;
const POS_KEY = "kl-graph-pos-v1";

// category color name → css var used for strokes/markers
const CAT_VAR = {
  oxblood: "var(--accent)", moss: "var(--moss)", indigo: "var(--indigo)",
  ochre: "var(--ochre)", teal: "var(--teal)", rust: "var(--rust)",
};
const MARKER_COLORS = {
  oxblood: "var(--accent)", moss: "var(--moss)", indigo: "var(--indigo)",
  ochre: "var(--ochre)", teal: "var(--teal)", rust: "var(--rust)",
  dim: "var(--rule-2)", hi: "var(--accent)",
};

// ——— geometry: point on a node's border toward another point ———
function borderPoint(cx, cy, tx, ty, hw, hh) {
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const s = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: cx + dx * s, y: cy + dy * s };
}

// ——— layered (longest-path) auto layout — foundations on the left ———
function computeLayout(notes) {
  const byId = Object.fromEntries(notes.map(n => [n.id, n]));
  const incoming = {}; notes.forEach(n => { incoming[n.id] = []; });
  notes.forEach(n => n.links.forEach(l => { if (byId[l]) incoming[l].push(n.id); }));
  const layer = {}, stack = new Set();
  const L = (id) => {
    if (layer[id] !== undefined) return layer[id];
    if (stack.has(id)) return 0;          // cycle guard
    stack.add(id);
    let v = 0;
    for (const p of incoming[id]) v = Math.max(v, L(p) + 1);
    stack.delete(id);
    return (layer[id] = v);
  };
  notes.forEach(n => L(n.id));
  const layers = {};
  notes.forEach(n => { (layers[layer[n.id]] = layers[layer[n.id]] || []).push(n.id); });
  const counts = Object.values(layers).map(a => a.length);
  const maxC = counts.length ? Math.max(...counts) : 1;
  const step = NODE_H + GAP_Y;
  const pos = {};
  Object.keys(layers).map(Number).sort((a, b) => a - b).forEach(l => {
    const ids = layers[l].slice().sort((a, b) => byId[a].category.localeCompare(byId[b].category) || a.localeCompare(b));
    ids.forEach((id, i) => {
      pos[id] = {
        x: 60 + l * (NODE_W + GAP_X),
        y: 60 + i * step + (maxC - ids.length) * step / 2,
      };
    });
  });
  return pos;
}

// ——— directed reachability closure ———
function closure(start, adj) {
  const seen = new Set(), q = [start];
  while (q.length) {
    const id = q.pop();
    for (const nb of (adj[id] || [])) if (!seen.has(nb)) { seen.add(nb); q.push(nb); }
  }
  return seen;
}

function GraphView({ notes, categories, onOpen, onAddLink, onRemoveLink, onAddNote, onDeleteNote, onSetCategory, onRenameNote, edgeStyle, showMinimap, progress, onLearn }) {
  const byId = gM(() => Object.fromEntries(notes.map(n => [n.id, n])), [notes]);
  const catById = gM(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);

  // adjacency (visible edges resolved later); raw out/in maps
  const outAdj = gM(() => {
    const m = {}; notes.forEach(n => { m[n.id] = n.links.filter(l => byId[l]); });
    return m;
  }, [notes, byId]);
  const inAdj = gM(() => {
    const m = {}; notes.forEach(n => { m[n.id] = []; });
    notes.forEach(n => n.links.forEach(l => { if (m[l]) m[l].push(n.id); }));
    return m;
  }, [notes]);

  const [transform, setTransform] = gS({ x: 80, y: 40, k: 0.85 });
  const [positions, setPositions] = gS(() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(POS_KEY) || "{}"); } catch (e) {}
    return { ...computeLayout(notes), ...saved };
  });
  const [selected, setSelected] = gS(null);
  const [selEdge, setSelEdge] = gS(null);
  const [hiddenCats, setHiddenCats] = gS(() => new Set());
  const [pathMode, setPathMode] = gS(false);
  const [linkDrag, setLinkDrag] = gS(null); // {from, x, y, over}
  const [draggingId, setDraggingId] = gS(null);
  const [panning, setPanning] = gS(false);

  const stageRef = gR(null);
  const drag = gR(null); // active pointer interaction

  // ensure any note without a position gets one (e.g. freshly added)
  gE(() => {
    setPositions(prev => {
      const missing = notes.filter(n => !prev[n.id]);
      if (!missing.length) return prev;
      const base = computeLayout(notes);
      const next = { ...prev };
      missing.forEach(n => { next[n.id] = prev[n.id] || base[n.id] || { x: 80, y: 80 }; });
      return next;
    });
  }, [notes]);

  // persist positions
  gE(() => {
    try { localStorage.setItem(POS_KEY, JSON.stringify(positions)); } catch (e) {}
  }, [positions]);

  const visible = gM(() => notes.filter(n => !hiddenCats.has(n.category)), [notes, hiddenCats]);
  const visibleIds = gM(() => new Set(visible.map(n => n.id)), [visible]);

  // ——— highlight sets when a node is selected ———
  const hi = gM(() => {
    if (!selected) return null;
    const up = closure(selected, inAdj);    // prerequisites (everything upstream)
    const down = closure(selected, outAdj);  // unlocks (everything downstream)
    return { up, down, all: new Set([selected, ...up, ...down]) };
  }, [selected, inAdj, outAdj]);

  // ——— build edge list (dedupe bidirectional) ———
  const edges = gM(() => {
    const seen = new Set(), list = [];
    notes.forEach(n => {
      if (!visibleIds.has(n.id)) return;
      n.links.forEach(l => {
        if (!visibleIds.has(l)) return;
        const rev = (byId[l].links || []).includes(n.id);
        if (rev) {
          const key = [n.id, l].sort().join("|");
          if (seen.has(key)) return;
          seen.add(key);
          const [a, b] = [n.id, l].sort();
          list.push({ a, b, bi: true });
        } else {
          list.push({ a: n.id, b: l, bi: false });
        }
      });
    });
    return list;
  }, [notes, visibleIds, byId]);

  // ——— coordinate helpers ———
  const toWorld = gC((clientX, clientY) => {
    const r = stageRef.current.getBoundingClientRect();
    return {
      x: (clientX - r.left - transform.x) / transform.k,
      y: (clientY - r.top - transform.y) / transform.k,
    };
  }, [transform]);

  // ——— pan + node-drag + link-drag interactions ———
  gE(() => {
    const onMove = (e) => {
      const d = drag.current;
      if (!d) return;
      if (d.mode === "pan") {
        setTransform(t => ({ ...t, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
      } else if (d.mode === "node") {
        const dx = (e.clientX - d.sx) / transform.k, dy = (e.clientY - d.sy) / transform.k;
        setPositions(p => ({ ...p, [d.id]: { x: d.ox + dx, y: d.oy + dy } }));
      } else if (d.mode === "link") {
        const w = toWorld(e.clientX, e.clientY);
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const nodeEl = el && el.closest("[data-node]");
        const over = nodeEl ? nodeEl.getAttribute("data-node") : null;
        setLinkDrag({ from: d.id, x: w.x, y: w.y, over: over && over !== d.id ? over : null });
      }
    };
    const onUp = (e) => {
      const d = drag.current;
      if (d && d.mode === "link") {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const nodeEl = el && el.closest("[data-node]");
        const target = nodeEl && nodeEl.getAttribute("data-node");
        if (target && target !== d.id) onAddLink(d.id, target);
        setLinkDrag(null);
      }
      if (d && d.mode === "node" && !d.moved) { setSelected(d.id); setSelEdge(null); }
      drag.current = null;
      setPanning(false); setDraggingId(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [transform.k, toWorld, onAddLink]);

  // track node movement to distinguish click vs drag
  gE(() => {
    const onMove = (e) => { if (drag.current && drag.current.mode === "node") {
      if (Math.abs(e.clientX - drag.current.sx) + Math.abs(e.clientY - drag.current.sy) > 3) drag.current.moved = true;
    }};
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const startPan = (e) => {
    if (e.target.closest("[data-node]") || e.target.closest(".graph-inspector") || e.target.closest(".graph-minimap")) return;
    drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, ox: transform.x, oy: transform.y };
    setPanning(true);
    setSelected(null); setSelEdge(null);
  };
  const startNodeDrag = (e, id) => {
    e.stopPropagation();
    drag.current = { mode: "node", id, sx: e.clientX, sy: e.clientY, ox: positions[id].x, oy: positions[id].y, moved: false };
    setDraggingId(id);
  };
  const startLink = (e, id) => {
    e.stopPropagation();
    const w = toWorld(e.clientX, e.clientY);
    drag.current = { mode: "link", id };
    setLinkDrag({ from: id, x: w.x, y: w.y, over: null });
  };

  // ——— zoom ———
  const onWheel = (e) => {
    e.preventDefault();
    const r = stageRef.current.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setTransform(t => {
      const k = Math.min(2.2, Math.max(0.25, t.k * factor));
      const wx = (sx - t.x) / t.k, wy = (sy - t.y) / t.k;
      return { k, x: sx - wx * k, y: sy - wy * k };
    });
  };
  const zoomBy = (f) => setTransform(t => {
    const r = stageRef.current.getBoundingClientRect();
    const sx = r.width / 2, sy = r.height / 2;
    const k = Math.min(2.2, Math.max(0.25, t.k * f));
    const wx = (sx - t.x) / t.k, wy = (sy - t.y) / t.k;
    return { k, x: sx - wx * k, y: sy - wy * k };
  });

  const fit = gC(() => {
    if (!stageRef.current || !visible.length) return;
    const xs = visible.map(n => positions[n.id]?.x ?? 0);
    const ys = visible.map(n => positions[n.id]?.y ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys), maxY = Math.max(...ys) + NODE_H;
    const r = stageRef.current.getBoundingClientRect();
    const pad = 70;
    const k = Math.min(1.4, Math.max(0.28,
      Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY))));
    setTransform({ k, x: pad - minX * k + (r.width - pad * 2 - (maxX - minX) * k) / 2, y: pad - minY * k + (r.height - pad * 2 - (maxY - minY) * k) / 2 });
  }, [visible, positions]);

  // initial fit once
  const didFit = gR(false);
  gE(() => { if (!didFit.current && visible.length) { didFit.current = true; setTimeout(fit, 30); } }, [visible, fit]);

  const tidy = () => { setPositions(computeLayout(notes)); setTimeout(fit, 40); };

  // ——— keyboard: delete selected edge/node ———
  gE(() => {
    const onKey = (e) => {
      const inField = ["TEXTAREA", "INPUT"].includes((document.activeElement || {}).tagName);
      if (inField) return;
      if ((e.key === "Delete" || e.key === "Backspace")) {
        if (selEdge) { e.preventDefault(); removeEdge(selEdge); setSelEdge(null); }
      }
      if (e.key === "Escape") { setSelected(null); setSelEdge(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selEdge]);

  const removeEdge = (eg) => {
    onRemoveLink(eg.a, eg.b);
    if (eg.bi) onRemoveLink(eg.b, eg.a);
  };

  const toggleCat = (id) => setHiddenCats(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const addNodeCenter = () => {
    const r = stageRef.current.getBoundingClientRect();
    const w = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const id = onAddNote("Untitled note");
    setPositions(p => ({ ...p, [id]: { x: w.x - NODE_W / 2, y: w.y - NODE_H / 2 } }));
    setSelected(id);
  };
  const onStageDblClick = (e) => {
    if (e.target.closest("[data-node]") || e.target.closest(".graph-inspector") || e.target.closest(".graph-minimap")) return;
    const w = toWorld(e.clientX, e.clientY);
    const id = onAddNote("Untitled note");
    setPositions(p => ({ ...p, [id]: { x: w.x - NODE_W / 2, y: w.y - NODE_H / 2 } }));
    setSelected(id);
  };

  // ——— edge rendering geometry ———
  const center = (id) => ({ x: (positions[id]?.x ?? 0) + NODE_W / 2, y: (positions[id]?.y ?? 0) + NODE_H / 2 });
  const edgePath = (eg) => {
    const A = center(eg.a), B = center(eg.b);
    const pa = borderPoint(A.x, A.y, B.x, B.y, NODE_W / 2 + 4, NODE_H / 2 + 4);
    const pb = borderPoint(B.x, B.y, A.x, A.y, NODE_W / 2 + 4, NODE_H / 2 + 4);
    if (edgeStyle === "curved") {
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy) || 1;
      const off = Math.min(38, len * 0.18);
      const cx = mx - (dy / len) * off, cy = my + (dx / len) * off;
      return { d: `M ${pa.x} ${pa.y} Q ${cx} ${cy} ${pb.x} ${pb.y}`, mid: { x: (pa.x + 2 * cx + pb.x) / 4, y: (pa.y + 2 * cy + pb.y) / 4 } };
    }
    return { d: `M ${pa.x} ${pa.y} L ${pb.x} ${pb.y}`, mid: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 } };
  };

  // is an edge part of the highlighted prerequisite path / neighborhood
  const edgeState = (eg) => {
    if (selEdge && selEdge.a === eg.a && selEdge.b === eg.b) return "sel";
    if (!hi) return "normal";
    const inHood = pathMode
      ? (hi.all.has(eg.a) && hi.all.has(eg.b) &&
         ((hi.up.has(eg.a) || eg.a === selected) && (hi.up.has(eg.b) || eg.b === selected) ||
          (hi.down.has(eg.a) || eg.a === selected) && (hi.down.has(eg.b) || eg.b === selected)))
      : (eg.a === selected || eg.b === selected);
    return inHood ? "hi" : "dim";
  };

  // stats
  const cycleCount = gM(() => {
    // count edges that go "backward" in layering as cycle indicators
    const lay = {}; const tmp = computeLayout(notes);
    notes.forEach(n => { lay[n.id] = tmp[n.id] ? tmp[n.id].x : 0; });
    let c = 0;
    notes.forEach(n => n.links.forEach(l => { if (byId[l] && lay[l] < lay[n.id] && !(byId[l].links || []).includes(n.id)) c++; }));
    return c;
  }, [notes, byId]);
  const orphanCount = gM(() => notes.filter(n => n.links.length === 0 && inAdj[n.id].length === 0).length, [notes, inAdj]);
  const totalLinks = gM(() => notes.reduce((s, n) => s + n.links.length, 0), [notes]);
  const mastery = (progress && progress.mastery) || {};
  const masteredCount = gM(() => visible.filter(n => mastery[n.id] === 'mastered').length, [visible, mastery]);

  const sel = selected ? byId[selected] : null;

  // ——— minimap geometry ———
  const mm = gM(() => {
    if (!visible.length) return null;
    const xs = visible.map(n => positions[n.id]?.x ?? 0);
    const ys = visible.map(n => positions[n.id]?.y ?? 0);
    const minX = Math.min(...xs) - 40, maxX = Math.max(...xs) + NODE_W + 40;
    const minY = Math.min(...ys) - 40, maxY = Math.max(...ys) + NODE_H + 40;
    const W = 184, H = 124;
    const s = Math.min(W / (maxX - minX), H / (maxY - minY));
    return { minX, minY, s, W, H, w: maxX - minX, h: maxY - minY };
  }, [visible, positions]);
  const mmRect = () => {
    if (!mm || !stageRef.current) return null;
    const r = stageRef.current.getBoundingClientRect();
    const vx = (-transform.x / transform.k - mm.minX) * mm.s;
    const vy = (-transform.y / transform.k - mm.minY) * mm.s;
    const vw = (r.width / transform.k) * mm.s, vh = (r.height / transform.k) * mm.s;
    return { vx, vy, vw, vh };
  };
  const onMinimap = (e) => {
    if (!mm || !stageRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const wx = (e.clientX - r.left) / mm.s + mm.minX;
    const wy = (e.clientY - r.top) / mm.s + mm.minY;
    const sr = stageRef.current.getBoundingClientRect();
    setTransform(t => ({ ...t, x: sr.width / 2 - wx * t.k, y: sr.height / 2 - wy * t.k }));
  };

  const arrow = mmRect();

  return (
    <div className="graph-view">
      {/* toolbar */}
      <div className="graph-toolbar">
        <span className="tb-title"><span className="glyph">⊹</span> The Weave</span>
        <span className="tb-stats">
          <span><b>{visible.length}</b> nodes</span>
          <span><b>{edges.length}</b> edges</span>
          {masteredCount > 0 && <span style={{color:'var(--moss)'}}><b style={{color:'var(--moss)'}}>{masteredCount}</b> mastered</span>}
          {orphanCount > 0 && <span><b>{orphanCount}</b> orphan{orphanCount !== 1 ? "s" : ""}</span>}
          {cycleCount > 0 && <span className="warn">⚠ {cycleCount} cycle edge{cycleCount !== 1 ? "s" : ""}</span>}
        </span>

        <span className="tb-spacer" />

        <div className="tb-group">
          {categories.map(c => (
            <button key={c.id} className={"gchip" + (hiddenCats.has(c.id) ? " off" : "")} onClick={() => toggleCat(c.id)} title={c.name}>
              <span className={"dot " + c.color} /> {c.name.split(" ")[0]}
            </button>
          ))}
        </div>

        <span className="tb-rule" />

        <div className="tb-group">
          <button className="tb-btn" style={{background:'var(--accent)', color:'#faf3e2', borderColor:'var(--accent)'}} onClick={() => onLearn && onLearn(null)} title="Build a learning plan"><span className="glyph">▸</span> Learn</button>
          <button className={"tb-btn" + (pathMode ? " on" : "")} onClick={() => setPathMode(p => !p)} title="Highlight the full prerequisite chain of the selected node">
            <span className="glyph">⥱</span> Path
          </button>
          <button className="tb-btn" onClick={tidy} title="Auto-arrange into prerequisite layers"><span className="glyph">⌗</span> Tidy</button>
          <button className="tb-btn" onClick={addNodeCenter} title="Add a node (or double-click the canvas)"><span className="glyph">+</span> Node</button>
        </div>

        <span className="tb-rule" />

        <div className="tb-group">
          <button className="tb-btn icon" onClick={() => zoomBy(1 / 1.2)} title="Zoom out">−</button>
          <span className="zoom-readout">{Math.round(transform.k * 100)}%</span>
          <button className="tb-btn icon" onClick={() => zoomBy(1.2)} title="Zoom in">+</button>
          <button className="tb-btn" onClick={fit} title="Fit graph to screen"><span className="glyph">⤢</span> Fit</button>
        </div>
      </div>

      {/* stage */}
      <div
        ref={stageRef}
        className={"graph-stage" + (panning ? " panning" : "") + (linkDrag ? " linking" : "")}
        onMouseDown={startPan}
        onDoubleClick={onStageDblClick}
        onWheel={onWheel}
      >
        <div className="graph-world" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}>
          {/* edges */}
          <svg className="graph-edges" width="8000" height="6000">
            <defs>
              {Object.entries(MARKER_COLORS).map(([k, col]) => (
                <marker key={k} id={"arrow-" + k} viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 1 L 9 5 L 0 9 z" fill={col} />
                </marker>
              ))}
            </defs>
            {edges.map(eg => {
              const { d } = edgePath(eg);
              const st = edgeState(eg);
              const catColor = st === "hi" || st === "sel" ? "var(--accent)" : (st === "dim" ? MARKER_COLORS.dim : CAT_VAR[byId[eg.a].color || (catById[byId[eg.a].category] || {}).color] || "var(--rule-2)");
              const mk = st === "hi" || st === "sel" ? "hi" : (st === "dim" ? "dim" : (catById[byId[eg.a].category] || {}).color || "dim");
              return (
                <g key={eg.a + ">" + eg.b}>
                  <path className="edge-hit" d={d} onClick={(ev) => { ev.stopPropagation(); setSelEdge(eg); setSelected(null); }} />
                  <path
                    className={"edge-line " + st}
                    d={d}
                    stroke={catColor}
                    strokeWidth={1.5}
                    markerEnd={`url(#arrow-${mk})`}
                    markerStart={eg.bi ? `url(#arrow-${mk})` : undefined}
                  />
                </g>
              );
            })}
            {/* delete affordance on selected edge */}
            {selEdge && (() => {
              const { mid } = edgePath(selEdge);
              return (
                <g className="edge-del" transform={`translate(${mid.x} ${mid.y})`} onClick={(e) => { e.stopPropagation(); removeEdge(selEdge); setSelEdge(null); }}>
                  <circle r="9" />
                  <line x1="-3.5" y1="-3.5" x2="3.5" y2="3.5" />
                  <line x1="3.5" y1="-3.5" x2="-3.5" y2="3.5" />
                </g>
              );
            })()}
            {/* temp link being drawn */}
            {linkDrag && (() => {
              const A = center(linkDrag.from);
              const pa = borderPoint(A.x, A.y, linkDrag.x, linkDrag.y, NODE_W / 2 + 4, NODE_H / 2 + 4);
              return <path className="edge-temp" d={`M ${pa.x} ${pa.y} L ${linkDrag.x} ${linkDrag.y}`} markerEnd="url(#arrow-hi)" />;
            })()}
          </svg>

          {/* nodes */}
          {visible.map(n => {
            const p = positions[n.id] || { x: 0, y: 0 };
            const cat = catById[n.category] || {};
            const deg = n.links.length + inAdj[n.id].length;
            let cls = "gnode";
            if (draggingId === n.id) cls += " dragging";
            if (mastery[n.id] === 'mastered') cls += " mastered";
            if (selected === n.id) cls += " selected";
            else if (hi) {
              if (hi.up.has(n.id)) cls += " prereq";
              else if (hi.down.has(n.id)) cls += " unlocks";
              else cls += " dim";
            }
            if (linkDrag && linkDrag.over === n.id) cls += " link-target";
            return (
              <div
                key={n.id}
                data-node={n.id}
                className={cls}
                style={{ left: p.x, top: p.y, borderLeftColor: (selected === n.id || (hi && hi.up.has(n.id))) ? undefined : CAT_VAR[cat.color] }}
                onMouseDown={(e) => startNodeDrag(e, n.id)}
                onDoubleClick={(e) => { e.stopPropagation(); onOpen(n.id); }}
              >
                <div className="gn-cat">
                  <span className={"dot " + cat.color} /> {cat.name ? cat.name.split(" ")[0] : n.category}
                  <span className="deg">{deg}</span>
                </div>
                <div className="gn-title">{n.title}</div>
                {mastery[n.id] === 'mastered' && <div className="gn-badge" title="Mastered">✓</div>}
                <div className="gport" title="Drag to another node to link" onMouseDown={(e) => startLink(e, n.id)} />
              </div>
            );
          })}
        </div>

        {/* inspector */}
        {sel && (
          <div className="graph-inspector" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ins-head">
              <div className="ins-cat">
                <span className={"dot " + (catById[sel.category] || {}).color} />
                {(catById[sel.category] || {}).name || sel.category}
                <span className="close" onClick={() => setSelected(null)}>×</span>
              </div>
              <textarea
                className="ins-title" rows={2} value={sel.title}
                onChange={(e) => onRenameNote(sel.id, e.target.value)}
              />
              <div className="ins-catpick">
                {categories.map(c => (
                  <span key={c.id} className={"cp" + (c.id === sel.category ? " active" : "")} title={c.name} onClick={() => onSetCategory(sel.id, c.id)}>
                    <span className={"dot " + c.color} />
                  </span>
                ))}
              </div>
            </div>
            <div className="ins-body">
              {sel.summary && <p className="ins-summary">{sel.summary}</p>}

              <div className="ins-block">
                <div className="ins-sec"><span className="ar">←</span> Prerequisites <span className="n">· {inAdj[sel.id].length}</span></div>
                {inAdj[sel.id].length === 0 && <div className="ins-empty">A foundation — nothing comes before it.</div>}
                {inAdj[sel.id].map(id => (
                  <div key={id} className="ins-link" onClick={() => setSelected(id)}>
                    <span className={"il-dot dot " + (catById[byId[id].category] || {}).color} />
                    <span className="il-title">{byId[id].title}</span>
                    <span className="il-x" title="Remove link" onClick={(e) => { e.stopPropagation(); onRemoveLink(id, sel.id); }}>×</span>
                  </div>
                ))}
              </div>

              <div className="ins-block">
                <div className="ins-sec">Unlocks <span className="ar">→</span> <span className="n">· {sel.links.length}</span></div>
                {sel.links.filter(l => byId[l]).length === 0 && <div className="ins-empty">Nothing builds on this yet. Drag the side handle to link.</div>}
                {sel.links.filter(l => byId[l]).map(id => (
                  <div key={id} className="ins-link" onClick={() => setSelected(id)}>
                    <span className={"il-dot dot " + (catById[byId[id].category] || {}).color} />
                    <span className="il-title">{byId[id].title}</span>
                    <span className="il-x" title="Remove link" onClick={(e) => { e.stopPropagation(); onRemoveLink(sel.id, id); }}>×</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="ins-foot">
              <button className="open-btn" onClick={() => onLearn && onLearn(sel.id)}>{mastery[sel.id] === 'mastered' ? 'Review ▸' : 'Learn this ▸'}</button>
              <button className="del-btn" style={{color:'var(--ink-2)'}} title="Open the full note" onClick={() => onOpen(sel.id)}>Note</button>
              <button className="del-btn" title="Delete node" onClick={() => { onDeleteNote(sel.id); setSelected(null); }}>Delete</button>
            </div>
          </div>
        )}

        {/* minimap */}
        {showMinimap && mm && (
          <div className="graph-minimap" onMouseDown={onMinimap}>
            <span className="mm-label">Map</span>
            <svg viewBox={`0 0 ${mm.W} ${mm.H}`}>
              {edges.map(eg => {
                const A = center(eg.a), B = center(eg.b);
                return <line key={"m" + eg.a + eg.b}
                  x1={(A.x - mm.minX) * mm.s} y1={(A.y - mm.minY) * mm.s}
                  x2={(B.x - mm.minX) * mm.s} y2={(B.y - mm.minY) * mm.s}
                  stroke="var(--rule-2)" strokeWidth="0.6" />;
              })}
              {visible.map(n => {
                const p = positions[n.id] || { x: 0, y: 0 };
                return <rect key={"mn" + n.id}
                  x={(p.x - mm.minX) * mm.s} y={(p.y - mm.minY) * mm.s}
                  width={NODE_W * mm.s} height={NODE_H * mm.s} rx="1.5"
                  fill={selected === n.id ? "var(--accent)" : CAT_VAR[(catById[n.category] || {}).color]} opacity={selected === n.id ? 1 : 0.8} />;
              })}
              {arrow && <rect className="mm-vp" x={arrow.vx} y={arrow.vy} width={arrow.vw} height={arrow.vh} />}
            </svg>
          </div>
        )}

        {/* hint */}
        <div className="graph-hint">
          <span><b>Drag</b> nodes · <b>scroll</b> to zoom</span>
          <span>Drag the <b>side dot</b> to link</span>
          <span>Click an edge → <kbd>⌫</kbd> to cut</span>
          <span><b>Double-click</b> canvas to add</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { GraphView });
