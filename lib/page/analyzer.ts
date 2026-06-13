import type { UserProfile } from '@/lib/agent/types';
import type { MemoryCandidate } from '@/lib/agent/types';
import type { PageAnalysisResult, PageReadResult, PageType } from './types';

export function analyzePageContext(page: PageReadResult, memory: UserProfile): PageAnalysisResult {
  const baseText = page.mainText ?? page.selectedText ?? '';
  const excerpt = page.textExcerpt ?? baseText.slice(0, 500);
  const sentences = splitSentences(baseText || excerpt);
  const headings = page.headings ?? [];
  const primaryTag = headings[0] ?? page.pageTitle;

  const keyIdeas = buildKeyIdeas(page.pageType, headings, sentences);
  const keyTakeaways = buildKeyTakeaways(page.pageType, sentences);
  const usefulForCurrentIdea = buildUsefulIdeas(memory, primaryTag, page.pageType);
  const productOpportunities = buildProductOpportunities(page.pageType, primaryTag, memory);
  const noteBullets = [...keyIdeas.slice(0, 2), ...keyTakeaways.slice(0, 2)].slice(0, 4);

  const analysis: PageAnalysisResult = {
    id: crypto.randomUUID(),
    sourceContextId: page.id,
    pageType: page.pageType,
    pageSummary: buildSummary(page.pageType, page.pageTitle, excerpt),
    keyIdeas,
    keyTakeaways,
    usefulForCurrentIdea,
    productOpportunities,
    noteCard: {
      title: `${page.pageTitle} 口袋卡片`,
      summary: buildSummary(page.pageType, page.pageTitle, excerpt),
      bullets: noteBullets,
      tags: buildTags(page.pageType, headings, memory),
    },
    paperInsights: page.pageType === 'paper'
      ? buildPaperInsights(baseText, memory)
      : undefined,
    memoryCandidates: buildMemoryCandidates(page, memory, keyIdeas, usefulForCurrentIdea),
    createdAt: Date.now(),
  };

  return analysis;
}

function buildSummary(pageType: PageType, title: string, excerpt: string): string {
  if (pageType === 'paper') {
    return `这页更像一篇论文或研究摘要，核心围绕“${title}”展开，正文里呈现了问题背景、方法线索和结论片段，适合整理成研究笔记与项目关联。`;
  }

  if (pageType === 'article') {
    return `这页更像一篇结构化文章，围绕“${title}”给出主线观点和行动建议，适合提炼成知识卡片与可执行清单。`;
  }

  return `这页内容可以被当作一个通用知识片段处理，先抓住“${title}”的主旨，再从中提取能放进口袋的想法与机会。`;
}

function buildKeyIdeas(pageType: PageType, headings: string[], sentences: string[]): string[] {
  const headingIdeas = headings.slice(0, 3);
  const sentenceIdeas = sentences.slice(0, 3);
  const combined = [...headingIdeas, ...sentenceIdeas].filter(Boolean);

  if (combined.length > 0) {
    return combined.slice(0, 4);
  }

  if (pageType === 'paper') {
    return ['问题定义', '方法路径', '实验或验证线索'];
  }

  return ['文章主线', '关键做法', '可转化的洞察'];
}

function buildKeyTakeaways(pageType: PageType, sentences: string[]): string[] {
  const takeaways = sentences.slice(1, 4).map((line) => `可带走：${line}`);
  if (takeaways.length > 0) return takeaways;

  if (pageType === 'paper') {
    return ['把方法和贡献拆开看，会更容易转成自己的研究脉络。'];
  }

  return ['先把这页内容提炼成一张卡片，再决定是否长期归档。'];
}

function buildUsefulIdeas(memory: UserProfile, primaryTag: string, pageType: PageType): string[] {
  const relatedTheme = memory.recentThemes[0] ?? memory.productPreferences[0] ?? '当前项目';

  return [
    `可以把“${primaryTag}”与 ${relatedTheme} 做一次连接，看它是否能补强你现在的产品或学习路径。`,
    pageType === 'paper'
      ? '适合转成论文笔记，并补一条“与我当前项目的关系”。'
      : '适合转成阅读卡片，再决定要不要继续做产品化延展。',
  ];
}

function buildProductOpportunities(pageType: PageType, primaryTag: string, memory: UserProfile): string[] {
  const preference = memory.productPreferences[0] ?? '轻量工具';
  const base = [
    `做一个围绕“${primaryTag}”的 ${preference} 解释器或助手。`,
    `把这页内容压缩成可回顾的卡片视图，用于之后快速复习。`,
  ];

  if (pageType === 'paper') {
    base.push('把论文方法、贡献和限制结构化对比，做成研究口袋板。');
  } else {
    base.push('把文章行动建议拆成清单，用于生成下一步小任务。');
  }

  return base.slice(0, 3);
}

function buildPaperInsights(text: string, memory: UserProfile): NonNullable<PageAnalysisResult['paperInsights']> {
  return {
    problem: extractAroundKeyword(text, ['problem', 'challenge', 'question', '任务'], '这篇内容在尝试解决一个明确的问题或研究缺口。'),
    method: extractAroundKeyword(text, ['method', 'approach', 'framework', '方法'], '正文里给出了一条方法或实现路径。'),
    contribution: extractAroundKeyword(text, ['contribution', 'we propose', '贡献'], '作者强调了方法或结论的独特价值。'),
    conclusion: extractAroundKeyword(text, ['conclusion', 'in summary', '结论'], '结尾给出了一段总结性判断。'),
    relationToMyProjects: [
      `可以把这里的方法线索映射到你最近的主题：${memory.recentThemes[0] ?? '当前项目'}`,
      '如果你在做学习型或知识型工具，这页内容适合转成长期研究笔记。',
    ],
  };
}

function buildMemoryCandidates(
  page: PageReadResult,
  memory: UserProfile,
  keyIdeas: string[],
  usefulForCurrentIdea: string[],
): MemoryCandidate[] {
  const baseSourceType: MemoryCandidate['sourceType'] = page.pageType === 'paper' ? 'paper' : 'article';
  const title = page.headings?.[0] ?? page.pageTitle;

  return [
    {
      id: crypto.randomUUID(),
      sourceType: baseSourceType,
      category: 'topic',
      title,
      content: page.visibleTextSummary ?? page.textExcerpt ?? '',
      reason: '这页内容主题明确，适合进入你的长期主题池。',
      status: 'pending' as const,
      createdAt: Date.now(),
    },
    {
      id: crypto.randomUUID(),
      sourceType: baseSourceType,
      category: 'knowledge',
      title: keyIdeas[0] ?? page.pageTitle,
      content: keyIdeas.slice(0, 2).join('；'),
      reason: '这条知识点已经足够结构化，之后回看会有价值。',
      status: 'pending' as const,
      createdAt: Date.now(),
    },
    {
      id: crypto.randomUUID(),
      sourceType: baseSourceType,
      category: 'project-link',
      title: memory.productPreferences[0] ?? '当前项目连接',
      content: usefulForCurrentIdea[0] ?? '建议把这页内容与你当前项目建立一条显式关系。',
      reason: '它和你现有方向存在潜在连接，记住后能让后续分析更贴近你的目标。',
      status: 'pending' as const,
      createdAt: Date.now(),
    },
  ];
}

function buildTags(pageType: PageType, headings: string[], memory: UserProfile): string[] {
  const tags = new Set<string>([pageType]);
  headings.slice(0, 3).forEach((heading) => tags.add(heading.slice(0, 18)));
  memory.recentThemes.slice(0, 2).forEach((theme) => tags.add(theme));
  return Array.from(tags).slice(0, 6);
}

function extractAroundKeyword(text: string, keywords: string[], fallback: string): string {
  const lowered = text.toLowerCase();
  const found = keywords.find((keyword) => lowered.includes(keyword.toLowerCase()));
  if (!found) return fallback;

  const index = lowered.indexOf(found.toLowerCase());
  return text.slice(index, index + 120).replace(/\s+/g, ' ').trim() || fallback;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
}
