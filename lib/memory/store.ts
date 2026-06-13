import type {
  ContextSnippet,
  FeedbackRecord,
  HarnessPatch,
  IdeaRecord,
  MemorySummary,
  ProductArtifact,
  UserProfile,
} from '@/lib/agent/types';
import { appendLimited, readStorage, readStorageSnapshot, resetStorageScope, writeStorage } from '@/lib/storage/local';
import type { StorageSchema } from '@/lib/storage/schema';
import { createProfile } from './profile';

export async function ensureProfile(): Promise<UserProfile> {
  const profile = await readStorage('profile');
  if (profile) return profile;

  const next = createProfile();
  await writeStorage('profile', next);
  return next;
}

export async function saveProfile(profile: UserProfile): Promise<UserProfile> {
  await writeStorage('profile', profile);
  return profile;
}

export async function saveIdea(idea: IdeaRecord): Promise<IdeaRecord> {
  await appendLimited('ideaHistory', idea, 30);
  return idea;
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

export async function saveHarnessPatch(patch: HarnessPatch): Promise<HarnessPatch> {
  await appendLimited('harnessPatches', patch, 20);
  return patch;
}

export async function getLatestContextSnippet(): Promise<ContextSnippet | undefined> {
  const snippets = await readStorage('contextSnippets');
  return snippets[0];
}

export async function getContextSnippetsByIds(ids: string[]): Promise<ContextSnippet[]> {
  if (ids.length === 0) return [];

  const snippets = await readStorage('contextSnippets');
  const lookup = new Set(ids);
  return snippets.filter((snippet) => lookup.has(snippet.id));
}

export async function getFeedbackLog(limit = 60): Promise<FeedbackRecord[]> {
  const log = await readStorage('feedbackLog');
  return log.slice(0, limit);
}

export async function getHarnessPatches(limit = 20): Promise<HarnessPatch[]> {
  const patches = await readStorage('harnessPatches');
  return patches.slice(0, limit);
}

export async function getMemorySummary(): Promise<MemorySummary> {
  const snapshot = await readStorageSnapshot();

  return {
    profile: snapshot.profile,
    recentContextSnippets: snapshot.contextSnippets.slice(0, 3),
    pendingPatches: snapshot.harnessPatches.filter((item) => item.status === 'pending').slice(0, 3),
    counts: {
      ideas: snapshot.ideaHistory.length,
      artifacts: snapshot.artifactHistory.length,
      feedback: snapshot.feedbackLog.length,
    },
  };
}

export async function deleteMemory(scope: keyof StorageSchema | 'all'): Promise<MemorySummary> {
  await resetStorageScope(scope);
  return getMemorySummary();
}
