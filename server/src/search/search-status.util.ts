import type { SearchStatus } from '../types';

export function healthySearchStatus(engine: string, attemptedAt: string): SearchStatus {
  return {
    engine,
    state: 'healthy',
    lastAttemptAt: attemptedAt,
    lastSuccessAt: attemptedAt,
    error: null,
  };
}

export function degradedSearchStatus(
  engine: string,
  attemptedAt: string,
  lastSuccessAt: string | null,
  error: unknown,
): SearchStatus {
  return {
    engine,
    state: 'degraded',
    lastAttemptAt: attemptedAt,
    lastSuccessAt,
    error: error instanceof Error ? error.message.slice(0, 500) : 'search sync failed',
  };
}
