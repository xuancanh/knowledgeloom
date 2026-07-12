import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from '@tiptap/markdown';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Image as ImageExt } from '@tiptap/extension-image';
import { uploadImage } from '../../api';
import { useTranslation } from 'react-i18next';

export type NoteEditorHandle = {
  getValue: () => string;
  setValue: (markdown: string) => void;
  focus: () => void;
  clear: () => void;
};

// ── Toolbar button ────────────────────────────────────────────────────────────

function Btn({
  active, title, onClick, children, disabled,
}: {
  active?: boolean; title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ne-btn${active ? ' ne-btn--active' : ''}`}
      title={title}
      aria-label={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function Sep() { return <span className="ne-sep" />; }

// ── Main component ────────────────────────────────────────────────────────────

const NoteEditor = forwardRef<NoteEditorHandle, {
  initialValue?: string;
  placeholder?: string;
  disabled?: boolean;
}>(function NoteEditor({ initialValue = '', placeholder, disabled = false }, ref) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: { HTMLAttributes: { class: 'ne-code-block' } },
        link: { openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } },
      }),
      Placeholder.configure({ placeholder: placeholder ?? t('editor.startWriting') }),
      Markdown,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      ImageExt.configure({ inline: false }),
    ],
    content: '',
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: () => { /* editor is the single source of truth */ },
  });

  // Load initial value once
  useEffect(() => {
    if (!editor || initRef.current) return;
    initRef.current = true;
    if (initialValue) {
      editor.commands.setContent(initialValue, { contentType: 'markdown' } as any);
    }
  }, [editor, initialValue]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);

  useImperativeHandle(ref, () => ({
    getValue: () => {
      if (!editor) return '';
      // editor.getMarkdown() is added by @tiptap/markdown
      return (editor as any).getMarkdown?.() ?? editor.getText();
    },
    setValue: (markdown: string) => {
      if (!editor) return;
      editor.commands.setContent(markdown, { contentType: 'markdown' } as any);
    },
    focus: () => editor?.commands.focus(),
    clear: () => editor?.commands.clearContent(),
  }));

  const uploadFile = useCallback(async (file: File) => {
    if (!editor || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (err) {
      console.error('Image upload failed', err);
    } finally {
      setUploading(false);
    }
  }, [editor]);

  // Paste handler: intercept image blobs from clipboard
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'));
      if (!imageItem) return;
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) uploadFile(file);
    };
    dom.addEventListener('paste', onPaste);
    return () => dom.removeEventListener('paste', onPaste);
  }, [editor, uploadFile]);

  // Drag-and-drop handler
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    const onDrop = (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files || []);
      const imageFile = files.find((f) => f.type.startsWith('image/'));
      if (!imageFile) return;
      e.preventDefault();
      uploadFile(imageFile);
    };
    dom.addEventListener('drop', onDrop);
    return () => dom.removeEventListener('drop', onDrop);
  }, [editor, uploadFile]);

  function insertTable() {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  }

  function setLink() {
    const prev = editor?.getAttributes('link').href || '';
    const url = window.prompt(t('editor.url'), prev);
    if (url === null) return;
    if (!url) {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }

  if (!editor) return null;

  const inTable = editor.isActive('table');

  return (
    <div className="note-editor">
      <div className="ne-toolbar" role="toolbar" aria-label={t('editor.formatting')}>
        <Btn active={editor.isActive('bold')} title={t('editor.bold')} onClick={() => editor.chain().focus().toggleBold().run()}>B</Btn>
        <Btn active={editor.isActive('italic')} title={t('editor.italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>I</Btn>
        <Btn active={editor.isActive('underline')} title={t('editor.underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>U</Btn>
        <Btn active={editor.isActive('strike')} title={t('editor.strikethrough')} onClick={() => editor.chain().focus().toggleStrike().run()}>S̶</Btn>
        <Btn active={editor.isActive('code')} title={t('editor.inlineCode')} onClick={() => editor.chain().focus().toggleCode().run()}>`</Btn>
        <Sep />
        <Btn active={editor.isActive('heading', { level: 1 })} title={t('editor.heading1')} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</Btn>
        <Btn active={editor.isActive('heading', { level: 2 })} title={t('editor.heading2')} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Btn>
        <Btn active={editor.isActive('heading', { level: 3 })} title={t('editor.heading3')} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Btn>
        <Sep />
        <Btn active={editor.isActive('bulletList')} title={t('editor.bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>•</Btn>
        <Btn active={editor.isActive('orderedList')} title={t('editor.numberedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</Btn>
        <Sep />
        <Btn active={editor.isActive('blockquote')} title={t('editor.blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</Btn>
        <Btn active={editor.isActive('codeBlock')} title={t('editor.codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{'{}'}</Btn>
        <Btn active={false} title={t('editor.horizontalRule')} onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</Btn>
        <Sep />
        <Btn active={editor.isActive('link')} title={t('editor.link')} onClick={setLink}>🔗</Btn>
        <Btn active={false} title={t('editor.insertImage')} onClick={openFilePicker}>🖼</Btn>
        <Btn active={false} title={t('editor.insertTable')} onClick={insertTable}>⊞</Btn>
        {inTable && (
          <>
            <Sep />
            <Btn active={false} title={t('editor.addColumn')} onClick={() => editor.chain().focus().addColumnAfter().run()}>+col</Btn>
            <Btn active={false} title={t('editor.addRow')} onClick={() => editor.chain().focus().addRowAfter().run()}>+row</Btn>
            <Btn active={false} title={t('editor.deleteColumn')} onClick={() => editor.chain().focus().deleteColumn().run()}>-col</Btn>
            <Btn active={false} title={t('editor.deleteRow')} onClick={() => editor.chain().focus().deleteRow().run()}>-row</Btn>
            <Btn active={false} title={t('editor.deleteTable')} onClick={() => editor.chain().focus().deleteTable().run()}>⊠</Btn>
          </>
        )}
        {uploading && <span className="ne-uploading" role="status" style={{ marginLeft: 'auto' }}>{t('editor.uploading')}</span>}
      </div>

      {/* Inline bubble menu rendered inside the editor DOM */}
      <NoteEditorBubble editor={editor} onSetLink={setLink} />

      <EditorContent editor={editor} className="ne-content" />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
    </div>
  );
});

// ── Bubble menu as a React portal ─────────────────────────────────────────────

function NoteEditorBubble({
  editor,
  onSetLink,
}: {
  editor: ReturnType<typeof useEditor>;
  onSetLink: () => void;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const onSelectionUpdate = () => {
      const menu = menuRef.current;
      if (!menu) return;
      const { from, to, empty } = editor.state.selection;
      if (empty) { menu.style.display = 'none'; return; }
      const view = editor.view;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      // Position relative to the .note-editor container (position:relative)
      const container = menu.offsetParent as HTMLElement | null;
      const containerRect = container?.getBoundingClientRect() ?? view.dom.getBoundingClientRect();
      const midX = (start.left + end.right) / 2 - containerRect.left;
      const topY = Math.min(start.top, end.top) - containerRect.top - 44;
      const menuWidth = 200; // approx, prevents overflow
      menu.style.display = 'flex';
      menu.style.left = `${Math.max(4, Math.min(containerRect.width - menuWidth - 4, midX - menuWidth / 2))}px`;
      menu.style.top = `${Math.max(4, topY)}px`;
    };
    const onBlur = () => { if (menuRef.current) menuRef.current.style.display = 'none'; };
    editor.on('selectionUpdate', onSelectionUpdate);
    editor.on('blur', onBlur);
    return () => {
      editor.off('selectionUpdate', onSelectionUpdate);
      editor.off('blur', onBlur);
    };
  }, [editor]);

  if (!editor) return null;

  return (
    <div ref={menuRef} className="ne-bubble" style={{ display: 'none', position: 'absolute', zIndex: 20 }}>
      <button type="button" className={`ne-btn${editor.isActive('bold') ? ' ne-btn--active' : ''}`} title={t('editor.bold')} aria-label={t('editor.bold')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}>B</button>
      <button type="button" className={`ne-btn${editor.isActive('italic') ? ' ne-btn--active' : ''}`} title={t('editor.italic')} aria-label={t('editor.italic')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}>I</button>
      <button type="button" className={`ne-btn${editor.isActive('underline') ? ' ne-btn--active' : ''}`} title={t('editor.underline')} aria-label={t('editor.underline')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }}>U</button>
      <button type="button" className={`ne-btn${editor.isActive('code') ? ' ne-btn--active' : ''}`} title={t('editor.inlineCode')} aria-label={t('editor.inlineCode')}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleCode().run(); }}>`</button>
      <button type="button" className={`ne-btn${editor.isActive('link') ? ' ne-btn--active' : ''}`} title={t('editor.link')} aria-label={t('editor.link')}
        onMouseDown={(e) => { e.preventDefault(); onSetLink(); }}>🔗</button>
    </div>
  );
}

export default NoteEditor;
