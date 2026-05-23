import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

/**
 * Imperative handle exposed by the LiveEditor component.
 * - `getValue()` — joins all lines with newlines
 * - `setValue(markdown)` — replaces the full content
 * - `clear()` — resets to a single empty line
 * - `focus()` — focuses the first line element
 */
export type LiveEditorHandle = {
  getValue: () => string;
  clear: () => void;
  focus: () => void;
  setValue: (markdown: string) => void;
};

function markdownLineClass(line: string) {
  if (/^#\s+/.test(line)) return 'md-line md-h1';
  if (/^##\s+/.test(line)) return 'md-line md-h2';
  if (/^###\s+/.test(line)) return 'md-line md-h3';
  if (/^>\s?/.test(line)) return 'md-line md-quote';
  if (/^-\s+/.test(line)) return 'md-line md-list';
  if (/^```/.test(line)) return 'md-line md-code';
  return 'md-line';
}

function caretOffset(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return element.textContent?.length || 0;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(element);
  range.setEnd(selection.anchorNode || element, selection.anchorOffset);
  return range.toString().length;
}

const LiveEditor = forwardRef<LiveEditorHandle, {
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  initialValue?: string;
}>(function LiveEditor({ placeholder = 'Start writing…', disabled = false, className = '', initialValue }, ref) {
  const [lines, setLines] = useState<string[]>(() => {
    if (initialValue === undefined) return [''];
    const split = initialValue.split('\n');
    return split.length ? split : [''];
  });
  const [caretRestore, setCaretRestore] = useState<{ line: number; offset: number } | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  useImperativeHandle(ref, () => ({
    getValue: () => lines.join('\n'),
    clear: () => { setLines(['']); setCaretRestore(null); },
    focus: () => { lineRefs.current[0]?.focus(); },
    setValue: (markdown: string) => {
      const split = markdown.split('\n');
      setLines(split.length ? split : ['']);
      setCaretRestore(null);
    },
  }));

  useLayoutEffect(() => {
    if (!caretRestore) return;
    const target = lineRefs.current[caretRestore.line];
    if (!target) return;
    const selection = window.getSelection();
    const range = document.createRange();
    const textNode = target.firstChild || target;
    const maxOffset = textNode.textContent?.length || 0;
    range.setStart(textNode, Math.min(caretRestore.offset, maxOffset));
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    target.focus();
    setCaretRestore(null);
  }, [lines, caretRestore]);

  useEffect(() => {
    if (initialValue === undefined) return;
    const split = initialValue.split('\n');
    setLines(split.length ? split : ['']);
    setCaretRestore(null);
  }, [initialValue]);

  function updateLines(next: string[], line: number, offset: number) {
    setLines(next);
    setCaretRestore({ line: Math.max(0, Math.min(next.length - 1, line)), offset });
  }

  function updateLine(index: number, value: string) {
    const next = [...lines];
    next[index] = value.replace(/\u200b/g, '');
    const el = lineRefs.current[index];
    const offset = el ? caretOffset(el) : next[index].length;
    updateLines(next, index, offset);
  }

  function handleKey(event: React.KeyboardEvent<HTMLDivElement>, index: number) {
    const current = lines[index] || '';
    const offset = caretOffset(event.currentTarget);
    if (event.key === 'Enter') {
      event.preventDefault();
      const next = [...lines];
      next.splice(index, 1, current.slice(0, offset), current.slice(offset));
      updateLines(next, index + 1, 0);
      return;
    }
    if (event.key === 'Backspace' && offset === 0 && index > 0) {
      event.preventDefault();
      const prev = lines[index - 1] || '';
      const next = [...lines];
      next.splice(index - 1, 2, `${prev}${current}`);
      updateLines(next, index - 1, prev.length);
      return;
    }
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      setCaretRestore({ line: index - 1, offset });
      return;
    }
    if (event.key === 'ArrowDown' && index < lines.length - 1) {
      event.preventDefault();
      setCaretRestore({ line: index + 1, offset });
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>, index: number) {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text/plain');
    const offset = caretOffset(event.currentTarget);
    const current = lines[index] || '';
    const pastedLines = pasted.split(/\r?\n/);
    const next = [...lines];
    const replacement = [
      `${current.slice(0, offset)}${pastedLines[0] || ''}`,
      ...pastedLines.slice(1, -1),
      `${pastedLines[pastedLines.length - 1] || ''}${current.slice(offset)}`,
    ];
    next.splice(index, 1, ...replacement);
    updateLines(next, index + replacement.length - 1, pastedLines[pastedLines.length - 1]?.length || 0);
  }

  const isEmpty = lines.length === 1 && lines[0] === '';

  function focusEnd() {
    const last = lineRefs.current[lines.length - 1];
    last?.focus();
  }

  return (
    <div
      className={`live-md-editor${disabled ? ' live-md-editor--disabled' : ''}${className ? ` ${className}` : ''}`}
      aria-label="Markdown editor"
      onClick={(e) => {
        if (e.target === e.currentTarget) focusEnd();
      }}
    >
      {isEmpty && !disabled && (
        <div className="live-md-placeholder" aria-hidden="true">{placeholder}</div>
      )}
      {lines.map((line, index) => (
        <div
          key={index}
          ref={(el) => { lineRefs.current[index] = el; }}
          className={markdownLineClass(line)}
          contentEditable={!disabled}
          suppressContentEditableWarning
          spellCheck
          onInput={(e) => updateLine(index, e.currentTarget.textContent || '')}
          onKeyDown={(e) => handleKey(e, index)}
          onPaste={(e) => handlePaste(e, index)}
        >
          {line || '\u200b'}
        </div>
      ))}
    </div>
  );
});

export default LiveEditor;
