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
  saveProfile,
} from '@/lib/memory';
import { getLlmClient } from '@/lib/llm';
import { buildHarnessHint } from '../harness';
import { POCKET_AGENT_VOICE } from '../personality';
import { routeIdeaIntent } from '../router';
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
  // 自学习闭环：读取有效 harness 补丁 → 生成 hint → 注入各 gadget 的 system prompt
  const activePatches = await getActiveHarnessPatches();
  const hint = buildHarnessHint(activePatches);
  const concept = await runIdeaLens({
    idea: ideaText,
    intent,
    profile,
    contextLine,
  }, client, hint);
  const imagePrompt = await runProductCamera(concept, client, hint);
  const shrinkResult = await runShrinkLight(concept, client, hint);
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
    appliedGadgets: ['IdeaLens', 'ProductCamera', 'ShrinkLight', 'MemoryBread', 'AnywhereDoor'],
    selectedContextIds,
    selectedArchiveNoteIds,
    createdAt: Date.now(),
  };

  const themedProfile = mergeRecentThemes(profile, extractThemesFromIdea(ideaText));
  await saveIdea(idea);
  await saveArtifact(artifact);
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
