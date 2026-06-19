/* learn-content.jsx — turns a note into a blended micro-lesson deck, and
   orders a set of notes into a prerequisite-respecting plan.
   All "content" is synthesized from the note's own data (summary, body,
   tags) plus the graph structure (real prerequisites become quiz answers). */

(function () {
  const HOSTS = [
    { id: "maya", name: "Maya", color: "var(--indigo)", initial: "M" },
    { id: "theo", name: "Theo", color: "var(--teal)", initial: "T" },
  ];

  // —— small text helpers ——
  function sentences(text) {
    return (text || "").replace(/\s+/g, " ").trim()
      .split(/(?<=[.!?])\s+(?=[A-Z“"'])/).filter(Boolean);
  }
  function clip(text, n) {
    const t = (text || "").trim();
    if (t.length <= n) return t;
    return t.slice(0, n - 1).replace(/[\s,;:]+\S*$/, "") + "…";
  }
  function firstSentence(text) { return sentences(text)[0] || text || ""; }
  function shortTitle(title) {
    const w = title.split(" ");
    return w.length <= 7 ? title : w.slice(0, 7).join(" ") + "…";
  }
  function pick(arr, n, seed) {
    const a = arr.slice();
    let s = seed || 1;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, n);
  }
  function seedOf(id) { let s = 0; for (const ch of id) s = (s * 31 + ch.charCodeAt(0)) & 0x7fffffff; return s || 1; }

  // —— teach cards from body ——
  function teachCards(note) {
    const cards = [];
    let cur = null;
    const flush = () => { if (cur && cur.paras.length) cards.push(cur); cur = null; };
    // opening overview from leading paragraphs handled by sequence
    note.body.forEach(b => {
      if (b.type === "h") { flush(); cur = { head: b.text, paras: [] }; }
      else if (b.type === "p") {
        if (!cur) cur = { head: null, paras: [] };
        // split very long paragraphs across cards
        if (cur.paras.length >= 2) { flush(); cur = { head: null, paras: [] }; }
        cur.paras.push(b.text);
      }
    });
    flush();
    return cards.map((c, i) => ({ type: "teach", head: c.head || (i === 0 ? "The idea" : "Going deeper"), paras: c.paras }));
  }

  function insightCard(note) {
    const q = note.body.find(b => b.type === "q");
    if (!q) return null;
    return { type: "insight", text: q.text, attr: note.category };
  }

  // —— flashcards ——
  function flashCards(note) {
    const cards = [];
    cards.push({
      type: "flash",
      front: `Why does “${shortTitle(note.title)}” matter?`,
      back: firstSentence(note.summary),
    });
    // a "catch / cost" card if the body talks about trade-offs
    const costPara = note.body.find(b => b.type === "p" && /(cost|price|trade|but |awful|expensive|catch|hardest|limit)/i.test(b.text));
    if (costPara) {
      cards.push({ type: "flash", front: "What's the catch or cost?", back: clip(firstSentence(costPara.text), 220) });
    }
    return cards;
  }

  // —— quiz (uses real graph structure for grounded answers) ——
  function quizCards(note, ctx) {
    const { byId, notes } = ctx;
    const cards = [];

    // Q1 — which statement captures this note (distractors = other notes' summaries)
    const others = notes.filter(n => n.id !== note.id);
    const sameCat = others.filter(n => n.category === note.category);
    const pool = (sameCat.length >= 3 ? sameCat : others);
    const distract = pick(pool, 3, seedOf(note.id)).map(n => clip(firstSentence(n.summary), 110));
    const correct = clip(firstSentence(note.summary), 110);
    cards.push({
      type: "quiz",
      prompt: `Which statement best captures “${shortTitle(note.title)}”?`,
      options: shuffleWithCorrect(distract, correct, seedOf(note.id)),
      answer: correct,
      feedback: `Yes — ${clip(note.summary, 180)}`,
    });

    // Q2 — a real prerequisite, if any
    const prereqs = notes.filter(n => (n.links || []).includes(note.id));
    if (prereqs.length) {
      const correctP = prereqs[0];
      const unrelated = notes.filter(n => n.id !== note.id && n.category !== note.category && !prereqs.includes(n));
      const dist = pick(unrelated, 3, seedOf(note.id) + 7).map(n => shortTitle(n.title));
      cards.push({
        type: "quiz",
        prompt: `Which of these should you understand first — a prerequisite for this idea?`,
        options: shuffleWithCorrect(dist, shortTitle(correctP.title), seedOf(note.id) + 7),
        answer: shortTitle(correctP.title),
        feedback: `“${clip(correctP.title, 80)}” feeds directly into this note.`,
      });
    }
    return cards;
  }
  function shuffleWithCorrect(distractors, correct, seed) {
    const arr = [...distractors.filter(d => d !== correct), correct];
    return pick(arr, arr.length, seed);
  }

  // —— podcast script: two hosts riff on the note ——
  function podcastCard(note, ctx) {
    const cat = (ctx.byId && ctx.cats && ctx.cats[note.category]) ? ctx.cats[note.category].name : note.category;
    const summ = sentences(note.summary);
    const bodyPs = note.body.filter(b => b.type === "p").map(b => firstSentence(b.text));
    const q = note.body.find(b => b.type === "q");
    const lines = [];
    const A = HOSTS[0].id, B = HOSTS[1].id;
    lines.push({ who: A, text: `Okay — today we're in ${cat}, and the topic is: ${note.title.toLowerCase().replace(/\.$/, "")}.` });
    lines.push({ who: B, text: summ[0] ? `The one-liner: ${summ[0]}` : `Let's unpack it.` });
    if (bodyPs[0]) lines.push({ who: A, text: `Wait, walk me through that. ${clip(bodyPs[0], 200)}` });
    if (summ[1]) lines.push({ who: B, text: clip(summ[1], 200) });
    if (bodyPs[1]) lines.push({ who: A, text: `And the part people miss — ${clip(bodyPs[1], 200)}` });
    if (q) lines.push({ who: B, text: `Here's the line I'd keep: ${clip(q.text, 200)}` });
    lines.push({ who: A, text: `Love it. That's the mental model — let's move on.` });
    return { type: "podcast", lines };
  }

  // —— recap ——
  function recapCard(note) {
    const takeaways = [];
    takeaways.push(firstSentence(note.summary));
    note.body.filter(b => b.type === "h").slice(0, 2).forEach(h => {
      const idx = note.body.indexOf(h);
      const nextP = note.body.slice(idx + 1).find(b => b.type === "p");
      if (nextP) takeaways.push(`${h.text}: ${clip(firstSentence(nextP.text), 130)}`);
    });
    if (takeaways.length < 3) {
      const q = note.body.find(b => b.type === "q");
      if (q) takeaways.push(clip(q.text, 150));
    }
    return { type: "recap", title: note.title, takeaways: takeaways.slice(0, 3) };
  }

  // —— assemble blended deck ——
  function buildDeck(note, ctx) {
    const deck = [];
    deck.push({ type: "hook", title: note.title, lede: note.summary, tags: note.tags, category: note.category });
    const teach = teachCards(note);
    deck.push(teach[0] || { type: "teach", head: "The idea", paras: [note.summary] });
    const ins = insightCard(note);
    if (ins) deck.push(ins);
    if (teach[1]) deck.push(teach[1]);
    flashCards(note).forEach(c => deck.push(c));
    if (teach[2]) deck.push(teach[2]);
    deck.push(podcastCard(note, ctx));
    quizCards(note, ctx).forEach(c => deck.push(c));
    deck.push(recapCard(note));
    return deck.map((c, i) => ({ ...c, _i: i }));
  }

  // filter a deck by chosen mode
  function filterDeck(deck, mode) {
    if (mode === "all") return deck;
    const map = {
      read: ["hook", "teach", "insight", "recap"],
      cards: ["hook", "flash", "recap"],
      quiz: ["hook", "quiz", "recap"],
      podcast: ["hook", "podcast", "recap"],
    };
    const keep = map[mode] || null;
    if (!keep) return deck;
    const out = deck.filter(c => keep.includes(c.type));
    return out.length ? out : deck;
  }

  // —— plan ordering ——
  function incomingMap(notes) {
    const m = {}; notes.forEach(n => { m[n.id] = []; });
    notes.forEach(n => (n.links || []).forEach(l => { if (m[l]) m[l].push(n.id); }));
    return m;
  }
  function withPrereqs(ids, notes) {
    const inc = incomingMap(notes);
    const out = new Set(ids), q = [...ids];
    while (q.length) { const id = q.pop(); (inc[id] || []).forEach(p => { if (!out.has(p)) { out.add(p); q.push(p); } }); }
    return [...out];
  }
  // topological order so that for an edge A→B, A (prerequisite) comes before B
  function topoOrder(ids, notes) {
    const byId = Object.fromEntries(notes.map(n => [n.id, n]));
    const set = new Set(ids);
    const visited = new Set(), temp = new Set(), order = [];
    const visit = (id) => {
      if (visited.has(id) || !set.has(id)) return;
      if (temp.has(id)) return;
      temp.add(id);
      [...set].filter(x => (byId[x].links || []).includes(id)).forEach(visit);
      temp.delete(id); visited.add(id); order.push(id);
    };
    // stable-ish: seed by created date then id
    [...ids].sort((a, b) => (byId[b].created || "").localeCompare(byId[a].created || "")).forEach(visit);
    return order;
  }
  function buildPlan({ scope, nodeId, category, includePrereqs, notes }) {
    let seed;
    if (scope === "node" && nodeId) seed = [nodeId];
    else if (scope === "category" && category) seed = notes.filter(n => n.category === category).map(n => n.id);
    else seed = notes.map(n => n.id); // everything
    let ids = seed;
    if (scope === "node" || (includePrereqs && scope !== "everything")) ids = withPrereqs(seed, notes);
    if (scope === "everything") ids = notes.map(n => n.id);
    return topoOrder([...new Set(ids)], notes);
  }

  // rough card-count estimate for a plan (without building every deck)
  function estimateCards(planIds, notes) {
    const byId = Object.fromEntries(notes.map(n => [n.id, n]));
    return planIds.reduce((s, id) => {
      const n = byId[id]; if (!n) return s;
      const heads = n.body.filter(b => b.type === "h").length;
      const hasQ = n.body.some(b => b.type === "q") ? 1 : 0;
      const prereq = notes.some(m => (m.links || []).includes(id)) ? 1 : 0;
      // hook + teach(~heads+1) + insight + 2 flash + podcast + (1+prereq) quiz + recap
      return s + 1 + Math.min(3, heads + 1) + hasQ + 2 + 1 + (1 + prereq) + 1;
    }, 0);
  }

  // —— continuous podcast PROGRAM: dialogue interleaved with pop-up checks ——
  function buildPodcastProgram(note, ctx) {
    const deck = buildDeck(note, ctx);
    const pod = deck.find(c => c.type === "podcast");
    const lines = (pod ? pod.lines : []).map(l => ({
      ...l, dur: Math.max(2600, Math.min(7400, l.text.length * 48)),
    }));
    const flashes = deck.filter(c => c.type === "flash");
    const quizzes = deck.filter(c => c.type === "quiz");
    const checks = [];
    if (flashes[0]) checks.push({ type: "flash", card: flashes[0] });
    if (quizzes[0]) checks.push({ type: "quiz", card: quizzes[0] });
    if (flashes[1]) checks.push({ type: "flash", card: flashes[1] });
    if (quizzes[1]) checks.push({ type: "quiz", card: quizzes[1] });

    // split dialogue into (checks+1) chunks, interleave a check after each chunk
    const parts = checks.length + 1;
    const per = Math.max(1, Math.ceil(lines.length / parts));
    const chunks = [];
    for (let i = 0; i < lines.length; i += per) chunks.push(lines.slice(i, i + per));
    const segments = [];
    const span = Math.max(parts, chunks.length);
    for (let p = 0; p < span; p++) {
      if (chunks[p] && chunks[p].length) segments.push({ type: "talk", lines: chunks[p] });
      if (checks[p]) segments.push(checks[p]);
    }
    return {
      segments,
      title: note.title,
      category: note.category,
      tags: note.tags,
      takeaways: (deck.find(c => c.type === "recap") || {}).takeaways || [],
    };
  }

  window.KL_LEARN = { HOSTS, buildDeck, filterDeck, buildPlan, estimateCards, buildPodcastProgram, topoOrder, withPrereqs, clip, firstSentence };
})();
