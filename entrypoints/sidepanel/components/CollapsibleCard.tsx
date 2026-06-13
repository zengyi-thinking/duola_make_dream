import type { ReactNode } from 'react';

interface CollapsibleCardProps {
  sectionLabel: string;
  title: string;
  summary?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleCard({
  sectionLabel,
  title,
  summary,
  badge,
  defaultOpen = false,
  children,
}: CollapsibleCardProps) {
  return (
    <details className="panel-card collapsible-card" open={defaultOpen}>
      <summary className="collapsible-card__summary">
        <div>
          <p className="section-label">{sectionLabel}</p>
          <h2>{title}</h2>
          {summary ? <p className="soft-text">{summary}</p> : null}
        </div>
        {badge ? <span className="micro-status">{badge}</span> : null}
      </summary>
      <div className="collapsible-card__body">{children}</div>
    </details>
  );
}
