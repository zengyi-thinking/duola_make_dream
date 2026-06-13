import type { AgentIntent, ProductConcept, UserProfile } from '../types';

interface IdeaLensInput {
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

export function runIdeaLens(input: IdeaLensInput): ProductConcept {
  const sourceLine = INTENT_LABELS[input.intent];
  const keywords = pickKeywords(input.idea);
  const primaryKeyword = keywords[0] ?? 'Idea';
  const styleCue = input.profile.visualLikes.slice(0, 2).join('、') || '蓝白线条';
  const contextTail = input.contextLine ? `，并借用了“${input.contextLine}”里的情境` : '';

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
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '')
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
    case 'browser-extension':
      return '浏览器插件';
    case 'creator-tool':
      return '创作工具';
    case 'learning-tool':
      return '学习工具';
    case 'playful-tool':
      return '陪伴型小工具';
    default:
      return '效率工具';
  }
}
