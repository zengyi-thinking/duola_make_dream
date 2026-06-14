import type { AgentIntent, PlanBoardData, PlanBoardModule, UserProfile } from '../types';
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
 * 把想法收束为信息密集型计划面板数据（PlanBoardData）。
 *
 * 产品重设计：旧版只产出 8 字段的 ProductConcept（内容单薄）。
 * 现在扩展为含 5 类模块（功能/技术路线/里程碑/竞品/风险）的 PlanBoardData，
 * 让"开一家拉面店"也能输出选址/菜单/供应链/营销/财务等丰富模块。
 *
 * 降级策略：
 * - mock 客户端 → 走模板逻辑（开箱即用，模板也产出 5 类模块）
 * - 真实 LLM 成功 → 走真实结果
 * - 真实 LLM 失败/解析失败 → 降级模板，永不崩溃
 */
export async function runIdeaLens(input: IdeaLensInput, client: LlmClient, hint?: string): Promise<PlanBoardData> {
  if (client.kind === 'mock') {
    return buildTemplateBoard(input);
  }

  const board = await generateBoardWithLlm(input, client, hint);
  if (board) return board;

  console.warn('[IdeaLens] LLM 解析失败，降级到模板');
  return buildTemplateBoard(input);
}

async function generateBoardWithLlm(input: IdeaLensInput, client: LlmClient, hint?: string): Promise<PlanBoardData | null> {
  const styleCue = input.profile.visualLikes.slice(0, 3).join('、') || '蓝白线条';
  const products = input.profile.productPreferences.slice(0, 2).join('、') || '轻量工具';

  if (hint) console.log('[IdeaLens] 应用自学习提示:', hint.slice(0, 50));
  const system = [
    hint,
    '你是一位资深产品经理与创业顾问，擅长把模糊想法收束为信息密集、可直接讨论落地的计划。',
    '只输出一个 JSON 对象，不要任何解释文字、不要 markdown 代码块标记。',
    'JSON 字段：',
    'name(名称,中文,2-8字)、tagline(一句话定位,中文)、positioning(定位描述,1-2句)、',
    'coreProblem(核心问题,中文)、targetUser(目标用户画像,中文)、valueProposition(价值主张,中文)、',
    'features(数组,4-6条中文短句,核心功能)、visualDirection(数组,3条中文短句,视觉风格)、',
    'modules(数组,4-6个对象{title,detail},功能或业务模块,detail 30-60字)、',
    'techStack(数组,3-5个{title,detail},技术路线分层或运营分层,detail 20-50字)、',
    'milestones(数组,3个{title,detail},实施里程碑,detail 20-50字)、',
    'competitors(数组,2-3个{title,detail},竞品或现状对比,detail 20-50字)、',
    'risks(数组,2-3个{title,detail},风险与对策,detail 20-50字)。',
    '内容要具体、可执行、信息密集，针对用户想法给出贴切模块，避免空话套话。',
  ].filter(Boolean).join('');

  const userContent = [
    `想法：${input.idea}`,
    `方向类型：${labelIntent(input.intent)}`,
    input.contextLine ? `相关上下文：${input.contextLine}` : '',
    `用户偏好视觉：${styleCue}`,
    `用户常做产品方向：${products}`,
    '请基于以上把这个想法收束成一份信息密集的计划，严格输出 JSON。',
  ].filter(Boolean).join('\n');

  const response = await client.generate({
    system,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 3200,
  });

  const parsed = extractJson<Partial<PlanBoardData>>(response.text);
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
    modules: normalizeModules(parsed.modules),
    techStack: normalizeModules(parsed.techStack),
    milestones: normalizeModules(parsed.milestones),
    competitors: normalizeModules(parsed.competitors),
    risks: normalizeModules(parsed.risks),
  };
}

/** 把 LLM 返回的半结构化模块数组归一化为 PlanBoardModule[]（容错缺失字段）。 */
function normalizeModules(raw: unknown): PlanBoardModule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const obj = (item ?? {}) as Record<string, unknown>;
      const title = String(obj.title ?? '').trim();
      const detail = String(obj.detail ?? '').trim();
      return { title, detail };
    })
    .filter((m) => m.title);
}

function buildTemplateBoard(input: IdeaLensInput): PlanBoardData {
  const sourceLine = INTENT_LABELS[input.intent];
  const keywords = pickKeywords(input.idea);
  const primaryKeyword = keywords[0] ?? '这个想法';
  const styleCue = input.profile.visualLikes.slice(0, 2).join('、') || '蓝白线条';
  const contextTail = input.contextLine ? `，并借用了"${input.contextLine}"里的情境` : '';

  return {
    name: buildProductName(primaryKeyword, sourceLine.suffix),
    tagline: `把 ${primaryKeyword} 变成可拿出来讨论的产品草图`,
    positioning: `一个面向 ${sourceLine.audience} 的轻量 ${labelIntent(input.intent)}${contextTail}。`,
    coreProblem: `用户已经有方向感，但缺少一个能把想法快速具象化的第一版容器。`,
    targetUser: sourceLine.audience,
    valueProposition: `用一个温暖、轻量、低门槛的创意工作台，把一句话想法扩展成可执行计划。`,
    features: [
      `一句话想法转结构化计划`,
      `自动生成技术路线与里程碑`,
      `关联记忆与调研以图展示`,
      `一键生成 16:9 计划信息图`,
      `记录你的风格偏好与反馈`,
    ],
    visualDirection: [
      `${styleCue} 的口袋感界面`,
      '白底、深蓝描边、轻手稿感留白',
      '模块像从口袋里抽出的道具卡',
    ],
    modules: [
      { title: '输入与收束', detail: `把"${primaryKeyword}"的一句话想法，收束为有名字、有定位、有目标用户的产品雏形。` },
      { title: '关联召回', detail: '从你放进口袋的网页片段与笔记里，带出与本次想法相关的上下文。' },
      { title: '内置调研', detail: `基于 Agent 知识库，针对"${primaryKeyword}"给出市场、用户、能力、风险维度的调研发现。` },
      { title: '计划面板', detail: '把以上信息编排成功能模块、技术路线、里程碑、竞品、风险五类结构化模块。' },
      { title: '信息图生成', detail: '确认计划后，一键渲染 16:9 知识密集型计划信息图，原地展示并可导出。' },
    ],
    techStack: [
      { title: '输入层', detail: '想法文本 + 选中的网页片段/笔记作为上下文。' },
      { title: 'Agent 层', detail: 'Plan → Research → Reflect → Structure 四阶段加工，可观测可投喂。' },
      { title: '记忆层', detail: '三层召回 + 力导向图谱，沉淀想法成果与笔记。' },
      { title: '展示层', detail: '精美 HTML 计划面板 + 16:9 信息图，复用莫兰迪蓝白设计 token。' },
    ],
    milestones: [
      { title: 'M1 雏形', detail: `完成"${primaryKeyword}"的计划面板与信息图，验证信息密度与美观。` },
      { title: 'M2 关联', detail: '打通记忆召回与调研，让关联图真正长出有内容的节点。' },
      { title: 'M3 沉淀', detail: '把成果并入全局记忆图，可在记忆页持续回顾与再利用。' },
    ],
    competitors: [
      { title: '空白画布', detail: '从零开始门槛高；本方案用结构化模板把想法秒变可讨论计划。' },
      { title: '通用笔记', detail: '只有记录没有加工；本方案把笔记作为图谱节点参与下一次发明。' },
    ],
    risks: [
      { title: '范围蔓延', detail: '初期易想做太多；用"不做什么"边界收敛到单一最高频场景。' },
      { title: '冷启动', detail: '历史数据少时召回为空；已用 LLM 内置调研兜底，图谱永不空。' },
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
