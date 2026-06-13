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

/**
 * 最近活跃 tab 缓存（content script 通过长连注册自己的 tab）。
 *
 * 背景：sidepanel 在 MV3 里是独立窗口（windowType: 'panel'），
 *  当 sidepanel 主动发起 page.readCurrent 时，
 *  `chrome.tabs.query({active:true, lastFocusedWindow:true})` 可能返回 panel 窗口自己，
 *  导致拿不到普通网页 tab。
 *
 * 解法：content script 注入后通过 `chrome.runtime.connect('content-tab-registry')`
 *  上报自己的 tab id，SW 缓存起来。sidepanel 请求时优先用最近活跃的缓存 tab。
 */
const recentContentTabs = new Map<number, {
  url: string;
  pathname: string;
  title: string;
  href: string;
  lastSeen: number;
}>();

export default defineBackground(() => {
  // 点击扩展图标时打开/关闭 sidepanel
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // 监听 content script 长连 → 缓存 tabId
  // 通过 wxt 的 browser.runtime.onConnect 包装，与 onMessage 行为一致
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'content-tab-registry') return;
    const tabId = port.sender?.tab?.id;
    if (!tabId) return;

    port.onMessage.addListener((msg: { type?: string; url?: string; pathname?: string; title?: string; href?: string }) => {
      if (msg?.type === 'content.registerTab') {
        recentContentTabs.set(tabId, {
          url: msg.url ?? '',
          pathname: msg.pathname ?? '',
          title: msg.title ?? '',
          href: msg.href ?? '',
          lastSeen: Date.now(),
        });
        console.log(`[bg] content tab registered: ${tabId} ${msg.title}`);
      }
    });

    port.onDisconnect.addListener(() => {
      // tab 关闭时清理
      // 延迟清理，因为 SW 重启时所有 port 都会 disconnect，tab 本身还在
      setTimeout(() => {
        const entry = recentContentTabs.get(tabId);
        if (entry && Date.now() - entry.lastSeen > 30_000) {
          recentContentTabs.delete(tabId);
        }
      }, 1000);
    });
  });

  browser.runtime.onMessage.addListener((
    message: AppMessage,
    _sender,
    sendResponse: (response?: unknown) => void,
  ) => {
    handleMessage(message)
      .then((response) => {
        try { sendResponse(response); } catch { /* channel may be closed */ }
      })
      .catch((error) => {
        try {
          sendResponse(createErrorResponse(
            message.type,
            message.requestId,
            error instanceof Error ? error.message : String(error),
          ));
        } catch { /* channel may be closed */ }
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
  await saveProfile(nextProfile, 'feedback');

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
  await saveProfile(nextProfile, 'memory-approval');

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

  // P1：白名单过滤已知的"不能注入 content script"的 URL scheme
  // 避免无效发消息后再报错，给用户更直接的解释
  const tab = await browser.tabs.get(tabId);
  if (!canInjectContentScript(tab.url)) {
    throw new Error(
      `当前页面（${describeUnsupportedUrl(tab.url)}）不允许 PocketBuddy 注入读取脚本。请打开普通网页后再试，或直接划词放入口袋。`,
    );
  }

  try {
    // P0：先 ping 一下 content script 是否在线；若不在则动态注入
    await ensureContentScriptInjected(tabId);
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
 * 判断该 URL 能否注入 content script。
 *
 * Chrome/Firefox MV3 都不会注入到这些 scheme 上：
 * - chrome:// / chrome-extension:// / chrome-search:// / devtools:// / about:
 * - chromewebstore.google.com（Web Store 自身限制）
 * - view-source:
 * - file:（需要 explicit host permission）
 */
function canInjectContentScript(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    const scheme = url.protocol.toLowerCase();
    if (
      scheme === 'chrome:'
      || scheme === 'chrome-extension:'
      || scheme === 'chrome-search:'
      || scheme === 'chrome-untrusted:'
      || scheme === 'devtools:'
      || scheme === 'about:'
      || scheme === 'view-source:'
    ) {
      return false;
    }
    if (url.hostname === 'chromewebstore.google.com') return false;
    return true;
  } catch {
    return false;
  }
}

function describeUnsupportedUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return '未知页面';
  try {
    const url = new URL(rawUrl);
    return url.hostname || url.protocol.replace(':', '');
  } catch {
    return '当前 URL';
  }
}

/**
 * 确保目标 tab 已注入 content script。
 *
 * 解法（来自 chrome.scripting 官方文档 + SO 高赞答案）：
 * 1. 先尝试 ping，content script 在线就直接返回
 * 2. 收到 "Receiving end does not exist" → 用 chrome.scripting.executeScript 动态注入
 * 3. 注入完成后再 ping 一次确认
 *
 * 解决了：
 * - 老标签页未触发静态注入（扩展安装/更新后未刷新）
 * - SPA 路由切换导致 content script 丢失（极少见但可能）
 */
async function ensureContentScriptInjected(tabId: number): Promise<void> {
  const PING = { type: 'content.ping' } as const;

  // 第一次尝试
  try {
    await browser.tabs.sendMessage(tabId, PING);
    return; // content script 在线
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const notConnected = msg.includes('Receiving end does not exist')
      || msg.includes('Could not establish connection');
    if (!notConnected) {
      throw err; // 其它错误（敏感输入等）原样抛
    }
  }

  // 动态注入
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/content.js'],
    });
  } catch (injectionErr) {
    throw new Error(
      `动态注入 content script 失败（通常是因为扩展未获得 host 权限）。请刷新当前页面后再试。原始错误: ${
        injectionErr instanceof Error ? injectionErr.message : String(injectionErr)
      }`,
    );
  }

  // 第二次确认（给 content script 一点注册监听器的时间）
  await new Promise((resolve) => setTimeout(resolve, 60));
  try {
    await browser.tabs.sendMessage(tabId, PING);
  } catch {
    throw new Error('注入完成但 content script 仍未注册监听器，请刷新当前页面后再试。');
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
  // 优先级 0：content script 长连注册过的"最近活跃网页 tab"
  // 这是最可靠的，因为 content script 自己知道自己的 tab id
  if (recentContentTabs.size > 0) {
    // 按 lastSeen 排序取最新
    const sorted = Array.from(recentContentTabs.entries())
      .sort((a, b) => b[1].lastSeen - a[1].lastSeen);
    const [tabId, info] = sorted[0];
    if (canInjectContentScript(info.href)) return tabId;
  }

  // 优先级 1：所有 normal 窗口的活动 tab 里挑一个可注入的
  const allNormalTabs = await browser.tabs.query({
    active: true,
    windowType: 'normal',
  });
  const normalTab = allNormalTabs.find((tab) =>
    tab.id && canInjectContentScript(tab.url),
  );
  if (normalTab?.id) return normalTab.id;

  // 优先级 2：所有 active tab 里再找一次（兜底）
  const allActiveTabs = await browser.tabs.query({ active: true });
  const fallback = allActiveTabs.find((tab) =>
    tab.id && canInjectContentScript(tab.url),
  );
  if (fallback?.id) return fallback.id;

  // 优先级 3：返回任意活动 tab id，让上游 canInjectContentScript 给友好提示
  const anyTab = allNormalTabs[0] ?? allActiveTabs[0];
  if (anyTab?.id) return anyTab.id;

  throw new Error('没有找到可读取的网页标签页。请打开一个普通网页后重试。');
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
    recentIdeas: [],
    recentArtifacts: [],
    recentFeedback: [],
    archiveNotes: [],
    memoryCandidates: [],
    approvedMemories: [],
    profileHistory: [],
    stateBackups: [],
    harnessPatches: [],
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
      profileChanges: 0,
      backups: 0,
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
