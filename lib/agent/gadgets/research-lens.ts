import type { AgentIntent, RecallItem } from '../types';
import type { LlmClient } from '@/lib/llm';
import { extractJson } from '@/lib/llm/json';

/**
 * 调研放大镜 —— 基于想法做"内置知识调研"（不联网，零成本，纯 LLM 训练知识）。
 *
 * 设计动机（产品重设计）：发明页要求"计划后面以图展示关联笔记 + agent 调研信息，节点地位相同；
 * 用户无关联记忆时，agent 调研作为图谱兜底"。researchAgent 先本地召回（buildKnowledgeRecall），
 * 再用本 gadget 补充 LLM 调研，合并为多个 research 节点。
 *
 * 降级策略（与 idea-lens 一致）：
 * - mock 客户端 → 模板（开箱即用）
 * - 真实 LLM 成功 → 真实调研发现
 * - 真实 LLM 失败/解析失败 → 降级模板，永不崩溃
 */
export interface ResearchFinding {
  title: string;
  points: string[];
  relevance: string;
}

export interface ResearchLensInput {
  idea: string;
  intent: AgentIntent;
  /** 本地召回结果，作为上下文喂给 LLM（避免重复、提示已有线索） */
  recallItems?: RecallItem[];
  /** 期望发现条数 */
  limit?: number;
}

export interface ResearchLensResult {
  findings: ResearchFinding[];
  source: 'mock' | 'llm' | 'template';
}

export async function runResearchLens(
  input: ResearchLensInput,
  client: LlmClient,
  hint?: string,
): Promise<ResearchLensResult> {
  if (client.kind === 'mock') {
    return { findings: buildTemplateFindings(input), source: 'mock' };
  }
  const findings = await generateFindingsWithLlm(input, client, hint);
  if (findings && findings.length > 0) return { findings, source: 'llm' };
  console.warn('[ResearchLens] LLM 解析失败，降级到模板');
  return { findings: buildTemplateFindings(input), source: 'template' };
}

async function generateFindingsWithLlm(
  input: ResearchLensInput,
  client: LlmClient,
  hint?: string,
): Promise<ResearchFinding[] | null> {
  const limit = input.limit ?? 4;
  const recallLine = (input.recallItems ?? []).slice(0, 3).map((r) => `- ${r.title}：${r.detail}`).join('\n');

  const system = [
    hint,
    '你是资深行业研究员与产品顾问。基于你的训练知识（不要联网、不要编造具体数字），',
    '针对用户想法从多个维度（市场前景/目标用户/关键能力/竞品或现状/潜在风险/可借鉴案例）给出有价值的调研发现。',
    '只输出一个 JSON 对象，不要解释文字、不要 markdown 代码块标记。',
    `JSON 格式：{"findings":[{"title":"主题(中文,4-10字)","points":["要点1","要点2"],"relevance":"与用户想法的关联或启示(中文,1-2句)"}]}，`,
    `给出 ${limit} 条发现，每条 2-3 个要点。内容要具体、有洞察，避免空话套话。`,
  ].filter(Boolean).join('');

  const userContent = [
    `想法：${input.idea}`,
    `方向类型：${labelIntent(input.intent)}`,
    recallLine ? `已有相关记忆（避免重复，可延伸）：\n${recallLine}` : '',
    '请基于以上给出调研发现，严格输出 JSON。',
  ].filter(Boolean).join('\n');

  const response = await client.generate({
    system,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 1800,
  });

  const parsed = extractJson<{ findings?: Partial<ResearchFinding>[] }>(response.text);
  if (!parsed || !Array.isArray(parsed.findings)) return null;

  const findings: ResearchFinding[] = parsed.findings
    .map((f) => ({
      title: String(f?.title ?? '').trim(),
      points: Array.isArray(f?.points) ? f!.points.map((p) => String(p).trim()).filter(Boolean) : [],
      relevance: String(f?.relevance ?? '').trim(),
    }))
    .filter((f) => f.title && (f.points.length > 0 || f.relevance));

  return findings.slice(0, limit);
}

/** 模板调研发现（mock/降级用）—— 覆盖市场/用户/能力/风险四个通用维度。 */
function buildTemplateFindings(input: ResearchLensInput): ResearchFinding[] {
  const keyword = pickPrimaryKeyword(input.idea);
  return [
    {
      title: '市场前景',
      points: [`${keyword}所在的领域有稳定需求，关键在于差异化定位`, '小切入口、高复用，比大而全更易冷启动'],
      relevance: `先验证"${keyword}"的最小人群与最高频场景，再扩展。`,
    },
    {
      title: '目标用户',
      points: ['核心用户是已有明确痛点、愿意动手的人', '次级用户是被核心用户带动而来的跟随者'],
      relevance: `把"${keyword}"做成让核心用户爱不释手的第一版，口碑会带来次级用户。`,
    },
    {
      title: '关键能力',
      points: ['把模糊输入结构化为可讨论的产物', '低门槛、可即时反馈、能持续积累'],
      relevance: `"${keyword}"若能减少从想法到落地的摩擦，就抓住了核心价值。`,
    },
    {
      title: '潜在风险',
      points: ['容易做太宽，初期应聚焦单一场景', '内容/数据冷启动需要种子'],
      relevance: `为"${keyword}"设定一个清晰的"不做什么"边界，避免分散。`,
    },
  ];
}

function pickPrimaryKeyword(idea: string): string {
  const keywords = idea
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return keywords[0] ?? '这个想法';
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
