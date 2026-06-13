import {
  applyFeedbackToProfile,
  ensureProfile,
  extractThemesFromIdea,
  getLatestContextSnippet,
  getMemorySummary,
  mergeRecentThemes,
  saveArtifact,
  saveIdea,
  saveProfile,
} from '@/lib/memory';
import { POCKET_AGENT_VOICE } from './personality';
import { routeIdeaIntent } from './router';
import type { IdeaSubmitResult, IdeaSource, ProductArtifact } from './types';
import { runAnywhereDoor, runIdeaLens, runMemoryBread, runProductCamera, runShrinkLight } from './gadgets';

interface IdeaSubmissionInput {
  text: string;
  source?: IdeaSource;
}

export async function processIdeaSubmission(
  input: IdeaSubmissionInput,
): Promise<IdeaSubmitResult> {
  const ideaText = input.text.trim();
  if (!ideaText) {
    throw new Error('想法不能为空');
  }

  const profile = await ensureProfile();
  const latestContext = await getLatestContextSnippet();
  const intent = routeIdeaIntent(ideaText);
  const contextLine = runAnywhereDoor(latestContext);

  const idea = {
    id: crypto.randomUUID(),
    rawInput: ideaText,
    source: input.source ?? 'popup',
    contextSnippetId: latestContext?.id,
    createdAt: Date.now(),
  };

  const concept = runIdeaLens({
    idea: ideaText,
    intent,
    profile,
    contextLine,
  });
  const imagePrompt = runProductCamera(concept);
  const shrinkResult = runShrinkLight(concept);
  const artifact: ProductArtifact = {
    id: crypto.randomUUID(),
    ideaId: idea.id,
    intent,
    concept,
    imagePrompt,
    mvpPlan: shrinkResult.mvpPlan,
    nextTasks: shrinkResult.nextTasks,
    appliedGadgets: ['IdeaLens', 'ProductCamera', 'ShrinkLight', 'MemoryBread', 'AnywhereDoor'],
    contextSnippetId: latestContext?.id,
    createdAt: Date.now(),
  };

  const themedProfile = mergeRecentThemes(profile, extractThemesFromIdea(ideaText));
  await saveIdea(idea);
  await saveArtifact(artifact);
  await saveProfile(themedProfile);

  const memoryHints = runMemoryBread(themedProfile);
  const memorySummary = await getMemorySummary();
  const assistantSummary = [
    latestContext ? POCKET_AGENT_VOICE.summaries.withContext : POCKET_AGENT_VOICE.summaries.withoutContext,
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

export async function previewProfileAfterFeedback(action: Parameters<typeof applyFeedbackToProfile>[1]) {
  const profile = await ensureProfile();
  return applyFeedbackToProfile(profile, action);
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
