/**
 * 统一 Graph 数据结构 —— 所有页面的主展示形态。
 *
 * 设计目标（见 docs/reaction-plan.md 第五节）：
 * - 所有产物（想法/计划/调研/笔记/图片/记忆/经验/工具/skill）都表达为 GraphNode；
 * - 节点之间用 GraphEdge 表达关系（派生/引用/产出/批准/拒绝/包含）；
 * - 一个 GraphView 是某次加工或某个视图的图快照（发明/喂养/记忆/观察/全局）。
 *
 * 零依赖：本文件不引用任何其它类型，作为最底层被 agent/storage/runtime 引用，避免循环。
 */

/** 节点类型 —— 决定节点在力导向图里的配色与图标（沿用 App.css 的 timeline-badge 7 色体系并扩展） */
export type GraphNodeType =
  | 'idea' // 想法输入
  | 'plan' // 规划产物
  | 'research' // 调研/页面提取
  | 'reflect' // 反思/自学习
  | 'structure' // 结构化编排
  | 'note' // 归档笔记
  | 'image' // 生图结果
  | 'mindmap' // 图谱结果
  | 'memory' // 长期记忆
  | 'success' // 成功经验
  | 'failure' // 失败经验
  | 'tool' // 注册工具
  | 'skill' // 注册 skill
  | 'profile' // 用户画像快照
  | 'feedback'; // 用户反馈

/** GraphView 的作用域 —— 对应五个页面 + 全局记忆图 */
export type GraphScope = 'invent' | 'feed' | 'memory' | 'observe' | 'global';

/** 边的关系语义 */
export type GraphEdgeRelation =
  | 'derives' // A 由 B 派生而来（idea → plan → structure）
  | 'cites' // A 引用了 B 的内容（note cites page）
  | 'relates' // 泛化关联（召回带出）
  | 'produces' // A 产出了 B（plan produces image）
  | 'approves' // 用户批准了 A（candidate → approved）
  | 'rejects' // 用户拒绝了 A
  | 'contains'; // A 包含 B（GraphView contains nodes —— 一般不显式建边，留给子图）

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  title: string;
  summary: string;
  /** 结构化负载（概念/笔记/图片记录等的原始数据），由前端按 type 解释渲染 */
  payload?: unknown;
  createdAt: number;
  /** 指向原始记录 id（archiveNote.id / artifact.id / generatedImage.id ...），用于图↔列表双写追溯 */
  sourceId?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: GraphEdgeRelation;
}

export interface GraphView {
  id: string;
  scope: GraphScope;
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  createdAt: number;
}

// ---------- 工厂 ----------

export function createGraphNode(
  partial: Omit<GraphNode, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): GraphNode {
  return {
    ...partial,
    id: partial.id ?? crypto.randomUUID(),
    createdAt: partial.createdAt ?? Date.now(),
  };
}

export function createGraphEdge(
  source: string,
  target: string,
  relation: GraphEdgeRelation,
  id?: string,
): GraphEdge {
  return {
    // 默认稳定 id：同 source/target/relation 的边 id 相同，mergeIntoGlobalGraph 可据此去重，
    // 避免重复迁移或多次 merge 累积重复边。显式传 id 时仍用传入值。
    id: id ?? `edge:${source}:${target}:${relation}`,
    source,
    target,
    relation,
  };
}

export function createGraphView(
  partial: Omit<GraphView, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): GraphView {
  return {
    ...partial,
    id: partial.id ?? crypto.randomUUID(),
    createdAt: partial.createdAt ?? Date.now(),
  };
}

/** 节点类型 → 中文标签（GraphCanvas 图例与详情抽屉用） */
export function labelGraphNodeType(type: GraphNodeType): string {
  switch (type) {
    case 'idea': return '想法';
    case 'plan': return '规划';
    case 'research': return '调研';
    case 'reflect': return '反思';
    case 'structure': return '编排';
    case 'note': return '笔记';
    case 'image': return '图片';
    case 'mindmap': return '图谱';
    case 'memory': return '记忆';
    case 'success': return '成功经验';
    case 'failure': return '失败经验';
    case 'tool': return '工具';
    case 'skill': return '技能';
    case 'profile': return '画像';
    case 'feedback': return '反馈';
  }
}

/** 边关系 → 中文标签 */
export function labelGraphEdgeRelation(relation: GraphEdgeRelation): string {
  switch (relation) {
    case 'derives': return '派生自';
    case 'cites': return '引用';
    case 'relates': return '关联';
    case 'produces': return '产出';
    case 'approves': return '批准';
    case 'rejects': return '拒绝';
    case 'contains': return '包含';
  }
}
