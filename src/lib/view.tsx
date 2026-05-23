import type { KnowledgeCategory, KnowledgeNote, LearnJob } from '../types';

export type UiCategory = KnowledgeCategory & { id: string; color: string; summary: string };
export type CategoryTreeNode = {
  id: string;
  name: string;
  label: string;
  depth: number;
  count: number;
  color: string;
  category?: UiCategory;
  children: CategoryTreeNode[];
};
export type NoteBlock = { type: 'p' | 'h' | 'q'; text: string };

export const categoryColors = ['oxblood', 'moss', 'indigo', 'ochre', 'teal', 'rust'];

/**
 * Produces the stable UI/category id used by category routes and comparisons.
 */
export function categoryId(name: string) {
  return normalizeCategoryPath(name || 'Uncategorized');
}

/**
 * Normalizes user-authored category paths into the folder-like format used by
 * routes and navigation. Multiple separators collapse into one path segment.
 */
export function normalizeCategoryPath(name: string) {
  return String(name || 'Uncategorized')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/') || 'Uncategorized';
}

/**
 * Returns the visible folder name for the final segment of a category path.
 */
export function categoryLabel(path: string) {
  const parts = normalizeCategoryPath(path).split('/');
  return parts[parts.length - 1] || 'Uncategorized';
}

/**
 * Checks whether a note category belongs to the selected folder path.
 */
export function categoryContains(parentPath: string, childPath: string) {
  const parent = normalizeCategoryPath(parentPath);
  const child = normalizeCategoryPath(childPath);
  return child === parent || child.startsWith(`${parent}/`);
}

/**
 * Normalizes ISO timestamps into the date-only format used in note lists.
 */
export function formatCreated(value: string) {
  if (!value) return 'unknown';
  return value.slice(0, 10);
}

/**
 * Formats a job timestamp for the compact Codex activity rail.
 */
export function formatJobTime(value?: string | null) {
  if (!value) return '--:--';
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Maps backend job statuses to the visual state names used by the reference UI.
 */
export function jobState(job: LearnJob) {
  if (job.status === 'running') return 'researching';
  if (job.status === 'done') return 'saved';
  if (job.status === 'error') return 'failed';
  return 'queued';
}

/**
 * Removes YAML-style frontmatter and returns the editable markdown body.
 */
export function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---[\s\S]*?---\s*/, '').trim();
}

/**
 * Parses simple markdown into display blocks for the note reader.
 * This renderer intentionally supports only the structures the app generates.
 */
export function parseMarkdownBlocks(markdown: string): NoteBlock[] {
  const body = stripFrontmatter(markdown);
  const lines = body.split('\n');
  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];

  // Consecutive plain lines become a paragraph; headings, quotes, and bullets
  // flush the paragraph first so the reader preserves the note's rough shape.
  const flush = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith('# ')) continue;
    if (line.startsWith('## ')) {
      flush();
      blocks.push({ type: 'h', text: line.slice(3) });
      continue;
    }
    if (line.startsWith('### ')) {
      flush();
      blocks.push({ type: 'h', text: line.slice(4) });
      continue;
    }
    if (line.startsWith('> ')) {
      flush();
      blocks.push({ type: 'q', text: line.slice(2) });
      continue;
    }
    if (line.startsWith('- ')) {
      flush();
      blocks.push({ type: 'p', text: line.slice(2) });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks.length ? blocks : [{ type: 'p', text: 'No body content yet.' }];
}

/**
 * Highlights search query tokens inside a text snippet for the command palette.
 */
export function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const re = new RegExp(`(${tokens.map((token) => token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(re).map((part, index) => (re.test(part) ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>));
}

/**
 * Adds UI-only ids, colors, and summaries to backend category records.
 */
export function makeUiCategories(categories: KnowledgeCategory[]): UiCategory[] {
  return categories.map((category, index) => ({
    ...category,
    name: normalizeCategoryPath(category.name),
    id: categoryId(category.name),
    color: categoryColors[index % categoryColors.length],
    summary: category.summaries.filter(Boolean).slice(0, 3).join(' ') || 'No summary yet.',
  }));
}

/**
 * Builds a folder tree from exact category paths. Parent folders are synthetic
 * nodes when no note uses that exact category, and their counts aggregate all
 * descendant note counts.
 */
export function makeCategoryTree(categories: UiCategory[]): CategoryTreeNode[] {
  const nodes = new Map<string, CategoryTreeNode>();

  for (const category of categories) {
    const parts = category.id.split('/');
    parts.forEach((_part, index) => {
      const id = parts.slice(0, index + 1).join('/');
      const existing = nodes.get(id);
      const exactCategory = id === category.id ? category : existing?.category;
      nodes.set(id, {
        id,
        name: id,
        label: categoryLabel(id),
        depth: index,
        count: (existing?.count || 0) + category.count,
        color: exactCategory?.color || existing?.color || categoryColors[index % categoryColors.length],
        category: exactCategory,
        children: existing?.children || [],
      });
    });
  }

  const roots: CategoryTreeNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.id.split('/').slice(0, -1).join('/');
    const parent = parentId ? nodes.get(parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortTree = (items: CategoryTreeNode[]) => {
    items.sort((a, b) => a.label.localeCompare(b.label));
    items.forEach((item) => sortTree(item.children));
    return items;
  };
  return sortTree(roots);
}

/**
 * Builds the local fallback search haystack for one note.
 */
export function noteSearchText(note: KnowledgeNote) {
  return `${note.title} ${note.summary} ${note.tags.join(' ')}`.toLowerCase();
}
