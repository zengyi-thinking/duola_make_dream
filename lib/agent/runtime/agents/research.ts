/**
 * ResearchAgent —— 发明链路第 2 阶段：基于想法召回关联记忆/产物/笔记。
 * 平移自 buildKnowledgeRecall（三层混合召回：字面/主题/关系图）。
 * 不调 LLM（纯本地召回）。召回结果在计划图生成后展示（修正旧 RecallPanel 立即召回的时序）。
 */
import type { MemorySummary, ProductArtifact, RecallItem } from '@/lib/agent/types';
import type { GeneratedImageRecord } from '@/lib/image/types';
import type { AgentRunResult, SubAgent } from '../types';
import { buildKnowledgeRecall } from '@/lib/agent/recall';
import { createGraphNode } from '@/lib/graph/types';

export interface ResearchInput {
  query: string;
  memory: MemorySummary;
  artifacts?: ProductArtifact[];
  images?: GeneratedImageRecord[];
  limit?: number;
}
export interface ResearchOutput {
  recallItems: RecallItem[];
}

export const researchAgent: SubAgent<ResearchInput, ResearchOutput> = {
  id: 'research',
  stage: 'research',
  needsLlm: false,
  async run(input, ctx): Promise<AgentRunResult<ResearchOutput>> {
    ctx.emit({ agentId: 'research', status: 'running', stage: 'research', message: 'Researching…召回关联记忆与调研节点' });
    const recallItems = buildKnowledgeRecall({
      query: input.query,
      memory: input.memory,
      artifacts: input.artifacts,
      images: input.images,
      limit: input.limit ?? 6,
    });
    const output: ResearchOutput = { recallItems };
    const stageNode = createGraphNode({
      type: 'research',
      title: `调研：召回 ${recallItems.length} 条关联`,
      summary: recallItems.slice(0, 3).map((r) => r.title).join(' / ') || '暂无关联记忆（将展示 Agent 调研节点）',
      payload: { count: recallItems.length, via: recallItems.map((r) => r.recallDetail?.via) },
    });
    ctx.emit({ agentId: 'research', status: 'done', stage: 'research', message: `召回 ${recallItems.length} 条`, partial: stageNode });
    return {
      output,
      stageNode,
      experience: recallItems.length === 0
        ? { outcome: 'failure', agentId: 'research', summary: '无关联记忆命中', lesson: '历史数据少时召回为空，应展示 Agent 调研节点兜底' }
        : { outcome: 'success', agentId: 'research', summary: `召回 ${recallItems.length} 条`, lesson: '三层混合召回生效' },
    };
  },
};
