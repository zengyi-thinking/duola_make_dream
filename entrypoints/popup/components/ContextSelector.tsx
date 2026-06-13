import type { Dispatch, SetStateAction } from 'react';

interface SelectionGroupProps {
  title: string;
  emptyText: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
  items: Array<{ id: string; title: string; description: string }>;
}

export function SelectionGroup(props: SelectionGroupProps) {
  return (
    <div className="selection-panel">
      <div className="selection-head">
        <span className="section-label">{props.title}</span>
        <span className="micro-status">{props.selectedIds.length > 0 ? `已选 ${props.selectedIds.length}` : '默认不带入'}</span>
      </div>
      <div className="selection-wrap">
        {props.items.length ? props.items.map((item) => {
          const active = props.selectedIds.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`selection-chip ${active ? 'selection-chip--active' : ''}`}
              onClick={() => props.onToggle(item.id)}
            >
              <span className="selection-chip__title">{item.title}</span>
              <span className="selection-chip__desc">{item.description}</span>
            </button>
          );
        }) : <p className="soft-text">{props.emptyText}</p>}
      </div>
    </div>
  );
}

export function toggleSelection(id: string, setter: Dispatch<SetStateAction<string[]>>) {
  setter((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
}
