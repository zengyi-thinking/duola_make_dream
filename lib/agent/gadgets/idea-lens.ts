import type { AgentIntent, ProductConcept, UserProfile } from '../types';
import type { LlmClient } from '@/lib/llm';
import { extractJson } from '@/lib/llm/json';

export interface IdeaLensInput {
  idea: string;
  intent: AgentIntent;
  profile: UserProfile;
  contextLine?: string;
}

const INTENT_LABELS: Record<AgentIntent, { suffix: string; audience: string; anchor: string }> = {
  'browser-extension': {
    suffix: 'Pocket',
    audience: '经常在浏览器里整理信息、想法很多但落地时间少的人',
    anchor: '把网页瞬间灵感变成一个可执行的小产品草图',
  },
  'productivity-tool': {
    suffix: 'Flow',
    audience: '需要把模糊任务快速拆清楚的个人创作者和独立开发者',
    anchor: '减少从想法到执行之间的摩擦',
  },
  'creator-tool': {
    suffix: 'Sketch',
    audience: '有视觉表达需求、但不想从空白画布开始的人',
    anchor: '先拿到可讨论的创意版本，再慢慢打磨',
  },
  'learning-tool': {
    suffix: 'Loop',
    audience: '想把知识点变成可反复练习、可视化成果的人',
    anchor: '把信息转换成可反馈的小练习或工具',
  },
  'playful-tool': {
    suffix: 'Joy',
    audience: '希望产品更轻快、更具陪伴感的用户',
    anchor: '让工具像一个有趣的小伙伴，而不是冷冰冰的面板',
  },
};

/**
 * 把想法收束为产品概念。
 *
 * 降级策略：
 * - mock 客户端 → 走模板逻辑（开箱即用）
 * - 真实 LLM 调用成功 → 走真实结果
 * - 真实 LLM 调用失败或解析失败 → 降级到模板逻辑，永不崩溃
 */
export async function runIdeaLens(input: IdeaLensInput, client: LlmClient, hint?: string): Promise<ProductConcept> {
  if (client.kind === 'mock') {
    return buildTemplateConcept(input);
  }

  const concept = await generateConceptWithLlm(input, client, hint);
  if (concept) return concept;

  // 真实 LLM 失败 → 降级到模板（绝不抛错）
  console.warn('[IdeaLens] LLM 解析失败，降级到模板');
  return buildTemplateConcept(input);
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
  ].filter(Boolean).join('');

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

function buildTemplateConcept(input: IdeaLensInput): ProductConcept {
  const sourceLine = INTENT_LABELS[input.intent];
  const keywords = pickKeywords(input.idea);
  const primaryKeyword = keywords[0] ?? 'Idea';
  const styleCue = input.profile.visualLikes.slice(0, 2).join('、') || '蓝白线条';
  const contextTail = input.contextLine ? `，并借用了"${input.contextLine}"里的情境` : '';

  return {
    name: buildProductName(primaryKeyword, sourceLine.suffix),
    tagline: `把 ${primaryKeyword} 变成可拿出来讨论的产品草图`,
    positioning: `一个面向 ${sourceLine.audience} 的轻量 ${labelIntent(input.intent)}${contextTail}。`,
    coreProblem: `用户已经有方向感，但缺少一个能把想法快速具象化的第一版容器。`,
    targetUser: sourceLine.audience,
    valueProposition: `用一个温暖、轻量、低门槛的创意工作台，把一句话想法扩展成名字、定位、视觉方向和 MVP。`,
    features: [
      `一句话想法转产品概念`,
      `自动生成视觉方向与图片 Prompt`,
      `把大想法压缩成 3 步 MVP`,
      `记录你的风格偏好与负反馈`,
    ],
    visualDirection: [
      `${styleCue} 的口袋感界面`,
      '白底、深蓝描边、轻手稿感留白',
      '模块像从口袋里抽出的道具卡',
    ],
  };
}

function pickKeywords(input: string): string[] {
  return input
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
}

function buildProductName(primaryKeyword: string, suffix: string): string {
  const cleaned = primaryKeyword
    .replace(/[^a-zA-Z0-9一-龥]/g, '')
    .slice(0, 8);

  if (!cleaned) {
    return `Pocket${suffix}`;
  }

  if (/^[A-Za-z]/.test(cleaned)) {
    return `${capitalize(cleaned)}${suffix}`;
  }

  return `${cleaned}${suffix}`;
}

function capitalize(input: string): string {
  return input.slice(0, 1).toUpperCase() + input.slice(1);
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
