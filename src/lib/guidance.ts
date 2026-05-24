/** Template applicability: research mode, link mode, or both. */
export type GuidanceMode = 'research' | 'link' | 'both';

/** A writing-guidance template that can be injected into a capture request. */
export type GuidanceTemplate = {
  id: string;
  label: string;
  text: string;
  mode: GuidanceMode;
  /** CSS variable name suffix: 'moss' | 'indigo' | 'ochre' | 'teal' | 'rust' | '' (accent) */
  color?: string;
  builtIn?: boolean;
};

/** localStorage key for the persisted template list. */
const STORAGE_KEY = 'knowledge-loom:guidance-templates';

export const DEFAULT_TEMPLATES: GuidanceTemplate[] = [
  {
    id: 'builtin-deep-ref',
    label: 'Deep reference',
    text: 'Write as an in-depth technical reference with implementation details, tradeoffs, and code examples.',
    mode: 'research',
    builtIn: true,
  },
  {
    id: 'builtin-beginner',
    label: 'Beginner-friendly',
    text: 'Write for someone new to this topic. Use plain language, analogies, and step-by-step explanations.',
    mode: 'research',
    builtIn: true,
  },
  {
    id: 'builtin-concise',
    label: 'Concise bullets',
    text: 'Be concise. Use short bullets: what it is, when to use it, and key tradeoffs.',
    mode: 'research',
    builtIn: true,
  },
  {
    id: 'builtin-practical',
    label: 'Practical guide',
    text: 'Focus on practical application with real-world examples and actionable steps.',
    mode: 'research',
    builtIn: true,
  },
  {
    id: 'builtin-key-insights',
    label: 'Key insights',
    text: 'Extract the most valuable insights. Skip introductory or promotional content.',
    mode: 'link',
    builtIn: true,
  },
  {
    id: 'builtin-technical',
    label: 'Technical summary',
    text: 'Focus on technical implementation details, specifications, and code patterns.',
    mode: 'link',
    builtIn: true,
  },
  {
    id: 'builtin-exec-brief',
    label: 'Executive brief',
    text: 'Summarize for a non-technical audience. Emphasize business value and outcomes.',
    mode: 'link',
    builtIn: true,
  },
];

export function loadTemplates(): GuidanceTemplate[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TEMPLATES;
    const parsed = JSON.parse(raw) as GuidanceTemplate[];
    return parsed.length ? parsed : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export function saveTemplates(templates: GuidanceTemplate[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function addTemplate(
  templates: GuidanceTemplate[],
  template: Omit<GuidanceTemplate, 'id' | 'builtIn'>,
): GuidanceTemplate[] {
  return [...templates, { ...template, id: `custom-${Date.now()}` }];
}

export function updateTemplate(
  templates: GuidanceTemplate[],
  id: string,
  patch: Partial<Omit<GuidanceTemplate, 'id'>>,
): GuidanceTemplate[] {
  return templates.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

export function deleteTemplate(templates: GuidanceTemplate[], id: string): GuidanceTemplate[] {
  return templates.filter((t) => t.id !== id);
}

export function templatesForMode(
  templates: GuidanceTemplate[],
  mode: 'research' | 'link',
): GuidanceTemplate[] {
  return templates.filter((t) => t.mode === mode || t.mode === 'both');
}
