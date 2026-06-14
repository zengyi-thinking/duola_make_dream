/**
 * PocketAgent 子 Agent 运行时类型骨架（阶段0）。
 *
 * 把现有 orchestrator+gadget 平铺模式拆成 8 个独立子 Agent 单元（接口化 + 状态机事件流）。
 * 本文件只定义契约，具体 8 个 SubAgent 的实现与 PocketAgentDirector 调度器在阶段1 落地。
 *
 * 依赖方向（避免循环）：
 * - 本文件 → agent/types(AgentId/Experience/ContentPipelineStageId/UserProfile)
 * - 本文件 → graph/types, llm/types, brand/avatars, page/types
 * - 不被 agent/types 反向引用。
 */
import type { LlmClient } from '@/lib/llm/types';
import type { PocketAvatarId } from '@/lib/brand/avatars';
import type {
  AgentId,
  AgentRunResult,
  ContentPipelineStageId,
  UserProfile,
} from '@/lib/agent/types';
import type { GraphNode, GraphView } from '@/lib/graph/types';
import type { PageReadResult } from '@/lib/page/types';

/** 子 Agent 状态机：前端订阅事件驱动 ProcessingStage 加工动画 */
export type AgentStatus = 'idle' | 'running' | 'done' | 'skipped' | 'error';

/**
 * 子 Agent 在运行中向前端推送的事件。
 * 前端 ProcessingStage 组件订阅事件流，渲染 Planning/Researching/Reflecting/Structuring/Rendering 链路。
 */
export interface AgentEvent {
  agentId: AgentId;
  status: AgentStatus;
  stage: ContentPipelineStageId;
  /** 可读的状态文案，直接喂给加工动画 */
  message?: string;
  /** 阶段产出的增量图节点（计划图/调研节点等，边生成边并入当前 GraphView） */
  partial?: GraphNode;
}

/** 四人格的输出风格维度 */
export type AgentOutputStyle = 'divergent' | 'warm' | 'focused' | 'rigorous';

/**
 * Agent 人格之一（四套，绑四个头像）。
 * 详细 personaPrompt/toneHint 内容在阶段4 的 lib/agent/voices.ts 填充；
 * 这里先定接口，让子 Agent 的 hint 注入有类型支撑。
 */
export interface AgentVoice {
  id: PocketAvatarId;
  name: string;
  /** 角色定位 prompt（注入 system prompt） */
  personaPrompt: string;
  /** 语气提示 */
  toneHint: string;
  /** 偏好调用的子 Agent（影响 Director 调度权重，阶段4 启用） */
  defaultToolBias: AgentId[];
  outputStyle: AgentOutputStyle;
}

/**
 * 子 Agent 运行上下文。Director 在驱动每个 SubAgent.run 时组装此对象。
 *
 * 设计：用 `emit` 回调 + `graph` 快照替代直接持有 director 引用，避免循环依赖。
 * 子 Agent 通过 emit 推事件、通过 client 调 LLM、通过 graph 读写当前加工图。
 */
export interface AgentRuntimeContext {
  client: LlmClient;
  voice: AgentVoice;
  /** voice + tone + harness 合并后的 system prompt 片段（注入各 gadget/agent 的 system 最前面） */
  hint: string;
  profile: UserProfile;
  /** 当前加工的 GraphView 快照（子 Agent 可读取已有节点并追加产物节点） */
  graph: GraphView;
  /** 推送状态机事件给前端 */
  emit: (event: AgentEvent) => void;
  /** 取消信号（用户放弃加工时） */
  signal?: AbortSignal;
}

/**
 * 子 Agent 契约：8 个独立单元（plan/research/reflect/structure/image/feed/memory-graph/observe）都实现此接口。
 * 统一契约（源自现有 gadget 模式，阶段1 实现）：
 *   1. client.kind === 'mock' → 走模板；2. LLM 成功 → 真实；3. LLM 失败 → 降级模板，写 experience outcome='failure'。
 *   4. system prompt = [ctx.hint, 角色 prompt, 输出契约].filter(Boolean).join('')。
 */
export interface SubAgent<I, O> {
  id: AgentId;
  stage: ContentPipelineStageId;
  needsLlm: boolean;
  run(input: I, ctx: AgentRuntimeContext): Promise<AgentRunResult<O>>;
}

/** 发明页输入 */
export interface InventInput {
  text: string;
  source?: 'popup' | 'selection';
  selectedContextIds?: string[];
  selectedArchiveNoteIds?: string[];
}

/** 喂养页输入 */
export interface FeedInput {
  page: PageReadResult;
  selectedText?: string;
}

/**
 * 调度器契约（PocketAgentDirector 在阶段1 实现）。
 * 三条链路都以 AsyncIterable<AgentEvent> 返回，前端边迭代边渲染加工动画。
 */
export interface IPocketAgentDirector {
  /** 发明主链路：plan → research → reflect → structure →（用户确认后）image */
  runInventPipeline(input: InventInput): AsyncIterable<AgentEvent>;
  /** 发明链路的生图阶段（计划图确认后单独触发） */
  runImageStage(planGraph: GraphView): AsyncIterable<AgentEvent>;
  /** 喂养主链路：research(页面提取) → structure(知识节点) →（用户确认后）archive */
  runFeedPipeline(input: FeedInput): AsyncIterable<AgentEvent>;
}
