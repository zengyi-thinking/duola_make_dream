import type { ContextSnippet } from '@/lib/agent/types';
import type { LlmClient } from '@/lib/llm';
import { extractJson } from '@/lib/llm/json';

/**
 * 划词碎片归纳放大镜 —— 把多条知识碎片（ContextSnippet）LLM 归纳成一篇连贯的知识笔记。
 *
 * 产品重设计：喂养页划词功能（content.ts 选词→contextSnippets）原本只堆积碎片，
 * 本 gadget 把碎片归纳成 {title, summary, bullets, tags}，供 background 构造 ArchiveNote 入图。
 *
 * 降级契约（与 idea-lens/research-lens 一致）：mock→模板 / 真实 LLM 失败→降级模板，永不抛。
 */
export interface SnippetSynthesisInput {
  snippets: ContextSnippet[];
}
export interface SnippetSynthesisResult {
  title: string;
  summary: string;
  bullets: string[];
  tags: string[];
  source: 'mock' | 'llm' | 'template';
}

export async function runSnippetSynthesizer(
  input: SnippetSynthesisInput,
  client: LlmClient,
  hint?: string,
): Promise<SnippetSynthesisResult> {
  if (client.kind === 'mock') {
    return { ...buildTemplateSynthesis(input), source: 'mock' };
  }
  const result = await generateWithLlm(input, client, hint);
  if (result) return { ...result, source: 'llm' };
  console.warn('[SnippetSynthesizer] LLM 解析失败，降级到模板');
  return { ...buildTemplateSynthesis(input), source: 'template' };
}

async function generateWithLlm(
  input: SnippetSynthesisInput,
  client: LlmClient,
  hint?: string,
): Promise<Omit<SnippetSynthesisResult, 'source'> | null> {
  const snippetLines = input.snippets
    .slice(0, 20)
    .map((s, i) => `[${i + 1}] 《${s.pageTitle}》：${s.selectedText}`)
    .join('\n');

  const system = [
    hint,
    '你是知识整理助手。把用户划取的多条知识碎片归纳成一篇连贯、有主题的知识笔记。',
    '只输出一个 JSON 对象，不要解释、不要 markdown 代码块标记。',
    'JSON 字段：title(中文标题,4-12字)、summary(中文摘要,2-3句,概括主题与价值)、',
    'bullets(数组,3-6条中文要点,去重合并同类项)、tags(数组,3-5个中文标签)。',
    '要求提炼主题、去重、合并，不要简单堆砌原文。',
  ].filter(Boolean).join('');

  const response = await client.generate({
    system,
    messages: [{ role: 'user', content: `以下是 ${input.snippets.length} 条知识碎片：\n${snippetLines}\n\n请归纳成知识笔记，严格输出 JSON。` }],
    maxTokens: 1400,
  });

  const parsed = extractJson<Partial<Omit<SnippetSynthesisResult, 'source'>>>(response.text);
  if (!parsed || !parsed.title || !Array.isArray(parsed.bullets)) return null;
  return {
    title: parsed.title,
    summary: parsed.summary ?? '',
    bullets: parsed.bullets,
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
  };
}

/** 模板归纳（mock/降级用）：取首条碎片主题做标题，拼接摘要，bullets 取前几条碎片精简版。 */
function buildTemplateSynthesis(input: SnippetSynthesisInput): Omit<SnippetSynthesisResult, 'source'> {
  const snippets = input.snippets;
  const firstPage = snippets[0]?.pageTitle ?? '知识碎片';
  const title = `${firstPage.slice(0, 6)}等 ${snippets.length} 条碎片归纳`;
  const summary = `从 ${snippets.length} 条划词碎片中归纳出的知识笔记，涵盖 ${countDistinctPages(snippets)} 个来源，提炼核心要点与主题标签。`;
  const bullets = snippets
    .slice(0, 5)
    .map((s) => `${s.pageTitle.slice(0, 10)}：${s.selectedText.slice(0, 40)}`)
    .map((t) => (t.length > 50 ? `${t.slice(0, 50)}…` : t));
  const tags = extractTemplateTags(snippets);
  return { title, summary, bullets, tags };
}

function countDistinctPages(snippets: ContextSnippet[]): number {
  return new Set(snippets.map((s) => s.pageTitle)).size;
}

function extractTemplateTags(snippets: ContextSnippet[]): string[] {
  const origins = Array.from(new Set(snippets.map((s) => s.origin).filter(Boolean))).slice(0, 3);
  const themes = ['知识碎片', '划词归纳'];
  return [...themes, ...origins.map((o) => new URL(o).hostname.replace(/^www\./, '').split('.')[0]).slice(0, 2)].slice(0, 5);
}
