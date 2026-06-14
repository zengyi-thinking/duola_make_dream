import type { MemoryCandidate, UserProfile } from '@/lib/agent/types';
import type { LlmClient } from '@/lib/llm';
import { extractJson } from '@/lib/llm/json';
import type { PageAnalysisResult, PageReadResult } from './types';

/**
 * 真实 LLM 页面分析（mock 已移除，失败抛错由上层 errorResponse 兜底）。
 * LLM 负责「理解+提炼」语义字段；buildMemoryCandidates/buildTags 负责结构壳。
 */
export async function analyzePageContextAsync(
  page: PageReadResult,
  memory: UserProfile,
  client: LlmClient,
  hint?: string,
): Promise<PageAnalysisResult> {
  const result = await analyzeWithLlm(page, memory, client, hint);
  if (result) return result;
  throw new Error('PageAnalyzer 未能解析出有效的页面分析');
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
  ].join('');

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
    createdAt: Date.now(),
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
