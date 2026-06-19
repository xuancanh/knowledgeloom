/* learn-podcast.jsx — immersive interactive podcast format.
   A node's dialogue auto-plays as subtitle-style captions over an ambient
   stage; at scripted checkpoints the show pauses and a flashcard or quiz
   slides up. Answer it and the conversation resumes. */

(function () {
  const { useState: pS, useEffect: pE, useMemo: pM, useRef: pR } = React;
  const KEYS = ["A", "B", "C", "D", "E"];

  const Waveform = React.memo(function Waveform({ playing, color, bars = 26 }) {
    return (
      <div className={"pod-wave" + (playing ? " on" : "")} aria-hidden="true">
        {Array.from({ length: bars }).map((_, i) => (
          <span key={i} style={{ background: color, animationDelay: `${(i % 7) * 0.11 + (i * 0.013)}s` }} />
        ))}
      </div>
    );
  });

  function PodcastStage({ note, ctx, hosts, planIds, nodeIndex, progress, onAward, onComplete, catColor, catName }) {
    const program = pM(() => window.KL_LEARN.buildPodcastProgram(note, ctx), [note.id]);
    const segs = program.segments;

    const [segIndex, setSegIndex] = pS(0);
    const [lineIndex, setLineIndex] = pS(0);
    const [tick, setTick] = pS(0);
    const [playing, setPlaying] = pS(true);
    const [ov, setOv] = pS({});            // overlay interaction state
    const awarded = pR(new Set());
    const timer = pR(null);

    const seg = segs[segIndex] || segs[segs.length - 1];
    const isTalk = seg && seg.type === "talk";
    const isCheck = seg && (seg.type === "flash" || seg.type === "quiz");

    const talkTotal = pM(() => segs.filter(s => s.type === "talk")
      .reduce((a, s) => a + s.lines.reduce((x, l) => x + l.dur, 0), 0), [segs]);

    const elapsed = pM(() => {
      let e = 0;
      for (let i = 0; i < segIndex && i < segs.length; i++)
        if (segs[i].type === "talk") e += segs[i].lines.reduce((x, l) => x + l.dur, 0);
      if (isTalk) { for (let j = 0; j < lineIndex; j++) e += seg.lines[j].dur; e += tick * seg.lines[lineIndex].dur; }
      return e;
    }, [segIndex, lineIndex, tick, isTalk]);

    const markers = pM(() => {
      const out = []; let acc = 0;
      segs.forEach((s, idx) => {
        if (s.type === "talk") acc += s.lines.reduce((x, l) => x + l.dur, 0);
        else out.push({ pct: talkTotal ? (acc / talkTotal) * 100 : 0, kind: s.type, idx });
      });
      return out;
    }, [segs, talkTotal]);

    // award a little XP per dialogue line heard (once)
    pE(() => {
      if (!isTalk) return;
      const k = segIndex + ":" + lineIndex;
      if (awarded.current.has(k)) return;
      awarded.current.add(k); onAward(2);
    }, [segIndex, lineIndex, isTalk]);

    // talk timer
    pE(() => {
      clearInterval(timer.current);
      if (!isTalk || !playing) return;
      const dur = seg.lines[lineIndex].dur;
      const start = Date.now();
      setTick(0);
      timer.current = setInterval(() => {
        const p = (Date.now() - start) / dur;
        if (p >= 1) {
          clearInterval(timer.current);
          if (lineIndex < seg.lines.length - 1) { setLineIndex(i => i + 1); setTick(0); }
          else nextSegment();
        } else setTick(p);
      }, 55);
      return () => clearInterval(timer.current);
    }, [isTalk, playing, lineIndex, segIndex]);

    function nextSegment() {
      const n = segIndex + 1;
      if (n >= segs.length) { onComplete(); return; }
      setOv({}); setLineIndex(0); setTick(0);
      setSegIndex(n);
      setPlaying(segs[n].type === "talk");
    }
    function resolveCheck(xp) { if (xp) onAward(xp); nextSegment(); }

    const line = isTalk ? seg.lines[lineIndex] : null;
    const liveHost = line ? hosts.find(h => h.id === line.who) || hosts[0] : null;
    const fmt = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

    return (
      <React.Fragment>
        <div className="podcast-stage" style={{ "--pc": catColor }}>
          <div className="pod-amb" />
          <div className="pod-amb b" />

          <div className="pod-core">
            <div className="pod-now">On air · {catName}</div>

            <div className="pod-hosts big">
              {hosts.map(h => {
                const live = isTalk && line && h.id === line.who;
                return (
                  <div key={h.id} className={"pod-host" + (live ? " live" : "")} style={{ color: h.color }}>
                    <div className="av" style={{ background: h.color }}>{h.initial}</div>
                    <div className="nm">{h.name}</div>
                  </div>
                );
              })}
            </div>

            <Waveform playing={playing && isTalk} color={catColor} />

            <div className="pod-caption big" key={segIndex + "-" + lineIndex}>
              {isTalk ? (
                <React.Fragment>
                  <span className="who" style={{ color: liveHost.color }}>{liveHost.name}</span>
                  {line.text}
                </React.Fragment>
              ) : (
                <span className="who" style={{ color: catColor }}>— paused for a quick check —</span>
              )}
            </div>
          </div>

          {/* transport */}
          <div className="pod-transport">
            <button className="pod-play" disabled={isCheck} onClick={() => setPlaying(p => !p)} title={playing ? "Pause" : "Play"}>
              {playing && isTalk ? "❚❚" : "▶"}
            </button>
            <div className="pod-track">
              <div className="pod-track-fill" style={{ width: `${talkTotal ? Math.min(100, (elapsed / talkTotal) * 100) : 0}%` }} />
              {markers.map((m, i) => (
                <span key={i} className={"pod-mark " + m.kind + (m.idx < segIndex ? " done" : "") + (m.idx === segIndex ? " active" : "")}
                  style={{ left: `${m.pct}%` }} title={m.kind === "quiz" ? "Pop quiz" : "Flashcard"}>
                  {m.kind === "quiz" ? "?" : "✦"}
                </span>
              ))}
            </div>
            <span className="pod-time">{fmt(elapsed)} / {fmt(talkTotal)}</span>
          </div>

          {/* node progress rail */}
          <div className="learn-plan-rail">
            {planIds.map((id, i) => (
              <div key={id} className={"lpr-node" + (i < nodeIndex || progress.mastery[id] === "mastered" ? " done" : "") + (i === nodeIndex ? " cur" : "")} />
            ))}
          </div>

          {/* pop-up check sheet */}
          {isCheck && (
            <div className="pod-sheet-wrap">
              <div className="pod-sheet">
                {seg.type === "flash"
                  ? <FlashCheck card={seg.card} ov={ov} setOv={setOv} onDone={resolveCheck} />
                  : <QuizCheck card={seg.card} ov={ov} setOv={setOv} onAward={onAward} onDone={resolveCheck} />}
              </div>
            </div>
          )}
        </div>
      </React.Fragment>
    );
  }

  function FlashCheck({ card, ov, setOv, onDone }) {
    const flipped = !!ov.flipped;
    return (
      <div className="pod-check">
        <div className="pc-tag"><span className="dot-pulse" /> The hosts paused — quick recall</div>
        <div className={"flip" + (flipped ? " flipped" : "")} onClick={() => setOv({ ...ov, flipped: true })}>
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
          ? <div className="flip-hint">Tap to reveal · then rate yourself</div>
          : (
            <div className="flash-rate">
              <button className="again" onClick={() => onDone(3)}>Again<span className="sub">resume</span></button>
              <button className="good" onClick={() => onDone(8)}>Good<span className="sub">resume</span></button>
              <button className="easy" onClick={() => onDone(10)}>Easy<span className="sub">resume</span></button>
            </div>
          )}
      </div>
    );
  }

  function QuizCheck({ card, ov, setOv, onAward, onDone }) {
    const picked = ov.picked;
    const answered = picked != null;
    return (
      <div className="pod-check">
        <div className="pc-tag"><span className="dot-pulse" /> Pop quiz — pause &amp; answer</div>
        <div className="q-prompt">{card.prompt}</div>
        <div className="q-opts">
          {card.options.map((opt, i) => {
            const isCorrect = opt === card.answer;
            let cls = "qopt";
            if (answered) { cls += " locked"; if (isCorrect) cls += " correct"; else if (opt === picked) cls += " wrong"; else cls += " dimmed"; }
            return (
              <button key={i} className={cls} disabled={answered}
                onClick={() => { if (answered) return; setOv({ picked: opt }); onAward(opt === card.answer ? 15 : 4); }}>
                <span className="key">{KEYS[i]}</span><span>{opt}</span>
              </button>
            );
          })}
        </div>
        {answered && (
          <React.Fragment>
            <div className={"q-feedback" + (picked === card.answer ? " ok" : "")}>
              {picked === card.answer ? card.feedback : `Not quite. ${card.feedback}`}
            </div>
            <button className="l-cta" onClick={() => onDone(0)}>Resume show ▶</button>
          </React.Fragment>
        )}
      </div>
    );
  }

  window.PodcastStage = PodcastStage;
})();
