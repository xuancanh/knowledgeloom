const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const inline = (value: string) =>
  escapeHtml(value)
    .replace(/\[\[([^\]]+)\]\]/g, '<code class="wiki-link">[[$1]]</code>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

/**
 * Legacy markdown-to-HTML renderer retained for simple markdown previews.
 * The main note reader now uses block rendering in `src/lib/view.tsx`.
 */
export function renderMarkdown(markdown: string) {
  const lines = markdown.replace(/^---[\s\S]*?---\s*/, '').split('\n');
  const html: string[] = [];
  let inList = false;

  for (const line of lines) {
    if (!line.trim()) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      continue;
    }

    if (line.startsWith('# ')) {
      if (inList) html.push('</ul>');
      inList = false;
      html.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      if (inList) html.push('</ul>');
      inList = false;
      html.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      if (inList) html.push('</ul>');
      inList = false;
      html.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith('- ')) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inline(line.slice(2))}</li>`);
    } else {
      if (inList) html.push('</ul>');
      inList = false;
      html.push(`<p>${inline(line)}</p>`);
    }
  }

  if (inList) html.push('</ul>');
  return html.join('');
}
