import type { View } from './view';

export function viewFromPath(pathname: string): View {
  const parts = pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts[0] === 'activity') return { kind: 'activity' };
  if (parts[0] === 'flashcards') {
    const params = new URLSearchParams(window.location.search);
    const category = params.get('category') || '';
    const tag = params.get('tag') || '';
    if (category) return { kind: 'flashcards', scope: 'category', value: category };
    if (tag) return { kind: 'flashcards', scope: 'tag', value: tag };
    return { kind: 'flashcards', scope: 'all' };
  }
  if (parts[0] === 'notes' && parts[1]) return { kind: 'note', id: parts[1] };
  if (parts[0] === 'categories' && parts[1]) return { kind: 'category', id: parts.slice(1).join('/') };
  if (parts[0] === 'tags' && parts[1]) {
    const page = Number(new URLSearchParams(window.location.search).get('page') || '1');
    return { kind: 'tag', tag: parts[1], page: Number.isFinite(page) && page > 0 ? page : 1 };
  }
  return { kind: 'home' };
}

export function pathFromView(view: View): string {
  if (view.kind === 'activity') return '/activity';
  if (view.kind === 'flashcards') {
    const base = '/flashcards';
    if (view.scope === 'category' && view.value) return `${base}?category=${encodeURIComponent(view.value)}`;
    if (view.scope === 'tag' && view.value) return `${base}?tag=${encodeURIComponent(view.value)}`;
    return base;
  }
  if (view.kind === 'note') return `/notes/${encodeURIComponent(view.id)}`;
  if (view.kind === 'category') return `/categories/${view.id.split('/').map(encodeURIComponent).join('/')}`;
  if (view.kind === 'tag') {
    const base = `/tags/${encodeURIComponent(view.tag)}`;
    return view.page && view.page > 1 ? `${base}?page=${view.page}` : base;
  }
  return '/';
}

export function sameView(left: View, right: View): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'home') return true;
  if (left.kind === 'activity') return true;
  if (left.kind === 'flashcards' && right.kind === 'flashcards')
    return (left.scope || 'all') === (right.scope || 'all') && (left.value || '') === (right.value || '');
  if (left.kind === 'note' && right.kind === 'note') return left.id === right.id;
  if (left.kind === 'category' && right.kind === 'category') return left.id === right.id;
  if (left.kind === 'tag' && right.kind === 'tag') return left.tag === right.tag && (left.page || 1) === (right.page || 1);
  return false;
}
