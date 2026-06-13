import type { MemorySummary, ProductArtifact, RecallDetail, RecallItem, RecallKind } from './types';
import type { GeneratedImageRecord } from '@/lib/image/types';
import type { MindmapNode } from '@/lib/mindmap/types';

/**
 * 纯本地 hybrid recall：把「拼关键词」升级为「字面 + 主题 + 关系图」三层融合。
 *
 * - Layer 1 字面：中文 2-gram（bigram）Jaccard，解决中文不分词匹配不上的问题。
 * - Layer 2 主题：query 命中节点的「主题字段」（标题/标签/结构化标签）bigram → 同主题加分。
 * - Layer 3 关系图：沿已有 id 引用构建的硬边（artifact↔context/note/idea 等）扩展，
 *                   把被直接命中节点关联的、但字面没命中的节点带出来。
 *
 * 零数据迁移：关系边全部从现有 id 字段（selectedContextIds / relatedNoteId / noteId 等）动态推导。
 */

type NodeKey = string; // `${kind}:${id}`

interface RecallNode {
  key: NodeKey;
  kind: RecallKind;
  id: string;
  title: string;
  detail: string;
  haystack: string; // 全文（literal 层）
  themeField: string; // 主题字段（theme 层，更聚焦）
  themes: string[]; // 结构化标签（展示用）
  linkKeys: NodeKey[]; // 该节点指向的其它节点（硬边，单向；建图时双向化）
  baseReason: string;
  createdAt: number;
  tags: string[];
}

const KIND_LABELS: Record<RecallKind, string> = {
  context: '片段', page: '页面', note: '笔记', memory: '记忆',
  idea: '想法', artifact: '产物', image: '图片', mindmap: '图谱',
};

const KIND_BIAS: Record<RecallKind, number> = {
  artifact: 1, memory: 0.8, image: 0.75, idea: 0.7,
  context: 0.6, mindmap: 0.55, note: 0.5, page: 0.45,
};

const W_LITERAL = 4;
const W_THEME = 2.5;
const W_GRAPH = 1.8;
const LITERAL_HIT_THRESHOLD = 0.05; // literal 命中率超过此值视为直接命中

interface Scored extends RecallNode {
  haystackBigrams: Set<string>;
  themeBigrams: Set<string>;
  literal: number;
  themeHits: string[];
  graphVia?: { kind: RecallKind; title: string };
}

export function buildKnowledgeRecall(input: {
  query: string;
  memory: MemorySummary | null;
  artifacts?: ProductArtifact[];
  images?: GeneratedImageRecord[];
  limit?: number;
}): RecallItem[] {
  const { query, memory, artifacts = [], images = [], limit = 4 } = input;
  if (!memory) return [];

  const nodes = buildNodes(memory, artifacts, images);
  if (nodes.length === 0) return [];

  const queryBigrams = bigrams(query).slice(0, 40);

  // Pass 1：literal + theme 直接命中
  const scored: Scored[] = nodes.map((node) => {
    const haystackBigrams = new Set(bigrams(node.haystack));
    const themeBigrams = new Set(bigrams(node.themeField));
    return {
      ...node,
      haystackBigrams,
      themeBigrams,
      literal: scoreOverlap(queryBigrams, haystackBigrams),
      themeHits: overlapList(queryBigrams, themeBigrams),
    };
  });

  const directHits = new Set<NodeKey>(
    scored
      .filter((s) => s.literal >= LITERAL_HIT_THRESHOLD || s.themeHits.length > 0)
      .map((s) => s.key),
  );

  // Pass 2：关系图扩展——未直接命中的节点，若其邻居命中，则带出并标记 via:'graph'
  const adjacency = buildAdjacency(scored);
  for (const s of scored) {
    if (directHits.has(s.key)) continue;
    const neighbors = adjacency.get(s.key);
    if (!neighbors) continue;
    for (const nb of neighbors) {
      if (directHits.has(nb)) {
        const from = scored.find((n) => n.key === nb);
        if (from) s.graphVia = { kind: from.kind, title: from.title };
        break;
      }
    }
  }

  // Pass 3：三层融合 + 组装。只保留「至少一层命中」的节点——
  // 否则无关项会凭 kindBias + recency 兜底混入（精准性问题）。
  const now = Date.now();
  return scored
    .filter((s) => s.literal >= LITERAL_HIT_THRESHOLD || s.themeHits.length > 0 || !!s.graphVia)
    .map((s) => {
      const recency = recencyScore(s.createdAt, now);
      const graphBoost = s.graphVia ? W_GRAPH : 0;
      const themeScoreVal = Math.min(s.themeHits.length, 3) / 3;
      const score = s.literal * W_LITERAL + themeScoreVal * W_THEME + graphBoost + recency + KIND_BIAS[s.kind];
      return { item: toItem(s, queryBigrams, now, score), score, createdAt: s.createdAt };
    })
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((r) => r.item);
}

function toItem(s: Scored, queryBigrams: string[], now: number, score: number): RecallItem {
  const age = describeRelativeAge(s.createdAt, now);
  let detail: RecallDetail;
  if (s.graphVia) {
    const title = shorten(s.graphVia.title, 20);
    detail = { via: 'graph', evidence: title, linkedFrom: { kind: s.graphVia.kind, title } };
  } else if (s.themeHits.length > 0) {
    detail = { via: 'theme', evidence: s.themeHits.slice(0, 2).join(' / ') };
  } else {
    const hit = queryBigrams.filter((b) => s.haystackBigrams.has(b)).slice(0, 2).join(' / ');
    detail = { via: 'literal', evidence: hit || shorten(s.title, 12) };
  }
  return {
    id: s.id,
    kind: s.kind,
    kindLabel: KIND_LABELS[s.kind],
    title: s.title,
    detail: s.detail,
    tags: s.tags.slice(0, 4),
    score,
    createdAt: s.createdAt,
    reason: `${s.baseReason} · ${detailReason(detail)} · ${age}`,
    recallDetail: detail,
  };
}

function detailReason(d: RecallDetail): string {
  if (d.via === 'graph') return `关联「${d.evidence}」`;
  if (d.via === 'theme') return `同主题 ${d.evidence}`;
  return `命中 ${d.evidence}`;
}

// ---------- 节点构建 ----------
function buildNodes(
  memory: MemorySummary,
  artifacts: ProductArtifact[],
  images: GeneratedImageRecord[],
): RecallNode[] {
  const nodes: RecallNode[] = [];

  memory.recentContextSnippets.forEach((item) => {
    nodes.push({
      key: `context:${item.id}`, kind: 'context', id: item.id,
      title: item.pageTitle,
      detail: shorten(item.selectedText || item.origin, 100),
      haystack: [item.origin, item.pageTitle, item.selectedText].join(' '),
      themeField: [item.pageTitle, item.origin].join(' '),
      themes: [item.origin].filter(Boolean),
      linkKeys: [],
      baseReason: `来自 ${shorten(item.origin, 28)}`,
      createdAt: item.createdAt,
      tags: [item.origin, item.pageTitle].filter(Boolean),
    });
  });

  memory.recentPageContexts.forEach((item) => {
    nodes.push({
      key: `page:${item.id}`, kind: 'page', id: item.id,
      title: item.pageTitle,
      detail: shorten(item.visibleTextSummary || item.textExcerpt, 100),
      haystack: [item.origin, item.pageTitle, item.pageType, item.visibleTextSummary, item.textExcerpt].join(' '),
      themeField: [item.pageTitle, item.pageType, ...item.headings.slice(0, 3)].join(' '),
      themes: [item.pageType].filter(Boolean),
      linkKeys: [],
      baseReason: `页面类型：${item.pageType}`,
      createdAt: item.createdAt,
      tags: [item.pageType, ...item.headings.slice(0, 2)].filter(Boolean),
    });
  });

  memory.archiveNotes.forEach((item) => {
    nodes.push({
      key: `note:${item.id}`, kind: 'note', id: item.id,
      title: item.title,
      detail: shorten(item.summary, 110),
      haystack: [item.title, item.sourceTitle, item.summary, item.tags.join(' ')].join(' '),
      themeField: [item.title, ...item.tags].join(' '),
      themes: item.tags.slice(0, 4),
      linkKeys: [],
      baseReason: `来源：${shorten(item.sourceTitle || item.origin, 24)}`,
      createdAt: item.createdAt,
      tags: item.tags.slice(0, 4),
    });
  });

  memory.approvedMemories.forEach((item) => {
    const linkKeys: NodeKey[] = [];
    if (item.relatedNoteId) linkKeys.push(`note:${item.relatedNoteId}`);
    if (item.relatedContextId) linkKeys.push(`context:${item.relatedContextId}`);
    nodes.push({
      key: `memory:${item.id}`, kind: 'memory', id: item.id,
      title: item.title,
      detail: shorten(item.content, 110),
      haystack: [item.title, item.content, item.reason, item.category].join(' '),
      themeField: [item.title, item.category, item.sourceType].join(' '),
      themes: [item.category, item.sourceType].filter(Boolean),
      linkKeys,
      baseReason: `已批准记忆 · ${item.category}`,
      createdAt: item.createdAt,
      tags: [item.category, item.sourceType].filter(Boolean),
    });
  });

  memory.recentIdeas.forEach((item) => {
    nodes.push({
      key: `idea:${item.id}`, kind: 'idea', id: item.id,
      title: shorten(item.rawInput, 40),
      detail: `${item.selectedContextIds.length} 个片段 · ${item.selectedArchiveNoteIds.length} 条笔记`,
      haystack: [item.rawInput, item.source].join(' '),
      themeField: item.rawInput,
      themes: [],
      linkKeys: [],
      baseReason: `想法输入 · ${item.source}`,
      createdAt: item.createdAt,
      tags: [item.source].filter(Boolean),
    });
  });

  mergeRecentAndFull(memory.recentArtifacts, artifacts).forEach((item) => {
    const linkKeys: NodeKey[] = [
      ...item.selectedContextIds.map((c) => `context:${c}`),
      ...item.selectedArchiveNoteIds.map((n) => `note:${n}`),
    ];
    if (item.ideaId) linkKeys.push(`idea:${item.ideaId}`);
    nodes.push({
      key: `artifact:${item.id}`, kind: 'artifact', id: item.id,
      title: item.concept.name,
      detail: shorten(item.concept.tagline || item.concept.positioning, 120),
      haystack: [
        item.intent, item.concept.name, item.concept.tagline, item.concept.positioning,
        item.concept.coreProblem, item.concept.targetUser, item.concept.valueProposition,
        item.concept.features.join(' '), item.concept.visualDirection.join(' '), item.imagePrompt,
      ].join(' '),
      themeField: [item.concept.name, item.concept.tagline, item.intent].join(' '),
      themes: [item.intent],
      linkKeys,
      baseReason: `产品意图：${item.intent}`,
      createdAt: item.createdAt,
      tags: [item.intent, ...item.concept.features.slice(0, 2)],
    });
  });

  mergeRecentAndFull(memory.generatedImages, images).forEach((item) => {
    const linkKeys: NodeKey[] = item.request.relatedNoteId ? [`note:${item.request.relatedNoteId}`] : [];
    nodes.push({
      key: `image:${item.id}`, kind: 'image', id: item.id,
      title: item.request.title || '未命名图片',
      detail: shorten(item.request.content || item.prompt, 120),
      haystack: [item.request.sourceType, item.request.title, item.request.content, item.request.style, item.prompt, item.model ?? '', item.previewText ?? ''].join(' '),
      themeField: [item.request.title, item.request.style, item.request.sourceType].join(' '),
      themes: [item.request.sourceType, item.request.style].filter(Boolean),
      linkKeys,
      baseReason: `图片风格：${item.request.style}`,
      createdAt: item.createdAt,
      tags: [item.request.sourceType, item.request.style, item.status].filter(Boolean),
    });
  });

  memory.generatedMindmaps.forEach((item) => {
    const linkKeys: NodeKey[] = item.result.noteId ? [`note:${item.result.noteId}`] : [];
    nodes.push({
      key: `mindmap:${item.id}`, kind: 'mindmap', id: item.id,
      title: item.result.title,
      detail: shorten(item.imagePrompt ?? '暂无图片提示词', 120),
      haystack: [item.result.title, item.sourceType, item.imagePrompt ?? '', flattenMindmap(item.result.root)].join(' '),
      themeField: [item.result.title, item.sourceType].join(' '),
      themes: [item.sourceType],
      linkKeys,
      baseReason: `来源：${item.sourceType}`,
      createdAt: item.createdAt,
      tags: [item.sourceType, item.result.noteId ? 'note-linked' : 'standalone'].filter(Boolean),
    });
  });

  return nodes;
}

/** 从节点单向 linkKeys 构建双向邻接表（硬边）。 */
function buildAdjacency(nodes: RecallNode[]): Map<NodeKey, Set<NodeKey>> {
  const adj = new Map<NodeKey, Set<NodeKey>>();
  const keySet = new Set(nodes.map((n) => n.key));
  nodes.forEach((n) => adj.set(n.key, new Set()));
  const addEdge = (a: NodeKey, b: NodeKey) => {
    if (a === b || !keySet.has(a) || !keySet.has(b)) return;
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const n of nodes) for (const target of n.linkKeys) addEdge(n.key, target);
  return adj;
}

// ---------- 文本工具 ----------
/** 中文按 2 字滑窗、英文按词，产出 bigram 集合——解决中文不分词。 */
function bigrams(text: string): string[] {
  const clean = normalizeText(text);
  const result: string[] = [];
  for (const seg of clean.match(/[一-鿿]+/g) ?? []) {
    if (seg.length === 1) result.push(seg);
    else for (let i = 0; i + 1 < seg.length; i++) result.push(seg.slice(i, i + 2));
  }
  const other = clean.replace(/[一-鿿]+/g, ' ').split(/\s+/).filter((t) => t.length > 1);
  result.push(...other);
  return dedupe(result);
}

function scoreOverlap(query: string[], target: Set<string>): number {
  if (query.length === 0) return 0;
  let hit = 0;
  for (const b of query) if (target.has(b)) hit++;
  return hit / query.length;
}

function overlapList(query: string[], target: Set<string>): string[] {
  return query.filter((b) => target.has(b));
}

function normalizeText(text: string): string {
  return (text ?? '').toLowerCase().replace(/[^0-9a-z一-鿿]+/gi, ' ').trim();
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list));
}

function recencyScore(createdAt: number, now: number): number {
  const ageDays = Math.max(0, now - createdAt) / (1000 * 60 * 60 * 24);
  return 1 / (1 + ageDays);
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

function flattenMindmap(node: MindmapNode): string {
  const buf: string[] = [];
  const walk = (n: MindmapNode) => { buf.push(n.label); n.children?.forEach(walk); };
  walk(node);
  return buf.join(' ');
}

function describeRelativeAge(createdAt: number, now: number): string {
  const min = Math.floor(Math.max(0, now - createdAt) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  if (d < 28) return `${Math.floor(d / 7)} 周前`;
  return `${Math.floor(d / 30)} 个月前`;
}

function shorten(text: string, max = 32): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
