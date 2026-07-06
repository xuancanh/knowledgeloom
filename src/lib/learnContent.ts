import type { KnowledgeNote } from '../types';
import type { UiCategory, NoteBlock } from './view';
import { parseMarkdownBlocks } from './view';

export type LearnCard =
  | { type: 'hook'; title: string; lede: string; tags: string[]; category: string; _i: number }
  | { type: 'teach'; head: string; paras: string[]; _i: number }
  | { type: 'insight'; text: string; attr: string; _i: number }
  | { type: 'flash'; front: string; back: string; _i: number }
  | { type: 'quiz'; prompt: string; options: string[]; answer: string; feedback: string; _i: number }
  | { type: 'podcast'; lines: PodLine[]; _i: number }
  | { type: 'recap'; title: string; takeaways: string[]; _i: number };

export type PodLine = { who: string; text: string; dur: number };

/** Omit that distributes over unions — plain Omit collapses LearnCard to its common keys. */
export type CardDraft = LearnCard extends infer T ? (T extends LearnCard ? Omit<T, '_i'> : never) : never;

export type NoteForLearn = KnowledgeNote & { body: NoteBlock[]; markdown: string };

export type LearnCtx = {
  notes: NoteForLearn[];
  byId: Record<string, NoteForLearn>;
  catById?: Record<string, UiCategory>;
  cats?: Record<string, UiCategory>;
};

export const HOSTS = [
  { id: 'maya', name: 'Maya', color: 'var(--indigo)', initial: 'M' },
  { id: 'theo', name: 'Theo', color: 'var(--teal)', initial: 'T' },
];

export { parseMarkdownBlocks as parseBodyBlocks };

// —— small text helpers ——
function sentences(text: string): string[] {
  return (text || '').replace(/\s+/g, ' ').trim()
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/).filter(Boolean);
}
export function clip(text: string, n: number): string {
  const t = (text || '').trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).replace(/[\s,;:]+\S*$/, '') + '…';
}
export function firstSentence(text: string): string { return sentences(text)[0] || text || ''; }
function shortTitle(title: string): string {
  const w = title.split(' ');
  return w.length <= 7 ? title : w.slice(0, 7).join(' ') + '…';
}
function pick<T>(arr: T[], n: number, seed: number): T[] {
  const a = arr.slice();
  let s = seed || 1;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
function seedOf(id: string): number { let s = 0; for (const ch of id) s = (s * 31 + ch.charCodeAt(0)) & 0x7fffffff; return s || 1; }

// —— teach cards from body ——
function teachCards(note: NoteForLearn): Array<{ head: string | null; paras: string[] }> {
  const cards: Array<{ head: string | null; paras: string[] }> = [];
  let cur: { head: string | null; paras: string[] } | null = null;
  const flush = () => { if (cur && cur.paras.length) cards.push(cur); cur = null; };
  note.body.forEach(b => {
    if (b.type === 'h') { flush(); cur = { head: b.text, paras: [] }; }
    else if (b.type === 'p') {
      if (!cur) cur = { head: null, paras: [] };
      if (cur.paras.length >= 2) { flush(); cur = { head: null, paras: [] }; }
      cur.paras.push(b.text);
    }
  });
  flush();
  return cards;
}

function insightCard(note: NoteForLearn): Omit<LearnCard & { type: 'insight' }, '_i'> | null {
  const q = note.body.find(b => b.type === 'q');
  if (!q) return null;
  return { type: 'insight', text: q.text, attr: note.category };
}

function flashCards(note: NoteForLearn): Array<Omit<LearnCard & { type: 'flash' }, '_i'>> {
  const cards: Array<Omit<LearnCard & { type: 'flash' }, '_i'>> = [];
  cards.push({
    type: 'flash',
    front: `Why does "${shortTitle(note.title)}" matter?`,
    back: firstSentence(note.summary),
  });
  const costPara = note.body.find(b => b.type === 'p' && /(cost|price|trade|but |awful|expensive|catch|hardest|limit)/i.test(b.text));
  if (costPara) {
    cards.push({ type: 'flash', front: "What's the catch or cost?", back: clip(firstSentence(costPara.text), 220) });
  }
  return cards;
}

function shuffleWithCorrect(distractors: string[], correct: string, seed: number): string[] {
  const arr = [...distractors.filter(d => d !== correct), correct];
  return pick(arr, arr.length, seed);
}

function quizCards(note: NoteForLearn, ctx: LearnCtx): Array<Omit<LearnCard & { type: 'quiz' }, '_i'>> {
  const { notes } = ctx;
  const cards: Array<Omit<LearnCard & { type: 'quiz' }, '_i'>> = [];

  const others = notes.filter(n => n.id !== note.id);
  const sameCat = others.filter(n => n.category === note.category);
  const pool = sameCat.length >= 3 ? sameCat : others;
  const distract = pick(pool, 3, seedOf(note.id)).map(n => clip(firstSentence(n.summary), 110));
  const correct = clip(firstSentence(note.summary), 110);
  cards.push({
    type: 'quiz',
    prompt: `Which statement best captures "${shortTitle(note.title)}"?`,
    options: shuffleWithCorrect(distract, correct, seedOf(note.id)),
    answer: correct,
    feedback: `Yes — ${clip(note.summary, 180)}`,
  });

  const prereqs = notes.filter(n => (n.links || []).includes(note.id));
  if (prereqs.length) {
    const correctP = prereqs[0];
    const unrelated = notes.filter(n => n.id !== note.id && n.category !== note.category && !prereqs.includes(n));
    const dist = pick(unrelated, 3, seedOf(note.id) + 7).map(n => shortTitle(n.title));
    cards.push({
      type: 'quiz',
      prompt: 'Which of these should you understand first — a prerequisite for this idea?',
      options: shuffleWithCorrect(dist, shortTitle(correctP.title), seedOf(note.id) + 7),
      answer: shortTitle(correctP.title),
      feedback: `"${clip(correctP.title, 80)}" feeds directly into this note.`,
    });
  }
  return cards;
}

function podcastCard(note: NoteForLearn, ctx: LearnCtx): Omit<LearnCard & { type: 'podcast' }, '_i'> {
  const cat = ctx.catById?.[note.category];
  const catName = cat ? cat.name : note.category;
  const summ = sentences(note.summary);
  const bodyPs = note.body.filter(b => b.type === 'p').map(b => firstSentence(b.text));
  const q = note.body.find(b => b.type === 'q');
  const lines: { who: string; text: string }[] = [];
  const A = HOSTS[0].id, B = HOSTS[1].id;
  lines.push({ who: A, text: `Okay — today we're in ${catName}, and the topic is: ${note.title.toLowerCase().replace(/\.$/, '')}.` });
  lines.push({ who: B, text: summ[0] ? `The one-liner: ${summ[0]}` : `Let's unpack it.` });
  if (bodyPs[0]) lines.push({ who: A, text: `Wait, walk me through that. ${clip(bodyPs[0], 200)}` });
  if (summ[1]) lines.push({ who: B, text: clip(summ[1], 200) });
  if (bodyPs[1]) lines.push({ who: A, text: `And the part people miss — ${clip(bodyPs[1], 200)}` });
  if (q) lines.push({ who: B, text: `Here's the line I'd keep: ${clip(q.text, 200)}` });
  lines.push({ who: A, text: `Love it. That's the mental model — let's move on.` });
  return { type: 'podcast', lines: lines.map(l => ({ ...l, dur: Math.max(2400, Math.min(7000, l.text.length * 46)) })) };
}

function recapCard(note: NoteForLearn): Omit<LearnCard & { type: 'recap' }, '_i'> {
  const takeaways: string[] = [];
  takeaways.push(firstSentence(note.summary));
  note.body.filter(b => b.type === 'h').slice(0, 2).forEach(h => {
    const idx = note.body.indexOf(h);
    const nextP = note.body.slice(idx + 1).find(b => b.type === 'p');
    if (nextP) takeaways.push(`${h.text}: ${clip(firstSentence(nextP.text), 130)}`);
  });
  if (takeaways.length < 3) {
    const q = note.body.find(b => b.type === 'q');
    if (q) takeaways.push(clip(q.text, 150));
  }
  return { type: 'recap', title: note.title, takeaways: takeaways.slice(0, 3) };
}

export function buildDeck(note: NoteForLearn, ctx: LearnCtx): LearnCard[] {
  const deck: CardDraft[] = [];
  deck.push({ type: 'hook', title: note.title, lede: note.summary, tags: note.tags, category: note.category });
  const teach = teachCards(note);
  deck.push(teach[0]
    ? { type: 'teach', head: teach[0].head || 'The idea', paras: teach[0].paras }
    : { type: 'teach', head: 'The idea', paras: [note.summary] });
  const ins = insightCard(note);
  if (ins) deck.push(ins);
  if (teach[1]) deck.push({ type: 'teach', head: teach[1].head || 'Going deeper', paras: teach[1].paras });
  flashCards(note).forEach(c => deck.push(c));
  if (teach[2]) deck.push({ type: 'teach', head: teach[2].head || 'Going deeper', paras: teach[2].paras });
  deck.push(podcastCard(note, ctx));
  quizCards(note, ctx).forEach(c => deck.push(c));
  deck.push(recapCard(note));
  return deck.map((c, i) => ({ ...c, _i: i })) as LearnCard[];
}

export function filterDeck(deck: LearnCard[], mode: string): LearnCard[] {
  if (mode === 'all') return deck;
  const map: Record<string, string[]> = {
    read: ['hook', 'teach', 'insight', 'recap'],
    cards: ['hook', 'flash', 'recap'],
    quiz: ['hook', 'quiz', 'recap'],
    podcast: ['hook', 'podcast', 'recap'],
  };
  const keep = map[mode];
  if (!keep) return deck;
  const out = deck.filter(c => keep.includes(c.type));
  return out.length ? out : deck;
}

// —— plan ordering ——
function incomingMap(notes: NoteForLearn[]): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  notes.forEach(n => { m[n.id] = []; });
  notes.forEach(n => (n.links || []).forEach(l => { if (m[l]) m[l].push(n.id); }));
  return m;
}

function withPrereqs(ids: string[], notes: NoteForLearn[]): string[] {
  const inc = incomingMap(notes);
  const out = new Set(ids), q = [...ids];
  while (q.length) { const id = q.pop()!; (inc[id] || []).forEach(p => { if (!out.has(p)) { out.add(p); q.push(p); } }); }
  return [...out];
}

function topoOrder(ids: string[], notes: NoteForLearn[]): string[] {
  const byId = Object.fromEntries(notes.map(n => [n.id, n]));
  const set = new Set(ids);
  const visited = new Set<string>(), temp = new Set<string>(), order: string[] = [];
  const visit = (id: string) => {
    if (visited.has(id) || !set.has(id)) return;
    if (temp.has(id)) return;
    temp.add(id);
    [...set].filter(x => (byId[x]?.links || []).includes(id)).forEach(visit);
    temp.delete(id); visited.add(id); order.push(id);
  };
  [...ids].sort((a, b) => (byId[b]?.createdAt || '').localeCompare(byId[a]?.createdAt || '')).forEach(visit);
  return order;
}

export function buildPlan(opts: {
  scope: 'node' | 'category' | 'everything';
  nodeId?: string;
  category?: string;
  includePrereqs?: boolean;
  notes: NoteForLearn[];
}): string[] {
  const { scope, nodeId, category, includePrereqs, notes } = opts;
  let seed: string[];
  if (scope === 'node' && nodeId) seed = [nodeId];
  else if (scope === 'category' && category) seed = notes.filter(n => n.category === category).map(n => n.id);
  else seed = notes.map(n => n.id);
  let ids = seed;
  if (scope === 'node' || (includePrereqs && scope !== 'everything')) ids = withPrereqs(seed, notes);
  if (scope === 'everything') ids = notes.map(n => n.id);
  return topoOrder([...new Set(ids)], notes);
}

export function estimateCards(planIds: string[], notes: NoteForLearn[]): number {
  const byId = Object.fromEntries(notes.map(n => [n.id, n]));
  return planIds.reduce((s, id) => {
    const n = byId[id]; if (!n) return s;
    const heads = n.body.filter(b => b.type === 'h').length;
    const hasQ = n.body.some(b => b.type === 'q') ? 1 : 0;
    const prereq = notes.some(m => (m.links || []).includes(id)) ? 1 : 0;
    return s + 1 + Math.min(3, heads + 1) + hasQ + 2 + 1 + (1 + prereq) + 1;
  }, 0);
}

export function buildPodcastProgram(note: NoteForLearn, ctx: LearnCtx): {
  segments: Array<{ type: 'talk'; lines: PodLine[] } | { type: 'flash'; card: LearnCard } | { type: 'quiz'; card: LearnCard }>;
  title: string;
  category: string;
  tags: string[];
  takeaways: string[];
} {
  const deck = buildDeck(note, ctx);
  const pod = deck.find(c => c.type === 'podcast') as (LearnCard & { type: 'podcast' }) | undefined;
  const lines = (pod ? pod.lines : []);
  const flashes = deck.filter(c => c.type === 'flash');
  const quizzes = deck.filter(c => c.type === 'quiz');
  const checks: Array<{ type: 'flash'; card: LearnCard } | { type: 'quiz'; card: LearnCard }> = [];
  if (flashes[0]) checks.push({ type: 'flash', card: flashes[0] });
  if (quizzes[0]) checks.push({ type: 'quiz', card: quizzes[0] });
  if (flashes[1]) checks.push({ type: 'flash', card: flashes[1] });
  if (quizzes[1]) checks.push({ type: 'quiz', card: quizzes[1] });

  const parts = checks.length + 1;
  const per = Math.max(1, Math.ceil(lines.length / parts));
  const chunks: PodLine[][] = [];
  for (let i = 0; i < lines.length; i += per) chunks.push(lines.slice(i, i + per));
  const segments: Array<{ type: 'talk'; lines: PodLine[] } | { type: 'flash'; card: LearnCard } | { type: 'quiz'; card: LearnCard }> = [];
  const span = Math.max(parts, chunks.length);
  for (let p = 0; p < span; p++) {
    if (chunks[p] && chunks[p].length) segments.push({ type: 'talk', lines: chunks[p] });
    if (checks[p]) segments.push(checks[p]);
  }
  const recap = deck.find(c => c.type === 'recap') as (LearnCard & { type: 'recap' }) | undefined;
  return { segments, title: note.title, category: note.category, tags: note.tags, takeaways: recap?.takeaways || [] };
}
