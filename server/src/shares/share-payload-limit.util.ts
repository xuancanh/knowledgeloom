export const MARKETPLACE_PREVIEW_MAX_BYTES = 1024 * 1024;
const PREVIEW_FIELD_MAX_CHARS = 20_000;

type CollectionPayload = {
  kind: 'category';
  collection?: Record<string, unknown>;
  notes?: Array<Record<string, unknown> & { body?: string }>;
  flashcards: unknown[];
  quiz: unknown[];
  [key: string]: unknown;
};

function encodedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function safePrefix(value: string, length: number): string {
  let prefix = value.slice(0, length);
  const last = prefix.charCodeAt(prefix.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) prefix = prefix.slice(0, -1);
  return prefix;
}

function limitFieldStrings(value: unknown): { value: unknown; truncated: boolean } {
  if (typeof value === 'string') {
    return value.length > PREVIEW_FIELD_MAX_CHARS
      ? { value: safePrefix(value, PREVIEW_FIELD_MAX_CHARS), truncated: true }
      : { value, truncated: false };
  }
  if (Array.isArray(value)) {
    const items = value.map(limitFieldStrings);
    return { value: items.map((item) => item.value), truncated: items.some((item) => item.truncated) };
  }
  if (value && typeof value === 'object') {
    let truncated = false;
    const entries = Object.entries(value).map(([key, item]) => {
      const limited = limitFieldStrings(item);
      truncated ||= limited.truncated;
      return [key, limited.value];
    });
    return { value: Object.fromEntries(entries), truncated };
  }
  return { value, truncated: false };
}

/**
 * Bounds unauthenticated marketplace category previews without changing the
 * canonical share payload used for imports. Note content is prioritized over
 * generated study material, and the returned JSON is guaranteed to fit.
 */
export function limitMarketplacePreview<T>(payload: T, maxBytes = MARKETPLACE_PREVIEW_MAX_BYTES): T {
  const source = payload as CollectionPayload;
  if (source.kind !== 'category') return payload;

  const notes: Array<Record<string, unknown>> = [];
  const flashcards: unknown[] = [];
  const quiz: unknown[] = [];
  const collection = {
    ...(source.collection ?? {}),
    includedNoteCount: 999,
    truncated: true,
  };
  const preview: CollectionPayload = { ...source, collection, notes, flashcards, quiz };
  let currentBytes = encodedBytes(preview);
  let truncated = false;

  const appendIfFits = (target: unknown[], item: unknown): boolean => {
    const itemBytes = encodedBytes(item) + (target.length ? 1 : 0);
    if (currentBytes + itemBytes > maxBytes) return false;
    target.push(item);
    currentBytes += itemBytes;
    return true;
  };

  for (const note of source.notes ?? []) {
    if (appendIfFits(notes, note)) continue;
    truncated = true;

    const body = typeof note.body === 'string' ? note.body : '';
    const shortened = { ...note, body: '', bodyTruncated: true };
    const separatorBytes = notes.length ? 1 : 0;
    const availableItemBytes = maxBytes - currentBytes - separatorBytes;
    if (encodedBytes(shortened) > availableItemBytes) continue;

    let low = 0;
    let high = body.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      shortened.body = safePrefix(body, mid);
      if (encodedBytes(shortened) <= availableItemBytes) low = mid;
      else high = mid - 1;
    }
    shortened.body = safePrefix(body, low);
    appendIfFits(notes, shortened);
  }

  for (const card of source.flashcards ?? []) {
    const limited = limitFieldStrings(card);
    if (limited.truncated) truncated = true;
    if (!appendIfFits(flashcards, limited.value)) truncated = true;
  }
  for (const question of source.quiz ?? []) {
    const limited = limitFieldStrings(question);
    if (limited.truncated) truncated = true;
    if (!appendIfFits(quiz, limited.value)) truncated = true;
  }

  if (!truncated) return payload;
  collection.includedNoteCount = notes.length;
  return preview as T;
}
