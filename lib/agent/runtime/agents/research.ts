/**
 * ResearchAgent —— 发明链路第 2 阶段：召回关联记忆 + LLM 内置知识调研。
 *
 * 产品重设计：用户要求"计划后面以图展示关联笔记 + agent 调研信息，节点地位相同；
 * 用户无关联记忆时，agent 调研作为图谱兜底"。因此：
 * 1. buildKnowledgeRecall 做本地三层召回（字面/主题/关系图）→ 每条召回建一个 research 节点；
 * 2. runResearchLens 调 LLM 基于训练知识做调研（不联网，零成本）→ 每条发现建一个 research 节点；
 * 3. 两类节点同为 research 类型、同色同地位，合并进 stageNodes。
 * 召回为空时，LLM 调研至少 3 条兜底，图谱永不空。
 */
import type { AgentIntent, MemorySummary, ProductArtifact, RecallItem } from '@/lib/agent/types';
import type { GeneratedImageRecord } from '@/lib/image/types';
import type { AgentRunResult, SubAgent } from '../types';
import { buildKnowledgeRecall } from '@/lib/agent/recall';
import { runResearchLens, type ResearchFinding } from '@/lib/agent/gadgets/research-lens';
import { createGraphNode } from '@/lib/graph/types';

export interface ResearchInput {
  query: string;
  intent: AgentIntent;
  memory: MemorySummary;
  artifacts?: ProductArtifact[];
  images?: GeneratedImageRecord[];
  limit?: number;
}
export interface ResearchOutput {
  recallItems: RecallItem[];
  findings: ResearchFinding[];
  /** 调研来源：mock/llm/template（用于经验沉淀与 UI 提示） */
  source: 'mock' | 'llm' | 'template';
}

export const researchAgent: SubAgent<ResearchInput, ResearchOutput> = {
  id: 'research',
  stage: 'research',
  needsLlm: true,
  async run(input, ctx): Promise<AgentRunResult<ResearchOutput>> {
    ctx.emit({ agentId: 'research', status: 'running', stage: 'research', message: 'Researching…召回关联记忆 + LLM 内置调研' });

    // 1. 本地三层召回
    const recallItems = buildKnowledgeRecall({
      query: input.query,
      memory: input.memory,
      artifacts: input.artifacts,
      images: input.images,
      limit: input.limit ?? 6,
    });

    // 2. LLM 内置知识调研（不联网）
    const lens = await runResearchLens(
      { idea: input.query, intent: input.intent, recallItems, limit: 4 },
      ctx.client,
      ctx.hint,
    );

    // 3. 合并为多个 research 节点（召回 + 调研，地位相同）
    const nodes = [
      ...recallItems.map((r) =>
        createGraphNode({
          type: 'research',
          title: r.title,
          summary: r.detail,
          payload: { via: 'recall', kind: r.kind, reason: r.reason, tags: r.tags },
          sourceId: r.id,
        }),
      ),
      ...lens.findings.map((f, i) =>
        createGraphNode({
          type: 'research',
          title: f.title,
          summary: f.relevance || f.points.join(' / '),
          payload: { via: 'research', points: f.points, relevance: f.relevance, order: i },
        }),
      ),
    ];

    const output: ResearchOutput = {
      recallItems,
      findings: lens.findings,
      source: lens.source,
    };

    ctx.emit({
      agentId: 'research',
      status: 'done',
      stage: 'research',
      message: `召回 ${recallItems.length} 条 + 调研 ${lens.findings.length} 条`,
    });

    const totalCount = recallItems.length + lens.findings.length;
    return {
      output,
      stageNodes: nodes,
      experience:
        totalCount === 0
          ? { outcome: 'failure', agentId: 'research', summary: '召回与调研均为空', lesson: '极端情况：mock 且无模板' }
          : {
              outcome: 'success',
              agentId: 'research',
              summary: `召回 ${recallItems.length} + 调研 ${lens.findings.length}（${lens.source}）`,
              lesson: recallItems.length === 0 ? '历史数据少，LLM 调研兜底生效' : '本地召回 + LLM 调研合并',
            },
    };
  },
};
