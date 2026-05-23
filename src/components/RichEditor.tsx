import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from '@tiptap/markdown';
import { forwardRef, useImperativeHandle } from 'react';

export type RichEditorHandle = {
  getMarkdown: () => string;
  clear: () => void;
  focus: () => void;
};

function ToolBtn({
  active, onClick, title, children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rich-tool${active ? ' active' : ''}`}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
    >
      {children}
    </button>
  );
}

const RichEditor = forwardRef<RichEditorHandle, {
  placeholder?: string;
  disabled?: boolean;
}>(function RichEditor({ placeholder = 'Start writing…', disabled = false }, ref) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Markdown,
    ],
    editable: !disabled,
  });

  useImperativeHandle(ref, () => ({
    getMarkdown: () => editor?.getMarkdown() ?? '',
    clear: () => { editor?.commands.clearContent(); },
    focus: () => { editor?.commands.focus(); },
  }));

  if (!editor) return null;

  return (
    <div className={`rich-editor${disabled ? ' rich-editor--disabled' : ''}`}>
      <div className="rich-toolbar">
        <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (⌘B)">B</ToolBtn>
        <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (⌘I)">I</ToolBtn>
        <span className="rich-sep" />
        <ToolBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">H2</ToolBtn>
        <ToolBtn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">H3</ToolBtn>
        <span className="rich-sep" />
        <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">•—</ToolBtn>
        <ToolBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">1.</ToolBtn>
        <span className="rich-sep" />
        <ToolBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">{`<>`}</ToolBtn>
        <ToolBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">❝</ToolBtn>
      </div>
      <EditorContent editor={editor} className="rich-content" />
    </div>
  );
});

export default RichEditor;
