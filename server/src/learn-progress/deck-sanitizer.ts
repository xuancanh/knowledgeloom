/**
 * Deck sanitizer — validates and repairs AI-generated learn decks.
 *
 * The AI provider returns free-form JSON; this module is the trust boundary
 * between model output and the UI. Malformed sections are dropped rather than
 * failing the whole deck, and quiz items whose answer is not one of the
 * options are discarded because the UI matches the answer by string equality.
 */

export interface AiDeck {
  teach?: Array<{ head: string; paras: string[] }>;
  insight?: { text: string };
  flash?: Array<{ front: string; back: string }>;
  quiz?: Array<{ prompt: string; options: string[]; answer: string; feedback: string }>;
  podcast?: { lines: Array<{ who: string; text: string }> };
  recap?: { takeaways: string[] };
}

const HOST_IDS = ['maya', 'theo'];

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function strArray(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(str).filter((s): s is string => !!s).slice(0, cap);
}

/** Extracts a JSON object from a raw model response (handles code fences and prose). */
export function parseAiJson(raw: string): unknown {
  const fenced = raw.match(/```json\s*([\s\S]+?)\s*```/)?.[1]
    ?? raw.match(/```\s*([\s\S]+?)\s*```/)?.[1]
    ?? raw;
  const trimmed = fenced.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Model may prepend prose; retry from the first brace to the last.
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('no JSON object in AI response');
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

/**
 * Validates a parsed AI deck. Returns null when nothing usable survives so
 * callers can fall back to the heuristic deck.
 */
export function sanitizeAiDeck(input: unknown): AiDeck | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const deck: AiDeck = {};

  if (Array.isArray(raw.teach)) {
    const teach = raw.teach
      .map((t: unknown) => {
        const o = obj(t);
        const head = str(o.head);
        const paras = strArray(o.paras, 3);
        return head && paras.length ? { head, paras } : null;
      })
      .filter((t): t is { head: string; paras: string[] } => !!t)
      .slice(0, 4);
    if (teach.length) deck.teach = teach;
  }

  const insightText = str(obj(raw.insight).text);
  if (insightText) deck.insight = { text: insightText };

  if (Array.isArray(raw.flash)) {
    const flash = raw.flash
      .map((f: unknown) => {
        const o = obj(f);
        const front = str(o.front);
        const back = str(o.back);
        return front && back ? { front, back } : null;
      })
      .filter((f): f is { front: string; back: string } => !!f)
      .slice(0, 6);
    if (flash.length) deck.flash = flash;
  }

  if (Array.isArray(raw.quiz)) {
    const quiz = raw.quiz
      .map((q: unknown) => {
        const o = obj(q);
        const prompt = str(o.prompt);
        const options = strArray(o.options, 5);
        const answer = str(o.answer);
        const feedback = str(o.feedback) ?? '';
        if (!prompt || options.length < 2 || !answer) return null;
        // The UI marks the correct option by exact string match.
        const match = options.find((o) => o === answer)
          ?? options.find((o) => o.toLowerCase() === answer.toLowerCase());
        if (!match) return null;
        return { prompt, options, answer: match, feedback };
      })
      .filter((q): q is NonNullable<typeof q> => !!q)
      .slice(0, 4);
    if (quiz.length) deck.quiz = quiz;
  }

  const rawLines = obj(raw.podcast).lines;
  if (Array.isArray(rawLines)) {
    const lines = rawLines
      .map((l: unknown, i: number) => {
        const o = obj(l);
        const text = str(o.text);
        if (!text) return null;
        const who = typeof o.who === 'string' && HOST_IDS.includes(o.who) ? o.who : HOST_IDS[i % 2];
        return { who, text };
      })
      .filter((l): l is { who: string; text: string } => !!l)
      .slice(0, 14);
    if (lines.length >= 2) deck.podcast = { lines };
  }

  const takeaways = strArray(obj(raw.recap).takeaways, 5);
  if (takeaways.length) deck.recap = { takeaways };

  // A deck with no learnable content is worse than the heuristic fallback.
  if (!deck.teach && !deck.flash && !deck.quiz && !deck.podcast) return null;
  return deck;
}
