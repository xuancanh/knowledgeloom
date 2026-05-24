/**
 * NoteViewer — read-only markdown renderer with MermaidJS diagram support.
 *
 * Uses Tiptap in non-editable mode for consistent rendering with NoteEditor.
 * After render, mermaid code fences (```mermaid) are replaced with SVG diagrams.
 */
import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import LinkExt from '@tiptap/extension-link';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Image as ImageExt } from '@tiptap/extension-image';

let mermaidReady = false;

async function getMermaid() {
  const m = await import('mermaid');
  const mermaid = m.default;
  if (!mermaidReady) {
    const isDark = ['dark', 'midnight'].includes(document.documentElement.dataset.theme || '');
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'neutral',
      securityLevel: 'strict',
      fontFamily: 'inherit',
    });
    mermaidReady = true;
  }
  return mermaid;
}

async function renderMermaidBlocks(container: HTMLElement) {
  // Tiptap renders code blocks as <pre><code class="language-mermaid">…</code></pre>
  const codeEls = container.querySelectorAll<HTMLElement>('pre code.language-mermaid');
  if (!codeEls.length) return;
  const mermaid = await getMermaid();
  let idx = 0;
  for (const codeEl of codeEls) {
    const pre = codeEl.closest('pre');
    if (!pre) continue;
    const source = codeEl.textContent || '';
    const id = `mermaid-${Date.now()}-${idx++}`;
    try {
      const { svg } = await mermaid.render(id, source);
      const div = document.createElement('div');
      div.className = 'ne-mermaid';
      div.innerHTML = svg;
      pre.replaceWith(div);
    } catch {
      pre.classList.add('ne-mermaid-error');
    }
  }
}

function setMarkdownContent(editor: ReturnType<typeof useEditor>, md: string) {
  if (!editor) return;
  // Pass contentType:'markdown' so the @tiptap/markdown extension parses the string
  // instead of treating it as HTML.
  editor.commands.setContent(md, { contentType: 'markdown' } as any);
}

export default function NoteViewer({ markdown }: { markdown: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: { HTMLAttributes: { class: 'ne-code-block' } } }),
      Markdown,
      LinkExt.configure({ openOnClick: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      ImageExt.configure({ inline: false }),
    ],
    content: '',
    editable: false,
    immediatelyRender: false,
  });

  // Initial load
  useEffect(() => {
    if (!editor) return;
    setMarkdownContent(editor, markdown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Update when markdown prop changes
  useEffect(() => {
    if (!editor) return;
    setMarkdownContent(editor, markdown);
  }, [editor, markdown]);

  // Run mermaid after each render
  useEffect(() => {
    if (!containerRef.current) return;
    const timer = setTimeout(() => {
      if (containerRef.current) renderMermaidBlocks(containerRef.current);
    }, 80);
    return () => clearTimeout(timer);
  });

  if (!editor) return null;

  return (
    <div ref={containerRef} className="note-viewer">
      <EditorContent editor={editor} className="ne-view-content" />
    </div>
  );
}
