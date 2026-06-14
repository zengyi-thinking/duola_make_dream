import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import type { MemorySummary, RuntimeConfig } from '@/lib/agent/types';
import { formatPipelineKindLabel } from '@/lib/agent/pipeline';
import { pocketAvatars } from '@/lib/brand/avatars';
import { ObservationSignalBoard } from '../../components/ObservationSignalBoard';

interface ObservationOverviewProps {
  memory: MemorySummary | null;
  runtimeConfig: RuntimeConfig | null;
}

export default function ObservationOverview({ memory, runtimeConfig }: ObservationOverviewProps) {
  const avatarId = runtimeConfig?.avatarId ?? 'yunyu-main';
  const avatarMeta = pocketAvatars[avatarId];
  const counts = memory
    ? {
        ideas: memory.counts.ideas,
        feed: memory.counts.pageContexts,
        pipeline: memory.counts.pipelineRuns,
        profile: memory.counts.profileChanges,
      }
    : {
        ideas: 0,
        feed: 0,
        pipeline: 0,
        profile: 0,
      };

  return (
    <>
      <section className="observation-hero panel-card">
        <div className="observation-hero__copy">
          <p className="section-label">Observation</p>
          <h2>Agent 在变什么</h2>
          <p className="soft-text">看输入、变化和产出三条线，判断这个 Agent 是否真的在学。</p>
          <div className="observation-hero__meta">
            <span className="status-pill status-pill--mocked">{runtimeConfig?.agentName ?? 'PocketAgent'}</span>
            <span className="status-pill status-pill--spark">{avatarMeta.name}</span>
            <span className="status-pill status-pill--approved">{runtimeConfig?.defaultTone ?? 'warm-product-designer'}</span>
          </div>
        </div>
        <PocketBuddyAvatar avatar={avatarId} mood="warm" size={72} />
      </section>

      <section className="status-grid">
        <StatCard label="创意" value={counts.ideas} hint={`产物 ${memory?.counts.artifacts ?? 0}`} />
        <StatCard label="喂养" value={counts.feed} hint={`候选记忆 ${memory?.counts.memoryCandidates ?? 0}`} />
        <StatCard
          label="流水线"
          value={counts.pipeline}
          hint={memory?.pipelineRuns[0]
            ? `${formatPipelineKindLabel(memory.pipelineRuns[0].kind)} · ${memory.pipelineRuns[0].stages.length} 步`
            : '等待第一条流程'}
        />
        <StatCard label="画像" value={counts.profile} hint={`快照 ${memory?.counts.backups ?? 0}`} />
      </section>

      <ObservationSignalBoard memory={memory} runtimeConfig={runtimeConfig} />
    </>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="stat-card">
      <p className="section-label">{label}</p>
      <strong>{value}</strong>
      <span className="micro-copy">{hint}</span>
    </div>
  );
}
