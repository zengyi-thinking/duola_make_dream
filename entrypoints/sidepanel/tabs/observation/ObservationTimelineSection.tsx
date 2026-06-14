import { useMemo } from 'react';
import type { MemorySummary } from '@/lib/agent/types';
import { buildObservationTimeline, formatObservationDate } from './observation-utils';
import PipelineFlow from '../../components/PipelineFlow';

interface ObservationTimelineSectionProps {
  memory: MemorySummary | null;
}

export default function ObservationTimelineSection({ memory }: ObservationTimelineSectionProps) {
  const timelineEntries = useMemo(() => buildObservationTimeline(memory), [memory]);

  return (
    <section className="panel-card">
      <div className="panel-head">
        <div>
          <p className="section-label">Timeline</p>
          <h2>演化时间线</h2>
        </div>
      </div>
      <div className="timeline-list">
        {timelineEntries.length > 0 ? timelineEntries.map((entry) => (
          <article key={entry.id} className="timeline-item">
            <div className="candidate-head">
              <strong>{entry.title}</strong>
              <span className={`timeline-badge timeline-badge--${entry.kind}`}>{entry.badgeLabel}</span>
            </div>
            <p className="micro-copy">{entry.detail}</p>
            {entry.pipelineTrace ? <PipelineFlow trace={entry.pipelineTrace} compact /> : null}
            <p className="micro-copy">{formatObservationDate(entry.createdAt)}</p>
          </article>
        )) : (
          <p className="soft-text">先发一个想法或读一页网页，时间线就会开始长出来。</p>
        )}
      </div>
    </section>
  );
}
