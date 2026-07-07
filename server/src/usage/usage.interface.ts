/**
 * UsageService — seam for AI usage tracking and quota enforcement.
 *
 * OSS builds get NoopUsageService: no tracking, no limits — self-hosters own
 * their AI spend. Extended builds (server/src/extensions/, private repo)
 * provide an implementation that records usage events and enforces per-plan
 * monthly quotas for AI features.
 *
 * Call sites (all AI-consuming endpoints):
 *   - POST /api/learn (research/polish/link)    → feature 'codex.research'
 *   - POST /api/learn-progress/generate-deck    → feature 'ai.deck'
 *   - POST /api/rag/stream                      → feature 'ai.rag'
 *   - POST /api/notes/assist-draft, :id/assist  → feature 'ai.assist'
 *   - POST /api/notes/:id/regenerate            → feature 'ai.regenerate'
 *   - POST /api/tts/podcast                     → feature 'ai.podcast'
 *
 * Non-AI events (e.g. 'note.created') may also be tracked for product
 * analytics; only AI_FEATURES count toward the quota.
 */
export const USAGE_SERVICE = 'USAGE_SERVICE';

/** Features that consume the per-plan monthly AI quota. */
export const AI_FEATURES = ['codex.research', 'ai.deck', 'ai.rag', 'ai.assist', 'ai.regenerate', 'ai.podcast'];

export interface UsageService {
  /**
   * Throws (HTTP 429) when the user's plan quota for AI features is
   * exhausted. Resolves silently otherwise.
   */
  checkQuota(userId: string, feature: string): Promise<void>;

  /** Records a usage event. Never throws — tracking must not break requests. */
  track(userId: string, feature: string, meta?: Record<string, unknown>): Promise<void>;

  /**
   * Maximum number of spaces the user may have, counting the default space.
   * null = unlimited. Self-hosted builds read the MAX_SPACES env var (unset
   * or 0 = unlimited); hosted builds derive it from the subscription plan.
   */
  spaceLimit(userId: string): Promise<number | null>;
}

export class NoopUsageService implements UsageService {
  constructor(private readonly maxSpaces: number = 0) {}
  async checkQuota(): Promise<void> {}
  async track(): Promise<void> {}
  async spaceLimit(): Promise<number | null> {
    return this.maxSpaces > 0 ? this.maxSpaces : null;
  }
}
