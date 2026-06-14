/**
 * PlanAgent —— 发明链路第 1 阶段：意图路由 + 上下文锁定。
 * 平移自 processIdeaSubmission 的前段（routeIdeaIntent + anywhere-door 上下文）。
 * 不调 LLM（纯关键词路由）。
 */
import type { AgentIntent } from '@/lib/agent/types';
import type { AgentRunResult, SubAgent } from '../types';
import { routeIdeaIntent } from '@/lib/agent/router';
import { createGraphNode } from '@/lib/graph/types';

export interface PlanInput {
  idea: string;
  contextLine?: string;
}
export interface PlanOutput {
  idea: string;
  intent: AgentIntent;
  contextLine: string;
}

export const planAgent: SubAgent<PlanInput, PlanOutput> = {
  id: 'plan',
  stage: 'plan',
  needsLlm: false,
  async run(input, ctx): Promise<AgentRunResult<PlanOutput>> {
    ctx.emit({ agentId: 'plan', status: 'running', stage: 'plan', message: 'Planning…锁定输入与目标' });
    const intent = routeIdeaIntent(input.idea);
    const output: PlanOutput = { idea: input.idea, intent, contextLine: input.contextLine ?? '' };
    const stageNode = createGraphNode({
      type: 'plan',
      title: `意图：${labelIntent(intent)}`,
      summary: output.contextLine ? `带入上下文：${output.contextLine.slice(0, 60)}` : '无额外上下文',
      payload: { intent, contextLine: output.contextLine },
    });
    ctx.emit({ agentId: 'plan', status: 'done', stage: 'plan', message: '规划完成', partial: stageNode });
    return {
      output,
      stageNode,
      experience: { outcome: 'success', agentId: 'plan', summary: `识别意图 ${intent}`, lesson: '关键词路由稳定命中' },
    };
  },
};

function labelIntent(intent: AgentIntent): string {
  switch (intent) {
    case 'browser-extension': return '浏览器插件';
    case 'creator-tool': return '创作工具';
    case 'learning-tool': return '学习工具';
    case 'playful-tool': return '陪伴型小工具';
    default: return '效率工具';
  }
}
