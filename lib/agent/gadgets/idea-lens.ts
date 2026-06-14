import type { AgentIntent, ProductConcept, UserProfile } from '../types';
import type { LlmClient } from '@/lib/llm';
import { extractJson } from '@/lib/llm/json';

export interface IdeaLensInput {
  idea: string;
  intent: AgentIntent;
  profile: UserProfile;
  contextLine?: string;
}

/** 把想法收束为产品概念（真实 LLM，失败抛错由上层 errorResponse 兜底）。 */
export async function runIdeaLens(input: IdeaLensInput, client: LlmClient, hint?: string): Promise<ProductConcept> {
  const concept = await generateConceptWithLlm(input, client, hint);
  if (concept) return concept;
  throw new Error('IdeaLens 未能解析出有效的产品概念');
}

async function generateConceptWithLlm(input: IdeaLensInput, client: LlmClient, hint?: string): Promise<ProductConcept | null> {
  const styleCue = input.profile.visualLikes.slice(0, 3).join('、') || '蓝白线条';
  const products = input.profile.productPreferences.slice(0, 2).join('、') || '轻量工具';

  if (hint) console.log('[IdeaLens] 应用自学习提示:', hint.slice(0, 50));
  const system = [
    hint,
    '你是一位资深产品经理，擅长把模糊想法快速收束为一个清晰、可讨论的产品概念。',
    '只输出一个 JSON 对象，不要任何解释文字、不要 markdown 代码块标记。',
    'JSON 字段：name(产品名,中文,2-8字)、tagline(一句话定位,中文)、positioning(定位描述,中文,1-2句)、',
    'coreProblem(核心问题,中文)、targetUser(目标用户,中文)、valueProposition(价值主张,中文)、',
    'features(数组,4条中文短句)、visualDirection(数组,3条中文短句,描述视觉风格)。',
  ].join('');

  const userContent = [
    `想法：${input.idea}`,
    `方向类型：${labelIntent(input.intent)}`,
    input.contextLine ? `相关上下文：${input.contextLine}` : '',
    `用户偏好视觉：${styleCue}`,
    `用户常做产品方向：${products}`,
    '请基于以上把这个想法收束成一个产品概念，严格输出 JSON。',
  ].filter(Boolean).join('\n');

  const response = await client.generate({
    system,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 1200,
  });

  const parsed = extractJson<Partial<ProductConcept>>(response.text);
  if (!parsed || !parsed.name || !parsed.tagline || !Array.isArray(parsed.features)) return null;

  return {
    name: parsed.name,
    tagline: parsed.tagline,
    positioning: parsed.positioning ?? '',
    coreProblem: parsed.coreProblem ?? '',
    targetUser: parsed.targetUser ?? '',
    valueProposition: parsed.valueProposition ?? '',
    features: parsed.features,
    visualDirection: parsed.visualDirection ?? [],
  };
}

function labelIntent(intent: AgentIntent): string {
  switch (intent) {
    case 'browser-extension': return '浏览器插件';
    case 'creator-tool': return '创作工具';
    case 'learning-tool': return '学习工具';
    case 'playful-tool': return '陪伴型小工具';
    default: return '效率工具';
  }
}
