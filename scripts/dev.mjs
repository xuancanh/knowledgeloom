/**
 * Dev runner — starts the NestJS server (via ts-node) and the Vite frontend
 * in parallel so a single `npm run dev` brings up the full stack.
 *
 * ts-node transpiles the TypeScript source on-the-fly without a separate build
 * step, keeping the dev loop fast. The server/tsconfig.json is explicitly
 * passed so ts-node uses CommonJS module output (required by NestJS) rather
 * than inheriting the root tsconfig which targets ESM for the Vite frontend.
 */
import { spawn } from 'node:child_process';

const children = [
  spawn(
    'npx',
    ['ts-node', '--project', 'server/tsconfig.json', 'server/src/main.ts'],
    { stdio: 'inherit' },
  ),
  spawn('npx', ['vite', '--host', '0.0.0.0'], { stdio: 'inherit' }),
];

const shutdown = (code = 0) => {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(code);
};

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) shutdown(code);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
