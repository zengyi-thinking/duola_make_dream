import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { processIdeaSubmission } from '@/lib/agent/core';
import { buildHarnessPatchFromFeedback } from '@/lib/agent/harness';
import type {
  ContextCaptureResult,
  FeedbackRecordResult,
  IdeaSubmitResult,
  MemorySummary,
} from '@/lib/agent/types';
import {
  applyFeedbackToProfile,
  deleteMemory,
  ensureProfile,
  getMemorySummary,
  saveContextSnippet,
  saveFeedback,
  saveHarnessPatch,
  saveProfile,
} from '@/lib/memory';
import { readStorage } from '@/lib/storage/local';
import type {
  AppMessage,
  AppMessageResponse,
  ContextCaptureSelectionRequest,
} from '@/lib/messaging/types';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: AppMessage) => handleMessage(message));
});

async function handleMessage(message: AppMessage): Promise<AppMessageResponse> {
  try {
    switch (message.type) {
      case 'idea.submit': {
        const payload = await handleIdeaSubmit(message.payload.text);
        return {
          type: 'idea.submit',
          requestId: message.requestId,
          source: 'background',
          success: true,
          payload,
        };
      }

      case 'feedback.record': {
        const payload = await handleFeedbackRecord(message.payload.artifactId, message.payload.action);
        return {
          type: 'feedback.record',
          requestId: message.requestId,
          source: 'background',
          success: true,
          payload,
        };
      }

      case 'memory.get': {
        const payload = await getMemorySummary();
        return {
          type: 'memory.get',
          requestId: message.requestId,
          source: 'background',
          success: true,
          payload,
        };
      }

      case 'memory.delete': {
        const payload = await deleteMemory(message.payload.scope);
        return {
          type: 'memory.delete',
          requestId: message.requestId,
          source: 'background',
          success: true,
          payload,
        };
      }

      case 'context.captureSelection': {
        const payload = await handleContextCapture(message.payload);
        return {
          type: 'context.captureSelection',
          requestId: message.requestId,
          source: 'background',
          success: true,
          payload,
        };
      }
    }
  } catch (error) {
    return createErrorResponse(
      message,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function handleIdeaSubmit(text: string): Promise<IdeaSubmitResult> {
  return processIdeaSubmission({
    text,
    source: 'popup',
  });
}

async function handleFeedbackRecord(
  artifactId: string,
  action: Parameters<typeof applyFeedbackToProfile>[1],
): Promise<FeedbackRecordResult> {
  const feedback = {
    id: crypto.randomUUID(),
    artifactId,
    action,
    createdAt: Date.now(),
  };

  await saveFeedback(feedback);

  const currentProfile = await ensureProfile();
  const nextProfile = applyFeedbackToProfile(currentProfile, action);
  await saveProfile(nextProfile);

  const patch = buildHarnessPatchFromFeedback(action);
  if (patch) {
    await saveHarnessPatch(patch);
  }

  return {
    feedback,
    memorySummary: await getMemorySummary(),
  };
}

async function handleContextCapture(
  payload: ContextCaptureSelectionRequest['payload'],
): Promise<ContextCaptureResult> {
  const runtimeConfig = await readStorage('runtimeConfig');
  const snippet = {
    id: crypto.randomUUID(),
    origin: payload.origin,
    pageTitle: payload.pageTitle.trim().slice(0, 100),
    selectedText: payload.selectedText.trim().slice(0, runtimeConfig.maxSelectionChars),
    source: 'content' as const,
    createdAt: Date.now(),
  };

  await saveContextSnippet(snippet);

  return {
    snippet,
    memorySummary: await getMemorySummary(),
  };
}

function createErrorResponse(
  message: AppMessage,
  error: string,
): AppMessageResponse {
  const memorySummary: MemorySummary = emptyMemorySummary();

  switch (message.type) {
    case 'idea.submit':
      return {
        type: 'idea.submit',
        requestId: message.requestId,
        source: 'background',
        success: false,
        error,
        payload: {
          artifact: {
            id: '',
            ideaId: '',
            intent: 'productivity-tool',
            concept: {
              name: '',
              tagline: '',
              positioning: '',
              coreProblem: '',
              targetUser: '',
              valueProposition: '',
              features: [],
              visualDirection: [],
            },
            imagePrompt: '',
            mvpPlan: [],
            nextTasks: [],
            appliedGadgets: [],
            createdAt: 0,
          },
          assistantSummary: '',
          memorySummary,
        },
      };

    case 'feedback.record':
      return {
        type: 'feedback.record',
        requestId: message.requestId,
        source: 'background',
        success: false,
        error,
        payload: {
          feedback: {
            id: '',
            artifactId: '',
            action: 'more-minimal',
            createdAt: 0,
          },
          memorySummary,
        },
      };

    case 'context.captureSelection':
      return {
        type: 'context.captureSelection',
        requestId: message.requestId,
        source: 'background',
        success: false,
        error,
        payload: {
          snippet: {
            id: '',
            origin: '',
            pageTitle: '',
            selectedText: '',
            source: 'content',
            createdAt: 0,
          },
          memorySummary,
        },
      };

    case 'memory.delete':
      return {
        type: 'memory.delete',
        requestId: message.requestId,
        source: 'background',
        success: false,
        error,
        payload: memorySummary,
      };

    case 'memory.get':
      return {
        type: 'memory.get',
        requestId: message.requestId,
        source: 'background',
        success: false,
        error,
        payload: memorySummary,
      };
  }
}

function emptyMemorySummary(): MemorySummary {
  return {
    profile: {
      visualLikes: [],
      visualDislikes: [],
      tonePreference: '',
      productPreferences: [],
      recentThemes: [],
      lastUpdated: 0,
    },
    recentContextSnippets: [],
    pendingPatches: [],
    counts: {
      ideas: 0,
      artifacts: 0,
      feedback: 0,
    },
  };
}
