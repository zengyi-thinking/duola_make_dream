import type { ProductConcept } from '../types';
import type { LlmClient } from '@/lib/llm';
import { extractJson } from '@/lib/llm/json';

interface ShrinkResult {
  mvpPlan: string[];
  nextTasks: string[];
}

/**
 * 把产品概念压缩成 3 步 MVP 和后续任务。
 * - 有真实 client → LLM 生成
 * - 无 client → 模板
 */
export async function runShrinkLight(concept: ProductConcept, client?: LlmClient): Promise<ShrinkResult> {
  if (client && client.kind !== 'mock') {
    try {
      const result = await generateWithLlm(concept, client);
      if (result) return result;
    } catch (err) {
      console.warn('[ShrinkLight] LLM 调用失败，降级到模板:', err);
    }
  }
  return buildTemplate(concept);
}

async function generateWithLlm(concept: ProductConcept, client: LlmClient): Promise<ShrinkResult | null> {
  const system = [
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

function buildTemplate(concept: ProductConcept): ShrinkResult {
  return {
    mvpPlan: [
      '先做一句话输入、结果卡片和本地记忆，不接任何外部 API。',
      '把网页划词片段通过"放进口袋"送进 background，当成灵感上下文。',
      '只输出 1 个主方向、1 段图片 Prompt、1 组 MVP 拆解，保证速度和闭环。',
    ],
    nextTasks: [
      `给 ${concept.name} 增加 2 套结果风格模板，测试用户更偏爱哪种表达方式。`,
      '为反馈按钮增加可解释的风格迁移逻辑，而不只是记录点击。',
      '接入后端代理，再把本地 mock 规则替换成真实模型调用。',
    ],
  };
}
