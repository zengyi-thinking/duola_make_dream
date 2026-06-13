import type {
  ContextSnippet,
  FeedbackRecord,
  HarnessPatch,
  IdeaRecord,
  ProductArtifact,
  RuntimeConfig,
  UserProfile,
} from '@/lib/agent/types';

export const STORAGE_KEYS = {
  profile: 'profile',
  ideaHistory: 'ideaHistory',
  artifactHistory: 'artifactHistory',
  feedbackLog: 'feedbackLog',
  contextSnippets: 'contextSnippets',
  harnessPatches: 'harnessPatches',
  runtimeConfig: 'runtimeConfig',
} as const;

export interface StorageSchema {
  profile: UserProfile;
  ideaHistory: IdeaRecord[];
  artifactHistory: ProductArtifact[];
  feedbackLog: FeedbackRecord[];
  contextSnippets: ContextSnippet[];
  harnessPatches: HarnessPatch[];
  runtimeConfig: RuntimeConfig;
}

export const DEFAULT_PROFILE: UserProfile = {
  visualLikes: ['蓝白线条', '口袋感', '轻陪伴'],
  visualDislikes: [],
  tonePreference: '温暖、直接、产品化',
  productPreferences: ['轻量工具', '浏览器插件'],
  recentThemes: [],
  lastUpdated: Date.now(),
};

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  agentName: 'PocketAgent',
  defaultTone: 'warm-product-designer',
  maxSelectionChars: 280,
  futurePermissionMode: 'all_urls-dev',
};

export function createDefaultStorageState(): StorageSchema {
  return {
    profile: { ...DEFAULT_PROFILE, lastUpdated: Date.now() },
    ideaHistory: [],
    artifactHistory: [],
    feedbackLog: [],
    contextSnippets: [],
    harnessPatches: [],
    runtimeConfig: { ...DEFAULT_RUNTIME_CONFIG },
  };
}
