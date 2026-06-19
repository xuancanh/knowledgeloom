/* learn.jsx — PlanBuilder modal + LearnSession player (TikTok-style vertical
   micro-cards) + small gamification widgets. Pulls deck content from
   window.KL_LEARN. */

const { useState: lS, useEffect: lE, useMemo: lM, useRef: lR, useCallback: lC } = React;
const KL = () => window.KL_LEARN;

/* ───────────────────── gamification widgets ───────────────────── */
function GoalRing({ value, goal }) {
  const r = 9, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, goal ? value / goal : 0));
  return (
    <svg className="goal-ring" width="26" height="26" viewBox="0 0 26 26" title={`Daily goal · ${value}/${goal} XP`}>
      <circle cx="13" cy="13" r={r} fill="none" stroke="var(--rule)" strokeWidth="3.2" />
      <circle cx="13" cy="13" r={r} fill="none" stroke="var(--moss)" strokeWidth="3.2"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 13 13)" style={{ transition: "stroke-dashoffset 400ms ease" }} />
    </svg>
  );
}
function StreakChip({ streak }) {
  return <span className="streak-chip" title="Day streak"><span className="fl">●</span>{streak}</span>;
}
function XpChip({ xp }) {
  return <span className="xp-chip" title="Total XP"><span className="xp">◆</span>{xp.toLocaleString()}</span>;
}

/* ───────────────────────── Plan builder ───────────────────────── */
function PlanBuilder({ notes, categories, seedNodeId, progress, onStart, onClose }) {
  const byId = lM(() => Object.fromEntries(notes.map(n => [n.id, n])), [notes]);
  const catById = lM(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const [scope, setScope] = lS(seedNodeId ? "node" : "category");
  const [category, setCategory] = lS((seedNodeId && byId[seedNodeId]?.category) || categories[0].id);
  const [includePrereqs, setIncludePrereqs] = lS(true);
  const [format, setFormat] = lS("slides");

  const planIds = lM(() => KL().buildPlan({ scope, nodeId: seedNodeId, category, includePrereqs, notes }),
    [scope, seedNodeId, category, includePrereqs, notes]);
  const cards = lM(() => KL().estimateCards(planIds, notes), [planIds, notes]);
  const mins = Math.max(1, Math.round(cards * 0.4));
  const seedNote = seedNodeId ? byId[seedNodeId] : null;

  return (
    <div className="planner" onMouseDown={onClose}>
      <div className="planner-panel" onMouseDown={e => e.stopPropagation()}>
        <div className="planner-head">
          <div className="eyebrow">
            <span>◷</span> Learning plan
            <span className="x" onClick={onClose}>×</span>
          </div>
          <h2>{scope === "node" && seedNote ? `Learn “${KL().clip(seedNote.title, 46)}”`
            : scope === "category" ? `${catById[category]?.name} curriculum`
            : "The whole vault, in order"}</h2>
        </div>

        <div className="planner-scope">
          <button className={"scope-tab" + (scope === "node" ? " active" : "")} disabled={!seedNodeId} onClick={() => setScope("node")}>
            {seedNote ? "This node + prerequisites" : "Pick a node first"}
          </button>
          <button className={"scope-tab" + (scope === "category" ? " active" : "")} onClick={() => setScope("category")}>By category</button>
          <button className={"scope-tab" + (scope === "everything" ? " active" : "")} onClick={() => setScope("everything")}>Everything</button>
        </div>

        {scope === "category" && (
          <div className="planner-cat">
            {categories.map(c => (
              <button key={c.id} className={"gchip" + (category === c.id ? " active" : "")} onClick={() => setCategory(c.id)}>
                <span className={"dot " + c.color} /> {c.name}
              </button>
            ))}
          </div>
        )}

        {scope !== "everything" && scope !== "node" && (
          <div className="planner-opts">
            <label>
              <input type="checkbox" checked={includePrereqs} onChange={e => setIncludePrereqs(e.target.checked)} />
              Pull in prerequisites from other areas
            </label>
          </div>
        )}

        <div className="planner-format">
          <button className={"pfmt" + (format === "slides" ? " active" : "")} onClick={() => setFormat("slides")}>
            <span className="pf-ic">▤</span>
            <span className="pf-tx"><b>Slide lesson</b><i>Swipe through micro-cards — teach, flashcards, quizzes, recap.</i></span>
          </button>
          <button className={"pfmt" + (format === "podcast" ? " active" : "")} onClick={() => setFormat("podcast")}>
            <span className="pf-ic">◉</span>
            <span className="pf-tx"><b>Podcast</b><i>Two hosts talk it through; flashcards &amp; quizzes pop up as you listen.</i></span>
          </button>
        </div>

        <div className="planner-list">
          {planIds.map((id, i) => {
            const n = byId[id]; if (!n) return null;
            const cat = catById[n.category] || {};
            const done = progress.mastery[id] === "mastered";
            return (
              <div key={id} className={"plan-step" + (done ? " done" : "")}>
                <span className="num">{i + 1}</span>
                <span className={"dot " + cat.color} />
                <span className="pt">{n.title}</span>
                <span className="pc">{cat.name ? cat.name.split(" ")[0] : ""}</span>
                {done && <span className="check">✓</span>}
              </div>
            );
          })}
        </div>

        <div className="planner-foot">
          <span className="stats"><b>{planIds.length}</b> nodes · ~<b>{cards}</b> cards · ~<b>{mins}</b> min</span>
          <button className="start" disabled={!planIds.length} onClick={() => onStart(planIds, format)}>{format === "podcast" ? "Start listening ▸" : "Start learning →"}</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── card renderers ───────────────────────── */
function HookCard({ card, catById, onNext }) {
  const cat = catById[card.category] || {};
  return (
    <div className="lcard hook">
      <div className="lcard-inner">
        <div className="l-eyebrow"><span className={"dot " + cat.color} /> {cat.name} <span className="kind">· lesson</span></div>
        <h1 className="l-title">{card.title}</h1>
        <p className="l-lede">{card.lede}</p>
        <div className="l-meta">
          <span>{(card.tags || []).slice(0, 3).map(t => "#" + t).join("  ")}</span>
        </div>
        <button className="l-cta" onClick={onNext}>Start ↓</button>
      </div>
    </div>
  );
}
function TeachCard({ card }) {
  return (
    <div className="lcard teach">
      <div className="lcard-inner">
        <div className="l-eyebrow"><span className="kind">{card.head}</span></div>
        <div className="l-head">{card.head}</div>
        <div className="l-body">{card.paras.map((p, i) => <p key={i}>{p}</p>)}</div>
      </div>
    </div>
  );
}
function InsightCard({ card, catById }) {
  return (
    <div className="lcard insight">
      <div className="lcard-inner">
        <div className="l-quote">{card.text}</div>
        <div className="l-attr">{(catById[card.attr] || {}).name || card.attr}</div>
      </div>
    </div>
  );
}
function FlashCard({ card, state, setState, onRate }) {
  const flipped = !!state.flipped;
  return (
    <div className="lcard flash">
      <div className="lcard-inner">
        <div className="l-eyebrow"><span className="kind">Flashcard</span> · recall</div>
        <div className={"flip" + (flipped ? " flipped" : "")} onClick={() => setState({ ...state, flipped: true })}>
          <div className="flip-inner">
            <div className="flip-face flip-front">
              <div className="ff-label">Prompt</div>
              <div className="ff-text">{card.front}</div>
            </div>
            <div className="flip-face flip-back">
              <div className="ff-label">Answer</div>
              <div className="ff-text">{card.back}</div>
            </div>
          </div>
        </div>
        {!flipped
          ? <div className="flip-hint">Tap the card to reveal</div>
          : (
            <div className="flash-rate">
              <button className="again" onClick={() => onRate("again")}>Again<span className="sub">&lt; 1d</span></button>
              <button className="good" onClick={() => onRate("good")}>Good<span className="sub">3d</span></button>
              <button className="easy" onClick={() => onRate("easy")}>Easy<span className="sub">7d</span></button>
            </div>
          )}
      </div>
    </div>
  );
}
function QuizCard({ card, state, setState, onAnswer, onNext }) {
  const picked = state.picked;
  const answered = picked != null;
  const KEYS = ["A", "B", "C", "D", "E"];
  return (
    <div className="lcard quiz">
      <div className="lcard-inner">
        <div className="l-eyebrow"><span className="kind">Quick check</span></div>
        <div className="q-prompt">{card.prompt}</div>
        <div className="q-opts">
          {card.options.map((opt, i) => {
            const isCorrect = opt === card.answer;
            let cls = "qopt";
            if (answered) {
              cls += " locked";
              if (isCorrect) cls += " correct";
              else if (opt === picked) cls += " wrong";
              else cls += " dimmed";
            }
            return (
              <button key={i} className={cls} disabled={answered}
                onClick={() => { if (answered) return; setState({ picked: opt }); onAnswer(opt === card.answer); }}>
                <span className="key">{KEYS[i]}</span><span>{opt}</span>
              </button>
            );
          })}
        </div>
        {answered && (
          <div className={"q-feedback" + (picked === card.answer ? " ok" : "")}>
            {picked === card.answer ? card.feedback : `Not quite. ${card.feedback}`}
          </div>
        )}
        {answered && <button className="l-cta" onClick={onNext}>Continue ↓</button>}
      </div>
    </div>
  );
}
function PodcastCard({ card, active, hosts }) {
  const [playing, setPlaying] = lS(false);
  const [idx, setIdx] = lS(0);
  const [tick, setTick] = lS(0); // progress within current line (0..1)
  const timer = lR(null);
  const lines = card.lines;
  const durs = lM(() => lines.map(l => Math.max(2400, Math.min(7000, l.text.length * 46))), [lines]);

  lE(() => { if (!active) { setPlaying(false); } }, [active]);
  lE(() => {
    clearInterval(timer.current);
    if (!playing || !active) return;
    const start = Date.now();
    timer.current = setInterval(() => {
      const el = Date.now() - start;
      const p = el / durs[idx];
      if (p >= 1) {
        if (idx < lines.length - 1) { setIdx(idx + 1); setTick(0); }
        else { setPlaying(false); setTick(1); clearInterval(timer.current); }
      } else setTick(p);
    }, 60);
    return () => clearInterval(timer.current);
  }, [playing, idx, active, durs, lines.length]);

  const cur = lines[idx];
  const host = hosts.find(h => h.id === cur.who) || hosts[0];
  const total = durs.reduce((a, b) => a + b, 0);
  const elapsed = durs.slice(0, idx).reduce((a, b) => a + b, 0) + tick * durs[idx];
  const fmt = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  return (
    <div className="lcard podcast">
      <div className="pod-wrap">
        <div className="pod-hosts">
          {hosts.map(h => (
            <div key={h.id} className={"pod-host" + (h.id === cur.who ? " live" : "")} style={{ color: h.color }}>
              <div className="av" style={{ background: h.color }}>{h.initial}</div>
              <div className="nm">{h.name}</div>
            </div>
          ))}
        </div>
        <div className="pod-caption" key={idx}>
          <span className="who" style={{ color: host.color }}>{host.name}</span>
          {cur.text}
        </div>
        <div className="pod-controls">
          <button className="pod-play" onClick={() => { if (idx >= lines.length - 1 && tick >= 1) { setIdx(0); setTick(0); } setPlaying(p => !p); }}>
            {playing ? "❚❚" : "▶"}
          </button>
          <div className="pod-prog" onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const p = (e.clientX - r.left) / r.width;
            let acc = 0, target = 0;
            for (let i = 0; i < durs.length; i++) { if ((acc + durs[i]) / total >= p) { target = i; break; } acc += durs[i]; target = i; }
            setIdx(target); setTick(0);
          }}>
            <i style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
          </div>
          <span className="pod-time">{fmt(elapsed)} / {fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}
function RecapCard({ card, isLast, earned, onContinue }) {
  return (
    <div className="lcard recap">
      <div className="lcard-inner">
        <div className="l-sub">Recap</div>
        <div className="l-head">{card.title}</div>
        <ul className="recap-list">
          {card.takeaways.map((t, i) => <li key={i}><span className="tick">✓</span>{t}</li>)}
        </ul>
        <div className="recap-earned">
          <span className="earn-chip">◆ <span className="v">+{earned}</span> XP this lesson</span>
          <span className="earn-chip">✓ Node mastered</span>
        </div>
        <button className="l-cta" onClick={onContinue}>{isLast ? "Finish plan ✦" : "Mark mastered & continue →"}</button>
      </div>
    </div>
  );
}

/* ───────────────────────── session shell ───────────────────────── */
function LearnSession({ planIds, notes, categories, progress, onAward, onMaster, onExit, onOpenNote, initialFormat }) {
  const byId = lM(() => Object.fromEntries(notes.map(n => [n.id, n])), [notes]);
  const catById = lM(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const hosts = KL().HOSTS;
  const CAT_TINT = { oxblood: "#b8553e", moss: "#6f8c4c", indigo: "#5a72b8", ochre: "#c08e30", teal: "#3f8f86", rust: "#a8553a" };

  const [nodeIndex, setNodeIndex] = lS(0);
  const [format, setFormat] = lS(initialFormat || "slides");
  const [mode, setMode] = lS("all");
  const [done, setDone] = lS(false);
  const xpStart = lR(progress.xp);

  const nodeId = planIds[nodeIndex];
  const note = byId[nodeId];
  const cat = note ? catById[note.category] || {} : {};
  const catColor = CAT_TINT[cat.color] || "#b8553e";

  function completeNode() {
    onMaster(nodeId);
    if (nodeIndex < planIds.length - 1) setNodeIndex(i => i + 1);
    else setDone(true);
  }
  const prevNode = lC(() => { if (nodeIndex > 0) setNodeIndex(i => i - 1); }, [nodeIndex]);

  // esc to exit
  lE(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onExit(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  if (done) {
    const earned = progress.xp - xpStart.current;
    return (
      <div className="learn-view">
        <div className="learn-top">
          <button className="lt-x" onClick={onExit}>← Back to the weave</button>
          <span className="lt-spacer" />
          <div className="lt-stats"><StreakChip streak={progress.streak} /><XpChip xp={progress.xp} /><GoalRing value={progress.todayXp} goal={progress.dailyGoalXp} /></div>
        </div>
        <div className="learn-stage">
          <div className="lcard complete">
            <div className="lcard-inner" style={{ alignItems: "center" }}>
              <div className="l-eyebrow" style={{ justifyContent: "center" }}><span className="kind">Plan complete ✦</span></div>
              <h1 className="l-title">Woven in.</h1>
              <p className="l-sub">You worked through {planIds.length} connected idea{planIds.length !== 1 ? "s" : ""}, in prerequisite order.</p>
              <div className="complete-stats">
                <div className="complete-stat"><div className="v">{planIds.length}</div><div className="k">Nodes mastered</div></div>
                <div className="complete-stat"><div className="v">+{earned}</div><div className="k">XP earned</div></div>
                <div className="complete-stat"><div className="v">{progress.streak}</div><div className="k">Day streak</div></div>
              </div>
              <button className="l-cta" onClick={onExit}>See it on the graph →</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const SLIDE_MODES = [["all", "Lesson"], ["read", "Read"], ["cards", "Cards"], ["quiz", "Quiz"]];

  return (
    <div className="learn-view">
      <div className="learn-top">
        <button className="lt-x" onClick={onExit}>✕ Exit</button>
        <span className="lt-crumb">Node <b>{nodeIndex + 1}</b>/{planIds.length} · {cat.name}</span>

        <div className="format-seg">
          <button className={format === "slides" ? "active" : ""} onClick={() => setFormat("slides")}><span className="glyph">▤</span> Slides</button>
          <button className={format === "podcast" ? "active" : ""} onClick={() => setFormat("podcast")}><span className="glyph">◉</span> Podcast</button>
        </div>

        {format === "slides" && (
          <div className="learn-modes">
            {SLIDE_MODES.map(([m, label]) => (
              <button key={m} className={"lmode" + (mode === m ? " active" : "")} onClick={() => setMode(m)}>{label}</button>
            ))}
          </div>
        )}

        <span className="lt-spacer" />
        <div className="lt-stats">
          <StreakChip streak={progress.streak} />
          <XpChip xp={progress.xp} />
          <GoalRing value={progress.todayXp} goal={progress.dailyGoalXp} />
        </div>
      </div>

      {format === "slides" ? (
        <SlideStage
          key={nodeId + ":" + mode}
          note={note} ctx={{ notes, byId, catById }} mode={mode} hosts={hosts} catById={catById}
          planIds={planIds} nodeIndex={nodeIndex} progress={progress}
          onAward={onAward} onComplete={completeNode} onPrevNode={prevNode}
          isLast={nodeIndex === planIds.length - 1}
        />
      ) : (
        window.PodcastStage ? (
          <window.PodcastStage
            key={nodeId + ":pod"}
            note={note} ctx={{ notes, byId, catById, cats: catById }} hosts={hosts}
            planIds={planIds} nodeIndex={nodeIndex} progress={progress}
            onAward={onAward} onComplete={completeNode}
            catColor={catColor} catName={cat.name}
          />
        ) : null
      )}
    </div>
  );
}

/* ─────────────────────── slide-deck stage (one node) ─────────────────────── */
function SlideStage({ note, ctx, mode, hosts, catById, planIds, nodeIndex, progress, onAward, onComplete, onPrevNode, isLast }) {
  const fullDeck = lM(() => note ? KL().buildDeck(note, ctx) : [], [note]);
  const deck = lM(() => KL().filterDeck(fullDeck, mode), [fullDeck, mode]);

  const [cardIndex, setCardIndex] = lS(0);
  const [, force] = lS(0);
  const cardStates = lR({});
  const seen = lR(new Set());
  const lessonXp = lR(0);
  const wheelLock = lR(0);

  const card = deck[cardIndex];
  const stKey = (c) => `${note.id}:${c.type}:${c._i}`;
  const getState = (c) => cardStates.current[stKey(c)] || {};
  const setState = (c, v) => { cardStates.current[stKey(c)] = v; force(x => x + 1); };

  lE(() => {
    if (!card) return;
    const k = stKey(card);
    if (seen.current.has(k)) return;
    seen.current.add(k);
    const xpFor = { hook: 3, teach: 4, insight: 4, podcast: 6, recap: 5 };
    if (xpFor[card.type]) { onAward(xpFor[card.type]); lessonXp.current += xpFor[card.type]; }
  }, [card]);

  const goNext = lC(() => {
    if (cardIndex < deck.length - 1) setCardIndex(i => i + 1);
    else onComplete();
  }, [cardIndex, deck.length, onComplete]);
  const goPrev = lC(() => {
    if (cardIndex > 0) setCardIndex(i => i - 1);
    else onPrevNode && onPrevNode();
  }, [cardIndex, onPrevNode]);

  lE(() => {
    const onKey = (e) => {
      const tag = (document.activeElement || {}).tagName;
      if (["INPUT", "TEXTAREA"].includes(tag)) return;
      if (["ArrowDown", "ArrowRight", "PageDown"].includes(e.key)) { e.preventDefault(); goNext(); }
      else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); goPrev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  const onWheel = (e) => {
    if (Math.abs(e.deltaY) < 24) return;
    const now = Date.now();
    if (now - wheelLock.current < 620) return;
    wheelLock.current = now;
    e.deltaY > 0 ? goNext() : goPrev();
  };
  const touch = lR(null);
  const onTouchStart = (e) => {
    if (e.target.closest("button, .qopt, .flip, .pod-controls, .pod-prog")) { touch.current = null; return; }
    touch.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    if (touch.current == null) return;
    const dy = e.changedTouches[0].clientY - touch.current;
    if (Math.abs(dy) > 56) (dy < 0 ? goNext() : goPrev());
    touch.current = null;
  };

  function renderCard(c, i) {
    const active = i === cardIndex;
    switch (c.type) {
      case "hook": return <HookCard card={c} catById={catById} onNext={goNext} />;
      case "teach": return <TeachCard card={c} />;
      case "insight": return <InsightCard card={c} catById={catById} />;
      case "flash": return <FlashCard card={c} state={getState(c)} setState={(v) => setState(c, v)}
        onRate={(r) => { const xp = r === "again" ? 3 : r === "good" ? 8 : 10; onAward(xp); lessonXp.current += xp; setState(c, { ...getState(c), rated: r }); goNext(); }} />;
      case "quiz": return <QuizCard card={c} state={getState(c)} setState={(v) => setState(c, v)}
        onAnswer={(ok) => { const xp = ok ? 15 : 4; onAward(xp); lessonXp.current += xp; }} onNext={goNext} />;
      case "podcast": return <PodcastCard card={c} active={active} hosts={hosts} />;
      case "recap": return <RecapCard card={c} isLast={isLast} earned={lessonXp.current} onContinue={onComplete} />;
      default: return null;
    }
  }

  return (
    <React.Fragment>
      <div className="learn-stage" onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="lcard-track">
          {deck.map((c, i) => (
            <div className="lcard-holder" key={stKey(c)}
              style={{ position: "absolute", left: 0, right: 0, top: 0, height: "100%",
                transform: `translateY(${(i - cardIndex) * 100}%)`,
                transition: "transform 440ms cubic-bezier(0.22, 0.61, 0.36, 1)",
                pointerEvents: i === cardIndex ? "auto" : "none" }}>
              {renderCard(c, i)}
            </div>
          ))}
        </div>
        <div className="learn-plan-rail">
          {planIds.map((id, i) => (
            <div key={id} className={"lpr-node" + (i < nodeIndex || progress.mastery[id] === "mastered" ? " done" : "") + (i === nodeIndex ? " cur" : "")} />
          ))}
        </div>
      </div>

      <div className="learn-foot">
        <button className="nav-btn" onClick={goPrev} disabled={nodeIndex === 0 && cardIndex === 0}>↑</button>
        <div className="learn-dots">
          {deck.map((c, i) => <span key={i} className={"dot2" + (i < cardIndex ? " done" : "") + (i === cardIndex ? " cur" : "")} />)}
        </div>
        <span className="ff-hint"><kbd>↑</kbd><kbd>↓</kbd> or swipe · <kbd>esc</kbd> exit</span>
        <button className="nav-btn" onClick={goNext}>↓</button>
      </div>
    </React.Fragment>
  );
}

Object.assign(window, { PlanBuilder, LearnSession, SlideStage, GoalRing, StreakChip, XpChip });
