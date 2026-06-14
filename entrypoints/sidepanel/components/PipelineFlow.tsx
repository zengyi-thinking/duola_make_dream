import type { ContentPipelineTrace } from '@/lib/agent/types';
import { formatPipelineKindLabel } from '@/lib/agent/pipeline';

interface PipelineFlowProps {
  trace: ContentPipelineTrace;
  compact?: boolean;
  className?: string;
}

export default function PipelineFlow({ trace, compact = false, className }: PipelineFlowProps) {
  return (
    <section className={`pipeline-flow ${compact ? 'pipeline-flow--compact' : ''} ${className ?? ''}`.trim()}>
      {!compact ? (
        <div className="pipeline-flow__head">
          <div className="pipeline-flow__head-copy">
            <span className="memory-label">{formatPipelineKindLabel(trace.kind)}</span>
            <strong>{trace.title}</strong>
          </div>
          <span className="timeline-badge timeline-badge--pipeline">{trace.stages.length} 步</span>
        </div>
      ) : null}

      {!compact ? <p className="pipeline-flow__summary">{trace.summary}</p> : null}

      <div className="pipeline-flow__rail" role="list" aria-label={`${trace.title} 的流水线阶段`}>
        {trace.stages.map((stage) => (
          <div
            key={stage.id}
            className={`pipeline-step pipeline-step--${stage.status}`}
            role="listitem"
            title={stage.detail ?? stage.summary}
          >
            <span className="pipeline-step__dot" aria-hidden="true" />
            <span className="pipeline-step__label">{stage.label}</span>
            {!compact ? <span className="pipeline-step__summary">{shorten(stage.summary, 18)}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function shorten(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
