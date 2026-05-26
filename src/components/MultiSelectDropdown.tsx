import { useState, useRef, useEffect } from 'react';

export interface MultiSelectItem {
  id: string;
  label: string;
  count: number;
}

export function MultiSelectDropdown({
  label,
  items,
  selected,
  onChange,
  className,
}: {
  label: string;
  items: MultiSelectItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function toggle(itemId: string) {
    if (selected.includes(itemId)) onChange(selected.filter((id) => id !== itemId));
    else onChange([...selected, itemId]);
  }

  return (
    <div className={className ?? 'fc-multi'} ref={ref}>
      <button className="fc-multi-trigger" onClick={() => setOpen(!open)} aria-expanded={open}>
        {label}{selected.length > 0 ? ` (${selected.length})` : ''} ▾
      </button>
      {open && (
        <div className="fc-multi-dropdown">
          {items.length === 0 && <div className="fc-multi-empty">None</div>}
          {items.map((item) => (
            <label key={item.id} className="fc-multi-item">
              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
              <span className="fc-multi-name">{item.label}</span>
              <span className="fc-multi-count">{item.count}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
