import type {
  GeneratedImageRecord,
  ImageGenerationRequest,
  ImageGenerationSourceType,
  ImageGenerationStyle,
} from '@/lib/image/types';
import type { PocketAvatarId } from '@/lib/brand/avatars';
import type { MindmapRecord, MindmapResult } from '@/lib/mindmap/types';
import type {
  PageAnalysisResult,
  PageContextRecord,
  PageReadMode,
  PageReadResult,
  PageType,
} from '@/lib/page/types';

export type { ImageGenerationRequest, ImageGenerationSourceType, ImageGenerationStyle } from '@/lib/image/types';
export type { MindmapNode, MindmapRecord, MindmapResult } from '@/lib/mindmap/types';
export type { PageAnalysisResult, PageContextRecord, PageReadMode, PageReadResult, PageType } from '@/lib/page/types';

export type PocketBuddyMood = 'idle' | 'warm' | 'thinking' | 'spark';

export type AgentIntent =
  | 'browser-extension'
  | 'productivity-tool'
  | 'creator-tool'
  | 'learning-tool'
  | 'playful-tool';

export type IdeaSource = 'popup' | 'selection';

export type FeedbackAction =
  | 'more-minimal'
  | 'cuter'
  | 'more-productized'
  | 'more-tech'
  | 'dislike-direction';

export type ProfileHistorySource =
  | 'init'
  | 'idea'
  | 'feedback'
  | 'memory-approval'
  | 'manual';

export type HarnessPatchTarget =
  | 'prompt'
  | 'tool-router'
  | 'memory-rule'
  | 'ui-copy'
  | 'core-code';

export type HarnessPatchRisk = 'low' | 'medium' | 'high';
export type HarnessPatchStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export interface HarnessPatch {
  id: string;
  target: HarnessPatchTarget;
  scope: 'runtime-config' | 'source-code';
  reason: string;
  before: string;
  after: string;
  riskLevel: HarnessPatchRisk;
  requireUserApproval: boolean;
  status: HarnessPatchStatus;
  createdAt: number;
  rollbackSnapshotId?: string;
}

export interface ContextSnippet {
  id: string;
  origin: string;
  pageTitle: string;
  selectedText: string;
  source: 'content';
  createdAt: number;
}

export interface IdeaRecord {
  id: string;
  rawInput: string;
  source: IdeaSource;
  selectedContextIds: string[];
  selectedArchiveNoteIds: string[];
  createdAt: number;
}

export interface ProductConcept {
  name: string;
  tagline: string;
  positioning: string;
  coreProblem: string;
  targetUser: string;
  valueProposition: string;
  features: string[];
  visualDirection: string[];
}

export interface ProductArtifact {
  id: string;
  ideaId: string;
  intent: AgentIntent;
  concept: ProductConcept;
  imagePrompt: string;
  mvpPlan: string[];
  nextTasks: string[];
  appliedGadgets: string[];
  selectedContextIds: string[];
  selectedArchiveNoteIds: string[];
  createdAt: number;
}

export interface FeedbackRecord {
  id: string;
  artifactId: string;
  action: FeedbackAction;
  createdAt: number;
}

export interface UserProfile {
  visualLikes: string[];
  visualDislikes: string[];
  tonePreference: string;
  productPreferences: string[];
  recentThemes: string[];
  lastUpdated: number;
}

export interface ProfileHistoryEntry {
  id: string;
  source: ProfileHistorySource;
  profile: UserProfile;
  createdAt: number;
}

export type MemoryCandidateCategory = 'interest' | 'project-link' | 'topic' | 'style' | 'knowledge';
export type MemoryCandidateSourceType = 'paper' | 'article' | 'idea';

export type MemoryCandidate = {
  id: string;
  sourceType: MemoryCandidateSourceType;
  category: MemoryCandidateCategory;
  title: string;
  content: string;
  reason: string;
  relatedNoteId?: string;
  relatedContextId?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
};

export type ApprovedMemory = {
  id: string;
  category: MemoryCandidateCategory;
  title: string;
  content: string;
  sourceType: MemoryCandidateSourceType;
  reason: string;
  relatedNoteId?: string;
  relatedContextId?: string;
  createdAt: number;
};

export type ArchiveNote = {
  id: string;
  sourceType: 'paper' | 'article' | 'idea';
  title: string;
  sourceTitle: string;
  origin: string;
  summary: string;
  bullets: string[];
  tags: string[];
  createdAt: number;
  savedByUser: boolean;
  relatedContextIds: string[];
};

export interface RuntimeConfig {
  agentName: string;
  defaultTone: string;
  avatarId: PocketAvatarId;
  maxSelectionChars: number;
  maxMainTextChars: number;
  maxPageExcerptChars: number;
  futurePermissionMode: 'all_urls-dev' | 'activeTab-ready';

  // LLM 配置
  llmProvider: 'mock' | 'minimax' | 'anthropic' | 'custom';
  llmModel: string;
  llmApiKey: string;
  llmEndpoint: string;

  // 图片生成配置
  imageMode: 'mock' | 'proxy';
  imageModel: string;
  imageProxyEndpoint: string;
  imageApiKey: string;
}

export interface MemorySummary {
  profile: UserProfile;
  recentContextSnippets: ContextSnippet[];
  recentPageContexts: PageContextRecord[];
  recentIdeas: IdeaRecord[];
  recentArtifacts: ProductArtifact[];
  recentFeedback: FeedbackRecord[];
  archiveNotes: ArchiveNote[];
  memoryCandidates: MemoryCandidate[];
  approvedMemories: ApprovedMemory[];
  profileHistory: ProfileHistoryEntry[];
  stateBackups: import('@/lib/storage/schema').StateBackup[];
  harnessPatches: HarnessPatch[];
  generatedImages: GeneratedImageRecord[];
  generatedMindmaps: MindmapRecord[];
  pendingPatches: HarnessPatch[];
  counts: {
    ideas: number;
    artifacts: number;
    feedback: number;
    pageContexts: number;
    notes: number;
    memoryCandidates: number;
    approvedMemories: number;
    profileChanges: number;
    backups: number;
    images: number;
    mindmaps: number;
  };
}

export interface IdeaSubmitResult {
  artifact: ProductArtifact;
  assistantSummary: string;
  memorySummary: MemorySummary;
}

export interface ContextCaptureResult {
  snippet: ContextSnippet;
  memorySummary: MemorySummary;
}

export interface FeedbackRecordResult {
  feedback: FeedbackRecord;
  memorySummary: MemorySummary;
}

export interface PageReadResponse {
  page: PageReadResult;
  savedContext: PageContextRecord;
  memorySummary: MemorySummary;
}

export interface PageAnalyzeResponse {
  page: PageReadResult;
  savedContext: PageContextRecord;
  analysis: PageAnalysisResult;
  memorySummary: MemorySummary;
}

export interface ArchiveNoteSaveResult {
  note: ArchiveNote;
  memorySummary: MemorySummary;
}

export interface ArchiveNoteListResult {
  notes: ArchiveNote[];
  memorySummary: MemorySummary;
}

export interface ArtifactListResult {
  records: ProductArtifact[];
  memorySummary: MemorySummary;
}

export interface MemoryCandidateMutationResult {
  candidate: MemoryCandidate;
  approvedMemory?: ApprovedMemory;
  memorySummary: MemorySummary;
}

export interface ImageGenerationResult {
  request: ImageGenerationRequest;
  record: GeneratedImageRecord;
  memorySummary: MemorySummary;
}

export interface MindmapGenerationResult {
  record: MindmapRecord;
  memorySummary: MemorySummary;
}
