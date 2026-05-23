// Sample knowledge base for the Loom prototype.
// Mix of CS, cognitive science, history of science, math, linguistics.

const CATEGORIES = [
  {
    id: "distributed-systems",
    name: "Distributed Systems",
    color: "oxblood",
    summary:
      "Eight notes on consensus, replication, and the awkward gap between what a clock claims and what a network agrees on. Themes: partial failure as the default, the price of strong consistency, and small protocols that hide enormous machinery.",
  },
  {
    id: "cognitive-science",
    name: "Cognitive Science",
    color: "moss",
    summary:
      "How minds carve up the world. Working memory limits, the predictive brain, and why introspection is an unreliable narrator. Recurring question: which findings actually replicate?",
  },
  {
    id: "history-of-science",
    name: "History of Science",
    color: "indigo",
    summary:
      "Episodes from the long argument with nature. The Royal Society, the smallpox debate, what Lavoisier weighed and what Priestley refused to. A reminder that paradigms are stickier than data.",
  },
  {
    id: "cryptography",
    name: "Cryptography",
    color: "ochre",
    summary:
      "From one-time pads to lattice assumptions. Notes on what 'secure' means under which adversary, and why most real-world breaks are protocol mistakes, not math.",
  },
  {
    id: "linguistics",
    name: "Linguistics",
    color: "teal",
    summary:
      "How sound becomes meaning. Phonology, morphology, the strange persistence of irregular verbs, and Zipf's law showing up uninvited in every corpus.",
  },
  {
    id: "probability",
    name: "Probability & Statistics",
    color: "rust",
    summary:
      "Conditioning, sampling, and the difference between a generative model and a fit. Recurring villains: base-rate neglect and quietly-correlated errors.",
  },
];

const NOTES = [
  {
    id: "vector-clocks",
    title: "Vector clocks order events without a shared clock",
    category: "distributed-systems",
    tags: ["consensus", "time", "causality"],
    created: "2026-05-14",
    summary:
      "Each process keeps a per-process counter; sending a message piggybacks the sender's vector and the receiver takes the pointwise max plus one. Two events are concurrent iff neither vector dominates.",
    body: [
      { type: "p", text: "A vector clock is one integer per process. On a local event, a process increments its own slot. On send, it attaches the whole vector. On receive, it merges by taking the pointwise maximum and then increments its own slot." },
      { type: "h", text: "Why it's useful" },
      { type: "p", text: "Lamport timestamps give a total order but lose information: two unrelated events can get arbitrary order. Vector clocks preserve the *partial* order, which is exactly what causality is." },
      { type: "p", text: "If V(a) < V(b) component-wise, then a happened-before b. If neither dominates, the events are concurrent — there is no fact of the matter about which came first." },
      { type: "h", text: "What it costs" },
      { type: "p", text: "Storage and bandwidth scale with the number of processes, which is fine for a fixed cluster and awful for an open system. Dotted version vectors compress the common case where one writer dominates a key." },
      { type: "q", text: "Concurrency isn't a bug to fix — it's a fact about the world your system has to be honest about." },
    ],
    links: ["lamport-happens-before", "crdts", "consistent-snapshots"],
  },
  {
    id: "lamport-happens-before",
    title: "Happens-before is the only order distributed systems get for free",
    category: "distributed-systems",
    tags: ["causality", "time", "lamport"],
    created: "2026-05-12",
    summary:
      "Lamport's 1978 insight: in a system without a shared clock, the only well-defined order is the transitive closure of program order and message delivery. Everything else is a lie wearing a timestamp.",
    body: [
      { type: "p", text: "Two events on the same process are ordered by program order. A send and its matching receive are ordered. Take the transitive closure and you have happens-before (→). Anything not related by → is concurrent." },
      { type: "p", text: "The pragmatic consequence: wall-clock timestamps from different machines don't compose. NTP-synced clocks can disagree by tens of milliseconds, which is forever at machine speed." },
      { type: "h", text: "Where it shows up" },
      { type: "p", text: "Causal consistency, session guarantees, conflict resolution in CRDTs, debugging traces. Anywhere you want to say 'X caused Y' across machines, → is the only honest answer." },
    ],
    links: ["vector-clocks", "crdts", "spanner-truetime"],
  },
  {
    id: "crdts",
    title: "CRDTs trade expressiveness for automatic merge",
    category: "distributed-systems",
    tags: ["replication", "merge", "lattice"],
    created: "2026-05-10",
    summary:
      "Conflict-free Replicated Data Types are sets, counters, and maps whose merge operation is commutative, associative, and idempotent — so concurrent updates always converge, but you give up arbitrary edits.",
    body: [
      { type: "p", text: "A state-based CRDT defines a join-semilattice: every pair of states has a least upper bound, and merge = lub. Replicas can apply updates in any order, lose messages, and double-deliver, and still agree." },
      { type: "p", text: "The price: you can model G-counters, OR-sets, LWW-registers, sequence types like RGA — but 'arbitrary edit a JSON tree' isn't on the menu without picking a specific semantics for every conflict." },
      { type: "h", text: "The Riak experience" },
      { type: "p", text: "Production use found that the hardest part isn't the math — it's metadata growth. Tombstones, dotted version vectors, and garbage collection are where most of the engineering goes." },
    ],
    links: ["vector-clocks", "lamport-happens-before"],
  },
  {
    id: "spanner-truetime",
    title: "TrueTime turns clock uncertainty into a first-class API",
    category: "distributed-systems",
    tags: ["clocks", "consistency", "spanner"],
    created: "2026-05-08",
    summary:
      "Google's Spanner exposes TT.now() returning an interval [earliest, latest]. To commit a transaction, you wait out the interval. Atomic clocks and GPS make the interval ~7ms.",
    body: [
      { type: "p", text: "Most systems pretend clocks are exact and pay for it in subtle bugs. Spanner instead admits the uncertainty and pays for it explicitly with a 'commit wait' of a few milliseconds." },
      { type: "p", text: "The result is external consistency: if transaction T1 commits before T2 starts in real time, T1's timestamp is less than T2's. This is stronger than serializability and lets you read at a timestamp." },
    ],
    links: ["lamport-happens-before", "consistent-snapshots"],
  },
  {
    id: "consistent-snapshots",
    title: "Chandy–Lamport snapshots without stopping the world",
    category: "distributed-systems",
    tags: ["snapshot", "checkpoint"],
    created: "2026-05-06",
    summary:
      "A process records its own state, then sends a marker on every outgoing channel. A receiver records the channel state as 'messages received between the first marker and the local snapshot.'",
    body: [
      { type: "p", text: "The protocol works because markers act as causal barriers. Any message sent before a process snapshotted is either already received (in pre-state) or in the recorded channel state." },
      { type: "p", text: "Modern streaming systems (Flink) use a variant for exactly-once: barriers flow through the dataflow graph and trigger aligned snapshots at every operator." },
    ],
    links: ["vector-clocks", "spanner-truetime"],
  },
  {
    id: "working-memory-four",
    title: "Working memory holds about four chunks, not seven",
    category: "cognitive-science",
    tags: ["memory", "attention", "cowan"],
    created: "2026-05-13",
    summary:
      "Miller's 'magical number seven' included rehearsal and chunking strategies. Cowan's stricter no-rehearsal estimate is closer to four items — and 'item' is a slippery unit.",
    body: [
      { type: "p", text: "When you control for rehearsal and grouping, the capacity drops. A chunk is whatever the long-term memory will reliably hand back as a unit — so an expert chess player's 'one chunk' is a novice's 'six pieces.'" },
      { type: "p", text: "Design implication: any UI that asks the user to hold more than ~4 simultaneous items in their head is asking them to externalize. Give them a place to put things." },
    ],
    links: ["chunking-expertise", "predictive-brain"],
  },
  {
    id: "chunking-expertise",
    title: "Expertise is mostly better chunking",
    category: "cognitive-science",
    tags: ["expertise", "memory", "chase-simon"],
    created: "2026-05-11",
    summary:
      "Chase and Simon showed that chess masters' superior recall vanishes when the board is randomized. They aren't remembering pieces; they're remembering meaningful structures.",
    body: [
      { type: "p", text: "The same effect appears in radiology, programming, sports tactics — anywhere experts spend years building a vocabulary of patterns. The deliberate-practice literature is largely a theory of how those patterns get installed." },
      { type: "p", text: "Why care: if expertise is chunking, then teaching is the design of chunkable representations. Notation matters more than effort." },
    ],
    links: ["working-memory-four"],
  },
  {
    id: "predictive-brain",
    title: "The brain is mostly running predictions, not reading sensors",
    category: "cognitive-science",
    tags: ["predictive-coding", "perception"],
    created: "2026-05-09",
    summary:
      "Predictive coding flips the naive picture: top-down predictions are the signal, sensory input is the correction. Most of what you 'see' is generated; the eyes mostly say what's wrong.",
    body: [
      { type: "p", text: "Anatomically, there are far more descending connections from higher cortical areas than ascending ones. Computationally, this matches a hierarchy of generative models whose errors propagate up." },
      { type: "p", text: "Hallucinations, illusions, and the placebo effect stop being weird edge cases — they're what you'd expect from a system that prefers its own model to noisy data." },
    ],
    links: ["working-memory-four"],
  },
  {
    id: "smallpox-inoculation",
    title: "Inoculation traveled west through letters, not lectures",
    category: "history-of-science",
    tags: ["medicine", "18th-century", "montagu"],
    created: "2026-05-07",
    summary:
      "Lady Mary Wortley Montagu observed Ottoman inoculation in 1717 and wrote about it from Constantinople. Adoption in England moved through aristocratic correspondence and royal trials, not the medical establishment.",
    body: [
      { type: "p", text: "The Royal Society had received reports from Timoni and Pylarini years earlier and largely ignored them. It took a well-connected aristocrat inoculating her own children — and a public trial on condemned prisoners — to move the needle." },
      { type: "p", text: "The pattern recurs: a technique exists, evidence exists, what's missing is a social vector willing to absorb the personal risk of being wrong in public." },
    ],
    links: ["paradigm-stickiness"],
  },
  {
    id: "paradigm-stickiness",
    title: "Paradigms outlive their data because identities are attached",
    category: "history-of-science",
    tags: ["kuhn", "sociology"],
    created: "2026-05-05",
    summary:
      "Kuhn's quieter point: scientists don't abandon a paradigm when anomalies pile up. They abandon it when the next generation, trained on a new one, takes over the journals and chairs.",
    body: [
      { type: "p", text: "Planck's grim joke — science advances one funeral at a time — turns out to have a base rate. Studies of citation patterns after a famous scientist dies show measurable upticks in heterodox work in their subfield." },
    ],
    links: ["smallpox-inoculation"],
  },
  {
    id: "one-time-pad",
    title: "The one-time pad is unconditionally secure and operationally hopeless",
    category: "cryptography",
    tags: ["otp", "information-theory", "shannon"],
    created: "2026-05-04",
    summary:
      "Shannon proved perfect secrecy requires a key as long as the message, used once, uniformly random. Every real-world OTP break has been a key-reuse or key-distribution failure, never a math failure.",
    body: [
      { type: "p", text: "Venona broke Soviet OTP traffic because of pad reuse during wartime production pressure. The cipher was fine; the supply chain wasn't." },
      { type: "p", text: "Lesson generalizes: in deployed crypto, the cryptosystem is rarely the weak link. Key management, protocol composition, and side channels are." },
    ],
    links: ["lattice-assumptions", "side-channels"],
  },
  {
    id: "lattice-assumptions",
    title: "Post-quantum security mostly bets on lattices",
    category: "cryptography",
    tags: ["post-quantum", "lattice", "lwe"],
    created: "2026-05-03",
    summary:
      "Learning With Errors (LWE) and its ring variant underpin most NIST-selected post-quantum schemes. The hardness assumption: distinguishing noisy linear equations from uniform is hard, even for a quantum adversary.",
    body: [
      { type: "p", text: "Unlike factoring, lattice problems have no known polynomial quantum algorithm. The cost is bigger keys and ciphertexts — Kyber's public key is ~800 bytes vs. RSA-2048's 256." },
    ],
    links: ["one-time-pad"],
  },
  {
    id: "side-channels",
    title: "Side channels are how crypto actually breaks",
    category: "cryptography",
    tags: ["timing", "power-analysis", "attacks"],
    created: "2026-05-02",
    summary:
      "Cache timing, branch prediction, EM emissions, power draw. The math is fine; the implementation leaks. Constant-time code is harder than it looks because compilers helpfully optimize it away.",
    body: [
      { type: "p", text: "Kocher's 1996 timing attacks on RSA started a whole field. Spectre and Meltdown made it operating-system-wide. Most production crypto libraries now ship constant-time primitives, and most code that calls them still leaks at a higher layer." },
    ],
    links: ["one-time-pad"],
  },
  {
    id: "zipf-law",
    title: "Zipf's law appears in every natural corpus and nobody fully knows why",
    category: "linguistics",
    tags: ["zipf", "power-law", "corpus"],
    created: "2026-05-01",
    summary:
      "Rank a corpus's words by frequency; frequency × rank is approximately constant. The same shape shows up in city sizes, surname distributions, and API endpoint hit counts.",
    body: [
      { type: "p", text: "Mandelbrot showed you can get Zipf from a random typewriter with a space key, which suggests it's partly an artifact of how we segment. But the principle of least effort and preferential-attachment models also produce it, so the field has more candidate explanations than constraints." },
    ],
    links: ["irregular-verbs"],
  },
  {
    id: "irregular-verbs",
    title: "Irregular verbs persist because they're frequent",
    category: "linguistics",
    tags: ["morphology", "frequency", "regularization"],
    created: "2026-04-29",
    summary:
      "Lieberman et al. tracked English verb regularization over 1,200 years. Irregular verbs that fall in frequency get regularized; high-frequency irregulars (be, have, go) stay irregular indefinitely.",
    body: [
      { type: "p", text: "The half-life of an irregular verb scales as the square root of its frequency. 'Holp' became 'helped'; 'went' is in no danger because we say it constantly and the irregular form gets reinforced every time." },
    ],
    links: ["zipf-law"],
  },
  {
    id: "base-rate-neglect",
    title: "Base-rate neglect makes diagnostic tests feel more useful than they are",
    category: "probability",
    tags: ["bayes", "diagnosis", "heuristics"],
    created: "2026-04-28",
    summary:
      "A test with 99% sensitivity and 99% specificity for a disease with 1% prevalence still produces a positive result that's wrong half the time. Most people — including doctors — get this wrong on first pass.",
    body: [
      { type: "p", text: "Frame it in natural frequencies and the error rate drops dramatically. 'Out of 10,000 people, 100 have it, 99 test positive correctly, of the other 9,900 about 99 also test positive — so a positive is 50/50' is much easier than P(D|+) = P(+|D)P(D)/P(+)." },
    ],
    links: ["correlated-errors"],
  },
  {
    id: "correlated-errors",
    title: "Independent errors aren't, and that's where models break",
    category: "probability",
    tags: ["independence", "modeling", "risk"],
    created: "2026-04-27",
    summary:
      "Most failure models assume independent components. In practice, components share power supplies, racks, software versions, and operators — so failures cluster. 2008 mortgage models assumed regional housing-price independence.",
    body: [
      { type: "p", text: "The general lesson: when you assume independence, list the shared causes you're implicitly betting against. If the list is empty, you haven't looked hard enough." },
    ],
    links: ["base-rate-neglect"],
  },
];

// Activity feed seeded with a mix of completed and in-flight jobs.
const INITIAL_JOBS = [
  { id: "j-301", title: "Eventually consistent reads are a UX problem, not a DB problem", state: "saved", category: "distributed-systems", at: "10:42" },
  { id: "j-300", title: "Cargo-cult Bayesians vs. actual Bayesians", state: "saved", category: "probability", at: "10:31" },
  { id: "j-299", title: "Why did the Antikythera mechanism take 2000 years to be matched?", state: "fallback", category: "history-of-science", at: "10:18" },
  { id: "j-298", title: "Phonemes are abstractions over allophones", state: "saved", category: "linguistics", at: "09:54" },
];

window.KL_DATA = { CATEGORIES, NOTES, INITIAL_JOBS };
