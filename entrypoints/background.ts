import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  applyApprovedMemoryToProfile,
  applyFeedbackToProfile,
  approveMemoryCandidate,
  cleanupOrphanIdeas,
  clearArchiveNotes,
  convertCandidateToApprovedMemory,
  deleteApprovedMemory,
  deleteArchiveNote,
  deleteGeneratedImage,
  deleteGeneratedMindmap,
  deleteMemory,
  deleteMemoryCandidate,
  ensureProfile,
  getArtifactHistory,
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
  savePipelineRun,
  savePageContext,
  saveProfile,
  updateIdeaStatus,
} from '@/lib/memory';
import { buildArchiveNoteFromAnalysis, buildPageAnalysisResult } from '@/lib/agent/core';
import { buildPipelineTrace, createPipelineStage } from '@/lib/agent/pipeline';
import { runImageGeneration } from '@/lib/image/service';
import { generateMindmapRecord } from '@/lib/mindmap/service';
import { toPageContextRecord } from '@/lib/page/extractor';
import { buildHarnessPatchFromFeedback, shouldCreateHarnessPatch } from '@/lib/agent/harness';
import { processIdeaSubmission } from '@/lib/agent/orchestrators/idea';
import { buildKnowledgeRecall } from '@/lib/agent/recall';
import type { ContentPipelineKind, ContentPipelineTrace, MemoryRecallResult } from '@/lib/agent/types';
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

  // SW 启动时清理孤儿 idea（>5 分钟仍 pending = 一定是被异常中止的）
  cleanupOrphanIdeas().catch((err) => {
    console.warn('[bg] cleanupOrphanIdeas failed:', err);
  });

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
      return successResponse('idea.submit', message.requestId, await runIdeaSubmissionWithTransaction({
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

    case 'artifact.list':
      return successResponse('artifact.list', message.requestId, {
        records: await getArtifactHistory(),
        memorySummary: await getMemorySummary(),
      });

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

    case 'memory.recall':
      return successResponse('memory.recall', message.requestId, await handleMemoryRecall(message.payload.query, message.payload.limit));
  }
}

async function handleMemoryRecall(query: string, limit?: number): Promise<MemoryRecallResult> {
  const memory = await getMemorySummary();
  const artifacts = await getArtifactHistory();
  const images = await getGeneratedImages();
  const items = buildKnowledgeRecall({ query, memory, artifacts, images, limit });
  return { query, items };
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
  // 优先信任 popup 主动上送的 payload（content script 在 selection 触发瞬间已把
  // 选区信息塞进 message.payload 转发过来了 —— 这是当前 SW 链路的事实）。
  // 但如果 payload 是兜底空值（来自 createErrorResponse），则改为反向问 content script
  // 拿一次最新选区，避免出现"孤儿协议"。
  const hasPayloadContent = payload.selectedText && payload.selectedText.trim().length > 0;
  if (!hasPayloadContent) {
    try {
      const tabId = await getLastFocusedNormalTabId();
      const tab = await browser.tabs.get(tabId);
      if (canInjectContentScript(tab.url)) {
        const fresh = await sendTabInternalMessage(tabId, { type: 'content.page.extract-selection' }) as PageReadResult;
        if (fresh?.selectedText) {
          return persistSnippet({
            origin: fresh.origin,
            pageTitle: fresh.pageTitle,
            selectedText: fresh.selectedText,
          });
        }
      }
    } catch {
      // 拿不到最新选区就回退到 payload
    }
  }

  return persistSnippet({
    origin: payload.origin,
    pageTitle: payload.pageTitle,
    selectedText: payload.selectedText,
  });
}

async function persistSnippet(input: {
  origin: string;
  pageTitle: string;
  selectedText: string;
}) {
  const runtimeConfig = await readStorage('runtimeConfig');
  const snippet = {
    id: crypto.randomUUID(),
    origin: input.origin,
    pageTitle: (input.pageTitle ?? '').trim().slice(0, 100),
    selectedText: (input.selectedText ?? '').trim().slice(0, runtimeConfig.maxSelectionChars),
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
  const pipelineTrace = buildPipelineTrace({
    kind: 'page',
    title: page.pageTitle,
    summary: '提取正文与页面结构',
    sourceId: page.id,
    stages: [
      createPipelineStage('plan', '规划', '锁定页面与模式', `${mode} · ${page.pageType}`),
      createPipelineStage('research', '调研', '提取正文并清洗结构', `${page.headings?.length ?? 0} 个标题`),
      createPipelineStage('reflect', '反思', '压缩出可读摘要', (page.visibleTextSummary ?? page.textExcerpt ?? '').slice(0, 40) || '暂无摘要'),
      createPipelineStage('outline', '信息编排', '写入临时页面口袋', savedContext.id.slice(0, 8)),
      createPipelineStage('generate', '生成', '形成页面缓存', page.pageTitle),
    ],
  });
  await savePipelineRun(pipelineTrace);

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
  const analysis = await buildPageAnalysisResult(page, savedContext, profile);
  await savePipelineRun(analysis.pipelineTrace);
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
  const pipelineTrace = buildPipelineTrace({
    kind: 'archive',
    title: note.title,
    summary: note.summary,
    sourceId: analysis?.id ?? sourceContext?.id ?? note.id,
    stages: [
      createPipelineStage('plan', '规划', '决定沉淀为笔记', note.sourceType),
      createPipelineStage('research', '调研', '压缩页面分析结果', analysis?.pageSummary ?? note.summary),
      createPipelineStage('reflect', '反思', '筛选长期保留价值', note.tags.slice(0, 3).join(' / ') || '暂无标签'),
      createPipelineStage('outline', '信息编排', '整理标题、摘要和要点', note.title),
      createPipelineStage('generate', '生成', '写入记忆库', `${note.bullets.length} 条要点`),
    ],
  });
  note.pipelineTrace = pipelineTrace;
  await saveArchiveNote(note);
  await savePipelineRun(pipelineTrace);
  return {
    note,
    memorySummary: await getMemorySummary(),
  };
}

async function handleImageGenerate(payload: AppMessage extends never ? never : any) {
  const runtimeConfig = await readStorage('runtimeConfig');
  const { request, record } = await runImageGeneration(payload, runtimeConfig);
  if (record.pipelineTrace) {
    await savePipelineRun(record.pipelineTrace);
  }
  await saveGeneratedImage(record);
  return {
    request,
    record,
    memorySummary: await getMemorySummary(),
  };
}

async function handleMindmapGenerate(payload: AppMessage extends never ? never : any) {
  const record = generateMindmapRecord(payload);
  if (record.pipelineTrace) {
    await savePipelineRun(record.pipelineTrace);
  }
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
 * 3. 注入后用指数退避重试 PING（因为 content.js 是 ES module，
 *    需要解析所有 import 后才会调用 defineContentScript 的 main()，
 *    在慢机器或大页面上可能需要 200-800ms）
 *
 * 解决了：
 * - 老标签页未触发静态注入（扩展安装/更新后未刷新）
 * - SPA 路由切换导致 content script 丢失（极少见但可能）
 * - 动态注入后模块加载慢导致 PING 失败（之前 60ms 太短）
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

  // 动态注入：使用 func 模式注入一个精简的 onMessage 桥接脚本
  // 为什么不用 files: ['content-scripts/content.js']：
  //   WXT 编译的 content.js 是 IIFE 包裹的 async main()，执行链是：
  //     (async () => { try { await e(...); } catch { H.error(...); } })()
  //   如果 main() 内部抛错（比如 document.documentElement 还没就绪），
  //   错误会被 H.error 静默吞掉，listener 永远不注册 → "3000ms 内仍未注册监听器"
  //   func 模式是纯函数，注入时同步执行，错误原样冒上来
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: injectContentScriptBridge,
    });
  } catch (injectionErr) {
    throw new Error(
      `动态注入 content script 失败（通常是因为扩展未获得 host 权限）。请刷新当前页面后再试。原始错误: ${
        injectionErr instanceof Error ? injectionErr.message : String(injectionErr)
      }`,
    );
  }

  // 第二次确认（func 模式同步执行，50ms 足够让消息回到 SW）
  await new Promise((resolve) => setTimeout(resolve, 50));
  try {
    await browser.tabs.sendMessage(tabId, PING);
    return;
  } catch (err) {
    throw new Error(
      `动态注入了 content script bridge 但 listener 仍未注册。请刷新当前页面后再试。原始错误: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * 通过 chrome.scripting.executeScript({func: ...}) 注入的桥接脚本。
 *
 * 设计目标：
 * 1. 100% 同步：listener 立即注册，不依赖任何异步操作
 * 2. 不依赖 WXT 模块链路：不 import 任何东西，纯原生 API
 * 3. 暴露与 content.ts 相同的消息协议（content.ping / extract-current / extract-selection）
 * 4. 重复注入保护：window.__pbBridgeInjected 标记
 *
 * 注意：func 模式下，函数体被字符串化后在目标 world 执行，
 * 不能引用外层任何变量。所有逻辑必须内联在这里。
 */
function injectContentScriptBridge(): void {
  const w = window as unknown as { __pbBridgeInjected?: boolean };
  if (w.__pbBridgeInjected) return;
  w.__pbBridgeInjected = true;

  const chromeRef = (globalThis as { chrome?: unknown }).chrome
    ?? (globalThis as unknown as { browser?: unknown }).browser;
  if (!chromeRef || !(chromeRef as { runtime?: { onMessage?: unknown } }).runtime?.onMessage) {
    throw new Error('chrome.runtime.onMessage 不可用，可能不是扩展上下文');
  }

  // ── 内联 DOM 工具（精简版，删掉了原始 content.ts 里的 FAB / Shadow DOM 部分）──
  const BLOCKED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'FORM', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);
  const REMOVABLE_SELECTORS = 'script,style,noscript,iframe,svg,canvas,form,input,textarea,select,button,nav,footer,[hidden],[aria-hidden="true"],[contenteditable]';

  function sanitize(input: string): string {
    return input.replace(/\s+/g, ' ').trim();
  }

  function getReadableRoot(root: HTMLElement): ParentNode {
    return root.querySelector('article, main, [role="main"]')
      ?? root.querySelector('body')
      ?? root;
  }

  function extractHeadings(root: ParentNode, limit = 20): string[] {
    return Array.from(root.querySelectorAll('h1, h2, h3'))
      .map((n) => sanitize(n.textContent ?? ''))
      .filter(Boolean)
      .slice(0, limit);
  }

  function extractReadableText(root: ParentNode, maxChars: number): string {
    const host = root instanceof HTMLElement ? root : (root.querySelector('body') ?? root as Element);
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    let len = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || BLOCKED_TAGS.has(parent.tagName)) continue;
      const text = sanitize(node.textContent ?? '');
      if (!text) continue;
      parts.push(text);
      len += text.length + 1;
      if (len >= maxChars) break;
    }
    return parts.join(' ').slice(0, maxChars).trim();
  }

  function createSanitizedClone(src: Document): HTMLElement {
    const clone = src.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(REMOVABLE_SELECTORS).forEach((n) => n.remove());
    clone.querySelectorAll('header').forEach((h) => {
      const links = h.querySelectorAll('a').length;
      if (h.querySelector('nav') || links >= 4) h.remove();
    });
    return clone;
  }

  function classifyPage(url: string, title: string, headings: string[], excerpt: string): 'paper' | 'article' | 'generic' {
    const joined = [url, title, ...headings, excerpt].join(' ').toLowerCase();
    if (/arxiv|doi|abstract|references|method|conclusion/.test(joined)) return 'paper';
    if (/article|blog|post|newsletter|author|published|教程|博客|文章/.test(joined)) return 'article';
    return 'generic';
  }

  function extractCurrentPage(mode: string) {
    if (/\.pdf$/i.test(window.location.pathname) // privacy-check: allow — 仅读取 pathname 用于 PDF 检测，不外传
      || document.contentType?.toLowerCase().includes('pdf')) {
      throw new Error('当前页面像是 PDF 阅读器或不可注入页面，暂不支持自动读取。可先划词放入口袋或复制摘要。');
    }
    const clone = createSanitizedClone(document);
    const readable = getReadableRoot(clone);
    const headings = extractHeadings(readable);
    const mainText = extractReadableText(readable, 3000);
    if (!mainText) {
      throw new Error('当前页面没有提取到可分析的正文内容。');
    }
    const textExcerpt = mainText.slice(0, 500);
    return {
      id: crypto.randomUUID(),
      mode,
      origin: window.location.origin,
      pageTitle: document.title.trim().slice(0, 140),
      pageType: classifyPage(window.location.href, document.title, headings, textExcerpt), // privacy-check: allow — 仅在 content script 内部用于分类判定，不外传
      headings,
      mainText,
      visibleTextSummary: mainText.slice(0, 300),
      textExcerpt,
      createdAt: Date.now(),
    };
  }

  // ── 注册监听器 ──
  (chromeRef as { runtime: { onMessage: { addListener: (
    cb: (message: { type?: string; mode?: string }, sender: unknown, sendResponse: (r: unknown) => void) => boolean | void
  ) => void } } }).runtime.onMessage.addListener((
    message: { type?: string; mode?: string },
    _sender: unknown,
    sendResponse: (r: unknown) => void,
  ) => {
    if (message?.type === 'content.ping') {
      sendResponse({ pong: true });
      return false;
    }

    if (message?.type === 'content.page.extract-current') {
      try {
        const mode = message.mode ?? 'current-page';
        const result = extractCurrentPage(mode);
        sendResponse(result);
      } catch (err) {
        sendResponse({ __error: err instanceof Error ? err.message : String(err) });
      }
      return false;
    }

    if (message?.type === 'content.page.extract-selection') {
      const sel = window.getSelection()?.toString().replace(/\s+/g, ' ').trim() ?? '';
      if (!sel) {
        sendResponse({ __error: '当前没有选中的文本。' });
      } else {
        sendResponse({
          id: crypto.randomUUID(),
          mode: 'selection',
          origin: window.location.origin,
          pageTitle: document.title.trim().slice(0, 140),
          pageType: 'generic',
          selectedText: sel.slice(0, 280),
          createdAt: Date.now(),
        });
      }
      return false;
    }

    return false;
  });

  // ── 主动注册到 tab registry ──
  try {
    const port = (chromeRef as { runtime: { connect: (n: { name: string }) => { postMessage: (m: unknown) => void } } }).runtime.connect({ name: 'content-tab-registry' });
    port.postMessage({
      type: 'content.registerTab',
      url: window.location.origin,
      pathname: window.location.pathname, // privacy-check: allow — 仅在 content script 内部使用
      title: document.title,
      href: window.location.href, // privacy-check: allow — 仅上报 URL 给 background，用于跨窗口定位活动 tab
    });
  } catch {
    // connect 失败也无妨
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
    pipelineRuns: [],
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
      pipelineRuns: 0,
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
        pipelineTrace: createEmptyPipelineTrace('idea', '想法产物'),
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
        pipelineTrace: createEmptyPipelineTrace('page', '页面分析'),
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
        pipelineTrace: createEmptyPipelineTrace('archive', '归档'),
      },
      memorySummary: emptySummary,
    };
  }

  if (type === 'archive.note.list') {
    return { notes: [], memorySummary: emptySummary };
  }

  if (type === 'artifact.list') {
    return { records: [], memorySummary: emptySummary };
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
        request: {
          id: '',
          sourceType: 'idea',
          title: '',
          content: '',
          style: 'line-art',
          createdAt: 0,
        },
        prompt: '',
        status: 'failed',
        previewText: '',
        model: 'gpt-image-2',
        pipelineTrace: createEmptyPipelineTrace('image', '图片生成'),
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
        pipelineTrace: createEmptyPipelineTrace('mindmap', '图谱生成'),
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

function createEmptyPipelineTrace(kind: ContentPipelineKind, title: string): ContentPipelineTrace {
  return {
    id: '',
    kind,
    title,
    summary: '',
    stages: [],
    createdAt: 0,
  };
}

/**
 * 事务包装：把 processIdeaSubmission 包成"先记 idea → 跑链路 → 标记 status"的状态机。
 *
 * 解决 #L1-5（事务支持）问题：
 * 旧版链路是「LLM 跑完才存 idea/artifact/profile」—— 如果 LLM 跑完但 SW 异常
 * 退出，idea 根本不存，用户看不到这次尝试；下次重试会拿同样 input 重新跑。
 *
 * 新版：
 * 1. processIdeaSubmission 内部依然做同样的事，但同步返回 ideaId + 抛错带 status 信息
 * 2. 启动时 cleanupOrphanIdeas 兜底 >5 分钟的 pending idea
 *
 * 这里包装是为了在 handler 层捕获异常后，把 idea 标 status='failed' + failReason。
 */
async function runIdeaSubmissionWithTransaction(input: {
  text: string;
  source: 'popup' | 'selection';
  selectedContextIds?: string[];
  selectedArchiveNoteIds?: string[];
}): Promise<import('@/lib/agent/types').IdeaSubmitResult> {
  const result = await processIdeaSubmission(input);
  // 成功：把对应的 idea 标记为 committed
  if (result.artifact.ideaId) {
    await updateIdeaStatus(result.artifact.ideaId, 'committed').catch((err) => {
      console.warn('[bg] 标记 idea 为 committed 失败：', err);
    });
  }
  return result;
}
