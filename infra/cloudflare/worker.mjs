/**
 * Thin Worker that proxies every request to the containerized API.
 * A long sleepAfter keeps BullMQ timers alive between requests; pair with a
 * cron-pinged /api/status for always-warm behaviour (docs/DEPLOYMENT.md).
 */
import { Container } from '@cloudflare/containers';

export class LoomApi extends Container {
  defaultPort = 8787;
  sleepAfter = '2h';
}

export default {
  async fetch(request, env) {
    const id = env.LOOM_API.idFromName('api');
    return env.LOOM_API.get(id).fetch(request);
  },
};
