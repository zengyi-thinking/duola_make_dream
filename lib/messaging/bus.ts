import { browser } from 'wxt/browser';
import type {
  AppMessage,
  AppMessageResponse,
  ArchiveNoteClearRequest,
  ArchiveNoteListRequest,
  ArchiveNoteDeleteRequest,
  ArchiveNoteSaveRequest,
  ArtifactListRequest,
  ContextCaptureSelectionRequest,
  FeedbackRecordRequest,
  IdeaSubmitRequest,
  ImageListRequest,
  ImageDeleteRequest,
  ImageGenerateRequest,
  InternalContentMessage,
  InternalContentResponseMap,
  MemoryCandidateListRequest,
  MemoryCandidateApproveRequest,
  MemoryCandidateDeleteRequest,
  MemoryCandidateRejectRequest,
  MemoryDeleteRequest,
  MemoryGetRequest,
  MessageResponseMap,
  MessageSource,
  MessageType,
  MindmapListRequest,
  MindmapDeleteRequest,
  MindmapGenerateRequest,
  PageAnalyzeCurrentRequest,
  PageReadCurrentRequest,
} from './types';

function createRequestId(type: MessageType): string {
  return `${type}-${crypto.randomUUID()}`;
}

async function sendRuntimeMessage<T extends AppMessage>(
  message: T,
): Promise<MessageResponseMap[T['type']]> {
  return browser.runtime.sendMessage(message) as Promise<MessageResponseMap[T['type']]>;
}

export async function sendTabInternalMessage<T extends InternalContentMessage>(
  tabId: number,
  message: T,
): Promise<InternalContentResponseMap[T['type']]> {
  return browser.tabs.sendMessage(tabId, message) as Promise<InternalContentResponseMap[T['type']]>;
}

export function createIdeaSubmitMessage(
  text: string,
  selectedContextIds: string[] = [],
  selectedArchiveNoteIds: string[] = [],
  source: MessageSource = 'popup',
): IdeaSubmitRequest {
  return {
    type: 'idea.submit',
    requestId: createRequestId('idea.submit'),
    source,
    payload: { text, selectedContextIds, selectedArchiveNoteIds },
  };
}

export function createFeedbackMessage(
  artifactId: string,
  action: FeedbackRecordRequest['payload']['action'],
  source: MessageSource = 'popup',
): FeedbackRecordRequest {
  return {
    type: 'feedback.record',
    requestId: createRequestId('feedback.record'),
    source,
    payload: { artifactId, action },
  };
}

export function createMemoryGetMessage(source: MessageSource = 'popup'): MemoryGetRequest {
  return {
    type: 'memory.get',
    requestId: createRequestId('memory.get'),
    source,
    payload: {},
  };
}

export function createMemoryDeleteMessage(
  scope: MemoryDeleteRequest['payload']['scope'],
  id?: string,
  source: MessageSource = 'popup',
): MemoryDeleteRequest {
  return {
    type: 'memory.delete',
    requestId: createRequestId('memory.delete'),
    source,
    payload: { scope, id },
  };
}

export function createContextCaptureMessage(
  payload: ContextCaptureSelectionRequest['payload'],
  source: MessageSource = 'content',
): ContextCaptureSelectionRequest {
  return {
    type: 'context.captureSelection',
    requestId: createRequestId('context.captureSelection'),
    source,
    payload,
  };
}

export function createPageReadMessage(source: MessageSource = 'popup'): PageReadCurrentRequest {
  return {
    type: 'page.readCurrent',
    requestId: createRequestId('page.readCurrent'),
    source,
    payload: { mode: 'current-page' },
  };
}

export function createPageAnalyzeMessage(source: MessageSource = 'popup'): PageAnalyzeCurrentRequest {
  return {
    type: 'page.analyzeCurrent',
    requestId: createRequestId('page.analyzeCurrent'),
    source,
    payload: { mode: 'study-archive' },
  };
}

export function createArchiveSaveMessage(
  payload: ArchiveNoteSaveRequest['payload'],
  source: MessageSource = 'popup',
): ArchiveNoteSaveRequest {
  return {
    type: 'archive.note.save',
    requestId: createRequestId('archive.note.save'),
    source,
    payload,
  };
}

export function createArchiveDeleteMessage(
  noteId: string,
  source: MessageSource = 'popup',
): ArchiveNoteDeleteRequest {
  return {
    type: 'archive.note.delete',
    requestId: createRequestId('archive.note.delete'),
    source,
    payload: { noteId },
  };
}

export function createArchiveListMessage(source: MessageSource = 'popup'): ArchiveNoteListRequest {
  return {
    type: 'archive.note.list',
    requestId: createRequestId('archive.note.list'),
    source,
    payload: {},
  };
}

export function createArchiveClearMessage(source: MessageSource = 'popup'): ArchiveNoteClearRequest {
  return {
    type: 'archive.note.clear',
    requestId: createRequestId('archive.note.clear'),
    source,
    payload: {},
  };
}

export function createArtifactListMessage(source: MessageSource = 'popup'): ArtifactListRequest {
  return {
    type: 'artifact.list',
    requestId: createRequestId('artifact.list'),
    source,
    payload: {},
  };
}

export function createImageGenerateMessage(
  payload: ImageGenerateRequest['payload'],
  source: MessageSource = 'popup',
): ImageGenerateRequest {
  return {
    type: 'image.generate',
    requestId: createRequestId('image.generate'),
    source,
    payload,
  };
}

export function createImageDeleteMessage(
  imageId: string,
  source: MessageSource = 'popup',
): ImageDeleteRequest {
  return {
    type: 'image.delete',
    requestId: createRequestId('image.delete'),
    source,
    payload: { imageId },
  };
}

export function createImageListMessage(source: MessageSource = 'popup'): ImageListRequest {
  return {
    type: 'image.list',
    requestId: createRequestId('image.list'),
    source,
    payload: {},
  };
}

export function createMindmapGenerateMessage(
  payload: MindmapGenerateRequest['payload'],
  source: MessageSource = 'popup',
): MindmapGenerateRequest {
  return {
    type: 'mindmap.generate',
    requestId: createRequestId('mindmap.generate'),
    source,
    payload,
  };
}

export function createMindmapDeleteMessage(
  mindmapId: string,
  source: MessageSource = 'popup',
): MindmapDeleteRequest {
  return {
    type: 'mindmap.delete',
    requestId: createRequestId('mindmap.delete'),
    source,
    payload: { mindmapId },
  };
}

export function createMindmapListMessage(source: MessageSource = 'popup'): MindmapListRequest {
  return {
    type: 'mindmap.list',
    requestId: createRequestId('mindmap.list'),
    source,
    payload: {},
  };
}

export function createMemoryCandidateApproveMessage(
  candidateId: string,
  source: MessageSource = 'popup',
): MemoryCandidateApproveRequest {
  return {
    type: 'memory.candidate.approve',
    requestId: createRequestId('memory.candidate.approve'),
    source,
    payload: { candidateId },
  };
}

export function createMemoryCandidateRejectMessage(
  candidateId: string,
  source: MessageSource = 'popup',
): MemoryCandidateRejectRequest {
  return {
    type: 'memory.candidate.reject',
    requestId: createRequestId('memory.candidate.reject'),
    source,
    payload: { candidateId },
  };
}

export function createMemoryCandidateDeleteMessage(
  candidateId: string,
  source: MessageSource = 'popup',
): MemoryCandidateDeleteRequest {
  return {
    type: 'memory.candidate.delete',
    requestId: createRequestId('memory.candidate.delete'),
    source,
    payload: { candidateId },
  };
}

export function createMemoryCandidateListMessage(source: MessageSource = 'popup'): MemoryCandidateListRequest {
  return {
    type: 'memory.candidate.list',
    requestId: createRequestId('memory.candidate.list'),
    source,
    payload: {},
  };
}

export {
  createRequestId,
  sendRuntimeMessage,
};

export type {
  AppMessage,
  AppMessageResponse,
};
