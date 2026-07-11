import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const KEY_BYTES = 64;

export async function hashSharePassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_BYTES) as Buffer;
  return `scrypt:${salt.toString('base64url')}:${key.toString('base64url')}`;
}

export async function verifySharePassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltText, keyText] = encoded.split(':');
  if (algorithm !== 'scrypt' || !saltText || !keyText) return false;
  try {
    const expected = Buffer.from(keyText, 'base64url');
    if (expected.length !== KEY_BYTES) return false;
    const actual = await derive(password, Buffer.from(saltText, 'base64url'), expected.length) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
