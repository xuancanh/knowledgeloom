/**
 * BDD-style tests for WritableGuard.
 *
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WritableGuard } from '../server/src/common/guards/writable.guard';

function mockContext(readOnly: boolean): any {
  return {
    switchToHttp: () => ({
      getRequest: () => ({}),
      getResponse: () => ({
        status: (code: number) => ({ json: (body: any) => ({ code, body }) }),
      }),
    }),
    getClass: () => ({}),
    getHandler: () => ({}),
  };
}

function makeGuard(readOnly: boolean): WritableGuard {
  const config = { get: (key: string) => (key === 'readOnly' ? readOnly : undefined) };
  return new WritableGuard(config as any);
}

test('WritableGuard: allows requests in read-write mode', () => {
  const guard = makeGuard(false);
  const ctx = mockContext(false);
  assert.ok(guard.canActivate(ctx as any));
});

test('WritableGuard: blocks requests in read-only mode with 403', () => {
  const guard = makeGuard(true);
  const ctx = mockContext(true);

  assert.throws(
    () => guard.canActivate(ctx as any),
    (err: any) => {
      return err.getStatus?.() === 403;
    },
  );
});

test('WritableGuard: readOnly is false when KNOWLEDGE_READ_ONLY is undefined', () => {
  const config = { get: () => undefined as any };
  const guard = new WritableGuard(config as any);
  const ctx = mockContext(false);
  assert.ok(guard.canActivate(ctx as any));
});

test('WritableGuard: readOnly is true when KNOWLEDGE_READ_ONLY=1', () => {
  // Verify the config module correctly interprets this — we test the guard
  // with the resolved config value, not the env var directly
  const guard = makeGuard(true);
  const ctx = mockContext(true);
  assert.throws(() => guard.canActivate(ctx as any));
});

// ── LocalAuthStrategy ─────────────────────────────────────────────────────────
import { LocalAuthStrategy } from '../server/src/auth/local-auth.strategy';

function makeStrategy(secret?: string): LocalAuthStrategy {
  const config = { get: (key: string) => (key === 'authSecret' ? secret : undefined) };
  return new LocalAuthStrategy(config as any);
}

function requestWithAuth(header?: string): any {
  return { headers: header ? { authorization: header } : {} };
}

test('LocalAuthStrategy: no secret configured — every request is userId "local"', () => {
  const strategy = makeStrategy();
  assert.equal(strategy.authenticate(requestWithAuth()), 'local');
  assert.equal(strategy.authenticate(requestWithAuth('Bearer anything')), 'local');
});

test('LocalAuthStrategy: secret configured — accepts the matching bearer token', () => {
  const strategy = makeStrategy('s3cret');
  assert.equal(strategy.authenticate(requestWithAuth('Bearer s3cret')), 'local');
});

test('LocalAuthStrategy: secret configured — rejects a missing token', () => {
  const strategy = makeStrategy('s3cret');
  assert.throws(() => strategy.authenticate(requestWithAuth()), /Missing authorization token/);
});

test('LocalAuthStrategy: secret configured — rejects a wrong token', () => {
  const strategy = makeStrategy('s3cret');
  assert.throws(() => strategy.authenticate(requestWithAuth('Bearer nope')), /Invalid token/);
  assert.throws(() => strategy.authenticate(requestWithAuth('Bearer s3cret-longer')), /Invalid token/);
});

test('LocalAuthStrategy: secret configured — rejects non-bearer schemes', () => {
  const strategy = makeStrategy('s3cret');
  assert.throws(() => strategy.authenticate(requestWithAuth('Basic s3cret')), /Missing authorization token/);
});
