import { browser } from 'wxt/browser';
import type {
  AppMessage,
  AppMessageResponse,
  ContextCaptureSelectionRequest,
  FeedbackRecordRequest,
  IdeaSubmitRequest,
  MemoryDeleteRequest,
  MemoryGetRequest,
  MessageResponseMap,
  MessageSource,
  MessageType,
} from './types';

function createRequestId(type: MessageType): string {
  return `${type}-${crypto.randomUUID()}`;
}

async function sendRuntimeMessage<T extends AppMessage>(
  message: T,
): Promise<MessageResponseMap[T['type']]> {
  return browser.runtime.sendMessage(message) as Promise<MessageResponseMap[T['type']]>;
}

export function createIdeaSubmitMessage(
  text: string,
  selectedContextIds: string[] = [],
  source: MessageSource = 'popup',
): IdeaSubmitRequest {
  return {
    type: 'idea.submit',
    requestId: createRequestId('idea.submit'),
    source,
    payload: { text, selectedContextIds },
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
  source: MessageSource = 'popup',
): MemoryDeleteRequest {
  return {
    type: 'memory.delete',
    requestId: createRequestId('memory.delete'),
    source,
    payload: { scope },
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

export {
  createRequestId,
  sendRuntimeMessage,
};

export type {
  AppMessage,
  AppMessageResponse,
};
