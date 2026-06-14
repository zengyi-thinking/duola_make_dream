import type {
  ApprovedMemory,
  ArchiveNote,
  ContentPipelineTrace,
  ContextSnippet,
  FeedbackRecord,
  HarnessPatch,
  IdeaRecord,
  MemoryCandidate,
  MemorySummary,
  ProfileHistoryEntry,
  ProfileHistorySource,
  ProductArtifact,
  UserProfile,
} from '@/lib/agent/types';
import type { GeneratedImageRecord } from '@/lib/image/types';
import type { MindmapRecord } from '@/lib/mindmap/types';
import type { PageContextRecord } from '@/lib/page/types';
import {
  appendLimited,
  clearArrayStorage,
  readStorage,
  readStorageSnapshot,
  removeById,
  replaceArrayItem,
  resetStorageScope,
  writeStorage,
} from '@/lib/storage/local';
import type { StorageSchema } from '@/lib/storage/schema';
import { createApprovedMemory, createProfile } from './profile';

export async function ensureProfile(): Promise<UserProfile> {
  const profile = await readStorage('profile');
  if (profile) return profile;

  const next = createProfile();
  await saveProfile(next, 'init');
  return next;
}

export async function saveProfile(
  profile: UserProfile,
  source: ProfileHistorySource = 'manual',
): Promise<UserProfile> {
  await writeStorage('profile', profile);
  const historyEntry: ProfileHistoryEntry = {
    id: crypto.randomUUID(),
    source,
    profile,
    createdAt: Date.now(),
  };
  await appendLimited('profileHistory', historyEntry, 20);
  return profile;
}

export async function saveIdea(idea: IdeaRecord): Promise<IdeaRecord> {
  await appendLimited('ideaHistory', idea, 30);
  return idea;
}

/** 更新指定 idea 的提交状态（pending → committed/failed）。事务收尾用。 */
export async function updateIdeaStatus(
  ideaId: string,
  status: 'committed' | 'failed',
  failReason?: string,
): Promise<IdeaRecord | null> {
  const ideas = await readStorage('ideaHistory');
  const idx = ideas.findIndex((i) => i.id === ideaId);
  if (idx < 0) return null;
  const updated: IdeaRecord = {
    ...ideas[idx],
    status,
    failReason,
    completedAt: Date.now(),
  };
  const next = [...ideas];
  next[idx] = updated;
  await writeStorage('ideaHistory', next);
  return updated;
}

/**
 * 启动时清理孤儿 idea：超过 5 分钟仍处于 pending 的 idea
 * 一定是上次 SW 异常中止留下的（正常流程 5 分钟内一定完成）。
 * 把它们标记为 failed，让用户能在历史里看到失败原因，但避免重复执行。
 */
export async function cleanupOrphanIdeas(maxAgeMs = 5 * 60 * 1000): Promise<number> {
  const ideas = await readStorage('ideaHistory');
  const now = Date.now();
  let cleanedCount = 0;
  const next = ideas.map((idea) => {
    if (idea.status === 'pending' && (now - idea.createdAt) > maxAgeMs) {
      cleanedCount++;
      return {
        ...idea,
        status: 'failed' as const,
        failReason: '服务异常中止导致未完成（自动清理）',
        completedAt: now,
      };
    }
    return idea;
  });
  if (cleanedCount > 0) {
    await writeStorage('ideaHistory', next);
  }
  return cleanedCount;
}

export async function saveArtifact(artifact: ProductArtifact): Promise<ProductArtifact> {
  await appendLimited('artifactHistory', artifact, 30);
  return artifact;
}

export async function saveFeedback(feedback: FeedbackRecord): Promise<FeedbackRecord> {
  await appendLimited('feedbackLog', feedback, 60);
  return feedback;
}

export async function saveContextSnippet(snippet: ContextSnippet): Promise<ContextSnippet> {
  await appendLimited('contextSnippets', snippet, 20);
  return snippet;
}

export async function savePageContext(record: PageContextRecord): Promise<PageContextRecord> {
  await appendLimited('pageContexts', record, 10);
  return record;
}

export async function saveArchiveNote(note: ArchiveNote): Promise<ArchiveNote> {
  await appendLimited('archiveNotes', note, 40);
  return note;
}

export async function saveMemoryCandidates(candidates: MemoryCandidate[]): Promise<MemoryCandidate[]> {
  const current = await readStorage('memoryCandidates');
  const next = [...candidates, ...current].slice(0, 60);
  await writeStorage('memoryCandidates', next);
  return next;
}

export async function saveApprovedMemory(memory: ApprovedMemory): Promise<ApprovedMemory> {
  await appendLimited('approvedMemories', memory, 60);
  return memory;
}

export async function saveGeneratedImage(record: GeneratedImageRecord): Promise<GeneratedImageRecord> {
  await appendLimited('generatedImages', record, 30);
  return record;
}

export async function saveGeneratedMindmap(record: MindmapRecord): Promise<MindmapRecord> {
  await appendLimited('generatedMindmaps', record, 30);
  return record;
}

export async function saveHarnessPatch(patch: HarnessPatch): Promise<HarnessPatch> {
  await appendLimited('harnessPatches', patch, 20);
  return patch;
}

export async function savePipelineRun(trace: ContentPipelineTrace): Promise<ContentPipelineTrace> {
  await appendLimited('pipelineRuns', trace, 60);
  return trace;
}

export async function getContextSnippetsByIds(ids: string[]): Promise<ContextSnippet[]> {
  if (ids.length === 0) return [];
  const snippets = await readStorage('contextSnippets');
  const lookup = new Set(ids);
  return snippets.filter((snippet) => lookup.has(snippet.id));
}

export async function getArchiveNotesByIds(ids: string[]): Promise<ArchiveNote[]> {
  if (ids.length === 0) return [];
  const notes = await readStorage('archiveNotes');
  const lookup = new Set(ids);
  return notes.filter((note) => lookup.has(note.id));
}

export async function getFeedbackLog(limit = 60): Promise<FeedbackRecord[]> {
  const log = await readStorage('feedbackLog');
  return log.slice(0, limit);
}

export async function getArtifactHistory(limit = 30): Promise<ProductArtifact[]> {
  const artifacts = await readStorage('artifactHistory');
  return artifacts.slice(0, limit);
}

export async function getHarnessPatches(limit = 20): Promise<HarnessPatch[]> {
  const patches = await readStorage('harnessPatches');
  return patches.slice(0, limit);
}

/** 读取有效（未拒绝）的 harness 补丁——这些会被注入 gadget 的 system prompt。 */
export async function getActiveHarnessPatches(): Promise<HarnessPatch[]> {
  const patches = await readStorage('harnessPatches');
  return patches.filter((p) => p.status !== 'rejected');
}

/** 把指定补丁标记为已应用（status → applied，记录 appliedAt）。闭环消费的收尾。 */
export async function markHarnessPatchesApplied(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const patches = await readStorage('harnessPatches');
  const idSet = new Set(ids);
  const now = Date.now();
  const next = patches.map((p) => (idSet.has(p.id) ? { ...p, status: 'applied' as const, appliedAt: now } : p));
  await writeStorage('harnessPatches', next);
}

export async function getArchiveNotes(limit = 40): Promise<ArchiveNote[]> {
  const notes = await readStorage('archiveNotes');
  return notes.slice(0, limit);
}

export async function getPageContexts(limit = 10): Promise<PageContextRecord[]> {
  const contexts = await readStorage('pageContexts');
  return contexts.slice(0, limit);
}

export async function getMemoryCandidates(limit = 60): Promise<MemoryCandidate[]> {
  const candidates = await readStorage('memoryCandidates');
  return candidates.slice(0, limit);
}

export async function getApprovedMemories(limit = 60): Promise<ApprovedMemory[]> {
  const memories = await readStorage('approvedMemories');
  return memories.slice(0, limit);
}

export async function getGeneratedImages(limit = 30): Promise<GeneratedImageRecord[]> {
  const images = await readStorage('generatedImages');
  return images.slice(0, limit);
}

export async function getGeneratedMindmaps(limit = 30): Promise<MindmapRecord[]> {
  const maps = await readStorage('generatedMindmaps');
  return maps.slice(0, limit);
}

export async function getMemorySummary(): Promise<MemorySummary> {
  const snapshot = await readStorageSnapshot();

  return {
    profile: snapshot.profile,
    recentContextSnippets: snapshot.contextSnippets.slice(0, 3),
    recentPageContexts: snapshot.pageContexts.slice(0, 5),
    recentIdeas: snapshot.ideaHistory.slice(0, 5),
    recentArtifacts: snapshot.artifactHistory.slice(0, 5),
    recentFeedback: snapshot.feedbackLog.slice(0, 5),
    archiveNotes: snapshot.archiveNotes.slice(0, 20),
    memoryCandidates: snapshot.memoryCandidates.slice(0, 20),
    approvedMemories: snapshot.approvedMemories.slice(0, 20),
    profileHistory: snapshot.profileHistory.slice(0, 10),
    stateBackups: snapshot.stateBackups.slice(0, 5),
    harnessPatches: snapshot.harnessPatches.slice(0, 20),
    pipelineRuns: snapshot.pipelineRuns.slice(0, 10),
    generatedImages: snapshot.generatedImages.slice(0, 10),
    generatedMindmaps: snapshot.generatedMindmaps.slice(0, 10),
    pendingPatches: snapshot.harnessPatches.filter((item) => item.status === 'pending').slice(0, 3),
    counts: {
      ideas: snapshot.ideaHistory.length,
      artifacts: snapshot.artifactHistory.length,
      feedback: snapshot.feedbackLog.length,
      pageContexts: snapshot.pageContexts.length,
      notes: snapshot.archiveNotes.length,
      memoryCandidates: snapshot.memoryCandidates.length,
      approvedMemories: snapshot.approvedMemories.length,
      profileChanges: snapshot.profileHistory.length,
      backups: snapshot.stateBackups.length,
      pipelineRuns: snapshot.pipelineRuns.length,
      images: snapshot.generatedImages.length,
      mindmaps: snapshot.generatedMindmaps.length,
    },
  };
}

export async function approveMemoryCandidate(candidateId: string): Promise<MemoryCandidate> {
  const candidates = await readStorage('memoryCandidates');
  const target = candidates.find((candidate) => candidate.id === candidateId);
  if (!target) throw new Error(`memoryCandidates 中找不到 ${candidateId}`);

  await replaceArrayItem('memoryCandidates', candidateId, (candidate) => ({
    ...candidate,
    status: 'approved' as const,
  }));

  return {
    ...target,
    status: 'approved' as const,
  };
}

export async function rejectMemoryCandidate(candidateId: string): Promise<MemoryCandidate> {
  const candidates = await readStorage('memoryCandidates');
  const target = candidates.find((candidate) => candidate.id === candidateId);
  if (!target) throw new Error(`memoryCandidates 中找不到 ${candidateId}`);

  await replaceArrayItem('memoryCandidates', candidateId, (candidate) => ({
    ...candidate,
    status: 'rejected' as const,
  }));

  return {
    ...target,
    status: 'rejected' as const,
  };
}

export async function convertCandidateToApprovedMemory(candidateId: string): Promise<ApprovedMemory> {
  const candidates = await readStorage('memoryCandidates');
  const target = candidates.find((candidate) => candidate.id === candidateId);
  if (!target) throw new Error(`memoryCandidates 中找不到 ${candidateId}`);

  const approved = createApprovedMemory({
    ...target,
    status: 'approved',
  });

  await saveApprovedMemory(approved);
  return approved;
}

export async function deleteMemory(scope: keyof StorageSchema | 'all'): Promise<MemorySummary> {
  await resetStorageScope(scope);
  return getMemorySummary();
}

export async function deleteArchiveNote(noteId: string): Promise<MemorySummary> {
  await removeById('archiveNotes', noteId);
  return getMemorySummary();
}

export async function clearArchiveNotes(): Promise<MemorySummary> {
  await clearArrayStorage('archiveNotes');
  return getMemorySummary();
}

export async function deleteMemoryCandidate(candidateId: string): Promise<MemorySummary> {
  await removeById('memoryCandidates', candidateId);
  return getMemorySummary();
}

export async function clearMemoryCandidates(): Promise<MemorySummary> {
  await clearArrayStorage('memoryCandidates');
  return getMemorySummary();
}

export async function deleteApprovedMemory(memoryId: string): Promise<MemorySummary> {
  await removeById('approvedMemories', memoryId);
  return getMemorySummary();
}

export async function clearApprovedMemories(): Promise<MemorySummary> {
  await clearArrayStorage('approvedMemories');
  return getMemorySummary();
}

export async function deleteGeneratedImage(imageId: string): Promise<MemorySummary> {
  await removeById('generatedImages', imageId);
  return getMemorySummary();
}

export async function deleteGeneratedMindmap(mindmapId: string): Promise<MemorySummary> {
  await removeById('generatedMindmaps', mindmapId);
  return getMemorySummary();
}

export async function clearGeneratedImages(): Promise<MemorySummary> {
  await clearArrayStorage('generatedImages');
  return getMemorySummary();
}

export async function clearGeneratedMindmaps(): Promise<MemorySummary> {
  await clearArrayStorage('generatedMindmaps');
  return getMemorySummary();
}
