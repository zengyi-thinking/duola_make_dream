import type {
  ApprovedMemory,
  ArchiveNote,
  ContextSnippet,
  ContentPipelineTrace,
  FeedbackRecord,
  HarnessPatch,
  IdeaRecord,
  MemoryCandidate,
  ModelProfile,
  ProfileHistoryEntry,
  ProductArtifact,
  RuntimeConfig,
  UserProfile,
} from '@/lib/agent/types';
import type { GeneratedImageRecord } from '@/lib/image/types';
import type { MindmapRecord } from '@/lib/mindmap/types';
import type { PageContextRecord } from '@/lib/page/types';
import bundledRuntimeConfigJson from '../../config/bundled-runtime-config.json';

export const STORAGE_KEYS = {
  profile: 'profile',
  profileHistory: 'profileHistory',
  ideaHistory: 'ideaHistory',
  artifactHistory: 'artifactHistory',
  feedbackLog: 'feedbackLog',
  contextSnippets: 'contextSnippets',
  pageContexts: 'pageContexts',
  archiveNotes: 'archiveNotes',
  memoryCandidates: 'memoryCandidates',
  approvedMemories: 'approvedMemories',
  generatedImages: 'generatedImages',
  generatedMindmaps: 'generatedMindmaps',
  harnessPatches: 'harnessPatches',
  pipelineRuns: 'pipelineRuns',
  stateBackups: 'stateBackups',
  runtimeConfig: 'runtimeConfig',
} as const;

export interface StorageSnapshot {
  profile: UserProfile;
  profileHistory: ProfileHistoryEntry[];
  ideaHistory: IdeaRecord[];
  artifactHistory: ProductArtifact[];
  feedbackLog: FeedbackRecord[];
  contextSnippets: ContextSnippet[];
  pageContexts: PageContextRecord[];
  archiveNotes: ArchiveNote[];
  memoryCandidates: MemoryCandidate[];
  approvedMemories: ApprovedMemory[];
  generatedImages: GeneratedImageRecord[];
  generatedMindmaps: MindmapRecord[];
  harnessPatches: HarnessPatch[];
  pipelineRuns: ContentPipelineTrace[];
  runtimeConfig: RuntimeConfig;
}

export interface StateBackup {
  id: string;
  label: string;
  createdAt: number;
  snapshot: StorageSnapshot;
}

export interface StorageSchema extends StorageSnapshot {
  stateBackups: StateBackup[];
}

export const DEFAULT_PROFILE: UserProfile = {
  visualLikes: ['蓝白线条', '口袋感', '轻陪伴'],
  visualDislikes: [],
  tonePreference: '温暖、直接、产品化',
  productPreferences: ['轻量工具', '浏览器插件'],
  recentThemes: [],
  lastUpdated: Date.now(),
};

export function createBundledRuntimeConfig(): RuntimeConfig {
  const bundled = bundledRuntimeConfigJson as RuntimeConfig;
  return {
    ...bundled,
    llmProfiles: (bundled.llmProfiles ?? []).map(cloneModelProfile),
    imageProfiles: (bundled.imageProfiles ?? []).map(cloneModelProfile),
  };
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = createBundledRuntimeConfig();

export function createDefaultStorageState(): StorageSchema {
  return {
    profile: { ...DEFAULT_PROFILE, lastUpdated: Date.now() },
    profileHistory: [],
    ideaHistory: [],
    artifactHistory: [],
    feedbackLog: [],
    contextSnippets: [],
    pageContexts: [],
    archiveNotes: [],
    memoryCandidates: [],
    approvedMemories: [],
    generatedImages: [],
    generatedMindmaps: [],
    harnessPatches: [],
    pipelineRuns: [],
    stateBackups: [],
    runtimeConfig: createBundledRuntimeConfig(),
  };
}

function cloneModelProfile(profile: ModelProfile): ModelProfile {
  return { ...profile };
}
