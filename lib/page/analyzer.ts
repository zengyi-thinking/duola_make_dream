import type { MemoryCandidate, UserProfile } from '@/lib/agent/types';
import type { LlmClient } from '@/lib/llm';
import { buildPipelineTrace, createPipelineStage } from '@/lib/agent/pipeline';
import { extractJson } from '@/lib/llm/json';
import type { PageAnalysisResult, PageReadResult } from './types';

/**
 * 页面分析（mock / 真实 LLM 双路径）。
 *
 * 降级策略：
 * - mock 客户端 → 走本地模板（基于正文首句 + headings 拼装结构化结果）
 * - 真实 LLM → 走真实理解
 * - 真实 LLM 失败 → 降级到模板（永不让"分析当前页"功能不可用）
 *
 * LLM 负责「理解+提炼」语义字段；模板路径下也保证结构完整。
 */
export async function analyzePageContextAsync(
  page: PageReadResult,
  memory: UserProfile,
  client: LlmClient,
  hint?: string,
): Promise<PageAnalysisResult> {
  if (client.kind === 'mock') {
    return buildTemplateAnalysis(page, memory);
  }

  const result = await analyzeWithLlm(page, memory, client, hint);
  if (result) return result;

  console.warn('[PageAnalyzer] LLM 解析失败，降级到模板');
  return buildTemplateAnalysis(page, memory);
}

interface LlmPageAnalysis {
  pageSummary?: string;
  keyIdeas?: string[];
  keyTakeaways?: string[];
  usefulForCurrentIdea?: string[];
  productOpportunities?: string[];
  noteCard?: { title?: string; summary?: string; bullets?: string[] };
  paperInsights?: { problem?: string; method?: string; contribution?: string; conclusion?: string; relationToMyProjects?: string[] };
}

async function analyzeWithLlm(
  page: PageReadResult,
  memory: UserProfile,
  client: LlmClient,
  hint?: string,
): Promise<PageAnalysisResult | null> {
  if (hint) console.log('[PageAnalyzer] 应用自学习提示:', hint.slice(0, 50));
  const system = [
    hint,
    '你是一位资深知识分析师。阅读网页正文，输出结构化分析。',
    '只输出一个 JSON 对象，不要解释、不要 markdown 标记。字段：',
    'pageSummary(中文,2-3句真实摘要,必须基于正文)、',
    'keyIdeas(数组,3-4条中文核心观点)、',
    'keyTakeaways(数组,3条中文可带走要点)、',
    'usefulForCurrentIdea(数组,2条中文:对用户当前方向有何用处)、',
    'productOpportunities(数组,2-3条中文产品或工具机会)、',
    'noteCard(对象:{title中文标题,summary中文摘要,bullets数组3条中文要点})',
    page.pageType === 'paper' ? '、paperInsights(对象:{problem,method,contribution,conclusion中文,relationToMyProjects数组})' : '',
    '。务必基于正文真实内容，不要泛泛而谈。',
  ].filter(Boolean).join('');

  const userContent = [
    `页面标题：${page.pageTitle}`,
    `页面类型：${page.pageType}`,
    `小标题：${(page.headings ?? []).slice(0, 6).join(' / ') || '无'}`,
    `正文摘录：${(page.mainText ?? page.textExcerpt ?? '').slice(0, 1500)}`,
    `用户近期主题：${memory.recentThemes.slice(0, 3).join('、') || '暂无'}`,
    `用户产品偏好：${memory.productPreferences.slice(0, 2).join('、') || '暂无'}`,
  ].join('\n');

  const response = await client.generate({
    system,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 1600,
  });

  const parsed = extractJson<LlmPageAnalysis>(response.text);
  if (!parsed || !parsed.pageSummary || !Array.isArray(parsed.keyIdeas) || parsed.keyIdeas.length === 0) {
    return null;
  }

  const keyIdeas = parsed.keyIdeas.slice(0, 4);
  const usefulForCurrentIdea = (parsed.usefulForCurrentIdea ?? []).slice(0, 3);

  return {
    id: crypto.randomUUID(),
    sourceContextId: page.id,
    pageType: page.pageType,
    pageSummary: parsed.pageSummary,
    keyIdeas,
    keyTakeaways: (parsed.keyTakeaways ?? []).slice(0, 4),
    usefulForCurrentIdea,
    productOpportunities: (parsed.productOpportunities ?? []).slice(0, 3),
    noteCard: {
      title: parsed.noteCard?.title ?? `${page.pageTitle} 口袋卡片`,
      summary: parsed.noteCard?.summary ?? parsed.pageSummary,
      bullets: (parsed.noteCard?.bullets ?? keyIdeas.slice(0, 2)).slice(0, 4),
      tags: buildTags(page.pageType, page.headings ?? [], memory),
    },
    paperInsights: page.pageType === 'paper' && parsed.paperInsights
      ? {
          problem: parsed.paperInsights.problem ?? '',
          method: parsed.paperInsights.method ?? '',
          contribution: parsed.paperInsights.contribution ?? '',
          conclusion: parsed.paperInsights.conclusion ?? '',
          relationToMyProjects: (parsed.paperInsights.relationToMyProjects ?? []).slice(0, 3),
        }
      : undefined,
    memoryCandidates: buildMemoryCandidates(page, memory, keyIdeas, usefulForCurrentIdea),
    pipelineTrace: buildPipelineTrace({
      kind: 'page',
      title: page.pageTitle,
      summary: parsed.pageSummary.slice(0, 80),
      sourceId: page.id,
      stages: [
        createPipelineStage('plan', '规划', '锁定目标页面', page.pageType),
        createPipelineStage('research', '调研', '阅读正文', `${(page.mainText ?? '').length} 字`),
        createPipelineStage('reflect', '反思', '结合画像', memory.recentThemes[0] ?? '暂无'),
        createPipelineStage('outline', '信息编排', '提炼要点', `keyIdeas ${keyIdeas.length} 条`),
        createPipelineStage('generate', '生成', '输出分析', parsed.pageSummary.slice(0, 20)),
      ],
    }),
    createdAt: Date.now(),
  };
}

/** 模板降级路径：从正文 + headings + profile 拼装结构化结果（不调用 LLM）。 */
function buildTemplateAnalysis(page: PageReadResult, memory: UserProfile): PageAnalysisResult {
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
  const pageSummary = buildSummary(page.pageType, page.pageTitle, excerpt);

  return {
    id: crypto.randomUUID(),
    sourceContextId: page.id,
    pageType: page.pageType,
    pageSummary,
    keyIdeas,
    keyTakeaways,
    usefulForCurrentIdea,
    productOpportunities,
    noteCard: {
      title: `${page.pageTitle} 口袋卡片`,
      summary: pageSummary,
      bullets: noteBullets,
      tags: buildTags(page.pageType, headings, memory),
    },
    paperInsights: page.pageType === 'paper' ? buildPaperInsights(baseText, memory) : undefined,
    memoryCandidates: buildMemoryCandidates(page, memory, keyIdeas, usefulForCurrentIdea),
    pipelineTrace: buildPipelineTrace({
      kind: 'page',
      title: page.pageTitle,
      summary: pageSummary.slice(0, 80),
      sourceId: page.id,
      stages: [
        createPipelineStage('plan', '规划', '锁定目标页面', page.pageType),
        createPipelineStage('research', '调研', '阅读正文', `${(page.mainText ?? '').length} 字`),
        createPipelineStage('reflect', '反思', '结合画像', memory.recentThemes[0] ?? '暂无'),
        createPipelineStage('outline', '信息编排', '提炼要点', `keyIdeas ${keyIdeas.length} 条`),
        createPipelineStage('generate', '生成', '输出分析', pageSummary.slice(0, 20)),
      ],
    }),
    createdAt: Date.now(),
  };
}

function buildSummary(pageType: PageAnalysisResult['pageType'], title: string, excerpt: string): string {
  if (pageType === 'paper') {
    return `这页更像一篇论文或研究摘要，核心围绕"${title}"展开，正文里呈现了问题背景、方法线索和结论片段，适合整理成研究笔记与项目关联。`;
  }
  if (pageType === 'article') {
    return `这页更像一篇结构化文章，围绕"${title}"给出主线观点和行动建议，适合提炼成知识卡片与可执行清单。`;
  }
  return `这页内容可以被当作一个通用知识片段处理，先抓住"${title}"的主旨，再从中提取能放进口袋的想法与机会。`;
}

function buildKeyIdeas(pageType: PageAnalysisResult['pageType'], headings: string[], sentences: string[]): string[] {
  const headingIdeas = headings.slice(0, 3);
  const sentenceIdeas = sentences.slice(0, 3);
  const combined = [...headingIdeas, ...sentenceIdeas].filter(Boolean);
  if (combined.length > 0) return combined.slice(0, 4);
  if (pageType === 'paper') return ['问题定义', '方法路径', '实验或验证线索'];
  return ['文章主线', '关键做法', '可转化的洞察'];
}

function buildKeyTakeaways(pageType: PageAnalysisResult['pageType'], sentences: string[]): string[] {
  const takeaways = sentences.slice(1, 4).map((line) => `可带走：${line}`);
  if (takeaways.length > 0) return takeaways;
  if (pageType === 'paper') return ['把方法和贡献拆开看，会更容易转成自己的研究脉络。'];
  return ['先把这页内容提炼成一张卡片，再决定是否长期归档。'];
}

function buildUsefulIdeas(memory: UserProfile, primaryTag: string, pageType: PageAnalysisResult['pageType']): string[] {
  const relatedTheme = memory.recentThemes[0] ?? memory.productPreferences[0] ?? '当前项目';
  return [
    `可以把"${primaryTag}"与 ${relatedTheme} 做一次连接，看它是否能补强你现在的产品或学习路径。`,
    pageType === 'paper'
      ? '适合转成论文笔记，并补一条"与我当前项目的关系"。'
      : '适合转成阅读卡片，再决定要不要继续做产品化延展。',
  ];
}

function buildProductOpportunities(pageType: PageAnalysisResult['pageType'], primaryTag: string, memory: UserProfile): string[] {
  const preference = memory.productPreferences[0] ?? '轻量工具';
  const base = [
    `做一个围绕"${primaryTag}"的 ${preference} 解释器或助手。`,
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

function buildTags(pageType: PageAnalysisResult['pageType'], headings: string[], memory: UserProfile): string[] {
  const tags = new Set<string>([pageType]);
  headings.slice(0, 3).forEach((heading) => tags.add(heading.slice(0, 18)));
  memory.recentThemes.slice(0, 2).forEach((theme) => tags.add(theme));
  return Array.from(tags).slice(0, 6);
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function extractAroundKeyword(text: string, keywords: string[], fallback: string): string {
  const lowered = text.toLowerCase();
  const found = keywords.find((keyword) => lowered.includes(keyword.toLowerCase()));
  if (!found) return fallback;
  const index = lowered.indexOf(found.toLowerCase());
  return text.slice(index, index + 120).replace(/\s+/g, ' ').trim() || fallback;
}
