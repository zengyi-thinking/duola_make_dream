import {
  ensureProfile,
  extractThemesFromIdea,
  getArchiveNotesByIds,
  getContextSnippetsByIds,
  getActiveHarnessPatches,
  getMemorySummary,
  markHarnessPatchesApplied,
  mergeRecentThemes,
  saveArtifact,
  saveIdea,
  savePipelineRun,
  saveProfile,
} from '@/lib/memory';
import { getLlmClient } from '@/lib/llm';
import { buildHarnessHint } from '../harness';
import { buildPipelineTrace, createPipelineStage } from '../pipeline';
import { buildToneHint, POCKET_AGENT_VOICE } from '../personality';
import { routeIdeaIntent } from '../router';
import { getRuntimeConfig } from '@/lib/storage/local';
import type { IdeaSubmitResult, IdeaSource, ProductArtifact } from '../types';
import { runAnywhereDoor, runIdeaLens, runMemoryBread, runProductCamera, runShrinkLight } from '../gadgets';

interface IdeaSubmissionInput {
  text: string;
  source?: IdeaSource;
  selectedContextIds?: string[];
  selectedArchiveNoteIds?: string[];
}

export async function processIdeaSubmission(
  input: IdeaSubmissionInput,
): Promise<IdeaSubmitResult> {
  const ideaText = input.text.trim();
  if (!ideaText) {
    throw new Error('想法不能为空');
  }

  const profile = await ensureProfile();
  const selectedContextIds = input.selectedContextIds ?? [];
  const selectedArchiveNoteIds = input.selectedArchiveNoteIds ?? [];
  const selectedContexts = await getContextSnippetsByIds(selectedContextIds);
  const selectedNotes = await getArchiveNotesByIds(selectedArchiveNoteIds);
  const intent = routeIdeaIntent(ideaText);
  const contextLine = [
    runAnywhereDoor(selectedContexts),
    selectedNotes.length > 0
      ? selectedNotes.map((note) => `${note.title}: ${note.summary}`).join(' + ')
      : undefined,
  ]
    .filter(Boolean)
    .join(' + ');

  const idea = {
    id: crypto.randomUUID(),
    rawInput: ideaText,
    source: input.source ?? 'popup',
    selectedContextIds,
    selectedArchiveNoteIds,
    createdAt: Date.now(),
  };

  const client = await getLlmClient();
  // 自学习 + 个性语气：合并 harness 补丁与 defaultTone → 注入各 gadget 的 system prompt
  const activePatches = await getActiveHarnessPatches();
  const { defaultTone } = await getRuntimeConfig();
  const hint = [buildToneHint(defaultTone), buildHarnessHint(activePatches)].filter(Boolean).join('\n');
  const concept = await runIdeaLens({
    idea: ideaText,
    intent,
    profile,
    contextLine,
  }, client, hint);
  const imagePrompt = await runProductCamera(concept, client, hint);
  const shrinkResult = await runShrinkLight(concept, client, hint);
  const pipelineTrace = buildPipelineTrace({
    kind: 'idea',
    title: concept.name,
    summary: concept.tagline,
    sourceId: idea.id,
    stages: [
      createPipelineStage('plan', '规划', '锁定输入与目标', `${selectedContexts.length} 个片段 · ${selectedNotes.length} 条笔记`),
      createPipelineStage('research', '调研', '整理上下文与记忆线索', contextLine || '没有带入额外上下文'),
      createPipelineStage('reflect', '反思', '结合画像偏好与近期主题', profile.recentThemes.slice(0, 2).join(' / ') || '暂无近期主题'),
      createPipelineStage('outline', '信息编排', '生成概念和 MVP 路径', concept.features.slice(0, 2).join(' / ') || '功能点待补'),
      createPipelineStage('generate', '生成', '输出产品雏形', shrinkResult.mvpPlan[0] || concept.name),
    ],
  });
  // 补丁已注入本轮输出，标记为已应用（status → applied）
  if (activePatches.length > 0) {
    await markHarnessPatchesApplied(activePatches.map((p) => p.id));
  }

  const artifact: ProductArtifact = {
    id: crypto.randomUUID(),
    ideaId: idea.id,
    intent,
    concept,
    imagePrompt,
    mvpPlan: shrinkResult.mvpPlan,
    nextTasks: shrinkResult.nextTasks,
    // 实际在本轮 orchestrator 中调用过的 gadget：
    //   - IdeaLens: 生成产品概念
    //   - ProductCamera: 生成图片 prompt
    //   - ShrinkLight: 压缩为 MVP 计划
    // 注意：AnywhereDoor 是片段拼接纯函数（不是 gadget），MemoryBread 只在系统提示层面
    // 起作用（不产生产物）—— 因此不列入"工具痕迹"。
    appliedGadgets: ['IdeaLens', 'ProductCamera', 'ShrinkLight'],
    selectedContextIds,
    selectedArchiveNoteIds,
    pipelineTrace,
    createdAt: Date.now(),
  };

  const themedProfile = mergeRecentThemes(profile, extractThemesFromIdea(ideaText));
  await saveIdea(idea);
  await saveArtifact(artifact);
  await savePipelineRun(pipelineTrace);
  await saveProfile(themedProfile, 'idea');

  const memoryHints = runMemoryBread(themedProfile);
  const memorySummary = await getMemorySummary();
  const assistantSummary = [
    selectedContexts.length > 0 || selectedNotes.length > 0
      ? POCKET_AGENT_VOICE.summaries.withContext
      : POCKET_AGENT_VOICE.summaries.withoutContext,
    `我先把它收束成了一个 ${labelIntent(intent)} 方向：${artifact.concept.name}。`,
    memoryHints[0] ? `我也记得你最近的偏好是“${memoryHints[0]}”。` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    artifact,
    assistantSummary,
    memorySummary,
  };
}

function labelIntent(intent: ProductArtifact['intent']): string {
  switch (intent) {
    case 'browser-extension':
      return '浏览器插件';
    case 'creator-tool':
      return '创作工具';
    case 'learning-tool':
      return '学习工具';
    case 'playful-tool':
      return '陪伴型小工具';
    default:
      return '效率工具';
  }
}
