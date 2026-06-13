import type { PageType } from './types';

interface PageClassificationInput {
  origin: string;
  pathname: string;
  title: string;
  headings: string[];
  excerpt: string;
}

export function classifyPage(input: PageClassificationInput): PageType {
  const joined = [
    input.origin,
    input.pathname,
    input.title,
    ...input.headings,
    input.excerpt,
  ]
    .join(' ')
    .toLowerCase();

  const paperSignals = [
    /arxiv|doi|abstract|references|method|methodology|conclusion|citation|preprint/i,
    /\bintroduction\b/i,
    /\bresults\b/i,
  ];

  if (paperSignals.some((rule) => rule.test(joined))) {
    return 'paper';
  }

  const articleSignals = [
    /article|blog|post|newsletter|author|published|updated/i,
    /教程|博客|文章|作者|发布时间/i,
  ];

  if (articleSignals.some((rule) => rule.test(joined))) {
    return 'article';
  }

  return 'generic';
}

export function isProbablyUnsupportedPdf(sourceDocument: Document): boolean {
  // privacy-check: allow — 仅读取 pathname 用于分类，不泄露完整 URL
  const pathname = window.location.pathname.toLowerCase();
  const contentType = sourceDocument.contentType.toLowerCase();
  const pluginHost = sourceDocument.body?.children.length === 1
    && /embed|object/i.test(sourceDocument.body.children[0]?.tagName ?? '');

  return pathname.endsWith('.pdf') || contentType.includes('pdf') || pluginHost;
}
