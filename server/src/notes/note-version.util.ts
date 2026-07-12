import { createHash } from 'node:crypto';

export function noteVersion(markdown: string): string {
  return createHash('sha256').update(markdown).digest('base64url');
}

export function noteEtag(version: string): string {
  return `"${version}"`;
}

export function versionFromIfMatch(value?: string): string | undefined {
  if (!value) return undefined;
  const candidate = value.split(',', 1)[0].trim();
  if (candidate === '*') return undefined;
  return candidate.replace(/^W\//, '').replace(/^"|"$/g, '');
}
