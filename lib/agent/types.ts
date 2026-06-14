import type {
  GeneratedImageRecord,
  ImageGenerationRequest,
  ImageGenerationSourceType,
  ImageGenerationStyle,
} from '@/lib/image/types';
import type { PocketAvatarId } from '@/lib/brand/avatars';
import type { MindmapRecord, MindmapResult } from '@/lib/mindmap/types';
import type {
  PageAnalysisResult,
  PageContextRecord,
  PageReadMode,
  PageReadResult,
  PageType,
} from '@/lib/page/types';
import type { GraphView } from '@/lib/graph/types';
import type { SkillDefinition } from '@/lib/skills/types';

export type { ImageGenerationRequest, ImageGenerationSourceType, ImageGenerationStyle } from '@/lib/image/types';
export type { MindmapNode, MindmapRecord, MindmapResult } from '@/lib/mindmap/types';
export type { PageAnalysisResult, PageContextRecord, PageReadMode, PageReadResult, PageType } from '@/lib/page/types';

export type PocketBuddyMood = 'idle' | 'warm' | 'thinking' | 'spark';

export type AgentIntent =
  | 'browser-extension'
  | 'productivity-tool'
  | 'creator-tool'
  | 'learning-tool'
  | 'playful-tool';

export type IdeaSource = 'popup' | 'selection';

export type FeedbackAction =
  | 'more-minimal'
  | 'cuter'
  | 'more-productized'
  | 'more-tech'
  | 'dislike-direction';

export type ContentPipelineKind = 'idea' | 'page' | 'archive' | 'image' | 'mindmap';
export type ContentPipelineStageId = 'plan' | 'research' | 'reflect' | 'outline' | 'generate';
export type ContentPipelineStageStatus = 'done' | 'skipped';

export interface ContentPipelineStage {
  id: ContentPipelineStageId;
  label: string;
  summary: string;
  detail?: string;
  status: ContentPipelineStageStatus;
}

export interface ContentPipelineTrace {
  id: string;
  kind: ContentPipelineKind;
  title: string;
  summary: string;
  stages: ContentPipelineStage[];
  sourceId?: string;
  createdAt: number;
}

export type ProfileHistorySource =
  | 'init'
  | 'idea'
  | 'feedback'
  | 'memory-approval'
  | 'manual';

export type HarnessPatchTarget =
  | 'prompt'
  | 'tool-router'
  | 'memory-rule'
  | 'ui-copy'
  | 'core-code';

export type HarnessPatchRisk = 'low' | 'medium' | 'high';
export type HarnessPatchStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export interface HarnessPatch {
  id: string;
  target: HarnessPatchTarget;
  scope: 'runtime-config' | 'source-code';
  reason: string;
  before: string;
  after: string;
  riskLevel: HarnessPatchRisk;
  requireUserApproval: boolean;
  status: HarnessPatchStatus;
  createdAt: number;
  appliedAt?: number;
  rollbackSnapshotId?: string;
  /**
   * 自学习评分（0-1）。由 [scoreHarnessPatch] 计算，反映"这次自调优的可信度"。
   * - 基础分由 riskLevel 决定（low 0.6 / medium 0.4 / high 0.2）
   * - 反馈加成：用户对同一方向累计点过 dislike-direction 越多分越高（最高 +0.3）
   * - 时间衰减：超过 30 天的补丁 -0.1
   * 评分 >= autoApplyThreshold 且 !requireUserApproval → 后端自动 apply
   */
  score?: number;
  /** 自动生效阈值（默认 0.5，可由用户在 Settings 调整——但前端只有 1 个开关） */
  autoApplyThreshold?: number;
  /** 评分来源（用于 Observation Tab 解释"为啥这条 patch 被自动应用了"） */
  scoreSource?: string;
}

export interface ContextSnippet {
  id: string;
  origin: string;
  pageTitle: string;
  selectedText: string;
  source: 'content';
  createdAt: number;
}

export type IdeaCommitStatus = 'pending' | 'committed' | 'failed';

export interface IdeaRecord {
  id: string;
  rawInput: string;
  source: IdeaSource;
  selectedContextIds: string[];
  selectedArchiveNoteIds: string[];
  createdAt: number;
  /**
   * 提交状态。processIdeaSubmission 事务支持：
   * - 'pending'   idea 已存但 artifact/profile 还没存（中途 SW 被杀或 LLM 失败）
   * - 'committed' 完整闭环成功
   * - 'failed'    LLM 失败但 idea 已留下让用户能看到失败原因
   * 启动时清理超过 5 分钟仍为 pending 的孤儿 idea。
   */
  status?: IdeaCommitStatus;
  failReason?: string;
  completedAt?: number;
}

export interface ProductConcept {
  name: string;
  tagline: string;
  positioning: string;
  coreProblem: string;
  targetUser: string;
  valueProposition: string;
  features: string[];
  visualDirection: string[];
}

/**
 * 计划面板模块 —— 一个有标题+详述的结构化单元。
 * 用于把单薄的 ProductConcept 扩展为信息密集型的「精美 HTML 计划面板」与「16:9 信息图」。
 */
export interface PlanBoardModule {
  title: string;
  detail: string;
}

/**
 * 计划面板数据 —— IdeaLens 产出的信息密集型计划，是 PlanBoard/InfographicPanel 的渲染源。
 * 在 ProductConcept 基础上扩展五类模块（功能/技术路线/里程碑/竞品/风险），
 * 让"开一家拉面店"也能输出选址/菜单/供应链/营销/财务等丰富内容，而非单薄的 8 字段。
 */
export interface PlanBoardData extends ProductConcept {
  /** 功能模块（4-6 个，每个含标题+详述） */
  modules: PlanBoardModule[];
  /** 技术路线分层（如 前端 / Agent / 记忆层，或 选址 / 运营 / 供应链） */
  techStack: PlanBoardModule[];
  /** 实施里程碑（M1/M2/M3 或阶段目标） */
  milestones: PlanBoardModule[];
  /** 竞品对比（vs 现状 / vs 同类） */
  competitors: PlanBoardModule[];
  /** 风险与对策 */
  risks: PlanBoardModule[];
}

export interface ProductArtifact {
  id: string;
  ideaId: string;
  intent: AgentIntent;
  concept: ProductConcept;
  /** 信息密集型计划面板数据（IdeaLens 扩展产出）；旧数据可能缺失，渲染时降级到 concept */
  planBoard?: PlanBoardData;
  imagePrompt: string;
  mvpPlan: string[];
  nextTasks: string[];
  appliedGadgets: string[];
  selectedContextIds: string[];
  selectedArchiveNoteIds: string[];
  pipelineTrace: ContentPipelineTrace;
  createdAt: number;
}

export interface FeedbackRecord {
  id: string;
  artifactId: string;
  action: FeedbackAction;
  createdAt: number;
}

export interface UserProfile {
  visualLikes: string[];
  visualDislikes: string[];
  tonePreference: string;
  productPreferences: string[];
  recentThemes: string[];
  /** 创作画像（自由文本）：领域/受众/风格/偏好，注入所有加工链路 system prompt */
  creativeBrief: string;
  lastUpdated: number;
}

export interface ProfileHistoryEntry {
  id: string;
  source: ProfileHistorySource;
  profile: UserProfile;
  createdAt: number;
}

export type MemoryCandidateCategory = 'interest' | 'project-link' | 'topic' | 'style' | 'knowledge';
export type MemoryCandidateSourceType = 'paper' | 'article' | 'idea';

export type MemoryCandidate = {
  id: string;
  sourceType: MemoryCandidateSourceType;
  category: MemoryCandidateCategory;
  title: string;
  content: string;
  reason: string;
  relatedNoteId?: string;
  relatedContextId?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
};

export type ApprovedMemory = {
  id: string;
  category: MemoryCandidateCategory;
  title: string;
  content: string;
  sourceType: MemoryCandidateSourceType;
  reason: string;
  relatedNoteId?: string;
  relatedContextId?: string;
  createdAt: number;
};

export type ArchiveNote = {
  id: string;
  sourceType: 'paper' | 'article' | 'idea';
  title: string;
  sourceTitle: string;
  origin: string;
  summary: string;
  bullets: string[];
  tags: string[];
  pipelineTrace?: ContentPipelineTrace;
  createdAt: number;
  savedByUser: boolean;
  relatedContextIds: string[];
};

/** 单个模型配置档（cc-switch 风格：name + apiKey + endpoint + model 三件套） */
export interface ModelProfile {
  id: string;
  /** 用户起的中性别名，UI 不强制暴露底层提供商 */
  name: string;
  apiKey: string;
  /** API base URL，如 https://api.minimaxi.com/anthropic */
  endpoint: string;
  /** 模型标识，如 MiniMax-M3 */
  model: string;
}

export interface RuntimeConfig {
  agentName: string;
  defaultTone: string;
  avatarId: PocketAvatarId;
  maxSelectionChars: number;
  maxMainTextChars: number;
  maxPageExcerptChars: number;
  futurePermissionMode: 'all_urls-dev' | 'activeTab-ready';

  // LLM 配置档（多配置档切换，激活档决定实际调用）
  llmProfiles: ModelProfile[];
  activeLlmProfileId: string | null;

  // 图片生成配置档
  imageProfiles: ModelProfile[];
  activeImageProfileId: string | null;

  /** 四人格 personaPrompt 用户覆盖（key=avatarId）；buildVoiceHint 注入时非空覆盖默认人格 */
  voiceOverrides: Partial<Record<PocketAvatarId, string>>;
}

export interface MemorySummary {
  profile: UserProfile;
  recentContextSnippets: ContextSnippet[];
  recentPageContexts: PageContextRecord[];
  recentIdeas: IdeaRecord[];
  recentArtifacts: ProductArtifact[];
  recentFeedback: FeedbackRecord[];
  archiveNotes: ArchiveNote[];
  memoryCandidates: MemoryCandidate[];
  approvedMemories: ApprovedMemory[];
  profileHistory: ProfileHistoryEntry[];
  stateBackups: import('@/lib/storage/schema').StateBackup[];
  harnessPatches: HarnessPatch[];
  pipelineRuns: ContentPipelineTrace[];
  generatedImages: GeneratedImageRecord[];
  generatedMindmaps: MindmapRecord[];
  pendingPatches: HarnessPatch[];
  graphViews: GraphView[];
  recentExperiences: ExperienceRecord[];
  skillRegistry: SkillDefinition[];
  counts: {
    ideas: number;
    artifacts: number;
    feedback: number;
    pageContexts: number;
    notes: number;
    memoryCandidates: number;
    approvedMemories: number;
    profileChanges: number;
    backups: number;
    pipelineRuns: number;
    images: number;
    mindmaps: number;
    graphViews: number;
    experiences: number;
    skills: number;
  };
}

export interface IdeaSubmitResult {
  artifact: ProductArtifact;
  assistantSummary: string;
  memorySummary: MemorySummary;
}

export interface ContextCaptureResult {
  snippet: ContextSnippet;
  memorySummary: MemorySummary;
}

export interface FeedbackRecordResult {
  feedback: FeedbackRecord;
  memorySummary: MemorySummary;
}

export interface PageReadResponse {
  page: PageReadResult;
  savedContext: PageContextRecord;
  memorySummary: MemorySummary;
}

export interface PageAnalyzeResponse {
  page: PageReadResult;
  savedContext: PageContextRecord;
  analysis: PageAnalysisResult;
  pipelineTrace: ContentPipelineTrace;
  memorySummary: MemorySummary;
}

export interface ArchiveNoteSaveResult {
  note: ArchiveNote;
  memorySummary: MemorySummary;
}

export interface ArchiveNoteListResult {
  notes: ArchiveNote[];
  memorySummary: MemorySummary;
}

export interface ArtifactListResult {
  records: ProductArtifact[];
  memorySummary: MemorySummary;
}

export interface MemoryCandidateMutationResult {
  candidate: MemoryCandidate;
  approvedMemory?: ApprovedMemory;
  memorySummary: MemorySummary;
}

export interface ImageGenerationResult {
  request: ImageGenerationRequest;
  record: GeneratedImageRecord;
  memorySummary: MemorySummary;
}

export interface MindmapGenerationResult {
  record: MindmapRecord;
  memorySummary: MemorySummary;
}

/** 召回条目类型（与记忆 kind 对齐） */
export type RecallKind =
  | 'context'
  | 'page'
  | 'note'
  | 'memory'
  | 'idea'
  | 'artifact'
  | 'image'
  | 'mindmap';

/** 结构化的「为什么召回」——由哪一层命中、命中了什么、被谁带出 */
export interface RecallDetail {
  via: 'literal' | 'theme' | 'graph';
  evidence: string;
  /** graph 层：被哪个命中节点沿关系边带出 */
  linkedFrom?: { kind: RecallKind; title: string };
}

/** 召回结果条目（reason 字符串向后兼容 UI，recallDetail 为结构化原因） */
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
  recallDetail?: RecallDetail;
}

export interface MemoryRecallResult {
  query: string;
  items: RecallItem[];
}

// ---------- 子 Agent 运行时与经验沉淀（Graph Agent 架构） ----------

/** 子 Agent 的 id —— 对应 PocketAgentDirector 调度的 8 个独立单元（见 docs/reaction-plan.md 第四节） */
export type AgentId =
  | 'plan'
  | 'research'
  | 'reflect'
  | 'structure'
  | 'image'
  | 'feed'
  | 'memory-graph'
  | 'observe';

/** 经验沉淀：记录子 Agent 在加工中的成功/失败经验，供 Observe 页经验图展示与后续复用 */
export interface ExperienceRecord {
  id: string;
  outcome: 'success' | 'failure';
  agentId: AgentId;
  summary: string;
  lesson: string;
  relatedNodeIds: string[];
  createdAt: number;
}

/** 经验种子：子 Agent run() 结束时产出，由 Director 汇总落库为 ExperienceRecord */
export interface ExperienceSeed {
  outcome: 'success' | 'failure';
  agentId: AgentId;
  summary: string;
  lesson: string;
  relatedNodeIds?: string[];
}

/** 子 Agent 单次运行的产物：领域输出 + 可选的阶段图节点/边 + 可选的经验种子 */
export interface AgentRunResult<O> {
  output: O;
  stageNode?: import('@/lib/graph/types').GraphNode;
  /** 该阶段产出的多个节点（如 researchAgent 把每条召回/调研各建一个 research 节点），Director 合并回主图 */
  stageNodes?: import('@/lib/graph/types').GraphNode[];
  /** 该阶段产出的关系边（连到已有节点或本阶段 stageNode），Director 合并回主图 */
  stageEdges?: import('@/lib/graph/types').GraphEdge[];
  experience?: ExperienceSeed;
}
