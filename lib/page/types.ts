import type { ContentPipelineTrace, MemoryCandidate } from '@/lib/agent/types';

export type PageType = 'paper' | 'article' | 'generic';
export type PageReadMode = 'selection' | 'current-page' | 'study-archive';

export type PageReadResult = {
  id: string;
  mode: PageReadMode;
  origin: string;
  pageTitle: string;
  pageType: PageType;
  selectedText?: string;
  headings?: string[];
  mainText?: string;
  visibleTextSummary?: string;
  textExcerpt?: string;
  createdAt: number;
};

export type PageContextRecord = {
  id: string;
  origin: string;
  pageTitle: string;
  pageType: PageType;
  headings: string[];
  visibleTextSummary: string;
  textExcerpt: string;
  createdAt: number;
};

export type PageAnalysisResult = {
  id: string;
  sourceContextId: string;
  pageType: PageType;
  pageSummary: string;
  keyIdeas: string[];
  keyTakeaways: string[];
  usefulForCurrentIdea: string[];
  productOpportunities: string[];
  noteCard: {
    title: string;
    summary: string;
    bullets: string[];
    tags: string[];
  };
  paperInsights?: {
    problem: string;
    method: string;
    contribution: string;
    conclusion: string;
    relationToMyProjects: string[];
  };
  memoryCandidates: MemoryCandidate[];
  pipelineTrace: ContentPipelineTrace;
  createdAt: number;
};
