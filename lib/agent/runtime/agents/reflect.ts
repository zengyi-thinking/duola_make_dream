/**
 * ReflectAgent —— 发明链路第 3 阶段：结合画像与 harness 自学习做反思。
 * 平移自 buildHarnessHint（把已 applied/approved 的补丁转成 system prompt 提示片段）。
 * 不调 LLM（纯函数组装 hint）。harness 的评分/markHarnessPatchesApplied 副作用由 Director 在链路末尾做。
 */
import type { HarnessPatch } from '@/lib/agent/types';
import type { AgentRunResult, SubAgent } from '../types';
import { buildHarnessHint } from '@/lib/agent/harness';
import { createGraphNode } from '@/lib/graph/types';

export interface ReflectInput {
  patches: HarnessPatch[];
}
export interface ReflectOutput {
  hint: string;
  activePatchCount: number;
}

export const reflectAgent: SubAgent<ReflectInput, ReflectOutput> = {
  id: 'reflect',
  stage: 'reflect',
  needsLlm: false,
  async run(input, ctx): Promise<AgentRunResult<ReflectOutput>> {
    ctx.emit({ agentId: 'reflect', status: 'running', stage: 'reflect', message: 'Reflecting…结合画像与自学习反思' });
    const hint = buildHarnessHint(input.patches);
    const activePatchCount = input.patches.filter((p) => p.status === 'applied' || p.status === 'approved').length;
    const output: ReflectOutput = { hint, activePatchCount };
    const stageNode = createGraphNode({
      type: 'reflect',
      title: activePatchCount > 0 ? `反思：${activePatchCount} 条自学习生效` : '反思：暂无自学习补丁',
      summary: hint ? hint.slice(0, 80) : '本轮无 harness 提示注入',
      payload: { activePatchCount },
    });
    ctx.emit({ agentId: 'reflect', status: 'done', stage: 'reflect', message: '反思完成', partial: stageNode });
    return {
      output,
      stageNode,
      experience: { outcome: 'success', agentId: 'reflect', summary: `注入 ${activePatchCount} 条自学习`, lesson: 'harness 闭环正常' },
    };
  },
};
