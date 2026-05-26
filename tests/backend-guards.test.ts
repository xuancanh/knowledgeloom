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
