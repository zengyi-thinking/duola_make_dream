import { InfoBlock } from './InfoBlock';
import type { MemorySummary, RuntimeConfig } from '@/lib/agent/types';
import { pocketAvatars } from '@/lib/brand/avatars';

interface ObservationSignalBoardProps {
  memory: MemorySummary | null;
  runtimeConfig: RuntimeConfig | null;
}

export function ObservationSignalBoard({ memory, runtimeConfig }: ObservationSignalBoardProps) {
  const avatarId = runtimeConfig?.avatarId ?? 'yunyu-main';
  const avatarMeta = pocketAvatars[avatarId];
  const currentCounts = memory
    ? {
        feed: memory.recentContextSnippets.length + memory.recentPageContexts.length + memory.archiveNotes.length,
        change: memory.profileHistory.length + memory.recentFeedback.length + memory.pendingPatches.length,
        output: memory.recentArtifacts.length + memory.generatedImages.length + memory.generatedMindmaps.length,
      }
    : { feed: 0, change: 0, output: 0 };
  const peak = Math.max(currentCounts.feed, currentCounts.change, currentCounts.output, 1);

  return (
    <section className="panel-card signal-board">
      <div className="panel-head">
        <div>
          <p className="section-label">Signal Flow</p>
          <h2>喂养 / 变化 / 产出</h2>
        </div>
        <span className="micro-status">把 Agent 的状态收成一眼能扫完的卡片</span>
      </div>

      <div className="detail-grid signal-board__meta">
        <InfoBlock label="Agent / Avatar" value={`${runtimeConfig?.agentName ?? 'PocketAgent'} · ${avatarMeta.name}`} />
        <InfoBlock label="LLM" value={`${runtimeConfig?.llmProvider ?? 'mock'} / ${runtimeConfig?.llmModel ?? '未配置'}`} />
        <InfoBlock label="Image" value={`${runtimeConfig?.imageMode ?? 'mock'} / ${runtimeConfig?.imageModel ?? '未配置'}`} />
        <InfoBlock label="语气" value={runtimeConfig?.defaultTone ?? 'warm-product-designer'} />
      </div>

      <div className="signal-rail" aria-hidden="true">
        <span>输入</span>
        <span className="signal-rail__arrow">→</span>
        <span>变化</span>
        <span className="signal-rail__arrow">→</span>
        <span>产出</span>
      </div>

      <div className="signal-grid">
        <SignalColumn
          label="喂养"
          value={currentCounts.feed}
          detail={memory?.recentPageContexts[0]?.pageTitle ?? memory?.recentContextSnippets[0]?.pageTitle ?? '还没有喂养记录'}
          accent="feed"
          fill={currentCounts.feed / peak}
        />
        <SignalColumn
          label="变化"
          value={currentCounts.change}
          detail={memory?.profileHistory[0]
            ? `${formatSource(memory.profileHistory[0].source)} · ${formatDate(memory.profileHistory[0].createdAt)}`
            : '还没有画像变化'}
          accent="change"
          fill={currentCounts.change / peak}
        />
        <SignalColumn
          label="产出"
          value={currentCounts.output}
          detail={memory?.recentArtifacts[0]?.concept.name
            ?? memory?.generatedImages[0]?.request.title
            ?? memory?.generatedMindmaps[0]?.result.title
            ?? '还没有产出记录'}
          accent="output"
          fill={currentCounts.output / peak}
        />
      </div>
    </section>
  );
}

function SignalColumn({
  label,
  value,
  detail,
  accent,
  fill,
}: {
  label: string;
  value: number;
  detail: string;
  accent: 'feed' | 'change' | 'output';
  fill: number;
}) {
  return (
    <article className={`signal-column signal-column--${accent}`}>
      <div className="candidate-head">
        <span className="memory-label">{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="signal-meter" aria-hidden="true">
        <span style={{ width: `${Math.max(8, Math.round(fill * 100))}%` }} />
      </div>
      <p className="micro-copy">{detail}</p>
    </article>
  );
}

function formatSource(source: string) {
  switch (source) {
    case 'init':
      return '初始画像';
    case 'idea':
      return '由想法更新';
    case 'feedback':
      return '由反馈更新';
    case 'memory-approval':
      return '由记忆批准更新';
    default:
      return '手动调整';
  }
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}
