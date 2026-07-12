import { randomBytes } from 'node:crypto';

export interface CitationSource {
  id: string;
  title: string;
}

export function untrustedContentBlock(label: string, content: string, nonce?: string): string {
  const safeLabel = label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'DATA';
  const boundary = `${safeLabel}_${nonce || randomBytes(8).toString('hex')}`;
  return `BEGIN_UNTRUSTED_${boundary}\n${content}\nEND_UNTRUSTED_${boundary}`;
}

function escapedSourceTitle(title: string): string {
  return title
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .trim()
    .slice(0, 200) || 'Untitled note';
}

export function sourceLegend(sources: CitationSource[]): string {
  if (!sources.length) return '';
  return `\n\n---\n**Retrieved sources**\n${sources
    .map((source) => `- [${source.id}] ${escapedSourceTitle(source.title)}`)
    .join('\n')}`;
}
