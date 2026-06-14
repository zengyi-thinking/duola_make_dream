import type {
  ApprovedMemory,
  ArchiveNote,
  ContextSnippet,
  ContentPipelineTrace,
  ExperienceRecord,
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
import type { GraphView } from '@/lib/graph/types';
import type { SkillDefinition } from '@/lib/skills/types';
import type { ToolDefinition } from '@/lib/tools/types';
import bundledRuntimeConfigJson from '../../config/bundled-runtime-config.json';
import localRuntimeConfigJson from '../../config/local-runtime-config.json';

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
  graphViews: 'graphViews',
  skillRegistry: 'skillRegistry',
  toolRegistry: 'toolRegistry',
  experienceRecords: 'experienceRecords',
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
  graphViews: GraphView[];
  skillRegistry: SkillDefinition[];
  toolRegistry: ToolDefinition[];
  experienceRecords: ExperienceRecord[];
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
  creativeBrief: '',
  lastUpdated: Date.now(),
};

export function createBundledRuntimeConfig(): RuntimeConfig {
  const bundled = bundledRuntimeConfigJson as RuntimeConfig;
  const local = localRuntimeConfigJson as LocalRuntimeConfig;
  return {
    ...bundled,
    llmProfiles: (bundled.llmProfiles ?? []).map((p) => mergeLocalProfile(p, local.llm)),
    imageProfiles: (bundled.imageProfiles ?? []).map((p) => mergeLocalProfile(p, local.image)),
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
    graphViews: [],
    skillRegistry: [],
    toolRegistry: [],
    experienceRecords: [],
    runtimeConfig: createBundledRuntimeConfig(),
  };
}

interface LocalProfile {
  apiKey?: string;
  endpoint?: string;
  model?: string;
}
interface LocalRuntimeConfig {
  llm?: LocalProfile;
  image?: LocalProfile;
}

/**
 * 合并 env 注入的本地凭据（config/local-runtime-config.json，gitignore）到 bundled profile。
 * apiKey/endpoint/model 非空则覆盖；本地副本由 scripts/inject-dev-config.mjs 从 .env 生成。
 * 合并顺序：bundled 默认 → 本地副本(env) → 用户 storage（后者覆盖前者，在 normalizeRuntimeConfig）。
 */
function mergeLocalProfile(profile: ModelProfile, local: LocalProfile | undefined): ModelProfile {
  const merged = { ...profile };
  if (!local) return merged;
  if (local.apiKey) merged.apiKey = local.apiKey;
  if (local.endpoint) merged.endpoint = local.endpoint;
  if (local.model) merged.model = local.model;
  return merged;
}
