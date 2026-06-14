import type { ProductConcept } from '../types';
import type { LlmClient } from '@/lib/llm';
import { extractJson } from '@/lib/llm/json';

interface ShrinkResult {
  mvpPlan: string[];
  nextTasks: string[];
}

/** 把产品概念压缩成 3 步 MVP 和后续任务，失败抛错。 */
export async function runShrinkLight(concept: ProductConcept, client: LlmClient, hint?: string): Promise<ShrinkResult> {
  const result = await generateWithLlm(concept, client, hint);
  if (result) return result;
  throw new Error('ShrinkLight 未能生成 MVP 计划');
}

async function generateWithLlm(concept: ProductConcept, client: LlmClient, hint?: string): Promise<ShrinkResult | null> {
  if (hint) console.log('[ShrinkLight] 应用自学习提示:', hint.slice(0, 50));
  const system = [
    hint,
    '你是 MVP 规划专家。把产品概念压缩成可立即执行的最小可行计划。',
    '只输出一个 JSON 对象，不要解释、不要 markdown 标记。',
    '字段：mvpPlan(数组,3条中文,每条一个具体可执行步骤)、nextTasks(数组,3条中文,后续优化方向)。',
  ].join('');

  const userContent = [
    `产品名：${concept.name}`,
    `定位：${concept.tagline}`,
    `核心问题：${concept.coreProblem}`,
    `功能：${concept.features.join('、')}`,
    '请输出 MVP 计划 JSON。',
  ].join('\n');

  const response = await client.generate({
    system,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 800,
  });

  const parsed = extractJson<ShrinkResult>(response.text);
  if (!parsed || !Array.isArray(parsed.mvpPlan) || !Array.isArray(parsed.nextTasks)) return null;
  return parsed;
}
