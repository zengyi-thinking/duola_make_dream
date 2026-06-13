import type { MemorySummary, ProductArtifact } from './types';
import type { GeneratedImageRecord } from '@/lib/image/types';
import type { MindmapNode } from '@/lib/mindmap/types';
import type { StateBackup } from '@/lib/storage/schema';

export interface RecallItem {
  id: string;
  kind: RecallKind;
  kindLabel: string;
  title: string;
  detail: string;
  reason: string;
  tags: string[];
  score: number;
  createdAt: number;
}

export type RecallKind =
  | 'context'
  | 'page'
  | 'note'
  | 'memory'
  | 'idea'
  | 'artifact'
  | 'image'
  | 'mindmap';

export interface VersionComparison {
  leftLabel: string;
  rightLabel: string;
  summary: string;
  changes: string[];
}

type RecallSeed = {
  id: string;
  kind: RecallKind;
  kindLabel: string;
  title: string;
  detail: string;
  reason: string;
  tags: string[];
  createdAt: number;
  haystack: string;
  extraBias?: number;
};

const KIND_LABELS: Record<RecallKind, string> = {
  context: '片段',
  page: '页面',
  note: '笔记',
  memory: '记忆',
  idea: '想法',
  artifact: '产物',
  image: '图片',
  mindmap: '图谱',
};

export function buildKnowledgeRecall(input: {
  query: string;
  memory: MemorySummary | null;
  artifacts?: ProductArtifact[];
  images?: GeneratedImageRecord[];
  limit?: number;
}): RecallItem[] {
  const { query, memory, artifacts = [], images = [], limit = 4 } = input;
  if (!memory) return [];

  const tokens = buildQueryTokens(query, memory);
  const now = Date.now();
  const seeds: RecallSeed[] = [];

  memory.recentContextSnippets.forEach((item) => {
    const haystack = [item.origin, item.pageTitle, item.selectedText].join(' ');
    seeds.push({
      id: item.id,
      kind: 'context',
      kindLabel: KIND_LABELS.context,
      title: item.pageTitle,
      detail: shorten(item.selectedText || item.origin, 100),
      reason: `来自 ${shorten(item.origin, 28)}`,
      tags: [item.origin, item.pageTitle].filter(Boolean),
      createdAt: item.createdAt,
      haystack,
      extraBias: 0.6,
    });
  });

  memory.recentPageContexts.forEach((item) => {
    const haystack = [item.origin, item.pageTitle, item.pageType, item.visibleTextSummary, item.textExcerpt].join(' ');
    seeds.push({
      id: item.id,
      kind: 'page',
      kindLabel: KIND_LABELS.page,
      title: item.pageTitle,
      detail: shorten(item.visibleTextSummary || item.textExcerpt, 100),
      reason: `页面类型：${item.pageType}`,
      tags: [item.pageType, ...item.headings.slice(0, 2)].filter(Boolean),
      createdAt: item.createdAt,
      haystack,
      extraBias: 0.45,
    });
  });

  memory.archiveNotes.forEach((item) => {
    const haystack = [item.title, item.sourceTitle, item.summary, item.tags.join(' ')].join(' ');
    seeds.push({
      id: item.id,
      kind: 'note',
      kindLabel: KIND_LABELS.note,
      title: item.title,
      detail: shorten(item.summary, 110),
      reason: `来源：${shorten(item.sourceTitle || item.origin, 24)}`,
      tags: item.tags.slice(0, 3),
      createdAt: item.createdAt,
      haystack,
      extraBias: 0.5,
    });
  });

  memory.approvedMemories.forEach((item) => {
    const haystack = [item.title, item.content, item.reason, item.category].join(' ');
    seeds.push({
      id: item.id,
      kind: 'memory',
      kindLabel: KIND_LABELS.memory,
      title: item.title,
      detail: shorten(item.content, 110),
      reason: `已批准记忆 · ${item.category}`,
      tags: [item.category, item.sourceType],
      createdAt: item.createdAt,
      haystack,
      extraBias: 0.8,
    });
  });

  memory.recentIdeas.forEach((item) => {
    const haystack = [item.rawInput, item.source, item.selectedContextIds.join(' '), item.selectedArchiveNoteIds.join(' ')].join(' ');
    seeds.push({
      id: item.id,
      kind: 'idea',
      kindLabel: KIND_LABELS.idea,
      title: shorten(item.rawInput, 40),
      detail: `${item.selectedContextIds.length} 个片段 · ${item.selectedArchiveNoteIds.length} 条笔记`,
      reason: `想法输入 · ${item.source}`,
      tags: [item.source],
      createdAt: item.createdAt,
      haystack,
      extraBias: 0.7,
    });
  });

  const artifactPool = mergeRecentAndFull(memory.recentArtifacts, artifacts);
  artifactPool.forEach((item) => {
    const haystack = [
      item.intent,
      item.concept.name,
      item.concept.tagline,
      item.concept.positioning,
      item.concept.coreProblem,
      item.concept.targetUser,
      item.concept.valueProposition,
      item.concept.features.join(' '),
      item.concept.visualDirection.join(' '),
      item.imagePrompt,
    ].join(' ');

    seeds.push({
      id: item.id,
      kind: 'artifact',
      kindLabel: KIND_LABELS.artifact,
      title: item.concept.name,
      detail: shorten(item.concept.tagline || item.concept.positioning, 120),
      reason: `产品意图：${item.intent}`,
      tags: [item.intent, ...item.concept.features.slice(0, 2)],
      createdAt: item.createdAt,
      haystack,
      extraBias: 1,
    });
  });

  const imagePool = mergeRecentAndFull(memory.generatedImages, images);
  imagePool.forEach((item) => {
    const haystack = [
      item.request.sourceType,
      item.request.title,
      item.request.content,
      item.request.style,
      item.prompt,
      item.model ?? '',
      item.previewText ?? '',
    ].join(' ');

    seeds.push({
      id: item.id,
      kind: 'image',
      kindLabel: KIND_LABELS.image,
      title: item.request.title || '未命名图片',
      detail: shorten(item.request.content || item.prompt, 120),
      reason: `图片风格：${item.request.style}`,
      tags: [item.request.sourceType, item.request.style, item.status],
      createdAt: item.createdAt,
      haystack,
      extraBias: 0.75,
    });
  });

  memory.generatedMindmaps.forEach((item) => {
    const haystack = [item.result.title, item.sourceType, item.imagePrompt ?? '', flattenMindmap(item.result.root)].join(' ');
    seeds.push({
      id: item.id,
      kind: 'mindmap',
      kindLabel: KIND_LABELS.mindmap,
      title: item.result.title,
      detail: shorten(item.imagePrompt ?? '暂无图片提示词', 120),
      reason: `来源：${item.sourceType}`,
      tags: [item.sourceType, item.result.noteId ? 'note-linked' : 'standalone'],
      createdAt: item.createdAt,
      haystack,
      extraBias: 0.55,
    });
  });

  const ranked = seeds
    .map((seed) => ({
      ...seed,
      score: scoreRecall(tokens, seed.haystack, seed.createdAt, now, seed.extraBias ?? 0),
      reason: composeRecallReason(seed.reason, tokens, seed.haystack, seed.createdAt, now),
    }))
    .sort((a, b) => (b.score - a.score) || (b.createdAt - a.createdAt))
    .slice(0, limit);

  return ranked.map(({ haystack: _ignored, extraBias: _bias, ...item }) => item);
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

function mergeRecentAndFull<T extends { id: string }>(recent: T[], full: T[]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const item of [...recent, ...full]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }

  return merged;
}

function buildQueryTokens(query: string, memory: MemorySummary): string[] {
  const tokens = new Set<string>();
  tokenize(query).forEach((token) => tokens.add(token));

  if (tokens.size === 0) {
    const anchorText = [
      ...memory.profile.recentThemes,
      ...memory.profile.productPreferences,
      ...memory.profile.visualLikes,
      memory.profile.tonePreference,
    ].join(' ');
    tokenize(anchorText).forEach((token) => tokens.add(token));
  }

  return Array.from(tokens).slice(0, 24);
}

function scoreRecall(tokens: string[], haystack: string, createdAt: number, now: number, extraBias = 0): number {
  const normalizedHaystack = normalizeText(haystack);
  const base = tokens.length > 0
    ? tokens.filter((token) => normalizedHaystack.includes(token)).length / tokens.length
    : 0.2;

  const directHit = tokens.some((token) => normalizedHaystack.includes(token)) ? 0.8 : 0;
  const queryHit = tokens.length > 0 && normalizedHaystack.includes(tokens.join(' ')) ? 0.6 : 0;
  const recency = recencyScore(createdAt, now);

  return base * 4 + directHit + queryHit + recency + extraBias;
}

function recencyScore(createdAt: number, now: number): number {
  const ageMs = Math.max(0, now - createdAt);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return 1 / (1 + ageDays);
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .filter((item) => item.length > 1 || /[\u4e00-\u9fff]/.test(item));
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^0-9a-z\u4e00-\u9fff]+/gi, ' ').trim();
}

function composeRecallReason(baseReason: string, tokens: string[], haystack: string, createdAt: number, now: number): string {
  const normalizedHaystack = normalizeText(haystack);
  const matched = tokens.filter((token) => normalizedHaystack.includes(token)).slice(0, 2);
  const age = describeRelativeAge(createdAt, now);

  if (matched.length === 0) {
    return `${baseReason} · ${age}`;
  }

  return `${baseReason} · 命中 ${matched.join(' / ')} · ${age}`;
}

function describeRelativeAge(createdAt: number, now: number): string {
  const ageMs = Math.max(0, now - createdAt);
  const ageMinutes = Math.floor(ageMs / (1000 * 60));
  if (ageMinutes < 1) return '刚刚';
  if (ageMinutes < 60) return `${ageMinutes} 分钟前`;
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) return `${ageHours} 小时前`;
  const ageDays = Math.floor(ageHours / 24);
  if (ageDays < 7) return `${ageDays} 天前`;
  const ageWeeks = Math.floor(ageDays / 7);
  if (ageWeeks < 4) return `${ageWeeks} 周前`;
  return `${Math.floor(ageDays / 30)} 个月前`;
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

function flattenMindmap(node: MindmapNode): string {
  const buffer: string[] = [];
  const walk = (current: MindmapNode) => {
    buffer.push(current.label);
    current.children?.forEach((child) => walk(child));
  };
  walk(node);
  return buffer.join(' ');
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
