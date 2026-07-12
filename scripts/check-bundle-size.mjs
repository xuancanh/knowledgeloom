import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_INITIAL_JS_BYTES = 300_000;
const html = await readFile(join('dist', 'index.html'), 'utf8');
const match = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);

if (!match) throw new Error('Could not find the initial module script in dist/index.html');

const relativePath = match[1].replace(/^\//, '');
const { size } = await stat(join('dist', relativePath));
if (size > MAX_INITIAL_JS_BYTES) {
  throw new Error(
    `Initial JavaScript is ${(size / 1000).toFixed(1)} KB; budget is ${(MAX_INITIAL_JS_BYTES / 1000).toFixed(0)} KB`,
  );
}

console.log(`Initial JavaScript: ${(size / 1000).toFixed(1)} KB / ${(MAX_INITIAL_JS_BYTES / 1000).toFixed(0)} KB budget`);
