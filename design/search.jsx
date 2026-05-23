/* Search overlay — fuzzy-ish over title, summary, tags, body, category */

const { useState: useStateS, useEffect: useEffectS, useMemo: useMemoS, useRef: useRefS } = React;

function highlightText(text, q) {
  if (!q) return text;
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return text;
  const re = new RegExp("(" + tokens.map(t => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|') + ")", 'gi');
  const parts = text.split(re);
  return parts.map((p, i) => re.test(p) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>);
}

function searchAll(notes, categories, q) {
  if (!q.trim()) {
    // No query → show recent
    return notes.slice(0, 12).map(n => ({ note: n, score: 0, snip: n.summary, field: 'recent' }));
  }
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = notes.map(n => {
    let score = 0;
    let snipField = 'summary', snip = n.summary;
    const title = n.title.toLowerCase();
    const summary = n.summary.toLowerCase();
    const tagStr = n.tags.join(' ').toLowerCase();
    const body = n.body.map(b => b.text).join(' ').toLowerCase();
    const catName = (categories.find(c => c.id === n.category)?.name || '').toLowerCase();
    for (const t of tokens) {
      if (title.includes(t)) score += 8;
      if (summary.includes(t)) score += 4;
      if (tagStr.includes(t)) score += 5;
      if (catName.includes(t)) score += 3;
      if (body.includes(t)) score += 1;
    }
    // build a snippet from body if matched
    for (const t of tokens) {
      const i = body.indexOf(t);
      if (i >= 0 && !summary.includes(t)) {
        const s = Math.max(0, i - 40);
        snip = (s > 0 ? '…' : '') + body.slice(s, s + 130) + '…';
        snipField = 'body';
        break;
      }
    }
    return { note: n, score, snip, field: snipField };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  return scored;
}

function SearchOverlay({ open, onClose, notes, categories, onOpen }) {
  const [q, setQ] = useStateS("");
  const [idx, setIdx] = useStateS(0);
  const inputRef = useRefS(null);

  useEffectS(() => {
    if (open) {
      setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
      setQ("");
      setIdx(0);
    }
  }, [open]);

  const results = useMemoS(() => searchAll(notes, categories, q), [notes, categories, q]);

  useEffectS(() => { setIdx(0); }, [q]);

  useEffectS(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(results.length - 1, i + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
      if (e.key === 'Enter' && results[idx]) {
        e.preventDefault();
        onOpen(results[idx].note.id);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, idx, onClose, onOpen]);

  if (!open) return null;

  // group by category for display when there is no query (recent) or by score otherwise
  const grouped = useMemoS(() => {
    if (!q.trim()) {
      const g = {};
      results.forEach(r => {
        const cn = categories.find(c => c.id === r.note.category)?.name || 'Uncategorized';
        (g[cn] = g[cn] || []).push(r);
      });
      return Object.entries(g);
    }
    return [["Matches", results]];
  }, [results, q, categories]);

  let runningIdx = -1;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-panel" onClick={e => e.stopPropagation()}>
        <div className="search-input">
          <span className="glyph">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search across title, summary, tags, body, category…"
          />
          <span className="esc">esc</span>
        </div>
        <div className="search-results">
          {results.length === 0 && (
            <div style={{padding: 28, color: 'var(--muted)', fontStyle: 'italic', textAlign:'center'}}>
              No matches. Try a tag like <span className="mono" style={{fontStyle:'normal'}}>#consensus</span> or a phrase.
            </div>
          )}
          {grouped.map(([label, rs]) => (
            <div key={label}>
              <div className="search-grp">{label} · {rs.length}</div>
              {rs.map(r => {
                runningIdx++;
                const myIdx = runningIdx;
                const cat = categories.find(c => c.id === r.note.category);
                return (
                  <div
                    key={r.note.id}
                    className={"search-hit" + (myIdx === idx ? " active" : "")}
                    onClick={() => { onOpen(r.note.id); onClose(); }}
                    onMouseEnter={() => setIdx(myIdx)}
                  >
                    <div>
                      <div className="h-title">{highlightText(r.note.title, q)}</div>
                      <div className="h-snip">{highlightText(r.snip, q)}</div>
                    </div>
                    <div className="h-meta">
                      <div>{cat ? cat.name : ''}</div>
                      <div style={{marginTop: 3}}>{r.note.created}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="search-foot">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span style={{marginLeft:'auto'}}>meilisearch · {results.length} hits</span>
        </div>
      </div>
    </div>
  );
}

window.SearchOverlay = SearchOverlay;
