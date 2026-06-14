/**
 * PocketAgentDirector —— 子 Agent 调度器。
 *
 * 职责：
 * 1. 组装 AgentRuntimeContext（client/voice/hint/profile/graph/emit）
 * 2. 串联 SubAgent 驱动三条链路：发明(invent) / 生图(image) / 喂养(feed)
 * 3. 收集各阶段的 stageNode/stageEdge/experience
 * 4. 副作用收尾：持久化 idea/artifact/profile/pipelineRun/image/archive，
 *    markHarnessPatchesApplied，mergeIntoGlobalGraph，saveExperience
 *
 * 设计决策（阶段1）：
 * - 用 async 函数返回 { events, result }（收集模式）而非 AsyncIterable。
 *   阶段1 重点是行为等价 + 可验证；阶段3 前端做实时加工动画时，再用 port 流式
 *   （IPocketAgentDirector 的 AsyncIterable 契约留作阶段3 目标形态）。
 * - SubAgent 只产出（纯领域逻辑），所有副作用集中在 Director，便于测试与回滚。
 * - 行为等价：runInventPipeline 的 artifact 字段与 processIdeaSubmission 一致（mock 下 gadget 走相同模板）。
 */
import type {
  AgentRuntimeContext,
  AgentEvent,
  FeedInput,
  InventInput,
} from './types';
import type {
  AgentRunResult,
  ExperienceSeed,
  HarnessPatch,
  IdeaRecord,
  ProductArtifact,
} from '@/lib/agent/types';
import type { GraphEdge, GraphNode, GraphView } from '@/lib/graph/types';
import type { GeneratedImageRecord } from '@/lib/image/types';
import type { PageAnalysisResult, PageContextRecord } from '@/lib/page/types';

import {
  feedAgent,
  imageAgent,
  planAgent,
  reflectAgent,
  researchAgent,
  structureAgent,
} from './agents';
import type { StructureOutput } from './agents/structure';
import { getLlmClient } from '@/lib/llm';
import { buildVoiceHint, getVoice } from '@/lib/agent/voices';
import { buildToneHint } from '@/lib/agent/personality';
import { buildHarnessHint } from '@/lib/agent/harness';
import {
  ensureProfile,
  getActiveHarnessPatches,
  getArchiveNotesByIds,
  getArtifactHistory,
  getContextSnippetsByIds,
  getGeneratedImages,
  getMemorySummary,
  markHarnessPatchesApplied,
  mergeIntoGlobalGraph,
  mergeRecentThemes,
  extractThemesFromIdea,
  saveArchiveNote,
  saveArtifact,
  saveExperience,
  saveGeneratedImage,
  saveIdea,
  savePipelineRun,
  saveProfile,
} from '@/lib/memory';
import { runAnywhereDoor, runMemoryBread } from '@/lib/agent/gadgets';
import { buildArchiveNoteFromAnalysis } from '@/lib/agent/core';
import { buildPipelineTrace, createPipelineStage } from '@/lib/agent/pipeline';
import { createGraphEdge, createGraphView } from '@/lib/graph/types';
import { getRuntimeConfig } from '@/lib/storage/local';

// ---------- 结果类型 ----------

export interface InventResult {
  artifact: ProductArtifact;
  planGraph: GraphView; // scope='invent'，本次加工的计划图（前端展示用）
  assistantSummary: string;
}
export interface ImageResult {
  imageRecord: GeneratedImageRecord;
}
export interface FeedResult {
  analysis: PageAnalysisResult;
  feedGraph: GraphView; // scope='feed'，知识节点图
}
export interface PipelineRun<T> {
  events: AgentEvent[];
  result: T;
}

// ---------- 公共：组装运行上下文 ----------

async function buildContext(
  scope: GraphView['scope'],
  title: string,
  emit: (e: AgentEvent) => void,
): Promise<{ ctx: AgentRuntimeContext; patches: HarnessPatch[] }> {
  const profile = await ensureProfile();
  const client = await getLlmClient();
  const runtimeConfig = await getRuntimeConfig();
  const voice = getVoice(runtimeConfig.avatarId);
  const patches = await getActiveHarnessPatches();
  const hint = [
    buildVoiceHint(voice, runtimeConfig.voiceOverrides?.[voice.id]),
    buildToneHint(runtimeConfig.defaultTone),
    buildHarnessHint(patches),
  ].filter(Boolean).join('\n');

  return {
    ctx: {
      client,
      voice,
      hint,
      profile,
      graph: createGraphView({ scope, title, nodes: [], edges: [] }),
      emit,
    },
    patches,
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 跑一个 SubAgent 并归集产物 + 即时落库经验（产品重设计：agent 健康日志）。
 * - 成功：收集 stageNode/stageEdge，experience 即时 saveExperience（不等链路末尾，避免后续失败丢经验）。
 * - 失败：saveExperience(outcome='failure', lesson=错误信息)，然后 throw 中止链路。
 * 这样即使链路中途崩，已跑完 agent 的成功/失败经验都已入库，观察页有完整的健康日志。
 */
async function runAgentWithTrace<O>(
  agentId: ExperienceSeed['agentId'],
  label: string,
  run: () => Promise<AgentRunResult<O>>,
  nodes: GraphNode[],
  edges: GraphEdge[],
): Promise<AgentRunResult<O>> {
  let result: AgentRunResult<O>;
  try {
    result = await run();
  } catch (err) {
    await saveExperience({
      outcome: 'failure',
      agentId,
      summary: `${label}阶段执行失败`,
      lesson: errMsg(err),
    });
    throw err;
  }
  if (result.stageNode) nodes.push(result.stageNode);
  if (result.stageNodes) nodes.push(...result.stageNodes);
  if (result.stageEdges) edges.push(...result.stageEdges);
  if (result.experience) await saveExperience(result.experience);
  return result;
}

// ---------- Director ----------

export class PocketAgentDirector {
  /**
   * 发明主链路：plan → research → reflect → structure。
   * 对应 processIdeaSubmission，artifact 字段行为等价。
   * 生图（image）不在本链路，由 runImageStage 在用户确认计划图后单独触发。
   */
  async runInventPipeline(input: InventInput, onEvent?: (e: AgentEvent) => void): Promise<PipelineRun<InventResult>> {
    if (!input.text.trim()) throw new Error('想法不能为空');
    const events: AgentEvent[] = [];
    const emit = (e: AgentEvent) => {
      events.push(e);
      try { onEvent?.(e); } catch { /* 流式推送失败不影响主链路 */ }
    };
    const { ctx, patches } = await buildContext('invent', input.text.slice(0, 40), emit);

    const selectedContextIds = input.selectedContextIds ?? [];
    const selectedArchiveNoteIds = input.selectedArchiveNoteIds ?? [];
    const selectedContexts = await getContextSnippetsByIds(selectedContextIds);
    const selectedNotes = await getArchiveNotesByIds(selectedArchiveNoteIds);
    const contextLine = [
      runAnywhereDoor(selectedContexts),
      selectedNotes.length > 0 ? selectedNotes.map((n) => `${n.title}: ${n.summary}`).join(' + ') : undefined,
    ].filter(Boolean).join(' + ');

    const stageNodes: GraphNode[] = [];
    const stageEdges: GraphEdge[] = [];

    const planResult = await runAgentWithTrace('plan', '规划', () => planAgent.run({ idea: input.text, contextLine }, ctx), stageNodes, stageEdges);

    const researchResult = await runAgentWithTrace('research', '调研', async () => researchAgent.run(
      {
        query: input.text,
        intent: planResult.output.intent,
        memory: await getMemorySummary(),
        artifacts: await getArtifactHistory(),
        images: await getGeneratedImages(),
      },
      ctx,
    ), stageNodes, stageEdges);

    const reflectResult = await runAgentWithTrace('reflect', '反思', () => reflectAgent.run({ patches }, ctx), stageNodes, stageEdges);

    const structureResult = await runAgentWithTrace('structure', '编排', () => structureAgent.run(
      { idea: input.text, intent: planResult.output.intent, profile: ctx.profile, contextLine },
      ctx,
    ), stageNodes, stageEdges);

    // 连边：structure 派生自 plan，关联 research（多节点）/ reflect
    const planId = planResult.stageNode?.id;
    const structureId = structureResult.stageNode?.id;
    if (planId && structureId) stageEdges.push(createGraphEdge(structureId, planId, 'derives'));
    const researchNodeIds = researchResult.stageNodes?.map((n) => n.id) ?? [];
    for (const rid of researchNodeIds) {
      if (structureId) stageEdges.push(createGraphEdge(structureId, rid, 'relates'));
    }
    if (reflectResult.stageNode?.id && structureId) {
      stageEdges.push(createGraphEdge(structureId, reflectResult.stageNode.id, 'relates'));
    }

    // 持久化（对应 processIdeaSubmission 的 save 段）
    const { concept, planBoard, imagePrompt, mvpPlan, nextTasks } = structureResult.output;
    const idea: IdeaRecord = {
      id: crypto.randomUUID(),
      rawInput: input.text,
      source: input.source ?? 'popup',
      selectedContextIds,
      selectedArchiveNoteIds,
      createdAt: Date.now(),
      status: 'committed',
    };
    const pipelineTrace = buildPipelineTrace({
      kind: 'idea',
      title: concept.name,
      summary: concept.tagline,
      sourceId: idea.id,
      stages: [
        createPipelineStage('plan', '规划', '锁定输入与目标', `${selectedContexts.length} 个片段 · ${selectedNotes.length} 条笔记`),
        createPipelineStage('research', '调研', '召回 + 内置调研', `${researchResult.output.recallItems.length} 召回 · ${researchResult.output.findings.length} 调研`),
        createPipelineStage('reflect', '反思', '结合自学习', reflectResult.output.activePatchCount > 0 ? `${reflectResult.output.activePatchCount} 条补丁` : '无补丁'),
        createPipelineStage('outline', '信息编排', '生成概念与 MVP', concept.features.slice(0, 2).join(' / ') || concept.name),
        createPipelineStage('generate', '生成', '待用户确认后生图', concept.name),
      ],
    });
    const artifact: ProductArtifact = {
      id: crypto.randomUUID(),
      ideaId: idea.id,
      intent: planResult.output.intent,
      concept,
      planBoard,
      imagePrompt,
      mvpPlan,
      nextTasks,
      appliedGadgets: ['IdeaLens', 'ProductCamera', 'ShrinkLight'],
      selectedContextIds,
      selectedArchiveNoteIds,
      pipelineTrace,
      createdAt: Date.now(),
    };

    await saveIdea(idea);
    await saveArtifact(artifact);
    await savePipelineRun(pipelineTrace);
    const themedProfile = mergeRecentThemes(ctx.profile, extractThemesFromIdea(input.text));
    await saveProfile(themedProfile, 'idea');
    if (patches.length > 0) {
      await markHarnessPatchesApplied(patches.map((p) => p.id));
    }

    const planGraph = createGraphView({
      scope: 'invent',
      title: concept.name,
      nodes: stageNodes,
      edges: stageEdges,
    });
    await mergeIntoGlobalGraph(stageNodes, stageEdges);

    events.push({ agentId: 'structure', status: 'done', stage: 'outline', message: '计划图就绪，等待确认' });

    const memoryHints = runMemoryBread(themedProfile);
    const assistantSummary = [
      selectedContexts.length > 0 || selectedNotes.length > 0
        ? '我把你放进口袋的上下文也带进来了。'
        : '我先根据你的想法起草一个方向。',
      `收束为 ${labelIntent(artifact.intent)} 方向：${artifact.concept.name}。`,
      memoryHints[0] ? `我也记得你最近的偏好是"${memoryHints[0]}"。` : '',
    ].filter(Boolean).join(' ');

    return { events, result: { artifact, planGraph, assistantSummary } };
  }

  /** 生图阶段：用户确认计划图后，从 structure 节点取 concept 调 ImageAgent。 */
  async runImageStage(planGraph: GraphView): Promise<PipelineRun<ImageResult>> {
    const events: AgentEvent[] = [];
    const structureNode = planGraph.nodes.find((n) => n.type === 'structure');
    const structureOutput = structureNode?.payload as StructureOutput | undefined;
    const concept = structureOutput?.concept;
    const planBoard = structureOutput?.planBoard;
    if (!concept || !planBoard) throw new Error('计划图中找不到 structure 节点，无法生图');

    const { ctx } = await buildContext('invent', `生图：${concept.name}`, (e) => events.push(e));
    const runtimeConfig = await getRuntimeConfig();

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const imageResult = await runAgentWithTrace('image', '生图', () => imageAgent.run({ concept, planBoard, style: 'knowledge-card', runtimeConfig }, ctx), nodes, edges);

    await saveGeneratedImage(imageResult.output.imageRecord);
    if (nodes.length > 0) await mergeIntoGlobalGraph(nodes, edges);

    return { events, result: { imageRecord: imageResult.output.imageRecord } };
  }

  /**
   * 喂养链路：feedAgent（页面提取+结构化分析），产出知识节点图。
   * 对应 buildPageAnalysisResult orchestrator。归档（archive）由调用方在用户确认后单独触发。
   */
  async runFeedPipeline(input: FeedInput, onEvent?: (e: AgentEvent) => void): Promise<PipelineRun<FeedResult>> {
    const events: AgentEvent[] = [];
    const emit = (e: AgentEvent) => {
      events.push(e);
      try { onEvent?.(e); } catch { /* 流式推送失败不影响主链路 */ }
    };
    const { ctx, patches } = await buildContext('feed', input.page.pageTitle.slice(0, 40), emit);

    const stageNodes: GraphNode[] = [];
    const stageEdges: GraphEdge[] = [];
    const feedResult = await runAgentWithTrace('feed', '喂养', () => feedAgent.run(
      { page: input.page, context: input.context, profile: ctx.profile },
      ctx,
    ), stageNodes, stageEdges);

    // 持久化（对应 handlePageAnalyze 的 savePipelineRun + saveMemoryCandidates + markHarnessPatchesApplied）
    await savePipelineRun(feedResult.output.analysis.pipelineTrace);
    if (patches.length > 0) {
      await markHarnessPatchesApplied(patches.map((p) => p.id));
    }

    const feedGraph = createGraphView({
      scope: 'feed',
      title: feedResult.output.analysis.noteCard.title || input.page.pageTitle,
      nodes: stageNodes,
      edges: stageEdges,
    });
    await mergeIntoGlobalGraph(stageNodes, stageEdges);

    events.push({ agentId: 'feed', status: 'done', stage: 'research', message: '知识节点图就绪，等待确认归档' });
    return { events, result: { analysis: feedResult.output.analysis, feedGraph } };
  }
}

/** 用户确认喂养后，把 analysis 转成 ArchiveNote 落库（归档动作）。 */
export async function commitFeedArchive(
  analysis: PageAnalysisResult,
  context: PageContextRecord,
) {
  const note = buildArchiveNoteFromAnalysis(analysis, context);
  await saveArchiveNote(note);
  return note;
}

function labelIntent(intent: ProductArtifact['intent']): string {
  switch (intent) {
    case 'browser-extension': return '浏览器插件';
    case 'creator-tool': return '创作工具';
    case 'learning-tool': return '学习工具';
    case 'playful-tool': return '陪伴型小工具';
    default: return '效率工具';
  }
}
