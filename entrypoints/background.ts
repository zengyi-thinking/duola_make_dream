import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  applyApprovedMemoryToProfile,
  applyFeedbackToProfile,
  approveMemoryCandidate,
  clearArchiveNotes,
  convertCandidateToApprovedMemory,
  deleteApprovedMemory,
  deleteArchiveNote,
  deleteGeneratedImage,
  deleteGeneratedMindmap,
  deleteMemory,
  deleteMemoryCandidate,
  ensureProfile,
  getArchiveNotes,
  getFeedbackLog,
  getGeneratedImages,
  getGeneratedMindmaps,
  getHarnessPatches,
  getMemoryCandidates,
  getMemorySummary,
  rejectMemoryCandidate,
  saveArchiveNote,
  saveContextSnippet,
  saveFeedback,
  saveGeneratedImage,
  saveGeneratedMindmap,
  saveHarnessPatch,
  saveMemoryCandidates,
  savePageContext,
  saveProfile,
} from '@/lib/memory';
import { buildArchiveNoteFromAnalysis, buildPageAnalysisResult } from '@/lib/agent/core';
import { runImageGeneration } from '@/lib/image/service';
import { generateMindmapRecord } from '@/lib/mindmap/service';
import { toPageContextRecord } from '@/lib/page/extractor';
import { buildHarnessPatchFromFeedback, shouldCreateHarnessPatch } from '@/lib/agent/harness';
import { processIdeaSubmission } from '@/lib/agent/orchestrators/idea';
import { readStorage } from '@/lib/storage/local';
import { sendTabInternalMessage } from '@/lib/messaging/bus';
import type { PageReadResult } from '@/lib/page/types';
import type {
  AppMessage,
  AppMessageResponse,
  ContextCaptureSelectionRequest,
  InternalContentMessage,
  MessageSource,
} from '@/lib/messaging/types';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: AppMessage, _sender, sendResponse) => {
    handleMessage(message)
      .then((response) => sendResponse(response))
      .catch((error) => {
        sendResponse(createErrorResponse(
          message.type,
          message.requestId,
          error instanceof Error ? error.message : String(error),
        ));
      });

    return true;
  });
});

async function handleMessage(message: AppMessage): Promise<AppMessageResponse> {
  switch (message.type) {
    case 'idea.submit':
      return successResponse('idea.submit', message.requestId, await processIdeaSubmission({
        text: message.payload.text,
        source: 'popup',
        selectedContextIds: message.payload.selectedContextIds,
        selectedArchiveNoteIds: message.payload.selectedArchiveNoteIds,
      }));

    case 'feedback.record':
      return successResponse('feedback.record', message.requestId, await handleFeedbackRecord(
        message.payload.artifactId,
        message.payload.action,
      ));

    case 'memory.get':
      return successResponse('memory.get', message.requestId, await getMemorySummary());

    case 'memory.delete':
      return successResponse('memory.delete', message.requestId, await handleMemoryDelete(message.payload.scope, message.payload.id));

    case 'context.captureSelection':
      return successResponse('context.captureSelection', message.requestId, await handleContextCapture(message.payload));

    case 'page.readCurrent':
      return successResponse('page.readCurrent', message.requestId, await handlePageRead(message.payload.mode ?? 'current-page'));

    case 'page.analyzeCurrent':
      return successResponse('page.analyzeCurrent', message.requestId, await handlePageAnalyze(message.payload.mode ?? 'study-archive'));

    case 'archive.note.save':
      return successResponse('archive.note.save', message.requestId, await handleArchiveSave(message.payload.analysis, message.payload.sourceContext));

    case 'archive.note.list':
      return successResponse('archive.note.list', message.requestId, {
        notes: await getArchiveNotes(),
        memorySummary: await getMemorySummary(),
      });

    case 'archive.note.delete':
      return successResponse('archive.note.delete', message.requestId, await deleteArchiveNote(message.payload.noteId));

    case 'archive.note.clear':
      return successResponse('archive.note.clear', message.requestId, await clearArchiveNotes());

    case 'image.generate':
      return successResponse('image.generate', message.requestId, await handleImageGenerate(message.payload));

    case 'image.list':
      return successResponse('image.list', message.requestId, {
        records: await getGeneratedImages(),
        memorySummary: await getMemorySummary(),
      });

    case 'image.delete':
      return successResponse('image.delete', message.requestId, await deleteGeneratedImage(message.payload.imageId));

    case 'mindmap.generate':
      return successResponse('mindmap.generate', message.requestId, await handleMindmapGenerate(message.payload));

    case 'mindmap.list':
      return successResponse('mindmap.list', message.requestId, {
        records: await getGeneratedMindmaps(),
        memorySummary: await getMemorySummary(),
      });

    case 'mindmap.delete':
      return successResponse('mindmap.delete', message.requestId, await deleteGeneratedMindmap(message.payload.mindmapId));

    case 'memory.candidate.approve':
      return successResponse('memory.candidate.approve', message.requestId, await handleMemoryCandidateApprove(message.payload.candidateId));

    case 'memory.candidate.reject':
      return successResponse('memory.candidate.reject', message.requestId, await handleMemoryCandidateReject(message.payload.candidateId));

    case 'memory.candidate.list':
      return successResponse('memory.candidate.list', message.requestId, {
        candidates: await getMemoryCandidates(),
        memorySummary: await getMemorySummary(),
      });

    case 'memory.candidate.delete':
      return successResponse('memory.candidate.delete', message.requestId, await deleteMemoryCandidate(message.payload.candidateId));
  }
}

async function handleFeedbackRecord(
  artifactId: string,
  action: Parameters<typeof applyFeedbackToProfile>[1],
) {
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

  const feedbackLog = await getFeedbackLog();
  const pendingPatches = await getHarnessPatches();
  const patch = buildHarnessPatchFromFeedback(action);
  if (patch && shouldCreateHarnessPatch(action, feedbackLog, pendingPatches)) {
    await saveHarnessPatch(patch);
  }

  return {
    feedback,
    memorySummary: await getMemorySummary(),
  };
}

async function handleContextCapture(
  payload: ContextCaptureSelectionRequest['payload'],
) {
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

async function handleMemoryDelete(scope: AppMessage['type'] extends never ? never : any, id?: string) {
  if (!id) {
    return deleteMemory(scope);
  }

  if (scope === 'approvedMemories') {
    return deleteApprovedMemory(id);
  }

  if (scope === 'archiveNotes') {
    return deleteArchiveNote(id);
  }

  if (scope === 'memoryCandidates') {
    return deleteMemoryCandidate(id);
  }

  if (scope === 'generatedImages') {
    return deleteGeneratedImage(id);
  }

  if (scope === 'generatedMindmaps') {
    return deleteGeneratedMindmap(id);
  }

  throw new Error(`scope=${String(scope)} 不支持单条删除`);
}

async function handlePageRead(mode: 'current-page' | 'study-archive') {
  const page = await requestPageExtraction({
    type: 'content.page.extract-current',
    mode,
  });
  const runtimeConfig = await readStorage('runtimeConfig');
  const savedContext = await savePageContext(toPageContextRecord(page, runtimeConfig));

  return {
    page,
    savedContext,
    memorySummary: await getMemorySummary(),
  };
}

async function handlePageAnalyze(mode: 'current-page' | 'study-archive') {
  const page = await requestPageExtraction({
    type: 'content.page.extract-current',
    mode,
  });
  const runtimeConfig = await readStorage('runtimeConfig');
  const savedContext = await savePageContext(toPageContextRecord(page, runtimeConfig));
  const profile = await ensureProfile();
  const analysis = buildPageAnalysisResult(page, savedContext, profile);
  await saveMemoryCandidates(analysis.memoryCandidates);

  return {
    page,
    savedContext,
    analysis,
    memorySummary: await getMemorySummary(),
  };
}

async function handleArchiveSave(analysis: AppMessage extends never ? never : any, sourceContext: any) {
  const note = buildArchiveNoteFromAnalysis(analysis, sourceContext);
  await saveArchiveNote(note);
  return {
    note,
    memorySummary: await getMemorySummary(),
  };
}

async function handleImageGenerate(payload: AppMessage extends never ? never : any) {
  const runtimeConfig = await readStorage('runtimeConfig');
  const { request, record } = await runImageGeneration(payload, runtimeConfig);
  await saveGeneratedImage(record);
  return {
    request,
    record,
    memorySummary: await getMemorySummary(),
  };
}

async function handleMindmapGenerate(payload: AppMessage extends never ? never : any) {
  const record = generateMindmapRecord(payload);
  await saveGeneratedMindmap(record);
  return {
    record,
    memorySummary: await getMemorySummary(),
  };
}

async function handleMemoryCandidateApprove(candidateId: string) {
  const candidate = await approveMemoryCandidate(candidateId);
  const approvedMemory = await convertCandidateToApprovedMemory(candidateId);
  const profile = await ensureProfile();
  const nextProfile = applyApprovedMemoryToProfile(profile, candidate);
  await saveProfile(nextProfile);

  return {
    candidate,
    approvedMemory,
    memorySummary: await getMemorySummary(),
  };
}

async function handleMemoryCandidateReject(candidateId: string) {
  const candidate = await rejectMemoryCandidate(candidateId);
  return {
    candidate,
    memorySummary: await getMemorySummary(),
  };
}

async function requestPageExtraction(message: InternalContentMessage) {
  const tabId = await getLastFocusedNormalTabId();

  try {
    const page = await sendTabInternalMessage(tabId, message) as PageReadResult & { __error?: string };
    if (page?.__error) {
      throw new Error(page.__error);
    }
    if (!page?.id) {
      throw new Error('内容提取结果为空。');
    }
    return page;
  } catch (error) {
    throw new Error(
      `当前页面暂不支持自动读取，可先划词放入口袋或复制摘要。原始错误: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * 获取用户最近聚焦的正常窗口中的活动标签页 ID。
 *
 * popup 窗口的 currentWindow 是 popup 自身，不是用户正在浏览的网页窗口。
 * 所以需要遍历所有窗口，找到最近聚焦的正常（normal）窗口中的活动标签页。
 * 仅使用 activeTab 权限，不读取 tab.url / tab.title 等敏感字段。
 */
async function getLastFocusedNormalTabId(): Promise<number> {
  // 优先尝试最后一个被聚焦的窗口
  const [lastFocused] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (lastFocused?.id) return lastFocused.id;

  // 回退：遍历所有窗口找正常窗口的活动标签页
  const allActiveTabs = await browser.tabs.query({ active: true });
  const normalTab = allActiveTabs.find((tab) => tab.id && !tab.url?.startsWith('chrome://'));
  if (normalTab?.id) return normalTab.id;

  throw new Error('没有找到可读取的网页标签页。');
}

function successResponse(type: AppMessage['type'], requestId: string, payload: unknown) {
  return {
    type,
    requestId,
    source: 'background' as MessageSource,
    success: true,
    payload,
  } as AppMessageResponse;
}

function createErrorResponse(type: AppMessage['type'], requestId: string, error: string) {
  return {
    type,
    requestId,
    source: 'background' as MessageSource,
    success: false,
    error,
    payload: buildEmptyPayload(type),
  } as AppMessageResponse;
}

function buildEmptyPayload(type: AppMessage['type']) {
  const emptySummary = {
    profile: {
      visualLikes: [],
      visualDislikes: [],
      tonePreference: '',
      productPreferences: [],
      recentThemes: [],
      lastUpdated: 0,
    },
    recentContextSnippets: [],
    recentPageContexts: [],
    archiveNotes: [],
    memoryCandidates: [],
    approvedMemories: [],
    generatedImages: [],
    generatedMindmaps: [],
    pendingPatches: [],
    counts: {
      ideas: 0,
      artifacts: 0,
      feedback: 0,
      pageContexts: 0,
      notes: 0,
      memoryCandidates: 0,
      approvedMemories: 0,
      images: 0,
      mindmaps: 0,
    },
  };

  if (type === 'idea.submit') {
    return {
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
        selectedContextIds: [],
        selectedArchiveNoteIds: [],
        createdAt: 0,
      },
      assistantSummary: '',
      memorySummary: emptySummary,
    };
  }

  if (type === 'feedback.record') {
    return {
      feedback: {
        id: '',
        artifactId: '',
        action: 'more-minimal',
        createdAt: 0,
      },
      memorySummary: emptySummary,
    };
  }

  if (type === 'context.captureSelection') {
    return {
      snippet: {
        id: '',
        origin: '',
        pageTitle: '',
        selectedText: '',
        source: 'content',
        createdAt: 0,
      },
      memorySummary: emptySummary,
    };
  }

  if (type === 'page.readCurrent') {
    return {
      page: {
        id: '',
        mode: 'current-page',
        origin: '',
        pageTitle: '',
        pageType: 'generic',
        headings: [],
        mainText: '',
        visibleTextSummary: '',
        textExcerpt: '',
        createdAt: 0,
      },
      savedContext: {
        id: '',
        origin: '',
        pageTitle: '',
        pageType: 'generic',
        headings: [],
        visibleTextSummary: '',
        textExcerpt: '',
        createdAt: 0,
      },
      memorySummary: emptySummary,
    };
  }

  if (type === 'page.analyzeCurrent') {
    return {
      page: {
        id: '',
        mode: 'study-archive',
        origin: '',
        pageTitle: '',
        pageType: 'generic',
        headings: [],
        mainText: '',
        visibleTextSummary: '',
        textExcerpt: '',
        createdAt: 0,
      },
      savedContext: {
        id: '',
        origin: '',
        pageTitle: '',
        pageType: 'generic',
        headings: [],
        visibleTextSummary: '',
        textExcerpt: '',
        createdAt: 0,
      },
      analysis: {
        id: '',
        sourceContextId: '',
        pageType: 'generic',
        pageSummary: '',
        keyIdeas: [],
        keyTakeaways: [],
        usefulForCurrentIdea: [],
        productOpportunities: [],
        noteCard: {
          title: '',
          summary: '',
          bullets: [],
          tags: [],
        },
        memoryCandidates: [],
        createdAt: 0,
      },
      memorySummary: emptySummary,
    };
  }

  if (type === 'archive.note.save') {
    return {
      note: {
        id: '',
        sourceType: 'article',
        title: '',
        sourceTitle: '',
        origin: '',
        summary: '',
        bullets: [],
        tags: [],
        createdAt: 0,
        savedByUser: true,
        relatedContextIds: [],
      },
      memorySummary: emptySummary,
    };
  }

  if (type === 'archive.note.list') {
    return { notes: [], memorySummary: emptySummary };
  }

  if (type === 'image.generate') {
    return {
      request: {
        id: '',
        sourceType: 'idea',
        title: '',
        content: '',
        style: 'line-art',
        createdAt: 0,
      },
      record: {
        id: '',
        requestId: '',
        prompt: '',
        status: 'failed',
        previewText: '',
        model: 'gpt-image-2',
        createdAt: 0,
      },
      memorySummary: emptySummary,
    };
  }

  if (type === 'mindmap.generate') {
    return {
      record: {
        id: '',
        sourceId: '',
        sourceType: 'article',
        result: {
          id: '',
          title: '',
          root: { id: '', label: '', children: [] },
          sourceType: 'article',
          createdAt: 0,
        },
        imagePrompt: '',
        createdAt: 0,
      },
      memorySummary: emptySummary,
    };
  }

  if (type === 'memory.candidate.approve' || type === 'memory.candidate.reject') {
    return {
      candidate: {
        id: '',
        sourceType: 'article',
        category: 'topic',
        title: '',
        content: '',
        reason: '',
        status: type === 'memory.candidate.approve' ? 'approved' : 'rejected',
        createdAt: 0,
      },
      memorySummary: emptySummary,
    };
  }

  if (type === 'image.list') {
    return { records: [], memorySummary: emptySummary };
  }

  if (type === 'mindmap.list') {
    return { records: [], memorySummary: emptySummary };
  }

  if (type === 'memory.candidate.list') {
    return { candidates: [], memorySummary: emptySummary };
  }

  return emptySummary;
}
