export type PocketBuddyMood = 'idle' | 'warm' | 'thinking' | 'spark';

export type AgentIntent = 'browser-extension' | 'productivity-tool' | 'creator-tool' | 'learning-tool' | 'playful-tool';

export type IdeaSource = 'popup' | 'selection';

export type FeedbackAction =
  | 'more-minimal'
  | 'cuter'
  | 'more-productized'
  | 'more-tech'
  | 'dislike-direction';

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
  contextSnippetId?: string;
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
  contextSnippetId?: string;
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

export interface RuntimeConfig {
  agentName: string;
  defaultTone: string;
  maxSelectionChars: number;
  futurePermissionMode: 'all_urls-dev' | 'activeTab-ready';
}

export interface MemorySummary {
  profile: UserProfile;
  recentContextSnippets: ContextSnippet[];
  pendingPatches: HarnessPatch[];
  counts: {
    ideas: number;
    artifacts: number;
    feedback: number;
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
