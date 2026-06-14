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
    buildVoiceHint(voice),
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

/** 把单个 SubAgent 的产物归集到全局收集器。 */
function collectResult<O>(
  result: AgentRunResult<O>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  experiences: ExperienceSeed[],
): void {
  if (result.stageNode) nodes.push(result.stageNode);
  if (result.stageEdges) edges.push(...result.stageEdges);
  if (result.experience) experiences.push(result.experience);
}

// ---------- Director ----------

export class PocketAgentDirector {
  /**
   * 发明主链路：plan → research → reflect → structure。
   * 对应 processIdeaSubmission，artifact 字段行为等价。
   * 生图（image）不在本链路，由 runImageStage 在用户确认计划图后单独触发。
   */
  async runInventPipeline(input: InventInput): Promise<PipelineRun<InventResult>> {
    if (!input.text.trim()) throw new Error('想法不能为空');
    const events: AgentEvent[] = [];
    const { ctx, patches } = await buildContext('invent', input.text.slice(0, 40), (e) => events.push(e));

    const selectedContextIds = input.selectedContextIds ?? [];
    const selectedArchiveNoteIds = input.selectedArchiveNoteIds ?? [];
    const selectedContexts = await getContextSnippetsByIds(selectedContextIds);
    const selectedNotes = await getArchiveNotesByIds(selectedArchiveNoteIds);
    const contextLine = [
      runAnywhereDoor(selectedContexts),
      selectedNotes.length > 0 ? selectedNotes.map((n) => `${n.title}: ${n.summary}`).join(' + ') : undefined,
    ].filter(Boolean).join(' + ');

    const experiences: ExperienceSeed[] = [];
    const stageNodes: GraphNode[] = [];
    const stageEdges: GraphEdge[] = [];

    const planResult = await planAgent.run({ idea: input.text, contextLine }, ctx);
    collectResult(planResult, stageNodes, stageEdges, experiences);

    const researchResult = await researchAgent.run(
      {
        query: input.text,
        memory: await getMemorySummary(),
        artifacts: await getArtifactHistory(),
        images: await getGeneratedImages(),
      },
      ctx,
    );
    collectResult(researchResult, stageNodes, stageEdges, experiences);

    const reflectResult = await reflectAgent.run({ patches }, ctx);
    collectResult(reflectResult, stageNodes, stageEdges, experiences);

    const structureResult = await structureAgent.run(
      { idea: input.text, intent: planResult.output.intent, profile: ctx.profile, contextLine },
      ctx,
    );
    collectResult(structureResult, stageNodes, stageEdges, experiences);

    // 连边：structure 派生自 plan，关联 research / reflect
    const planId = planResult.stageNode?.id;
    const structureId = structureResult.stageNode?.id;
    if (planId && structureId) stageEdges.push(createGraphEdge(structureId, planId, 'derives'));
    if (researchResult.stageNode?.id && structureId) {
      stageEdges.push(createGraphEdge(structureId, researchResult.stageNode.id, 'relates'));
    }
    if (reflectResult.stageNode?.id && structureId) {
      stageEdges.push(createGraphEdge(structureId, reflectResult.stageNode.id, 'relates'));
    }

    // 持久化（对应 processIdeaSubmission 的 save 段）
    const { concept, imagePrompt, mvpPlan, nextTasks } = structureResult.output;
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
        createPipelineStage('research', '调研', '召回关联记忆', `${researchResult.output.recallItems.length} 条`),
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
    for (const exp of experiences) await saveExperience(exp);

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
    const concept = structureNode?.payload as ProductArtifact['concept'] | undefined;
    if (!concept) throw new Error('计划图中找不到 structure 节点，无法生图');

    const { ctx } = await buildContext('invent', `生图：${concept.name}`, (e) => events.push(e));
    const runtimeConfig = await getRuntimeConfig();

    const imageResult = await imageAgent.run({ concept, style: 'product-ui', runtimeConfig }, ctx);
    const experiences: ExperienceSeed[] = [];
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    collectResult(imageResult, nodes, edges, experiences);

    await saveGeneratedImage(imageResult.output.imageRecord);
    for (const exp of experiences) await saveExperience(exp);
    if (nodes.length > 0) await mergeIntoGlobalGraph(nodes, edges);

    return { events, result: { imageRecord: imageResult.output.imageRecord } };
  }

  /**
   * 喂养链路：feedAgent（页面提取+结构化分析），产出知识节点图。
   * 对应 buildPageAnalysisResult orchestrator。归档（archive）由调用方在用户确认后单独触发。
   */
  async runFeedPipeline(input: FeedInput): Promise<PipelineRun<FeedResult>> {
    const events: AgentEvent[] = [];
    const { ctx, patches } = await buildContext('feed', input.page.pageTitle.slice(0, 40), (e) => events.push(e));

    const feedResult = await feedAgent.run(
      { page: input.page, context: input.context, profile: ctx.profile },
      ctx,
    );
    const experiences: ExperienceSeed[] = [];
    const stageNodes: GraphNode[] = [];
    const stageEdges: GraphEdge[] = [];
    collectResult(feedResult, stageNodes, stageEdges, experiences);

    // 持久化（对应 handlePageAnalyze 的 savePipelineRun + saveMemoryCandidates + markHarnessPatchesApplied）
    await savePipelineRun(feedResult.output.analysis.pipelineTrace);
    if (patches.length > 0) {
      await markHarnessPatchesApplied(patches.map((p) => p.id));
    }
    for (const exp of experiences) await saveExperience(exp);

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
