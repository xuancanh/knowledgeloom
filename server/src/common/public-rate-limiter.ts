import type { NextFunction, Request, Response } from 'express';

export type RateLimitResult = { count: number; resetMs: number };

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitResult>;
  close(): void;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly maxKeys = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const now = this.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      this.makeRoom(now, windowMs, key);
      this.hits.set(key, { count: 1, windowStart: now });
      return { count: 1, resetMs: windowMs };
    }
    entry.count += 1;
    return { count: entry.count, resetMs: Math.max(1, windowMs - (now - entry.windowStart)) };
  }

  close(): void {
    this.hits.clear();
  }

  private makeRoom(now: number, windowMs: number, incomingKey: string): void {
    if (this.hits.has(incomingKey) || this.hits.size < this.maxKeys) return;
    for (const [key, entry] of this.hits) {
      if (now - entry.windowStart >= windowMs) this.hits.delete(key);
    }
    while (this.hits.size >= this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }
}

type RedisEvalClient = {
  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
  disconnect(): void;
};

const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`;

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: RedisEvalClient, private readonly prefix = 'kl:rate-limit:') {}

  async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const value = await this.redis.eval(INCREMENT_SCRIPT, 1, `${this.prefix}${key}`, windowMs);
    if (!Array.isArray(value) || value.length < 2) throw new Error('invalid Redis rate-limit response');
    const count = Number(value[0]);
    const ttl = Number(value[1]);
    if (!Number.isFinite(count) || !Number.isFinite(ttl)) throw new Error('invalid Redis rate-limit counters');
    return { count, resetMs: ttl > 0 ? ttl : windowMs };
  }

  close(): void {
    this.redis.disconnect();
  }
}

export type PublicRateLimitOptions = {
  publicLimit: number;
  shareUnlockLimit: number;
  windowMs?: number;
};

export function classifyPublicRequest(method: string, path: string): 'public' | 'share-unlock' | null {
  const isShareUnlock = method === 'POST' && /^\/api\/shares\/[^/]+\/public$/.test(path);
  if (isShareUnlock) return 'share-unlock';
  const isPublicGet = method === 'GET' && /^\/api\/(shares\/[^/]+\/public|marketplace(\/|$))/.test(path);
  return isPublicGet ? 'public' : null;
}

export function createPublicRateLimitMiddleware(store: RateLimitStore, options: PublicRateLimitOptions) {
  const windowMs = options.windowMs ?? 60_000;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const kind = classifyPublicRequest(req.method, req.path);
    if (!kind) return next();

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const identity = kind === 'share-unlock' ? `${kind}:${req.path}:${ip}` : `${kind}:${ip}`;
    const limit = kind === 'share-unlock' ? options.shareUnlockLimit : options.publicLimit;

    let result: RateLimitResult;
    try {
      result = await store.increment(identity, windowMs);
    } catch {
      res.status(503).json({ error: 'public request protection is temporarily unavailable' });
      return;
    }

    const resetSeconds = Math.max(1, Math.ceil(result.resetMs / 1000));
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - result.count)));
    res.setHeader('RateLimit-Reset', String(resetSeconds));
    if (result.count > limit) {
      res.setHeader('Retry-After', String(resetSeconds));
      res.status(429).json({ error: 'rate limit exceeded — try again shortly' });
      return;
    }
    next();
  };
}
