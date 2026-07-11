/**
 * main.ts — OSS entry point.
 *
 * All bootstrap logic lives in bootstrap.ts (`createApp`/`startApp`) so that
 * private composing apps importing @knowledge-loom/server reuse the exact
 * same configuration (CORS, security headers, rate limiting, validation,
 * exception shape, SPA serving) and differ only in the modules they mount.
 */
import { startApp } from './bootstrap';

startApp();
