/* Views: Home, NoteDetail, CategoryIndex, MiniGraph, NoteList */

const { useState, useEffect, useMemo, useRef } = React;

// ——— shared bits ———
function CategoryDot({ catId, categories }) {
  const cat = categories.find(c => c.id === catId);
  if (!cat) return null;
  return <span className={`dot ${cat.color}`} />;
}

function NoteRow({ note, categories, onOpen, focused }) {
  const cat = categories.find(c => c.id === note.category);
  return (
    <div className={"note-row" + (focused ? " focused" : "")} onClick={() => onOpen(note.id)}>
      <div className="date mono">{note.created.replace(/-/g, ".")}</div>
      <div className="body">
        <div className="title">{note.title}</div>
        <div className="summary">{note.summary}</div>
      </div>
      <div className="meta">
        <span className="cat"><CategoryDot catId={note.category} categories={categories} />{cat ? cat.name : note.category}</span>
        <span>{note.tags.length} tags · {note.links.length} links</span>
      </div>
    </div>
  );
}

function NoteList({ notes, categories, onOpen, focusIndex }) {
  return (
    <div className="note-list">
      {notes.map((n, i) => (
        <NoteRow key={n.id} note={n} categories={categories} onOpen={onOpen} focused={i === focusIndex} />
      ))}
    </div>
  );
}

// ——— Home / Capture ———
function CaptureBox({ onSubmit, floating }) {
  const [text, setText] = useState("");
  const [ctx, setCtx] = useState("");
  const taRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        taRef.current && taRef.current.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function submit() {
    if (!text.trim()) return;
    onSubmit(text.trim(), ctx.trim());
    setText(""); setCtx("");
  }

  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className={"capture" + (floating ? " floating-capture" : "")}>
      <div className="prompt">
        <span className="pen">✦</span> What did you learn?
      </div>
      <textarea
        ref={taRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder="e.g. CRDTs converge because merge is a join over a semilattice…"
        rows={2}
      />
      <input
        className="ctx"
        value={ctx}
        onChange={e => setCtx(e.target.value)}
        onKeyDown={onKey}
        placeholder="Optional context — where you read it, why it matters, what to chase next…"
      />
      <div className="row">
        <span className="hint">
          <kbd>/</kbd> focus · <kbd>⌘</kbd><kbd>↵</kbd> submit · Codex will research and categorize
        </span>
        <button className="submit" onClick={submit} disabled={!text.trim()}>Send to Codex</button>
      </div>
    </div>
  );
}

function Home({ notes, categories, jobs, onOpen, onSubmit, captureFloating }) {
  // recent notes sorted desc
  const recent = useMemo(() => [...notes].sort((a,b) => b.created.localeCompare(a.created)).slice(0, 8), [notes]);
  const inFlight = jobs.filter(j => j.state === 'researching' || j.state === 'queued');

  return (
    <div className="home">
      <div className="crumbs"><span>Desk</span><span className="sep">/</span><span>Capture</span></div>
      {!captureFloating && <CaptureBox onSubmit={onSubmit} />}

      <div className="section-label">
        <h2>In flight</h2>
        <span className="meta">{inFlight.length} job{inFlight.length !== 1 ? 's' : ''} · codex worker · meilisearch idle</span>
      </div>
      {inFlight.length === 0 ? (
        <div className="empty">Codex is quiet. Capture something above and it'll show up here while it researches.</div>
      ) : (
        <div className="inflight-list">
          {inFlight.map(j => (
            <div key={j.id} className={"job " + j.state} style={{paddingLeft: 14, marginLeft: 0, marginBottom: 8}}>
              <div className="top">
                <span className="state"><span className="pulse" />{j.state}</span>
                <span>{j.at}</span>
                <span style={{opacity: 0.6}}>· {j.id}</span>
              </div>
              <div className="title">{j.title}</div>
            </div>
          ))}
        </div>
      )}

      <div className="section-label">
        <h2>Recently learned</h2>
        <span className="meta">{notes.length} notes total · {categories.length} categories</span>
      </div>
      <NoteList notes={recent} categories={categories} onOpen={onOpen} />
    </div>
  );
}

// ——— Mini graph ———
function MiniGraph({ note, notes, onOpen }) {
  // center node = note; ring = its outgoing links + backlinks
  const related = useMemo(() => {
    const out = note.links.map(id => notes.find(n => n.id === id)).filter(Boolean);
    const back = notes.filter(n => n.links.includes(note.id) && !note.links.includes(n.id));
    return [...out.map(n => ({ n, kind: 'out' })), ...back.map(n => ({ n, kind: 'back' }))];
  }, [note, notes]);

  const W = 280, H = 200, cx = W/2, cy = H/2;
  const R = 76;
  const angleStep = (Math.PI * 2) / Math.max(related.length, 1);

  return (
    <div className="mini-graph">
      <svg viewBox={`0 0 ${W} ${H}`}>
        {/* edges */}
        {related.map(({ n }, i) => {
          const a = -Math.PI/2 + i * angleStep;
          const x = cx + Math.cos(a) * R;
          const y = cy + Math.sin(a) * R;
          return <line key={"e"+n.id} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--rule-2)" strokeWidth="1" />;
        })}
        {/* center */}
        <circle cx={cx} cy={cy} r="8" fill="var(--accent)" />
        <circle cx={cx} cy={cy} r="13" fill="none" stroke="var(--accent)" strokeOpacity="0.3" strokeWidth="1" />
        {/* ring */}
        {related.map(({ n, kind }, i) => {
          const a = -Math.PI/2 + i * angleStep;
          const x = cx + Math.cos(a) * R;
          const y = cy + Math.sin(a) * R;
          const fill = kind === 'out' ? 'var(--ink-2)' : 'var(--ochre)';
          return (
            <g key={n.id} style={{cursor:'pointer'}} onClick={() => onOpen(n.id)}>
              <circle cx={x} cy={y} r="5" fill={fill} />
              <title>{n.title}</title>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span>● <span style={{color:'var(--accent)'}}>here</span></span>
        <span>● <span style={{color:'var(--ink-2)'}}>links to</span></span>
        <span>● <span style={{color:'var(--ochre)'}}>linked from</span></span>
      </div>
    </div>
  );
}

// ——— Note detail ———
function NoteDetail({ note, notes, categories, onOpen, onOpenCategory }) {
  const cat = categories.find(c => c.id === note.category);
  const outgoing = note.links.map(id => notes.find(n => n.id === id)).filter(Boolean);
  const backlinks = notes.filter(n => n.links.includes(note.id));
  const [showSource, setShowSource] = useState(false);

  // Render body
  const renderBlock = (b, i) => {
    if (b.type === 'h') return <h3 key={i}>{b.text}</h3>;
    if (b.type === 'q') return <blockquote key={i}>{b.text}</blockquote>;
    return <p key={i}>{b.text}</p>;
  };

  const sourceMd = useMemo(() => {
    const lines = [
      `---`,
      `id: ${note.id}`,
      `title: "${note.title.replace(/"/g, '\\"')}"`,
      `category: ${note.category}`,
      `tags: [${note.tags.map(t => `"${t}"`).join(', ')}]`,
      `created: ${note.created}`,
      `links: [${note.links.map(l => `"${l}"`).join(', ')}]`,
      `---`,
      ``,
      `> ${note.summary}`,
      ``,
      ...note.body.map(b => b.type === 'h' ? `## ${b.text}` : b.type === 'q' ? `> ${b.text}` : b.text),
    ];
    return lines.join('\n');
  }, [note]);

  return (
    <div className="note-detail">
      <div className="crumbs">
        <button onClick={() => onOpenCategory(cat.id)}>{cat.name}</button>
        <span className="sep">/</span>
        <span>{note.id}.md</span>
      </div>

      <div className="head">
        <div className="h-meta">
          <span className="cat-pill" onClick={() => onOpenCategory(cat.id)}>
            <span className={`dot ${cat.color}`} />{cat.name}
          </span>
          <span>· {note.created}</span>
          <span>· {note.tags.length} tags · {outgoing.length}↗ {backlinks.length}↘</span>
        </div>
        <h1>{note.title}</h1>
        <p className="lede">{note.summary}</p>
        <div className="tags">
          {note.tags.map(t => <span key={t} className="tag">#{t}</span>)}
        </div>
      </div>

      <div className="note-body">
        {note.body.map(renderBlock)}
      </div>

      <div className="source-toggle">
        <div className="head" onClick={() => setShowSource(s => !s)}>
          <span>{showSource ? '▾' : '▸'} Source · {note.id}.md</span>
          <span>{sourceMd.length} chars · markdown</span>
        </div>
        {showSource && <pre>{sourceMd}</pre>}
      </div>
    </div>
  );
}

// ——— Category index ———
function CategoryIndex({ category, notes, categories, onOpen }) {
  const inCat = notes.filter(n => n.category === category.id)
    .sort((a,b) => b.created.localeCompare(a.created));
  const allTags = {};
  inCat.forEach(n => n.tags.forEach(t => { allTags[t] = (allTags[t] || 0) + 1; }));
  const topTags = Object.entries(allTags).sort((a,b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="category-index">
      <div className="crumbs">
        <span>Categories</span><span className="sep">/</span><span>{category.id}</span>
      </div>
      <div className="cat-hero">
        <div className="label"><span className={`dot ${category.color}`} style={{display:'inline-block', width:8, height:8, borderRadius:'50%', marginRight:6, verticalAlign:'middle'}} />Category index · auto-generated by Codex</div>
        <h1>{category.name}</h1>
        <p>{category.summary}</p>
        <div className="stats">
          <span><b>{inCat.length}</b> notes</span>
          <span><b>{Object.keys(allTags).length}</b> distinct tags</span>
          <span><b>{inCat.reduce((s,n) => s + n.links.length, 0)}</b> outgoing links</span>
          <span>updated <b>{inCat[0]?.created || '—'}</b></span>
        </div>
      </div>

      <div className="section-label">
        <h2>Tags in this category</h2>
        <span className="meta">by frequency</span>
      </div>
      <div className="tags" style={{display:'flex', flexWrap:'wrap', gap: 6, marginBottom: 24}}>
        {topTags.map(([t, c]) => (
          <span key={t} className="tag">#{t} <span style={{opacity:0.55, marginLeft:4}}>{c}</span></span>
        ))}
      </div>

      <div className="section-label">
        <h2>Notes</h2>
        <span className="meta">most recent first</span>
      </div>
      <NoteList notes={inCat} categories={categories} onOpen={onOpen} />
    </div>
  );
}

Object.assign(window, { CaptureBox, Home, NoteDetail, CategoryIndex, MiniGraph, NoteList, NoteRow, CategoryDot });
