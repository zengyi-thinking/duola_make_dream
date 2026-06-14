import type { ProductArtifact } from './types';
import type { GeneratedImageRecord } from '@/lib/image/types';
import type { StateBackup } from '@/lib/storage/schema';

// recall 逻辑已迁移到 ./recall（hybrid：字面 + 主题 + 关系图）。
// 这里 re-export 以保持现有 import 路径（UI 从 @/lib/agent/insights 引用 RecallItem/buildKnowledgeRecall）不变。
export { buildKnowledgeRecall } from './recall';
export type { RecallDetail, RecallItem, RecallKind } from './types';

export interface VersionComparison {
  leftLabel: string;
  rightLabel: string;
  summary: string;
  changes: string[];
}

export function compareProductArtifacts(left: ProductArtifact, right: ProductArtifact): VersionComparison {
  const changes: string[] = [];

  pushTextChange(changes, '名称', left.concept.name, right.concept.name);
  pushTextChange(changes, '标语', left.concept.tagline, right.concept.tagline);
  pushTextChange(changes, '定位', left.concept.positioning, right.concept.positioning);
  pushTextChange(changes, '核心问题', left.concept.coreProblem, right.concept.coreProblem);
  pushTextChange(changes, '目标用户', left.concept.targetUser, right.concept.targetUser);
  pushTextChange(changes, '价值主张', left.concept.valueProposition, right.concept.valueProposition);
  pushTextChange(changes, 'Intent', left.intent, right.intent);

  pushArrayChange(changes, '功能点', left.concept.features, right.concept.features);
  pushArrayChange(changes, '视觉方向', left.concept.visualDirection, right.concept.visualDirection);
  pushArrayChange(changes, 'MVP', left.mvpPlan, right.mvpPlan);
  pushArrayChange(changes, '下一步', left.nextTasks, right.nextTasks);
  pushCountChange(changes, '关联片段', left.selectedContextIds.length, right.selectedContextIds.length);
  pushCountChange(changes, '关联笔记', left.selectedArchiveNoteIds.length, right.selectedArchiveNoteIds.length);
  pushArrayChange(changes, '工具痕迹', left.appliedGadgets, right.appliedGadgets);

  const summary = changes.length > 0
    ? `两个版本的概念方向和功能编排都发生了变化，${changes.slice(0, 2).join('；')}`
    : '两个版本几乎一致，主要差别只在保存时间和细节格式。';

  return {
    leftLabel: `${left.concept.name} · ${formatDate(left.createdAt)}`,
    rightLabel: `${right.concept.name} · ${formatDate(right.createdAt)}`,
    summary,
    changes: changes.length > 0 ? changes : ['没有发现明显差异。'],
  };
}

export function compareGeneratedImages(left: GeneratedImageRecord, right: GeneratedImageRecord): VersionComparison {
  const changes: string[] = [];

  pushTextChange(changes, '标题', left.request.title, right.request.title);
  pushTextChange(changes, '来源', left.request.sourceType, right.request.sourceType);
  pushTextChange(changes, '风格', left.request.style, right.request.style);
  pushTextChange(changes, '关联内容', left.request.content, right.request.content);
  pushTextChange(changes, '模型', left.model ?? '', right.model ?? '');
  pushTextChange(changes, '状态', left.status, right.status);
  pushTextChange(changes, '提示词长度', String(left.prompt.length), String(right.prompt.length), true);

  const summary = changes.length > 0
    ? `图片版本在标题、风格或关联内容上发生了变化，${changes.slice(0, 2).join('；')}`
    : '两张图片的请求配置基本一致。';

  return {
    leftLabel: `${left.request.title || '未命名图片'} · ${formatDate(left.createdAt)}`,
    rightLabel: `${right.request.title || '未命名图片'} · ${formatDate(right.createdAt)}`,
    summary,
    changes: changes.length > 0 ? changes : ['没有发现明显差异。'],
  };
}

export function compareStateBackups(left: StateBackup, right: StateBackup): VersionComparison {
  const changes: string[] = [];
  const leftSnapshot = left.snapshot;
  const rightSnapshot = right.snapshot;

  pushCountChange(changes, '创意', leftSnapshot.ideaHistory.length, rightSnapshot.ideaHistory.length);
  pushCountChange(changes, '产物', leftSnapshot.artifactHistory.length, rightSnapshot.artifactHistory.length);
  pushCountChange(changes, '归档', leftSnapshot.archiveNotes.length, rightSnapshot.archiveNotes.length);
  pushCountChange(changes, '图片', leftSnapshot.generatedImages.length, rightSnapshot.generatedImages.length);
  pushCountChange(changes, '图谱', leftSnapshot.generatedMindmaps.length, rightSnapshot.generatedMindmaps.length);
  pushCountChange(changes, '流水线', leftSnapshot.pipelineRuns?.length ?? 0, rightSnapshot.pipelineRuns?.length ?? 0);
  pushCountChange(changes, '候选记忆', leftSnapshot.memoryCandidates.length, rightSnapshot.memoryCandidates.length);
  pushCountChange(changes, '长期记忆', leftSnapshot.approvedMemories.length, rightSnapshot.approvedMemories.length);
  pushCountChange(changes, '补丁', leftSnapshot.harnessPatches.length, rightSnapshot.harnessPatches.length);

  pushTextChange(changes, '语气', leftSnapshot.profile.tonePreference, rightSnapshot.profile.tonePreference);
  pushArrayChange(changes, '视觉偏好', leftSnapshot.profile.visualLikes, rightSnapshot.profile.visualLikes);
  pushArrayChange(changes, '产品偏好', leftSnapshot.profile.productPreferences, rightSnapshot.profile.productPreferences);
  pushArrayChange(changes, '近期主题', leftSnapshot.profile.recentThemes, rightSnapshot.profile.recentThemes);

  const summary = changes.length > 0
    ? `快照之间的规模和画像偏好都出现了变化，${changes.slice(0, 2).join('；')}`
    : '两份快照的内容基本一致。';

  return {
    leftLabel: `${left.label} · ${formatDate(left.createdAt)}`,
    rightLabel: `${right.label} · ${formatDate(right.createdAt)}`,
    summary,
    changes: changes.length > 0 ? changes : ['没有发现明显差异。'],
  };
}

function pushTextChange(changes: string[], label: string, before: string, after: string, numeric = false) {
  if (before === after) return;
  if (numeric) {
    const beforeNum = Number(before) || 0;
    const afterNum = Number(after) || 0;
    const delta = afterNum - beforeNum;
    const sign = delta > 0 ? '+' : '';
    changes.push(`${label}: ${beforeNum} -> ${afterNum} (${sign}${delta})`);
    return;
  }
  changes.push(`${label}: ${shorten(before || '空', 24)} -> ${shorten(after || '空', 24)}`);
}

function pushArrayChange(changes: string[], label: string, before: string[], after: string[]) {
  const beforeSet = new Set(before.filter(Boolean));
  const afterSet = new Set(after.filter(Boolean));
  const added = after.filter((item) => item && !beforeSet.has(item));
  const removed = before.filter((item) => item && !afterSet.has(item));

  if (added.length === 0 && removed.length === 0) return;

  const chunks: string[] = [];
  if (added.length > 0) chunks.push(`新增 ${added.length} 项：${added.slice(0, 3).map((item) => shorten(item, 16)).join(' / ')}`);
  if (removed.length > 0) chunks.push(`减少 ${removed.length} 项：${removed.slice(0, 3).map((item) => shorten(item, 16)).join(' / ')}`);
  changes.push(`${label}: ${chunks.join('；')}`);
}

function pushCountChange(changes: string[], label: string, before: number, after: number) {
  if (before === after) return;
  const delta = after - before;
  const sign = delta > 0 ? '+' : '';
  changes.push(`${label}: ${before} -> ${after} (${sign}${delta})`);
}

function shorten(text: string, max = 32): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}
