# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately via GitHub Security Advisories
("Report a vulnerability" on the Security tab) rather than public issues.
You can expect an acknowledgement within 72 hours.

## Scope notes

- The API is authenticated by default in cloud mode (Supabase JWT) and can be
  bearer-token-gated in self-hosted mode (`AUTH_SECRET`). Running an
  internet-exposed instance with neither is unsupported.
- `/api/shares/:id/public` and `/api/marketplace` are intentionally public;
  share ids are 128-bit random values and revocable.
- The MCP server (`mcp/`) is stdio-only by design — see docs/tech/MCP.md for its
  threat model. Wrapping it in a network transport voids that model.
- Secrets are environment-only; nothing in the repo or the Docker image
  should ever contain credentials.

## Supported versions

The `main` branch and the latest tagged release receive security fixes.
