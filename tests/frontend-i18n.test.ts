/**
 * Locale parity: every translation file must define the same keys as the
 * English reference, so no user-visible string silently falls back to English
 * (or worse, renders a raw key) in another language.
 *
 * i18next plural handling means a locale may carry MORE keys than English —
 * Spanish needs quiz.studyDue_plural where English reuses the base — so an
 * "extra" key is allowed only when it reduces to an English base key after its
 * plural suffix is stripped. A genuinely unknown key still fails.
 *
 * Run: npm run test:frontend
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/i18n/locales');
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other|plural)$/;

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

const load = (file: string) => JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8'));
const baseOf = (key: string) => key.replace(PLURAL_SUFFIX, '');

const enKeys = new Set(flatten(load('en.json')));
const enBases = new Set([...enKeys].map(baseOf));
const otherLocales = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json') && f !== 'en.json');

test('locales: at least the nine shipped languages exist', () => {
  assert.ok(otherLocales.length >= 8, `expected >= 8 non-English locales, found ${otherLocales.length}`);
});

for (const file of otherLocales) {
  const keys = new Set(flatten(load(file)));

  test(`locales: ${file} defines every English key`, () => {
    const missing = [...enKeys].filter((k) => !keys.has(k));
    assert.deepEqual(missing, [], `${file} is missing ${missing.length} key(s): ${missing.slice(0, 8).join(', ')}`);
  });

  test(`locales: ${file} has no unknown keys (extras must be plural variants of an English key)`, () => {
    const unexplained = [...keys].filter((k) => !enKeys.has(k) && !enBases.has(baseOf(k)));
    assert.deepEqual(unexplained, [], `${file} has ${unexplained.length} unknown key(s): ${unexplained.slice(0, 8).join(', ')}`);
  });
}
