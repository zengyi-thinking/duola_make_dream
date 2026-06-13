import type { RecallItem } from '@/lib/agent/insights';
import LineButton from '@/components/LineArt/LineButton';
import { ResultCard } from './ResultCard';

interface RecallPanelProps {
  title: string;
  items: RecallItem[];
  emptyText: string;
  sendLabel: string;
  copyLabel?: string;
  onSend: (item: RecallItem) => void;
  onCopy?: (item: RecallItem) => void;
}

export function RecallPanel({
  title,
  items,
  emptyText,
  sendLabel,
  copyLabel,
  onSend,
  onCopy,
}: RecallPanelProps) {
  return (
    <ResultCard title={title}>
      {items.length > 0 ? (
        <div className="stack">
          {items.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="list-card">
              <div className="candidate-head">
                <strong>{item.title}</strong>
                <span className="status-pill status-pill--spark">{item.kindLabel}</span>
              </div>
              <p className="soft-text">{item.detail}</p>
              <p className="micro-copy">{item.reason}</p>
              <div className="token-list">
                {item.tags.map((tag, index) => (
                  <span key={`${tag}-${index}`} className="token-chip">{tag}</span>
                ))}
              </div>
              <div className="inline-actions">
                <LineButton variant="secondary" onClick={() => onSend(item)}>
                  {sendLabel}
                </LineButton>
                {onCopy && copyLabel ? (
                  <LineButton variant="ghost" onClick={() => onCopy(item)}>
                    {copyLabel}
                  </LineButton>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="soft-text">{emptyText}</p>
      )}
    </ResultCard>
  );
}
