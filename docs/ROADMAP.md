# Knowledge Loom — Product Roadmap (July 2026)

**Positioning: the second brain that makes you learn, not just collect.**

Knowledge Loom sits at the intersection of two markets that are converging fast:
personal knowledge management (Obsidian, Notion, AFFiNE) and learning-science
study tools (Anki, RemNote, Quizlet, Laxu). Our bet: students and lifelong
learners don't want a filing cabinet *and* a flashcard app — they want one
system where captured knowledge automatically becomes durable memory.

---

## 1. Market snapshot

- The flashcard-app market is projected to grow from ~$23.9B (2026) to ~$31.3B
  by 2035; AI in education overall passed $8.3B in 2025 and is growing >30%/yr.
- A 2026 meta-analysis (21k+ learners) found spaced repetition produces a large
  effect size (d = 0.78) for long-term retention; active recall is consistently
  the top-ranked study strategy in cognitive science.
- The competitive shift in 2026 is **from "how you study" to "how fast you can
  create materials"**: AI turns PDFs/lectures/audio into cards in seconds, and
  FSRS-style adaptive schedulers are replacing vanilla SM-2.
- AI tutoring is fragmenting into verticals (exam prep, language, math);
  seed-stage AI-education valuations reset sharply upward in early 2026
  (Vimi/Giant/Pensive $7–12M seeds).

### Competitive landscape

| Tool | Strength | Weakness we exploit |
|---|---|---|
| Anki | Best scheduler, free | Manual card creation, no notes, dated UX |
| Quizlet | 800M+ study sets, distribution | Weak scheduling (~74% day-14 retention vs Anki's 89%) |
| RemNote | Notes ↔ flashcards integration | Outline-first; weak graph/AI research |
| Obsidian | Local-first, graph, plugins | Hostile to beginners; studying requires plugin stitching |
| Notion / AFFiNE | Structured workspaces | "Great at capture, terrible at retrieval" — no learning loop |
| Laxu / Knowt / NoteLyn | AI card generation from any input | No durable knowledge base; cards are disposable |

### The gap we fill

1. **Capture → comprehension → retention in one loop.** Nobody else combines a
   real markdown knowledge base (local-first, graph, categories) with
   AI-generated decks, quizzes, podcasts, and SM-2 review.
2. **Local-first + open-core trust.** Students increasingly distrust
   cloud-only tools with their notes; AGPL core + optional cloud is a
   differentiator against every AI study app on the list.
3. **AI that cites *your* notes.** RAG chat over your own knowledge base beats
   generic AI tutors for revision ("answer from what I actually studied").

### Target users (in order)

1. **University/med/law students** — heavy Anki users who resent card-making
   time; highest willingness to pay, exam-driven urgency.
2. **Self-directed tech learners** — current core users; learn from
   articles/docs, want retention not just bookmarks.
3. **Educators (later)** — deck sharing/classroom quota is the Atelier/Guild
   wedge.

---

## 2. Where the product stands (July 2026)

Shipped: markdown vault + graph + categories/tags; AI research/link/polish
capture; AI flashcards (SM-2) + quizzes (streak scheduler); learn sessions
(plan builder, AI deck, podcast script, XP/streak/mastery); RAG chat;
Meilisearch; reminders; open-core split with Supabase auth, Stripe billing,
Redis-backed AI quota; 165 automated tests.

Just fixed in the core review: stable card IDs (review history now survives
note edits), RAG context now includes full note bodies, read-only crash,
engine labeling, streak-logic unification.

---

## 3. Roadmap

### Now (Q3 2026) — close the learning loop — ✅ shipped July 2026

1. ✅ **Unified "Today" study queue** — `/today` + `GET /api/study/today`:
   due flashcards, due quiz, capped new items, reminders, inline review.
2. ✅ **Multimodal import: PDF / text / audio → notes + deck** —
   `POST /api/import` with PDF parsing and pluggable Whisper-compatible or
   local-CLI transcription; imports flow into the note → flashcards → quiz
   pipeline automatically.
3. ✅ **FSRS-4.5 adaptive scheduling** (default weights; per-user weight
   optimization remains future work) — unified across flashcards and quiz,
   legacy SM-2 state seeded over.
4. ✅ **Retention analytics** — append-only review-event log; 1d+/7d+ recall
   rates, per-category success, weakest-topics panel on Today.

Also shipped alongside Q3: an **MCP server** (stdio, read-only by default —
docs/MCP.md) exposing search/read/capture/study-queue to Claude and other
MCP clients.

### Next (Q4 2026) — differentiate

5. **Cited AI tutor mode.** RAG chat that quizzes the user Socratically and
   links every claim to a note ("[Note: …]") — generic AI tutors can't do
   this over private material.
6. **Exam mode.** Date-targeted study plans: pick notes/categories + exam
   date → scheduler compresses reviews to peak on exam day. Strong wedge for
   the student segment and a natural paid feature.
7. **Real podcast audio (TTS).** We already generate two-host scripts; add
   TTS rendering for commute-time review. Audio-first learners are an
   underserved input/output segment.
8. **Deck sharing.** Public/read-only share links for decks and notes —
   Quizlet's 800M study sets prove distribution comes from shared artifacts.
   Also the first viral loop for the landing page.

### Later (2027) — expand

9. **Mobile capture + review app** (or PWA hardening): review queues are a
   phone habit; capture-on-the-go feeds the vault.
10. **Classroom/team spaces** (Atelier/Guild): shared vaults, instructor
    dashboards on top of the existing admin console + seat billing.
11. **Handwriting/image and lecture-video ingestion**; browser-clipper for
    link mode.
12. **Marketplace/community decks** with quality signals — long-term moat vs
    disposable AI-generated cards.

### Explicit non-goals

- Generic chat assistant untethered from the vault (commodity).
- Language-learning vertical (dominated: Preply/Speak/ELSA raised $400M+).
- Real-time collaboration editing (Notion's turf; not a learning feature).

---

## 4. Success metrics

- **Activation:** first deck reviewed within 24h of first note captured.
- **Retention proxy:** day-14 flashcard recall rate ≥ 85% (Anki benchmark 89%).
- **Habit:** weekly review sessions per active user; streak length median.
- **Monetization:** free→Weaver conversion on AI-quota exhaustion (20/mo cap);
  track 429-to-checkout funnel already instrumented in EE.

## Sources

- [Laxu — Best spaced repetition apps 2026](https://laxuai.com/blog/best-spaced-repetition-apps-2026)
- [Iatrox — Anki vs Quizlet for medical students (2026)](https://www.iatrox.com/blog/anki-vs-quizlet-vs-spaced-repetition-apps-medical-students-2026)
- [RemNote — Best Anki alternatives 2026](https://www.remnote.com/blog/best-anki-alternatives)
- [AFFiNE — Best second brain apps 2026](https://affine.pro/blog/best-second-brain-apps)
- [NoteLyn — Best second brain app 2026](https://www.notelyn.com/blog/second-brain-app)
- [New Market Pitch — Top AI education startups by fundraising (2026)](https://newmarketpitch.com/blogs/news/ai-education-top-startups-fundraising)
- [Jenova — AI tutor apps guide 2026](https://www.jenova.ai/en/resources/ai-tutor-app)
- [Y Combinator — AI-enhanced learning startups](https://www.ycombinator.com/companies/industry/AI-Enhanced%20Learning)
