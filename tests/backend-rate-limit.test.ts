import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPublicRequest,
  createPublicRateLimitMiddleware,
  MemoryRateLimitStore,
  RedisRateLimitStore,
  type RateLimitStore,
} from '../server/src/common/public-rate-limiter';

test('public limiter: classifies only unauthenticated public routes', () => {
  assert.equal(classifyPublicRequest('GET', '/api/marketplace'), 'public');
  assert.equal(classifyPublicRequest('GET', '/api/shares/token/public'), 'public');
  assert.equal(classifyPublicRequest('POST', '/api/shares/token/public'), 'share-unlock');
  assert.equal(classifyPublicRequest('POST', '/api/marketplace'), null);
  assert.equal(classifyPublicRequest('GET', '/api/status'), null);
});

test('memory limiter: increments within a window and resets at the boundary', async () => {
  let now = 1_000;
  const store = new MemoryRateLimitStore(10, () => now);
  assert.deepEqual(await store.increment('client', 60_000), { count: 1, resetMs: 60_000 });
  now += 1_000;
  assert.deepEqual(await store.increment('client', 60_000), { count: 2, resetMs: 59_000 });
  now += 59_000;
  assert.deepEqual(await store.increment('client', 60_000), { count: 1, resetMs: 60_000 });
});

test('redis limiter: uses the atomic script result', async () => {
  const calls: unknown[][] = [];
  const redis = {
    async eval(...args: unknown[]) { calls.push(args); return [3, 42_000]; },
    disconnect() {},
  };
  const store = new RedisRateLimitStore(redis, 'test:');
  assert.deepEqual(await store.increment('client', 60_000), { count: 3, resetMs: 42_000 });
  assert.equal(calls[0][1], 1);
  assert.equal(calls[0][2], 'test:client');
});

test('public limiter: returns 429 with retry metadata after the allowance', async () => {
  const store = new MemoryRateLimitStore();
  const middleware = createPublicRateLimitMiddleware(store, { publicLimit: 1, shareUnlockLimit: 1 });
  const headers: Record<string, string> = {};
  let status = 200;
  let body: unknown;
  const req = { method: 'GET', path: '/api/marketplace', ip: '127.0.0.1', socket: {} } as any;
  const res = {
    setHeader(name: string, value: string) { headers[name] = value; },
    status(value: number) { status = value; return this; },
    json(value: unknown) { body = value; return this; },
  } as any;
  let nextCalls = 0;
  await middleware(req, res, () => { nextCalls += 1; });
  await middleware(req, res, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(status, 429);
  assert.equal(headers['RateLimit-Remaining'], '0');
  assert.equal(headers['Retry-After'], '60');
  assert.deepEqual(body, { error: 'rate limit exceeded — try again shortly' });
});

test('public limiter: fails closed when the shared store is unavailable', async () => {
  const store: RateLimitStore = {
    async increment() { throw new Error('offline'); },
    close() {},
  };
  const middleware = createPublicRateLimitMiddleware(store, { publicLimit: 1, shareUnlockLimit: 1 });
  let status = 200;
  let nextCalled = false;
  const req = { method: 'GET', path: '/api/marketplace', ip: '127.0.0.1', socket: {} } as any;
  const res = {
    setHeader() {},
    status(value: number) { status = value; return this; },
    json() { return this; },
  } as any;
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(status, 503);
  assert.equal(nextCalled, false);
});
