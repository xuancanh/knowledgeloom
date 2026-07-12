import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { KnowledgeNote } from '../../types';
import type { UiCategory } from '../../lib/view';
import { useLearnProgress } from '../../hooks/useLearnProgress';
import type { LearnProgress } from '../../hooks/useLearnProgress';
import {
  HOSTS, parseBodyBlocks, buildDeck, filterDeck, buildPlan, estimateCards, buildPodcastProgram,
  clip,
} from '../../lib/learnContent';
import type { NoteForLearn, LearnCtx, LearnCard, PodLine, CardDraft } from '../../lib/learnContent';
import { fetchNoteMarkdown, generateLearnDeck, fetchTtsConfig, fetchPodcastAudio } from '../../api';

const KEYS = ['A', 'B', 'C', 'D', 'E'];
const CAT_TINT: Record<string, string> = {
  oxblood: '#b8553e', moss: '#6f8c4c', indigo: '#5a72b8',
  ochre: '#c08e30', teal: '#3f8f86', rust: '#a8553a',
};

/* ────────── gamification ────────── */
function GoalRing({ value, goal }: { value: number; goal: number }) {
  const { t } = useTranslation();
  const r = 9, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, goal ? value / goal : 0));
  return (
    <svg className="goal-ring" width="26" height="26" viewBox="0 0 26 26">
      <title>{t('learn.dailyGoal', { value, goal })}</title>
      <circle cx="13" cy="13" r={r} fill="none" stroke="var(--rule)" strokeWidth="3.2" />
      <circle cx="13" cy="13" r={r} fill="none" stroke="var(--moss)" strokeWidth="3.2"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 13 13)" style={{ transition: 'stroke-dashoffset 400ms ease' }} />
    </svg>
  );
}
function StreakChip({ streak }: { streak: number }) {
  const { t } = useTranslation();
  return <span className="streak-chip" title={t('learn.dayStreak')}><span className="fl">●</span>{streak}</span>;
}
function XpChip({ xp }: { xp: number }) {
  const { t } = useTranslation();
  return <span className="xp-chip" title={t('learn.totalXp')}><span className="xp">◆</span>{xp.toLocaleString()}</span>;
}

/* ────────── plan builder ────────── */
function PlanBuilder({ notes, categories, seedNodeId, progress, onStart, onClose }: {
  notes: NoteForLearn[];
  categories: UiCategory[];
  seedNodeId?: string;
  progress: LearnProgress;
  onStart: (planIds: string[], format: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const byId = useMemo(() => Object.fromEntries(notes.map(n => [n.id, n])), [notes]);
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const [scope, setScope] = useState<'node' | 'category' | 'everything'>(seedNodeId ? 'node' : 'category');
  const [category, setCategory] = useState(
    (seedNodeId && byId[seedNodeId]?.category) || categories[0]?.id || ''
  );
  const [includePrereqs, setIncludePrereqs] = useState(true);
  const [format, setFormat] = useState<'slides' | 'podcast'>('slides');

  const planIds = useMemo(
    () => buildPlan({ scope, nodeId: seedNodeId, category, includePrereqs, notes }),
    [scope, seedNodeId, category, includePrereqs, notes]
  );
  const cards = useMemo(() => estimateCards(planIds, notes), [planIds, notes]);
  const mins = Math.max(1, Math.round(cards * 0.4));
  const seedNote = seedNodeId ? byId[seedNodeId] : null;

  return (
    <div className="planner" onMouseDown={onClose}>
      <div className="planner-panel" role="dialog" aria-modal="true" aria-labelledby="learn-planner-title" onMouseDown={e => e.stopPropagation()}>
        <div className="planner-head">
          <div className="eyebrow">
            <span>◷</span> {t('learn.planner.title')}
            <button type="button" className="x" onClick={onClose} aria-label={t('common.close')}>×</button>
          </div>
          <h2 id="learn-planner-title">
            {scope === 'node' && seedNote
              ? t('learn.planner.learnNote', { title: clip(seedNote.title, 46) })
              : scope === 'category'
              ? t('learn.planner.curriculum', { category: catById[category]?.name || category })
              : t('learn.planner.wholeVault')}
          </h2>
        </div>

        <div className="planner-scope">
          <button className={`scope-tab${scope === 'node' ? ' active' : ''}`} disabled={!seedNodeId} onClick={() => setScope('node')}>
            {seedNote ? t('learn.planner.nodePrereqs') : t('learn.planner.pickNode')}
          </button>
          <button className={`scope-tab${scope === 'category' ? ' active' : ''}`} onClick={() => setScope('category')}>{t('learn.planner.byCategory')}</button>
          <button className={`scope-tab${scope === 'everything' ? ' active' : ''}`} onClick={() => setScope('everything')}>{t('learn.planner.everything')}</button>
        </div>

        {scope === 'category' && (
          <div className="planner-cat">
            {categories.map(c => (
              <button key={c.id} className={`gchip${category === c.id ? ' active' : ''}`} onClick={() => setCategory(c.id)}>
                <span className="dot" /> {c.name}
              </button>
            ))}
          </div>
        )}

        {scope !== 'everything' && scope !== 'node' && (
          <div className="planner-opts">
            <label>
              <input type="checkbox" checked={includePrereqs} onChange={e => setIncludePrereqs(e.target.checked)} />
              {t('learn.planner.includePrereqs')}
            </label>
          </div>
        )}

        <div className="planner-format">
          <button className={`pfmt${format === 'slides' ? ' active' : ''}`} onClick={() => setFormat('slides')}>
            <span className="pf-ic">▤</span>
            <span className="pf-tx"><b>{t('learn.planner.slides')}</b><i>{t('learn.planner.slidesDescription')}</i></span>
          </button>
          <button className={`pfmt${format === 'podcast' ? ' active' : ''}`} onClick={() => setFormat('podcast')}>
            <span className="pf-ic">◉</span>
            <span className="pf-tx"><b>{t('learn.podcast')}</b><i>{t('learn.planner.podcastDescription')}</i></span>
          </button>
        </div>

        <div className="planner-list">
          {planIds.map((id, i) => {
            const n = byId[id]; if (!n) return null;
            const cat = catById[n.category] || null;
            const done = progress.mastery[id] === 'mastered';
            return (
              <div key={id} className={`plan-step${done ? ' done' : ''}`}>
                <span className="num">{i + 1}</span>
                <span className="dot" />
                <span className="pt">{n.title}</span>
                <span className="pc">{cat ? cat.name.split(' ')[0] : ''}</span>
                {done && <span className="check">✓</span>}
              </div>
            );
          })}
        </div>

        <div className="planner-foot">
          <span className="stats">{t('learn.planner.summary', { nodes: planIds.length, cards, mins })}</span>
          <button className="start" disabled={!planIds.length} onClick={() => onStart(planIds, format)}>
            {format === 'podcast' ? t('learn.planner.startListening') : t('learn.planner.startLearning')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────── card renderers ────────── */
function HookCard({ card, catById, onNext }: { card: LearnCard & { type: 'hook' }; catById: Record<string, UiCategory>; onNext: () => void }) {
  const { t } = useTranslation();
  const cat = catById[card.category];
  return (
    <div className="lcard hook">
      <div className="lcard-inner">
        <div className="l-eyebrow"><span className="dot" /> {cat?.name || card.category} <span className="kind">· {t('learn.lesson')}</span></div>
        <h1 className="l-title">{card.title}</h1>
        <p className="l-lede">{card.lede}</p>
        <div className="l-meta">
          <span>{(card.tags || []).slice(0, 3).map(t => '#' + t).join('  ')}</span>
        </div>
        <button className="l-cta" onClick={onNext}>{t('common.start')} ↓</button>
      </div>
    </div>
  );
}
function TeachCard({ card }: { card: LearnCard & { type: 'teach' } }) {
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
function InsightCard({ card, catById }: { card: LearnCard & { type: 'insight' }; catById: Record<string, UiCategory> }) {
  return (
    <div className="lcard insight">
      <div className="lcard-inner">
        <div className="l-quote">{card.text}</div>
        <div className="l-attr">{catById[card.attr]?.name || card.attr}</div>
      </div>
    </div>
  );
}
function FlashCard({ card, state, setState, onRate }: {
  card: LearnCard & { type: 'flash' };
  state: Record<string, unknown>;
  setState: (v: Record<string, unknown>) => void;
  onRate: (r: string) => void;
}) {
  const { t } = useTranslation();
  const flipped = !!state.flipped;
  return (
    <div className="lcard flash">
      <div className="lcard-inner">
        <div className="l-eyebrow"><span className="kind">{t('common.flashcards')}</span> · {t('learn.recall')}</div>
        <div className={`flip${flipped ? ' flipped' : ''}`} role="button" tabIndex={0} aria-label={t('learn.revealCard')} onClick={() => setState({ ...state, flipped: true })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setState({ ...state, flipped: true }); }}>
          <div className="flip-inner">
            <div className="flip-face flip-front">
              <div className="ff-label">{t('learn.prompt')}</div>
              <div className="ff-text">{card.front}</div>
            </div>
            <div className="flip-face flip-back">
              <div className="ff-label">{t('learn.answer')}</div>
              <div className="ff-text">{card.back}</div>
            </div>
          </div>
        </div>
        {!flipped
          ? <div className="flip-hint">{t('learn.tapToReveal')}</div>
          : (
            <div className="flash-rate">
              <button className="again" onClick={() => onRate('again')}>{t('learn.again')}<span className="sub">&lt; 1d</span></button>
              <button className="good" onClick={() => onRate('good')}>{t('learn.good')}<span className="sub">3d</span></button>
              <button className="easy" onClick={() => onRate('easy')}>{t('learn.easy')}<span className="sub">7d</span></button>
            </div>
          )}
      </div>
    </div>
  );
}
function QuizCard({ card, state, setState, onAnswer, onNext }: {
  card: LearnCard & { type: 'quiz' };
  state: Record<string, unknown>;
  setState: (v: Record<string, unknown>) => void;
  onAnswer: (correct: boolean) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const picked = state.picked as string | undefined;
  const answered = picked != null;
  return (
    <div className="lcard quiz">
      <div className="lcard-inner">
        <div className="l-eyebrow"><span className="kind">{t('learn.quickCheck')}</span></div>
        <div className="q-prompt">{card.prompt}</div>
        <div className="q-opts">
          {card.options.map((opt, i) => {
            const isCorrect = opt === card.answer;
            let cls = 'qopt';
            if (answered) { cls += ' locked'; if (isCorrect) cls += ' correct'; else if (opt === picked) cls += ' wrong'; else cls += ' dimmed'; }
            return (
              <button key={i} className={cls} disabled={answered}
                onClick={() => { if (answered) return; setState({ picked: opt }); onAnswer(opt === card.answer); }}>
                <span className="key">{KEYS[i]}</span><span>{opt}</span>
              </button>
            );
          })}
        </div>
        {answered && (
          <div className={`q-feedback${picked === card.answer ? ' ok' : ''}`}>
            {picked === card.answer ? card.feedback : t('learn.notQuite', { feedback: card.feedback })}
          </div>
        )}
        {answered && <button className="l-cta" onClick={onNext}>{t('learn.continue')} ↓</button>}
      </div>
    </div>
  );
}
function PodcastCard({ card, active, hosts }: {
  card: LearnCard & { type: 'podcast' };
  active: boolean;
  hosts: typeof HOSTS;
}) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const [idx, setIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lines = card.lines;
  const durs = useMemo(() => lines.map(l => l.dur), [lines]);

  useEffect(() => { if (!active) setPlaying(false); }, [active]);
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!playing || !active) return;
    const start = Date.now();
    timer.current = setInterval(() => {
      const p = (Date.now() - start) / durs[idx];
      if (p >= 1) {
        if (idx < lines.length - 1) { setIdx(i => i + 1); setTick(0); }
        else { setPlaying(false); setTick(1); if (timer.current) clearInterval(timer.current); }
      } else setTick(p);
    }, 60);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, idx, active, durs, lines.length]);

  const cur = lines[idx];
  const host = hosts.find(h => h.id === cur.who) || hosts[0];
  const total = durs.reduce((a, b) => a + b, 0);
  const elapsed = durs.slice(0, idx).reduce((a, b) => a + b, 0) + tick * durs[idx];
  const fmt = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  return (
    <div className="lcard podcast">
      <div className="pod-wrap">
        <div className="pod-hosts">
          {hosts.map(h => (
            <div key={h.id} className={`pod-host${h.id === cur.who ? ' live' : ''}`} style={{ color: h.color }}>
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
          <button className="pod-play" aria-label={playing ? t('learn.pause') : t('learn.play')} onClick={() => {
            if (idx >= lines.length - 1 && tick >= 1) { setIdx(0); setTick(0); }
            setPlaying(p => !p);
          }}>
            {playing ? '❚❚' : '▶'}
          </button>
          <div className="pod-prog" onClick={e => {
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
function RecapCard({ card, isLast, earned, onContinue }: {
  card: LearnCard & { type: 'recap' };
  isLast: boolean;
  earned: number;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="lcard recap">
      <div className="lcard-inner">
        <div className="l-sub">{t('learn.recap')}</div>
        <div className="l-head">{card.title}</div>
        <ul className="recap-list">
          {card.takeaways.map((t, i) => <li key={i}><span className="tick">✓</span>{t}</li>)}
        </ul>
        <div className="recap-earned">
          <span className="earn-chip">◆ <span className="v">+{earned}</span> {t('learn.lessonXp')}</span>
          <span className="earn-chip">✓ {t('learn.nodeMastered')}</span>
        </div>
        <button className="l-cta" onClick={onContinue}>{isLast ? t('learn.finishPlan') : t('learn.masterAndContinue')}</button>
      </div>
    </div>
  );
}

/* ────────── slide stage (one node) ────────── */
function SlideStage({ note, ctx, mode, catById, planIds, nodeIndex, progress, aiDeck, onAward, onComplete, onPrevNode, isLast }: {
  note: NoteForLearn;
  ctx: LearnCtx;
  mode: string;
  catById: Record<string, UiCategory>;
  planIds: string[];
  nodeIndex: number;
  progress: LearnProgress;
  aiDeck: AiDeck | null | undefined;
  onAward: (xp: number) => void;
  onComplete: () => void;
  onPrevNode: () => void;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const [cardIndex, setCardIndex] = useState(0);
  // Adopt the AI deck if it arrives while the user is still on the hook card
  // (identical in both decks); once past it, lock the source so card positions
  // don't reset mid-lesson.
  const [deckSrc, setDeckSrc] = useState<AiDeck | null>(aiDeck ?? null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot deck adoption, guarded
    if (!deckSrc && aiDeck && cardIndex === 0) setDeckSrc(aiDeck);
  }, [aiDeck, cardIndex, deckSrc]);
  const fullDeck = useMemo(() => {
    if (deckSrc) return aiDeckToCards(note, deckSrc, ctx);
    return buildDeck(note, ctx);
  }, [note, ctx, deckSrc]);
  const deck = useMemo(() => filterDeck(fullDeck, mode), [fullDeck, mode]);

  const [, forceRender] = useState(0);
  const cardStates = useRef<Record<string, Record<string, unknown>>>({});
  const seen = useRef(new Set<string>());
  const lessonXp = useRef(0);
  const wheelLock = useRef(0);

  const card = deck[cardIndex];
  const stKey = (c: LearnCard) => `${note.id}:${c.type}:${c._i}`;
  const getState = (c: LearnCard) => cardStates.current[stKey(c)] || {};
  const setState = (c: LearnCard, v: Record<string, unknown>) => { cardStates.current[stKey(c)] = v; forceRender(x => x + 1); };

  useEffect(() => {
    if (!card) return;
    const k = stKey(card);
    if (seen.current.has(k)) return;
    seen.current.add(k);
    const xpFor: Record<string, number> = { hook: 3, teach: 4, insight: 4, podcast: 6, recap: 5 };
    if (xpFor[card.type]) { onAward(xpFor[card.type]); lessonXp.current += xpFor[card.type]; }
  }, [card]);

  const goNext = useCallback(() => {
    if (cardIndex < deck.length - 1) setCardIndex(i => i + 1);
    else onComplete();
  }, [cardIndex, deck.length, onComplete]);

  const goPrev = useCallback(() => {
    if (cardIndex > 0) setCardIndex(i => i - 1);
    else onPrevNode?.();
  }, [cardIndex, onPrevNode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (['INPUT', 'TEXTAREA'].includes(tag || '')) return;
      if (['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key)) { e.preventDefault(); goNext(); }
      else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  const touch = useRef<number | null>(null);

  function renderCard(c: LearnCard, i: number) {
    const active = i === cardIndex;
    switch (c.type) {
      case 'hook': return <HookCard card={c} catById={catById} onNext={goNext} />;
      case 'teach': return <TeachCard card={c} />;
      case 'insight': return <InsightCard card={c} catById={catById} />;
      case 'flash': return <FlashCard card={c} state={getState(c)} setState={v => setState(c, v)}
        onRate={r => { const xp = r === 'again' ? 3 : r === 'good' ? 8 : 10; onAward(xp); lessonXp.current += xp; setState(c, { ...getState(c), rated: r }); goNext(); }} />;
      case 'quiz': return <QuizCard card={c} state={getState(c)} setState={v => setState(c, v)}
        onAnswer={ok => { const xp = ok ? 15 : 4; onAward(xp); lessonXp.current += xp; }} onNext={goNext} />;
      case 'podcast': return <PodcastCard card={c} active={active} hosts={HOSTS} />;
      case 'recap': return <RecapCard card={c} isLast={isLast} earned={lessonXp.current} onContinue={onComplete} />;
      default: return null;
    }
  }

  return (
    <>
      <div className="learn-stage"
        onWheel={e => {
          if (Math.abs(e.deltaY) < 24) return;
          const now = Date.now();
          if (now - wheelLock.current < 620) return;
          wheelLock.current = now;
          if (e.deltaY > 0) goNext(); else goPrev();
        }}
        onTouchStart={e => {
          if ((e.target as HTMLElement).closest('button, .qopt, .flip, .pod-controls, .pod-prog')) { touch.current = null; return; }
          touch.current = e.touches[0].clientY;
        }}
        onTouchEnd={e => {
          if (touch.current == null) return;
          const dy = e.changedTouches[0].clientY - touch.current;
          if (Math.abs(dy) > 56) { if (dy < 0) goNext(); else goPrev(); }
          touch.current = null;
        }}
      >
        <div className="lcard-track">
          {deck.map((c, i) => (
            <div className="lcard-holder" key={stKey(c)}
              style={{
                position: 'absolute', left: 0, right: 0, top: 0, height: '100%',
                transform: `translateY(${(i - cardIndex) * 100}%)`,
                transition: 'transform 440ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                pointerEvents: i === cardIndex ? 'auto' : 'none',
              }}>
              {renderCard(c, i)}
            </div>
          ))}
        </div>
        <div className="learn-plan-rail">
          {planIds.map((id, i) => (
            <div key={id} className={`lpr-node${i < nodeIndex || progress.mastery[id] === 'mastered' ? ' done' : ''}${i === nodeIndex ? ' cur' : ''}`} />
          ))}
        </div>
      </div>
      <div className="learn-foot">
        <button className="nav-btn" onClick={goPrev} disabled={nodeIndex === 0 && cardIndex === 0} aria-label={t('common.previous')}>↑</button>
        <div className="learn-dots">
          {deck.map((c, i) => <span key={i} className={`dot2${i < cardIndex ? ' done' : ''}${i === cardIndex ? ' cur' : ''}`} />)}
        </div>
        <span className="ff-hint">{t('learn.navigationHint')}</span>
        <button className="nav-btn" onClick={goNext} aria-label={t('common.next')}>↓</button>
      </div>
    </>
  );
}

/* ────────── podcast stage ────────── */
function Waveform({ playing, color, bars = 26 }: { playing: boolean; color: string; bars?: number }) {
  return (
    <div className={`pod-wave${playing ? ' on' : ''}`} aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} style={{ background: color, animationDelay: `${(i % 7) * 0.11 + i * 0.013}s` }} />
      ))}
    </div>
  );
}

function PodcastStage({ note, ctx, catById: _catById, planIds, nodeIndex, progress, aiDeck, onAward, onComplete, catColor, catName }: {
  note: NoteForLearn;
  ctx: LearnCtx;
  catById: Record<string, UiCategory>;
  planIds: string[];
  nodeIndex: number;
  progress: LearnProgress;
  aiDeck: AiDeck | null | undefined;
  onAward: (xp: number) => void;
  onComplete: () => void;
  catColor: string;
  catName: string;
}) {
  const { t } = useTranslation();
  // Lock deck source at mount — same as SlideStage
  const lockedAiDeck = useRef(aiDeck);
  const program = useMemo(() => {
    if (lockedAiDeck.current) {
      // Use AI deck to build the program structure
      const aiDeck = lockedAiDeck.current;
      const aiCards = aiDeckToCards(note, aiDeck, ctx);
      const pod = aiCards.find(c => c.type === 'podcast') as (LearnCard & { type: 'podcast' }) | undefined;
      const flashes = aiCards.filter(c => c.type === 'flash');
      const quizzes = aiCards.filter(c => c.type === 'quiz');
      const recap = aiCards.find(c => c.type === 'recap') as (LearnCard & { type: 'recap' }) | undefined;
      const lines = pod?.lines || [];
      const checks: Array<{ type: 'flash'; card: LearnCard } | { type: 'quiz'; card: LearnCard }> = [];
      if (flashes[0]) checks.push({ type: 'flash', card: flashes[0] });
      if (quizzes[0]) checks.push({ type: 'quiz', card: quizzes[0] });
      if (flashes[1]) checks.push({ type: 'flash', card: flashes[1] });
      const parts = checks.length + 1;
      const per = Math.max(1, Math.ceil(lines.length / parts));
      const chunks: typeof lines[] = [];
      for (let i = 0; i < lines.length; i += per) chunks.push(lines.slice(i, i + per));
      const segments: Array<{ type: 'talk'; lines: typeof lines } | { type: 'flash'; card: LearnCard } | { type: 'quiz'; card: LearnCard }> = [];
      const span = Math.max(parts, chunks.length);
      for (let p = 0; p < span; p++) {
        if (chunks[p]?.length) segments.push({ type: 'talk', lines: chunks[p] });
        if (checks[p]) segments.push(checks[p]);
      }
      return { segments, title: note.title, category: note.category, tags: note.tags, takeaways: recap?.takeaways || [] };
    }
    return buildPodcastProgram(note, ctx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]); // lockedAiDeck.current is fixed at mount — safe to omit
  const segs = program.segments;

  const [segIndex, setSegIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [ov, setOv] = useState<Record<string, unknown>>({});
  const awarded = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Real voice (server TTS). Available only when the backend has a TTS key;
  // audio plays per talk segment alongside the caption timing.
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    fetchTtsConfig().then((c) => setVoiceAvailable(c.enabled));
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  const seg = segs[segIndex] || segs[segs.length - 1];
  const isTalk = seg && seg.type === 'talk';
  const isCheck = seg && (seg.type === 'flash' || seg.type === 'quiz');

  const talkTotal = useMemo(() => segs.filter(s => s.type === 'talk').reduce((a, s) => {
    if (s.type !== 'talk') return a;
    return a + (s as { type: 'talk'; lines: PodLine[] }).lines.reduce((x, l) => x + l.dur, 0);
  }, 0), [segs]);

  const elapsed = useMemo(() => {
    let e = 0;
    for (let i = 0; i < segIndex && i < segs.length; i++) {
      const s = segs[i];
      if (s.type === 'talk') e += (s as { type: 'talk'; lines: PodLine[] }).lines.reduce((x, l) => x + l.dur, 0);
    }
    if (isTalk && seg.type === 'talk') {
      const talkSeg = seg as { type: 'talk'; lines: PodLine[] };
      for (let j = 0; j < lineIndex; j++) e += talkSeg.lines[j].dur;
      e += tick * talkSeg.lines[lineIndex].dur;
    }
    return e;
  }, [segIndex, lineIndex, tick, isTalk]);

  const markers = useMemo(() => {
    const out: { pct: number; kind: string; idx: number }[] = [];
    let acc = 0;
    segs.forEach((s, idx) => {
      if (s.type === 'talk') acc += (s as { type: 'talk'; lines: PodLine[] }).lines.reduce((x, l) => x + l.dur, 0);
      else out.push({ pct: talkTotal ? (acc / talkTotal) * 100 : 0, kind: s.type, idx });
    });
    return out;
  }, [segs, talkTotal]);

  useEffect(() => {
    if (!isTalk) return;
    const k = `${segIndex}:${lineIndex}`;
    if (awarded.current.has(k)) return;
    awarded.current.add(k); onAward(2);
  }, [segIndex, lineIndex, isTalk]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!isTalk || !playing || seg.type !== 'talk') return;
    const talkSeg = seg as { type: 'talk'; lines: PodLine[] };
    const dur = talkSeg.lines[lineIndex].dur;
    const start = Date.now();
    setTick(0);
    timer.current = setInterval(() => {
      const p = (Date.now() - start) / dur;
      if (p >= 1) {
        if (timer.current) clearInterval(timer.current);
        if (lineIndex < talkSeg.lines.length - 1) { setLineIndex(i => i + 1); setTick(0); }
        else nextSegment();
      } else setTick(p);
    }, 55);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [isTalk, playing, lineIndex, segIndex]);

  // Fetch + play the current talk segment's audio when voice is on.
  useEffect(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (!voiceOn || !isTalk || seg.type !== 'talk') return;
    let cancelled = false;
    const lines = (seg as { type: 'talk'; lines: PodLine[] }).lines.map((l) => ({ who: l.who, text: l.text }));
    fetchPodcastAudio(lines).then((url) => {
      if (!url) return;
      if (cancelled) { URL.revokeObjectURL(url); return; }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      if (playing) void audio.play().catch(() => {});
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceOn, segIndex, isTalk]);

  // Pause/resume follows the transport button.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) void audio.play().catch(() => {});
    else audio.pause();
  }, [playing]);

  function nextSegment() {
    const n = segIndex + 1;
    if (n >= segs.length) { onComplete(); return; }
    setOv({}); setLineIndex(0); setTick(0); setSegIndex(n);
    setPlaying(segs[n].type === 'talk');
  }
  function resolveCheck(xp: number) { if (xp) onAward(xp); nextSegment(); }

  const line = isTalk && seg.type === 'talk' ? (seg as { type: 'talk'; lines: PodLine[] }).lines[lineIndex] : null;
  const liveHost = line ? HOSTS.find(h => h.id === line.who) || HOSTS[0] : null;
  const fmt = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  const flashCard = isCheck && seg.type === 'flash' ? (seg as { type: 'flash'; card: LearnCard }).card as LearnCard & { type: 'flash' } : null;
  const quizCard = isCheck && seg.type === 'quiz' ? (seg as { type: 'quiz'; card: LearnCard }).card as LearnCard & { type: 'quiz' } : null;

  return (
    <div className="podcast-stage" style={{ '--pc': catColor } as React.CSSProperties}>
      <div className="pod-amb" />
      <div className="pod-amb b" />
      <div className="pod-core">
        <div className="pod-now">{t('learn.onAir')} · {catName}</div>
        <div className="pod-hosts big">
          {HOSTS.map(h => {
            const live = isTalk && line && h.id === line.who;
            return (
              <div key={h.id} className={`pod-host${live ? ' live' : ''}`} style={{ color: h.color }}>
                <div className="av" style={{ background: h.color }}>{h.initial}</div>
                <div className="nm">{h.name}</div>
              </div>
            );
          })}
        </div>
        <Waveform playing={playing && isTalk} color={catColor} />
        <div className="pod-caption big" key={`${segIndex}-${lineIndex}`}>
          {isTalk && liveHost ? (
            <>
              <span className="who" style={{ color: liveHost.color }}>{liveHost.name}</span>
              {line?.text}
            </>
          ) : (
            <span className="who" style={{ color: catColor }}>{t('learn.pausedCheck')}</span>
          )}
        </div>
      </div>

      <div className="pod-transport">
        <button className="pod-play" disabled={!!isCheck} onClick={() => setPlaying(p => !p)} title={playing ? t('learn.pause') : t('learn.play')} aria-label={playing ? t('learn.pause') : t('learn.play')}>
          {playing && isTalk ? '❚❚' : '▶'}
        </button>
        <div className="pod-track">
          <div className="pod-track-fill" style={{ width: `${talkTotal ? Math.min(100, (elapsed / talkTotal) * 100) : 0}%` }} />
          {markers.map((m, i) => (
            <span key={i} className={`pod-mark ${m.kind}${m.idx < segIndex ? ' done' : ''}${m.idx === segIndex ? ' active' : ''}`}
              style={{ left: `${m.pct}%` }} title={m.kind === 'quiz' ? t('learn.popQuiz') : t('common.flashcards')}>
              {m.kind === 'quiz' ? '?' : '✦'}
            </span>
          ))}
        </div>
        <span className="pod-time">{fmt(elapsed)} / {fmt(talkTotal)}</span>
        {voiceAvailable && (
          <button
            className={`pod-voice${voiceOn ? ' on' : ''}`}
            onClick={() => setVoiceOn((v) => !v)}
            title={voiceOn ? t('learn.voiceOn') : t('learn.voiceOff')}
            aria-label={voiceOn ? t('learn.voiceOn') : t('learn.voiceOff')}
          >
            {voiceOn ? '🔊' : '🔇'}
          </button>
        )}
      </div>

      <div className="learn-plan-rail">
        {planIds.map((id, i) => (
          <div key={id} className={`lpr-node${i < nodeIndex || progress.mastery[id] === 'mastered' ? ' done' : ''}${i === nodeIndex ? ' cur' : ''}`} />
        ))}
      </div>

      {isCheck && (
        <div className="pod-sheet-wrap">
          <div className="pod-sheet">
            {flashCard && (
              <div className="pod-check">
                <div className="pc-tag"><span className="dot-pulse" /> {t('learn.hostsPaused')}</div>
                <div className={`flip${ov.flipped ? ' flipped' : ''}`} role="button" tabIndex={0} aria-label={t('learn.revealCard')} onClick={() => setOv({ ...ov, flipped: true })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOv({ ...ov, flipped: true }); }}>
                  <div className="flip-inner">
                    <div className="flip-face flip-front">
                      <div className="ff-label">{t('learn.prompt')}</div>
                      <div className="ff-text">{flashCard.front}</div>
                    </div>
                    <div className="flip-face flip-back">
                      <div className="ff-label">{t('learn.answer')}</div>
                      <div className="ff-text">{flashCard.back}</div>
                    </div>
                  </div>
                </div>
                {!ov.flipped
                  ? <div className="flip-hint">{t('learn.revealThenRate')}</div>
                  : (
                    <div className="flash-rate">
                      <button className="again" onClick={() => resolveCheck(3)}>{t('learn.again')}<span className="sub">{t('learn.resume')}</span></button>
                      <button className="good" onClick={() => resolveCheck(8)}>{t('learn.good')}<span className="sub">{t('learn.resume')}</span></button>
                      <button className="easy" onClick={() => resolveCheck(10)}>{t('learn.easy')}<span className="sub">{t('learn.resume')}</span></button>
                    </div>
                  )}
              </div>
            )}
            {quizCard && (
              <div className="pod-check">
                <div className="pc-tag"><span className="dot-pulse" /> {t('learn.popQuizPrompt')}</div>
                <div className="q-prompt">{quizCard.prompt}</div>
                <div className="q-opts">
                  {quizCard.options.map((opt, i) => {
                    const isCorrect = opt === quizCard.answer;
                    let cls = 'qopt';
                    if (ov.picked != null) { cls += ' locked'; if (isCorrect) cls += ' correct'; else if (opt === ov.picked) cls += ' wrong'; else cls += ' dimmed'; }
                    return (
                      <button key={i} className={cls} disabled={ov.picked != null}
                        onClick={() => { if (ov.picked != null) return; setOv({ picked: opt }); onAward(opt === quizCard.answer ? 15 : 4); }}>
                        <span className="key">{KEYS[i]}</span><span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
                {ov.picked != null && (
                  <>
                    <div className={`q-feedback${ov.picked === quizCard.answer ? ' ok' : ''}`}>
                      {ov.picked === quizCard.answer ? quizCard.feedback : t('learn.notQuite', { feedback: quizCard.feedback })}
                    </div>
                    <button className="l-cta" onClick={() => resolveCheck(0)}>{t('learn.resumeShow')} ▶</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────── AI deck types + assembly ────────── */
type AiDeck = {
  teach?: Array<{ head: string; paras: string[] }>;
  insight?: { text: string };
  flash?: Array<{ front: string; back: string }>;
  quiz?: Array<{ prompt: string; options: string[]; answer: string; feedback: string }>;
  podcast?: { lines: Array<{ who: string; text: string }> };
  recap?: { takeaways: string[] };
};

function aiDeckToCards(note: NoteForLearn, ai: AiDeck, _ctx: LearnCtx): LearnCard[] {
  const deck: CardDraft[] = [];
  deck.push({ type: 'hook', title: note.title, lede: note.summary, tags: note.tags, category: note.category });
  (ai.teach || []).forEach(t => deck.push({ type: 'teach', head: t.head, paras: t.paras }));
  if (ai.insight?.text) deck.push({ type: 'insight', text: ai.insight.text, attr: note.category });
  (ai.flash || []).forEach(f => deck.push({ type: 'flash', front: f.front, back: f.back }));
  if (ai.podcast?.lines?.length) {
    const lines = ai.podcast.lines.map(l => ({
      who: l.who, text: l.text,
      dur: Math.max(2400, Math.min(7000, l.text.length * 46)),
    }));
    deck.push({ type: 'podcast', lines });
  }
  (ai.quiz || []).forEach(q => deck.push({ type: 'quiz', prompt: q.prompt, options: q.options, answer: q.answer, feedback: q.feedback }));
  deck.push({ type: 'recap', title: note.title, takeaways: ai.recap?.takeaways?.length ? ai.recap.takeaways : [note.summary] });
  return deck.map((c, i) => ({ ...c, _i: i })) as LearnCard[];
}

async function fetchAiDeck(note: NoteForLearn): Promise<AiDeck | null> {
  const deck = await generateLearnDeck({
    noteId: note.id, title: note.title, category: note.category, summary: note.summary, tags: note.tags,
  });
  return deck && typeof deck === 'object' ? (deck as AiDeck) : null;
}

/** Deck fetch lifecycle per note: absent = not started, pending = in flight, done = resolved (deck may be null on failure). */
type AiDeckEntry = { status: 'pending' | 'done'; deck: AiDeck | null };

/* ────────── learn session shell ────────── */
function LearnSession({ planIds, notes, categories, progress, onAward, onMaster, onExit, initialFormat }: {
  planIds: string[];
  notes: NoteForLearn[];
  categories: UiCategory[];
  progress: LearnProgress;
  onAward: (xp: number) => void;
  onMaster: (noteId: string) => void;
  onExit: () => void;
  initialFormat: 'slides' | 'podcast';
}) {
  const { t } = useTranslation();
  const byId = useMemo(() => Object.fromEntries(notes.map(n => [n.id, n])), [notes]);
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);

  const [nodeIndex, setNodeIndex] = useState(0);
  const [format, setFormat] = useState(initialFormat);
  const [mode, setMode] = useState('all');
  const [done, setDone] = useState(false);
  const [aiDecks, setAiDecks] = useState<Record<string, AiDeckEntry>>({});
  const [startedAnyway, setStartedAnyway] = useState<Record<string, boolean>>({});
  const xpStart = useRef(progress.xp);

  const nodeId = planIds[nodeIndex];
  const note = byId[nodeId];
  const cat = note ? catById[note.category] || null : null;
  const catColor = CAT_TINT[cat?.name?.toLowerCase() || ''] || '#b8553e';

  // fetch AI deck for current node; prefetch next
  useEffect(() => {
    if (!note || aiDecks[nodeId]) return;
    setAiDecks(prev => ({ ...prev, [nodeId]: { status: 'pending', deck: null } }));
    fetchAiDeck(note).then(deck => {
      setAiDecks(prev => ({ ...prev, [nodeId]: { status: 'done', deck } }));
    });
  }, [nodeId, note]);

  // prefetch next note in background
  useEffect(() => {
    const nextId = planIds[nodeIndex + 1];
    const nextNote = nextId ? byId[nextId] : undefined;
    if (!nextNote || aiDecks[nextId]) return;
    setAiDecks(prev => ({ ...prev, [nextId]: { status: 'pending', deck: null } }));
    fetchAiDeck(nextNote).then(deck => setAiDecks(prev => ({ ...prev, [nextId]: { status: 'done', deck } })));
  }, [nodeIndex, planIds, byId, aiDecks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onExit(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  function completeNode() {
    onMaster(nodeId);
    if (nodeIndex < planIds.length - 1) setNodeIndex(i => i + 1);
    else setDone(true);
  }
  const prevNode = useCallback(() => { if (nodeIndex > 0) setNodeIndex(i => i - 1); }, [nodeIndex]);

  const ctx: LearnCtx = useMemo(() => ({ notes, byId, catById }), [notes, byId, catById]);

  if (done) {
    const earned = progress.xp - xpStart.current;
    return (
      <div className="learn-view">
        <div className="learn-top">
          <button className="lt-x" onClick={onExit}>← {t('learn.backToWeave')}</button>
          <span className="lt-spacer" />
          <div className="lt-stats"><StreakChip streak={progress.streak} /><XpChip xp={progress.xp} /><GoalRing value={progress.todayXp} goal={progress.dailyGoalXp} /></div>
        </div>
        <div className="learn-stage">
          <div className="lcard complete">
            <div className="lcard-inner" style={{ alignItems: 'center' }}>
              <div className="l-eyebrow" style={{ justifyContent: 'center' }}><span className="kind">{t('learn.complete.label')} ✦</span></div>
              <h1 className="l-title">{t('learn.complete.title')}</h1>
              <p className="l-sub">{t('learn.complete.summary', { count: planIds.length })}</p>
              <div className="complete-stats">
                <div className="complete-stat"><div className="v">{planIds.length}</div><div className="k">{t('learn.complete.nodesMastered')}</div></div>
                <div className="complete-stat"><div className="v">+{earned}</div><div className="k">{t('learn.complete.xpEarned')}</div></div>
                <div className="complete-stat"><div className="v">{progress.streak}</div><div className="k">{t('learn.dayStreak')}</div></div>
              </div>
              <button className="l-cta" onClick={onExit}>{t('learn.complete.viewGraph')} →</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!note) return null;

  const deckEntry = aiDecks[nodeId];
  const generating = deckEntry?.status === 'pending';
  const aiDeck = deckEntry?.deck ?? null;
  const SLIDE_MODES: [string, string][] = [
    ['all', t('learn.lesson')],
    ['read', t('learn.read')],
    ['cards', t('learn.cards')],
    ['quiz', t('learn.quiz')],
  ];

  return (
    <div className="learn-view">
      <div className="learn-top">
        <button className="lt-x" onClick={onExit}>✕ {t('learn.exit')}</button>
        <span className="lt-crumb">{t('learn.nodeProgress', { current: nodeIndex + 1, total: planIds.length })} · {cat?.name || note.category}</span>
        <div className="format-seg">
          <button className={format === 'slides' ? 'active' : ''} onClick={() => setFormat('slides')}><span className="glyph">▤</span> {t('learn.slides')}</button>
          <button className={format === 'podcast' ? 'active' : ''} onClick={() => setFormat('podcast')}><span className="glyph">◉</span> {t('learn.podcast')}</button>
        </div>
        {format === 'slides' && (
          <div className="learn-modes">
            {SLIDE_MODES.map(([m, label]) => (
              <button key={m} className={`lmode${mode === m ? ' active' : ''}`} onClick={() => setMode(m)}>{label}</button>
            ))}
          </div>
        )}
        <span className="lt-spacer" />
        <div className="lt-stats">
          {generating && <span className="generating-chip" role="status">✦ {t('learn.generating')}</span>}
          <StreakChip streak={progress.streak} />
          <XpChip xp={progress.xp} />
          <GoalRing value={progress.todayXp} goal={progress.dailyGoalXp} />
        </div>
      </div>

      {format === 'slides' ? (
        <SlideStage
          key={`${nodeId}:${mode}`}
          note={note} ctx={ctx} mode={mode} catById={catById}
          planIds={planIds} nodeIndex={nodeIndex} progress={progress}
          aiDeck={aiDeck}
          onAward={onAward} onComplete={completeNode} onPrevNode={prevNode}
          isLast={nodeIndex === planIds.length - 1}
        />
      ) : generating && !startedAnyway[nodeId] ? (
        <div className="learn-stage">
          <div className="lcard podcast">
            <div className="lcard-inner" style={{ alignItems: 'center', textAlign: 'center', justifyContent: 'center' }}>
              <div className="l-eyebrow"><span className="kind">✦ {t('learn.preparingEpisode')}</span></div>
              <p className="l-sub">{t('learn.hostsReading', { title: clip(note.title, 60) })}</p>
              <button className="l-cta ghost" onClick={() => setStartedAnyway(s => ({ ...s, [nodeId]: true }))}>
                {t('learn.startInstant')} →
              </button>
            </div>
          </div>
        </div>
      ) : (
        <PodcastStage
          key={`${nodeId}:pod`}
          note={note} ctx={ctx} catById={catById}
          planIds={planIds} nodeIndex={nodeIndex} progress={progress}
          aiDeck={aiDeck}
          onAward={onAward} onComplete={completeNode}
          catColor={catColor} catName={cat?.name || note.category}
        />
      )}
    </div>
  );
}

/* ────────── main page: body loading + routing ────────── */
export default function LearnPage({ notes, categories, seedNoteId, onExit }: {
  notes: KnowledgeNote[];
  categories: UiCategory[];
  seedNoteId?: string;
  onExit: () => void;
}) {
  const { t } = useTranslation();
  const [bodiesById, setBodiesById] = useState<Record<string, NoteForLearn>>({});
  const [loading, setLoading] = useState(true);
  const [showPlanner, setShowPlanner] = useState(false);
  const [sessionPlanIds, setSessionPlanIds] = useState<string[] | null>(null);
  const [format, setFormat] = useState<'slides' | 'podcast'>('slides');
  const { progress, award, master } = useLearnProgress();
  const loadedIds = useRef(new Set<string>());

  // stable key — only changes when note IDs actually change, not on every poll
  const noteIdsKey = useMemo(() => notes.map(n => n.id).sort().join(','), [notes]);

  // load note bodies — only for missing IDs, no reset on poll-triggered re-renders
  useEffect(() => {
    let cancelled = false;
    const missing = notes.filter(n => !loadedIds.current.has(n.id));
    if (!missing.length) { setLoading(false); return; }

    const isInitial = loadedIds.current.size === 0;
    if (isInitial) setLoading(true);

    async function loadMissing() {
      const chunks: KnowledgeNote[][] = [];
      for (let i = 0; i < missing.length; i += 6) chunks.push(missing.slice(i, i + 6));
      for (const chunk of chunks) {
        if (cancelled) break;
        await Promise.all(chunk.map(async n => {
          try {
            const md = await fetchNoteMarkdown(n.id);
            if (!cancelled) {
              loadedIds.current.add(n.id);
              setBodiesById(prev => ({ ...prev, [n.id]: { ...n, body: parseBodyBlocks(md), markdown: md } }));
            }
          } catch {
            if (!cancelled) {
              loadedIds.current.add(n.id);
              setBodiesById(prev => ({ ...prev, [n.id]: { ...n, body: [], markdown: '' } }));
            }
          }
        }));
      }
      if (!cancelled) setLoading(false);
    }
    loadMissing();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteIdsKey]);

  const enrichedNotes = useMemo((): NoteForLearn[] =>
    notes.map(n => bodiesById[n.id] || { ...n, body: [] }),
    [notes, bodiesById]
  );

  if (loading) {
    return (
      <div className="learn-view" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {t('learn.loadingNotes')}
        </div>
      </div>
    );
  }

  if (sessionPlanIds) {
    return (
      <LearnSession
        planIds={sessionPlanIds}
        notes={enrichedNotes}
        categories={categories}
        progress={progress}
        onAward={award}
        onMaster={master}
        onExit={onExit}
        initialFormat={format}
      />
    );
  }

  return (
    <>
      <div className="learn-view" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
            ◷ {t('learn.title')}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 500, marginBottom: 8, color: 'var(--ink)' }}>
            {t('learn.notesReady', { count: enrichedNotes.length })}
          </div>
          <div style={{ fontSize: 15, color: 'var(--ink-2)', marginBottom: 28 }}>
            {t('learn.intro')}
          </div>
          <div className="lt-stats" style={{ justifyContent: 'center', marginBottom: 24 }}>
            <StreakChip streak={progress.streak} />
            <XpChip xp={progress.xp} />
            <GoalRing value={progress.todayXp} goal={progress.dailyGoalXp} />
          </div>
          <button className="l-cta" onClick={() => setShowPlanner(true)}>
            {t('learn.planSession')} →
          </button>
          <button className="l-cta ghost" style={{ marginLeft: 10 }} onClick={onExit}>
            {t('learn.back')}
          </button>
        </div>
      </div>
      {showPlanner && (
        <PlanBuilder
          notes={enrichedNotes}
          categories={categories}
          seedNodeId={seedNoteId}
          progress={progress}
          onStart={(ids, fmt) => { setShowPlanner(false); setSessionPlanIds(ids); setFormat(fmt as 'slides' | 'podcast'); }}
          onClose={() => setShowPlanner(false)}
        />
      )}
    </>
  );
}
