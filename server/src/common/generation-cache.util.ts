export type GenerationCacheEntry = {
  hash: string;
  generatedAt: string;
};

const FAILURE_PREFIX = 'failed:';

export function failedGenerationTimestamp(now = new Date()): string {
  return `${FAILURE_PREFIX}${now.toISOString()}`;
}

export function shouldReuseGeneration(
  entry: GenerationCacheEntry | undefined,
  contentHash: string,
  retryMs: number,
  now = Date.now(),
): boolean {
  if (!entry || entry.hash !== contentHash) return false;
  if (!entry.generatedAt.startsWith(FAILURE_PREFIX)) return true;
  const failedAt = Date.parse(entry.generatedAt.slice(FAILURE_PREFIX.length));
  return Number.isFinite(failedAt) && now - failedAt < retryMs;
}
