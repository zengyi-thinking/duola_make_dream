import type {
  ContextCaptureResult,
  FeedbackAction,
  FeedbackRecordResult,
  IdeaSubmitResult,
  MemorySummary,
} from '@/lib/agent/types';

export type MessageSource = 'popup' | 'content' | 'background';

export type MessageType =
  | 'idea.submit'
  | 'feedback.record'
  | 'memory.get'
  | 'memory.delete'
  | 'context.captureSelection';

interface MessageEnvelope<TType extends MessageType, TPayload> {
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
  | 'harnessPatches';

export type IdeaSubmitRequest = MessageEnvelope<
  'idea.submit',
  {
    text: string;
    selectedContextIds: string[];
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

export type AppMessage =
  | IdeaSubmitRequest
  | FeedbackRecordRequest
  | MemoryGetRequest
  | MemoryDeleteRequest
  | ContextCaptureSelectionRequest;

interface ResponseEnvelope<TType extends MessageType, TPayload> {
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
};

export type AppMessageResponse = MessageResponseMap[MessageType];
