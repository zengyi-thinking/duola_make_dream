import type {
  ArchiveNoteListResult,
  ArchiveNoteSaveResult,
  ContextCaptureResult,
  FeedbackAction,
  FeedbackRecordResult,
  IdeaSubmitResult,
  ImageGenerationResult,
  MemoryCandidateMutationResult,
  MemorySummary,
  MindmapGenerationResult,
  PageAnalyzeResponse,
  PageAnalysisResult,
  PageContextRecord,
  PageReadResponse,
  PageReadResult,
} from '@/lib/agent/types';
import type { ImageGenerationSourceType, ImageGenerationStyle } from '@/lib/image/types';
import type { MindmapRecord } from '@/lib/mindmap/types';

export type MessageSource = 'popup' | 'content' | 'background';

export type ExtensionMessageType =
  | 'idea.submit'
  | 'feedback.record'
  | 'memory.get'
  | 'memory.delete'
  | 'context.captureSelection'
  | 'page.readCurrent'
  | 'page.analyzeCurrent'
  | 'archive.note.save'
  | 'archive.note.list'
  | 'archive.note.delete'
  | 'archive.note.clear'
  | 'image.generate'
  | 'image.list'
  | 'image.delete'
  | 'mindmap.generate'
  | 'mindmap.list'
  | 'mindmap.delete'
  | 'memory.candidate.approve'
  | 'memory.candidate.reject'
  | 'memory.candidate.list'
  | 'memory.candidate.delete';

export type MessageType = ExtensionMessageType;

export type InternalContentMessageType =
  | 'content.page.extract-current'
  | 'content.page.extract-selection';

interface MessageEnvelope<TType extends ExtensionMessageType, TPayload> {
  type: TType;
  requestId: string;
  source: MessageSource;
  payload: TPayload;
}

export type MemoryDeleteScope =
  | 'all'
  | 'profile'
  | 'ideaHistory'
  | 'artifactHistory'
  | 'feedbackLog'
  | 'contextSnippets'
  | 'pageContexts'
  | 'archiveNotes'
  | 'memoryCandidates'
  | 'approvedMemories'
  | 'generatedImages'
  | 'generatedMindmaps'
  | 'harnessPatches';

export type IdeaSubmitRequest = MessageEnvelope<
  'idea.submit',
  {
    text: string;
    selectedContextIds: string[];
    selectedArchiveNoteIds: string[];
  }
>;

export type FeedbackRecordRequest = MessageEnvelope<
  'feedback.record',
  {
    artifactId: string;
    action: FeedbackAction;
  }
>;

export type MemoryGetRequest = MessageEnvelope<'memory.get', Record<string, never>>;

export type MemoryDeleteRequest = MessageEnvelope<
  'memory.delete',
  {
    scope: MemoryDeleteScope;
    id?: string;
  }
>;

export type ContextCaptureSelectionRequest = MessageEnvelope<
  'context.captureSelection',
  {
    origin: string;
    pageTitle: string;
    selectedText: string;
  }
>;

export type PageReadCurrentRequest = MessageEnvelope<
  'page.readCurrent',
  {
    mode?: 'current-page' | 'study-archive';
  }
>;

export type PageAnalyzeCurrentRequest = MessageEnvelope<
  'page.analyzeCurrent',
  {
    mode?: 'current-page' | 'study-archive';
  }
>;

export type ArchiveNoteSaveRequest = MessageEnvelope<
  'archive.note.save',
  {
    analysis: PageAnalysisResult;
    sourceContext: PageContextRecord;
  }
>;

export type ArchiveNoteListRequest = MessageEnvelope<'archive.note.list', Record<string, never>>;

export type ArchiveNoteDeleteRequest = MessageEnvelope<
  'archive.note.delete',
  {
    noteId: string;
  }
>;

export type ArchiveNoteClearRequest = MessageEnvelope<'archive.note.clear', Record<string, never>>;

export type ImageGenerateRequest = MessageEnvelope<
  'image.generate',
  {
    sourceType: ImageGenerationSourceType;
    title: string;
    content: string;
    style: ImageGenerationStyle;
    relatedNoteId?: string;
  }
>;

export type ImageListRequest = MessageEnvelope<'image.list', Record<string, never>>;

export type ImageDeleteRequest = MessageEnvelope<
  'image.delete',
  {
    imageId: string;
  }
>;

export type MindmapGenerateRequest = MessageEnvelope<
  'mindmap.generate',
  {
    sourceId: string;
    sourceType: 'paper' | 'article' | 'idea';
    title: string;
    content: string;
    noteId?: string;
  }
>;

export type MindmapListRequest = MessageEnvelope<'mindmap.list', Record<string, never>>;

export type MindmapDeleteRequest = MessageEnvelope<
  'mindmap.delete',
  {
    mindmapId: string;
  }
>;

export type MemoryCandidateApproveRequest = MessageEnvelope<
  'memory.candidate.approve',
  {
    candidateId: string;
  }
>;

export type MemoryCandidateRejectRequest = MessageEnvelope<
  'memory.candidate.reject',
  {
    candidateId: string;
  }
>;

export type MemoryCandidateListRequest = MessageEnvelope<'memory.candidate.list', Record<string, never>>;

export type MemoryCandidateDeleteRequest = MessageEnvelope<
  'memory.candidate.delete',
  {
    candidateId: string;
  }
>;

export type AppMessage =
  | IdeaSubmitRequest
  | FeedbackRecordRequest
  | MemoryGetRequest
  | MemoryDeleteRequest
  | ContextCaptureSelectionRequest
  | PageReadCurrentRequest
  | PageAnalyzeCurrentRequest
  | ArchiveNoteSaveRequest
  | ArchiveNoteListRequest
  | ArchiveNoteDeleteRequest
  | ArchiveNoteClearRequest
  | ImageGenerateRequest
  | ImageListRequest
  | ImageDeleteRequest
  | MindmapGenerateRequest
  | MindmapListRequest
  | MindmapDeleteRequest
  | MemoryCandidateApproveRequest
  | MemoryCandidateRejectRequest
  | MemoryCandidateListRequest
  | MemoryCandidateDeleteRequest;

export type InternalExtractCurrentMessage = {
  type: 'content.page.extract-current';
  mode: 'current-page' | 'study-archive';
};

export type InternalExtractSelectionMessage = {
  type: 'content.page.extract-selection';
};

export type InternalContentMessage =
  | InternalExtractCurrentMessage
  | InternalExtractSelectionMessage;

export type InternalContentResponseMap = {
  'content.page.extract-current': PageReadResult;
  'content.page.extract-selection': PageReadResult;
};

interface ResponseEnvelope<TType extends ExtensionMessageType, TPayload> {
  type: TType;
  requestId: string;
  source: 'background';
  success: boolean;
  payload: TPayload;
  error?: string;
}

export type MessageResponseMap = {
  'idea.submit': ResponseEnvelope<'idea.submit', IdeaSubmitResult>;
  'feedback.record': ResponseEnvelope<'feedback.record', FeedbackRecordResult>;
  'memory.get': ResponseEnvelope<'memory.get', MemorySummary>;
  'memory.delete': ResponseEnvelope<'memory.delete', MemorySummary>;
  'context.captureSelection': ResponseEnvelope<'context.captureSelection', ContextCaptureResult>;
  'page.readCurrent': ResponseEnvelope<'page.readCurrent', PageReadResponse>;
  'page.analyzeCurrent': ResponseEnvelope<'page.analyzeCurrent', PageAnalyzeResponse>;
  'archive.note.save': ResponseEnvelope<'archive.note.save', ArchiveNoteSaveResult>;
  'archive.note.list': ResponseEnvelope<'archive.note.list', ArchiveNoteListResult>;
  'archive.note.delete': ResponseEnvelope<'archive.note.delete', MemorySummary>;
  'archive.note.clear': ResponseEnvelope<'archive.note.clear', MemorySummary>;
  'image.generate': ResponseEnvelope<'image.generate', ImageGenerationResult>;
  'image.list': ResponseEnvelope<'image.list', { records: import('@/lib/image/types').GeneratedImageRecord[]; memorySummary: MemorySummary }>;
  'image.delete': ResponseEnvelope<'image.delete', MemorySummary>;
  'mindmap.generate': ResponseEnvelope<'mindmap.generate', MindmapGenerationResult>;
  'mindmap.list': ResponseEnvelope<'mindmap.list', { records: MindmapRecord[]; memorySummary: MemorySummary }>;
  'mindmap.delete': ResponseEnvelope<'mindmap.delete', MemorySummary>;
  'memory.candidate.approve': ResponseEnvelope<'memory.candidate.approve', MemoryCandidateMutationResult>;
  'memory.candidate.reject': ResponseEnvelope<'memory.candidate.reject', MemoryCandidateMutationResult>;
  'memory.candidate.list': ResponseEnvelope<'memory.candidate.list', { candidates: import('@/lib/agent/types').MemoryCandidate[]; memorySummary: MemorySummary }>;
  'memory.candidate.delete': ResponseEnvelope<'memory.candidate.delete', MemorySummary>;
};

export type AppMessageResponse = MessageResponseMap[ExtensionMessageType];
