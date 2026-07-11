import test from 'node:test';
import assert from 'node:assert/strict';
import { hashSharePassword, verifySharePassword } from '../server/src/shares/share-password.util';

test('share passwords are salted and verify only the original value', async () => {
  const first = await hashSharePassword('correct horse battery staple');
  const second = await hashSharePassword('correct horse battery staple');
  assert.notEqual(first, second, 'random salts must produce different encodings');
  assert.equal(await verifySharePassword('correct horse battery staple', first), true);
  assert.equal(await verifySharePassword('wrong password', first), false);
});

test('share password verification rejects malformed persisted values', async () => {
  assert.equal(await verifySharePassword('anything', ''), false);
  assert.equal(await verifySharePassword('anything', 'sha256:salt:key'), false);
  assert.equal(await verifySharePassword('anything', 'scrypt:bad:short'), false);
});
