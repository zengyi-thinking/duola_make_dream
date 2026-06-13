import type { RuntimeConfig } from '@/lib/agent/types';
import { classifyPage, isProbablyUnsupportedPdf } from './classifier';
import {
  createSanitizedDocumentClone,
  extractHeadings,
  extractReadableText,
  selectReadableRoot,
} from './sanitizer';
import type { PageContextRecord, PageReadMode, PageReadResult } from './types';

export function extractCurrentPageContent(
  sourceDocument: Document,
  mode: Exclude<PageReadMode, 'selection'>,
  runtimeConfig: RuntimeConfig,
): PageReadResult {
  if (isProbablyUnsupportedPdf(sourceDocument)) {
    throw new Error('当前页面像是 PDF 阅读器或不可注入页面，暂不支持自动读取。可先划词放入口袋或复制摘要。');
  }

  const sanitizedRoot = createSanitizedDocumentClone(sourceDocument);
  const readableRoot = selectReadableRoot(sanitizedRoot);
  const headings = extractHeadings(readableRoot, 20);
  const mainText = extractReadableText(readableRoot, runtimeConfig.maxMainTextChars);

  if (!mainText) {
    throw new Error('当前页面没有提取到可分析的正文内容。');
  }

  const textExcerpt = mainText.slice(0, runtimeConfig.maxPageExcerptChars);
  const visibleTextSummary = mainText.slice(0, 300);
  const pageType = classifyPage({
    origin: window.location.origin, // privacy-check: allow
    pathname: window.location.pathname, // privacy-check: allow
    title: sourceDocument.title,
    headings,
    excerpt: textExcerpt,
  });

  return {
    id: crypto.randomUUID(),
    mode,
    origin: window.location.origin,
    pageTitle: sourceDocument.title.trim().slice(0, 140),
    pageType,
    headings,
    mainText,
    visibleTextSummary,
    textExcerpt,
    createdAt: Date.now(),
  };
}

export function extractCurrentSelection(
  sourceDocument: Document,
  runtimeConfig: RuntimeConfig,
): PageReadResult {
  const selection = sourceDocument.defaultView?.getSelection();
  const selectedText = selection?.toString().replace(/\s+/g, ' ').trim() ?? '';

  if (!selectedText) {
    throw new Error('当前没有选中的文本。');
  }

  return {
    id: crypto.randomUUID(),
    mode: 'selection',
    origin: window.location.origin,
    pageTitle: sourceDocument.title.trim().slice(0, 140),
    pageType: 'generic',
    selectedText: selectedText.slice(0, runtimeConfig.maxSelectionChars),
    createdAt: Date.now(),
  };
}

export function toPageContextRecord(
  page: PageReadResult,
  runtimeConfig: RuntimeConfig,
): PageContextRecord {
  return {
    id: page.id,
    origin: page.origin,
    pageTitle: page.pageTitle,
    pageType: page.pageType,
    headings: page.headings?.slice(0, 20) ?? [],
    visibleTextSummary: (page.visibleTextSummary ?? page.selectedText ?? '').slice(0, 300),
    textExcerpt: (page.textExcerpt ?? page.selectedText ?? '').slice(0, runtimeConfig.maxPageExcerptChars),
    createdAt: page.createdAt,
  };
}
