/**
 * Reads and parses a JSON request body. Empty bodies are treated as `{}` so
 * callers do not need separate handling for routes with optional payloads.
 */
export async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Writes a JSON response with permissive local CORS headers for the Vite dev
 * proxy and direct curl smoke tests.
 */
export function sendJson(response, status, data) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  response.end(JSON.stringify(data));
}
