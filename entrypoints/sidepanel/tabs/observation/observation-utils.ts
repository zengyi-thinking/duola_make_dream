import type {
  HarnessPatch,
  MemorySummary,
  ProfileHistoryEntry,
  ProfileHistorySource,
} from '@/lib/agent/types';
import type { StateBackup } from '@/lib/storage/schema';

export type TimelineKind = 'idea' | 'artifact' | 'feedback' | 'profile' | 'backup' | 'patch';

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  createdAt: number;
  badgeLabel: string;
}

const FEEDBACK_LABELS: Record<string, string> = {
  'more-minimal': '更极简',
  cuter: '更可爱',
  'more-productized': '更产品化',
  'more-tech': '更有科技感',
  'dislike-direction': '不喜欢当前方向',
};

export function buildObservationTimeline(memory: MemorySummary | null): TimelineEntry[] {
  if (!memory) return [];

  const entries: TimelineEntry[] = [];

  memory.recentIdeas.forEach((idea) => {
    entries.push({
      id: `idea-${idea.id}`,
      kind: 'idea',
      title: `想法 · ${shorten(idea.rawInput)}`,
      detail: `来源：${idea.source} · 片段 ${idea.selectedContextIds.length} · 笔记 ${idea.selectedArchiveNoteIds.length}`,
      createdAt: idea.createdAt,
      badgeLabel: 'Idea',
    });
  });

  memory.recentArtifacts.forEach((artifact) => {
    entries.push({
      id: `artifact-${artifact.id}`,
      kind: 'artifact',
      title: `产物 · ${artifact.concept.name}`,
      detail: `${artifact.intent} · ${artifact.concept.tagline}`,
      createdAt: artifact.createdAt,
      badgeLabel: 'Artifact',
    });
  });

  memory.recentFeedback.forEach((feedback) => {
    entries.push({
      id: `feedback-${feedback.id}`,
      kind: 'feedback',
      title: `反馈 · ${FEEDBACK_LABELS[feedback.action] ?? feedback.action}`,
      detail: `针对产物 ${feedback.artifactId.slice(0, 8)}`,
      createdAt: feedback.createdAt,
      badgeLabel: 'Feedback',
    });
  });

  memory.profileHistory.forEach((entry: ProfileHistoryEntry) => {
    entries.push({
      id: `profile-${entry.id}`,
      kind: 'profile',
      title: `画像 · ${formatProfileSource(entry.source)}`,
      detail: `喜欢 ${entry.profile.visualLikes.slice(0, 3).join(' / ') || '暂无'} · 语气 ${entry.profile.tonePreference || '暂无'}`,
      createdAt: entry.createdAt,
      badgeLabel: 'Profile',
    });
  });

  memory.stateBackups.forEach((backup: StateBackup) => {
    entries.push({
      id: `backup-${backup.id}`,
      kind: 'backup',
      title: `快照 · ${backup.label}`,
      detail: `创意 ${backup.snapshot.ideaHistory.length} · 归档 ${backup.snapshot.archiveNotes.length} · 补丁 ${backup.snapshot.harnessPatches.length}`,
      createdAt: backup.createdAt,
      badgeLabel: 'Backup',
    });
  });

  memory.harnessPatches.forEach((patch: HarnessPatch) => {
    entries.push({
      id: `patch-${patch.id}`,
      kind: 'patch',
      title: `补丁 · ${patch.target}`,
      detail: patch.reason,
      createdAt: patch.createdAt,
      badgeLabel: patch.status,
    });
  });

  return entries.sort((a, b) => b.createdAt - a.createdAt).slice(0, 18);
}

export function formatObservationDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function formatProfileSource(source: ProfileHistorySource) {
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

export function shorten(text: string, max = 16) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
