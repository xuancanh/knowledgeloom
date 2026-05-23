/* Knowledge Loom — app shell */

const { useState: uS, useEffect: uE, useMemo: uM, useCallback: uC, useRef: uR } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "#8a2a1f",
  "density": "balanced",
  "captureFloating": false,
  "jobStyle": "sidebar",
  "showMiniGraph": true
}/*EDITMODE-END*/;

const ACCENT_PALETTES = {
  "#8a2a1f": { light: { accent: "#8a2a1f", accent2: "#b8553e", highlight: "#f6e0a0" }, dark: { accent: "#d97559", accent2: "#e89070", highlight: "#5c4520" } },
  "#2f4a8a": { light: { accent: "#2f4a8a", accent2: "#5a72b8", highlight: "#dfe5f6" }, dark: { accent: "#8e9ed0", accent2: "#a8b6df", highlight: "#2a3552" } },
  "#4a6b2c": { light: { accent: "#4a6b2c", accent2: "#6f8c4c", highlight: "#e3ecc8" }, dark: { accent: "#a8c073", accent2: "#bdd590", highlight: "#3a4a26" } },
  "#a37018": { light: { accent: "#a37018", accent2: "#c08e30", highlight: "#f5e4b6" }, dark: { accent: "#d6a548", accent2: "#e6bb6c", highlight: "#574020" } },
};

function applyAccent(theme, accent) {
  const p = ACCENT_PALETTES[accent] || ACCENT_PALETTES["#8a2a1f"];
  const v = p[theme] || p.light;
  const r = document.documentElement;
  r.style.setProperty('--accent', v.accent);
  r.style.setProperty('--accent-2', v.accent2);
  r.style.setProperty('--highlight', v.highlight);
}

function makeJobId() {
  return "j-" + (302 + Math.floor(Math.random() * 800));
}

function classifyForResearch(title) {
  // Trivial keyword routing for the demo
  const t = title.toLowerCase();
  if (/consensus|raft|paxos|crdt|replica|spanner|truetime|lamport|vector clock|distributed|snapshot/.test(t)) return 'distributed-systems';
  if (/memory|cogni|brain|attention|chunk|predict|perception|hallucin/.test(t)) return 'cognitive-science';
  if (/lavoisier|priestley|kuhn|paradigm|history|royal society|inoculation|smallpox|antikythera/.test(t)) return 'history-of-science';
  if (/crypto|lattice|cipher|aes|rsa|otp|pad|side[- ]channel|encryption|kyber|signature/.test(t)) return 'cryptography';
  if (/zipf|phoneme|morpheme|grammar|verb|syntax|linguist/.test(t)) return 'linguistics';
  if (/bayes|probab|prior|posterior|base rate|correlat|independence|sampling/.test(t)) return 'probability';
  return 'distributed-systems';
}

function makeSummary(title) {
  // Stitch a plausible Codex-style summary
  const stubs = [
    "Codex pulled in three references and reconciled them with two existing notes; the consensus framing below.",
    "Expanded from your capture with background context and an explicit statement of what it costs.",
    "Synthesized from your one-liner plus the related notes Codex pattern-matched against.",
    "Researched against the related notes already in your vault — the framing here threads them together.",
  ];
  return stubs[Math.floor(Math.random() * stubs.length)] + " — " + title;
}

function App() {
  const { CATEGORIES, NOTES, INITIAL_JOBS } = window.KL_DATA;
  const [notes, setNotes] = uS(NOTES);
  const [jobs, setJobs] = uS(INITIAL_JOBS);
  const [view, setView] = uS({ kind: 'home' }); // {kind:'home'} | {kind:'note', id} | {kind:'category', id}
  const [searchOpen, setSearchOpen] = uS(false);
  const [tweaks, setTweaksRaw] = uS(TWEAK_DEFAULTS);
  const [editModeOn, setEditModeOn] = uS(false);
  const [toasts, setToasts] = uS([]);

  // theme apply
  uE(() => {
    document.documentElement.dataset.theme = tweaks.theme;
    applyAccent(tweaks.theme, tweaks.accent);
  }, [tweaks.theme, tweaks.accent]);

  // tweaks panel host protocol
  uE(() => {
    const onMsg = (e) => {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode') setEditModeOn(true);
      if (d.type === '__deactivate_edit_mode') setEditModeOn(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const setTweak = uC((keyOrObj, value) => {
    setTweaksRaw(prev => {
      const next = typeof keyOrObj === 'string' ? { ...prev, [keyOrObj]: value } : { ...prev, ...keyOrObj };
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: next }, '*');
      return next;
    });
  }, []);

  // Open helpers
  const openNote = uC((id) => setView({ kind: 'note', id }), []);
  const openCategory = uC((id) => setView({ kind: 'category', id }), []);
  const goHome = uC(() => setView({ kind: 'home' }), []);

  // ⌘K / etc keyboard shortcuts
  uE(() => {
    const onKey = (e) => {
      const inField = ['TEXTAREA', 'INPUT'].includes((document.activeElement || {}).tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(s => !s);
        return;
      }
      if (e.key === 'Escape') { setSearchOpen(false); return; }
      if (inField) return;
      // j/k nav for note rows in the current main listing
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        const dir = e.key === 'j' ? 1 : -1;
        const rows = Array.from(document.querySelectorAll('.note-row'));
        if (rows.length === 0) return;
        const currentlyFocused = rows.findIndex(r => r.classList.contains('focused'));
        const next = currentlyFocused < 0 ? (dir > 0 ? 0 : rows.length - 1)
                                          : Math.max(0, Math.min(rows.length - 1, currentlyFocused + dir));
        rows.forEach(r => r.classList.remove('focused'));
        rows[next].classList.add('focused');
        rows[next].scrollIntoView({ block: 'nearest' });
      }
      if (e.key === 'Enter') {
        const focused = document.querySelector('.note-row.focused');
        if (focused) focused.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ——— job submit + progression ———
  const submitCapture = uC((title, ctx) => {
    const id = makeJobId();
    const now = new Date();
    const at = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    const newJob = { id, title, state: 'queued', at };
    setJobs(prev => [newJob, ...prev]);
    if (tweaks.jobStyle === 'toast') {
      setToasts(t => [{ ...newJob, _key: id+'-q' }, ...t]);
    }

    // queued → researching
    setTimeout(() => {
      setJobs(prev => prev.map(j => j.id === id ? { ...j, state: 'researching' } : j));
      if (tweaks.jobStyle === 'toast') setToasts(t => [{ id, title, state:'researching', at, _key: id+'-r' }, ...t.filter(x => !x._key.startsWith(id+'-'))]);
    }, 700);

    // researching → saved (or fallback ~15%)
    const dur = 2400 + Math.random() * 1200;
    setTimeout(() => {
      const fallback = Math.random() < 0.15;
      const category = classifyForResearch(title);
      const cat = CATEGORIES.find(c => c.id === category);
      const noteId = "k-" + id.slice(2);
      const finalState = fallback ? 'fallback' : 'saved';
      const newNote = {
        id: noteId,
        title,
        category,
        tags: [
          ...(category === 'distributed-systems' ? ['consensus'] : []),
          ...(ctx ? ['from-capture'] : []),
          'new',
        ],
        created: now.toISOString().slice(0,10),
        summary: ctx ? `${ctx}. ${makeSummary(title)}` : makeSummary(title),
        body: [
          { type: 'p', text: ctx || "Captured from the desk; Codex expanded the surrounding context." },
          { type: 'h', text: 'Background' },
          { type: 'p', text: `Codex routed this to ${cat ? cat.name : category} based on title keywords. Edit the markdown to refine.` },
          { type: 'q', text: title },
        ],
        links: [],
      };
      setNotes(prev => [newNote, ...prev]);
      setJobs(prev => prev.map(j => j.id === id ? { ...j, state: finalState, category, noteId } : j));
      if (tweaks.jobStyle === 'toast') {
        setToasts(t => [{ id, title, state: finalState, at, _key: id+'-s', noteId }, ...t.filter(x => !x._key.startsWith(id+'-'))]);
        setTimeout(() => setToasts(t => t.filter(x => !x._key.startsWith(id+'-'))), 4200);
      }
    }, dur);
  }, [tweaks.jobStyle, CATEGORIES]);

  // ——— render screens ———
  const currentNote = view.kind === 'note' ? notes.find(n => n.id === view.id) : null;
  const currentCategory = view.kind === 'category' ? CATEGORIES.find(c => c.id === view.id) : null;
  const showContextPanel = view.kind === 'note' && !!currentNote;

  return (
    <div className={"app" + (showContextPanel ? "" : " no-right") + (tweaks.density === 'dense' ? ' dense' : '')}>
      {/* LEFT RAIL */}
      <aside className="rail">
        <div className="rail-head">
          <div className="wordmark">
            <span className="mark" />
            <span className="name">Knowledge <em>Loom</em></span>
          </div>
          <div className="rail-sub">a desk for things you just learned</div>
        </div>

        <nav className="rail-nav">
          <button className={"nav-item" + (view.kind === 'home' ? ' active' : '')} onClick={goHome}>
            <span style={{width:14, color:'var(--accent)'}}>✦</span> Capture
            <span className="kbd">/</span>
          </button>
          <button className="nav-item" onClick={() => setSearchOpen(true)}>
            <span style={{width:14, color:'var(--accent)'}}>⌕</span> Search
            <span className="kbd">⌘K</span>
          </button>

          <div className="grp-label"><span>Categories</span><span>{CATEGORIES.length}</span></div>
          {CATEGORIES.map(c => {
            const count = notes.filter(n => n.category === c.id).length;
            return (
              <button
                key={c.id}
                className={"nav-item" + (view.kind === 'category' && view.id === c.id ? ' active' : '')}
                onClick={() => openCategory(c.id)}
              >
                <span className={"dot " + c.color} />
                <span style={{flex:1, textAlign:'left'}}>{c.name}</span>
                <span className="count">{count}</span>
              </button>
            );
          })}
        </nav>

        {tweaks.jobStyle === 'sidebar' && (
          <div className="activity">
            <div className="activity-head">
              <span className="label">Activity · Codex</span>
              <span className="meta">{jobs.length} jobs</span>
            </div>
            {jobs.slice(0, 14).map(j => (
              <div key={j.id} className={"job " + j.state}>
                <div className="top">
                  <span className="state"><span className="pulse" />{j.state}</span>
                  <span>· {j.at}</span>
                  <span style={{opacity:0.6}}>· {j.id}</span>
                </div>
                <div className="title" onClick={() => j.noteId && openNote(j.noteId)}>{j.title}</div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* CENTER */}
      <main>
        <div className="utility">
          <button className="search-trigger" onClick={() => setSearchOpen(true)}>
            <span className="glyph">⌕</span>
            <span>Search title, tags, body, category…</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="util-actions">
            <button className="theme-toggle" onClick={() => setTweak('theme', tweaks.theme === 'light' ? 'dark' : 'light')}>
              <span className="glyph">{tweaks.theme === 'light' ? '☾' : '☀'}</span>
              {tweaks.theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <button onClick={goHome}>Desk</button>
          </div>
        </div>

        <div className="main">
          {view.kind === 'home' && (
            <Home
              notes={notes}
              categories={CATEGORIES}
              jobs={jobs}
              onOpen={openNote}
              onSubmit={submitCapture}
              captureFloating={tweaks.captureFloating}
            />
          )}
          {view.kind === 'note' && currentNote && (
            <NoteDetail
              note={currentNote}
              notes={notes}
              categories={CATEGORIES}
              onOpen={openNote}
              onOpenCategory={openCategory}
            />
          )}
          {view.kind === 'category' && currentCategory && (
            <CategoryIndex
              category={currentCategory}
              notes={notes}
              categories={CATEGORIES}
              onOpen={openNote}
            />
          )}
        </div>
      </main>

      {/* RIGHT CONTEXT PANEL (only on note detail) */}
      {showContextPanel && (
        <aside className="context">
          {tweaks.showMiniGraph && (
            <div className="ctx-block">
              <h3>Connections</h3>
              <MiniGraph note={currentNote} notes={notes} onOpen={openNote} />
            </div>
          )}
          <div className="ctx-block">
            <h3>Links out · {currentNote.links.length}</h3>
            <ul className="link-list">
              {currentNote.links.map(id => {
                const n = notes.find(x => x.id === id);
                if (!n) return null;
                const cat = CATEGORIES.find(c => c.id === n.category);
                return (
                  <li key={id} onClick={() => openNote(id)}>
                    <span className="arrow">↗</span>
                    <div>
                      <div className="ltitle">{n.title}</div>
                      <div className="lcat">{cat ? cat.name : ''} · {n.created}</div>
                    </div>
                  </li>
                );
              })}
              {currentNote.links.length === 0 && <li style={{color:'var(--muted)', fontStyle:'italic', borderBottom:'none'}}>None yet. Codex will add some after the next pass.</li>}
            </ul>
          </div>
          <div className="ctx-block">
            <h3>Backlinks · {notes.filter(n => n.links.includes(currentNote.id)).length}</h3>
            <ul className="link-list">
              {notes.filter(n => n.links.includes(currentNote.id)).map(n => {
                const cat = CATEGORIES.find(c => c.id === n.category);
                return (
                  <li key={n.id} onClick={() => openNote(n.id)}>
                    <span className="arrow">↘</span>
                    <div>
                      <div className="ltitle">{n.title}</div>
                      <div className="lcat">{cat ? cat.name : ''} · {n.created}</div>
                    </div>
                  </li>
                );
              })}
              {notes.filter(n => n.links.includes(currentNote.id)).length === 0 && <li style={{color:'var(--muted)', fontStyle:'italic', borderBottom:'none'}}>Nothing links here yet.</li>}
            </ul>
          </div>
          <div className="ctx-block">
            <h3>File</h3>
            <div className="fine">
              <div><b>{currentNote.id}.md</b></div>
              <div style={{marginTop:4}}>vault / {CATEGORIES.find(c => c.id === currentNote.category)?.id}</div>
              <div style={{marginTop:4}}>indexed · meilisearch</div>
            </div>
          </div>
        </aside>
      )}

      {/* Floating capture */}
      {tweaks.captureFloating && view.kind === 'home' && (
        <CaptureBox onSubmit={submitCapture} floating />
      )}

      {/* Toast job feed */}
      {tweaks.jobStyle === 'toast' && (
        <div className="toast-stack">
          {toasts.slice(0, 4).map(t => (
            <div key={t._key} className={"toast " + t.state}>
              <div style={{flex:1}}>
                <div className="state">{t.state}</div>
                <div style={{marginTop:3, lineHeight:1.35}}>{t.title}</div>
              </div>
              {t.state === 'saved' && t.noteId && (
                <button className="mono" style={{fontSize:10.5, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.1em'}} onClick={() => openNote(t.noteId)}>Open</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Search overlay */}
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        notes={notes}
        categories={CATEGORIES}
        onOpen={openNote}
      />

      {/* Tweaks */}
      {editModeOn && (
        <TweaksPanel onClose={() => setEditModeOn(false)} title="Tweaks">
          <TweakSection label="Theme">
            <TweakRadio
              label="Mode"
              value={tweaks.theme}
              options={[{value:'light', label:'Light'}, {value:'dark', label:'Dark'}]}
              onChange={v => setTweak('theme', v)}
            />
            <TweakColor
              label="Accent"
              value={tweaks.accent}
              options={["#8a2a1f", "#2f4a8a", "#4a6b2c", "#a37018"]}
              onChange={v => setTweak('accent', v)}
            />
          </TweakSection>

          <TweakSection label="Layout">
            <TweakRadio
              label="Density"
              value={tweaks.density}
              options={[{value:'balanced', label:'Balanced'}, {value:'dense', label:'Dense'}]}
              onChange={v => setTweak('density', v)}
            />
            <TweakToggle
              label="Floating capture box"
              value={tweaks.captureFloating}
              onChange={v => setTweak('captureFloating', v)}
            />
          </TweakSection>

          <TweakSection label="Job feed">
            <TweakRadio
              label="Show jobs as"
              value={tweaks.jobStyle}
              options={[{value:'sidebar', label:'Sidebar'}, {value:'toast', label:'Toasts'}]}
              onChange={v => setTweak('jobStyle', v)}
            />
          </TweakSection>

          <TweakSection label="Note detail">
            <TweakToggle
              label="Mini graph in right rail"
              value={tweaks.showMiniGraph}
              onChange={v => setTweak('showMiniGraph', v)}
            />
          </TweakSection>
        </TweaksPanel>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
