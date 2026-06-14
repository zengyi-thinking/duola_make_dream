/**
 * StructureAgent —— 发明链路第 4 阶段：信息编排，生成产品概念 + 图片 prompt + MVP 计划。
 * 平移自 processIdeaSubmission 的中段（runIdeaLens + runProductCamera + runShrinkLight）。
 * 调 LLM（三个 gadget），降级策略与原 orchestrator 一致（mock→模板/失败→模板）。
 * ctx.hint = voice + tone + harness 合并后的 system prompt 片段，注入三个 gadget。
 */
import type { AgentIntent, ProductConcept, UserProfile } from '@/lib/agent/types';
import type { AgentRunResult, SubAgent } from '../types';
import { runIdeaLens, runProductCamera, runShrinkLight } from '@/lib/agent/gadgets';
import { createGraphNode } from '@/lib/graph/types';

export interface StructureInput {
  idea: string;
  intent: AgentIntent;
  profile: UserProfile;
  contextLine: string;
}
export interface StructureOutput {
  concept: ProductConcept;
  imagePrompt: string;
  mvpPlan: string[];
  nextTasks: string[];
}

export const structureAgent: SubAgent<StructureInput, StructureOutput> = {
  id: 'structure',
  stage: 'outline',
  needsLlm: true,
  async run(input, ctx): Promise<AgentRunResult<StructureOutput>> {
    ctx.emit({ agentId: 'structure', status: 'running', stage: 'outline', message: 'Structuring…生成产品概念与 MVP' });
    const concept = await runIdeaLens(
      { idea: input.idea, intent: input.intent, profile: input.profile, contextLine: input.contextLine },
      ctx.client,
      ctx.hint,
    );
    const imagePrompt = await runProductCamera(concept, ctx.client, ctx.hint);
    const shrink = await runShrinkLight(concept, ctx.client, ctx.hint);
    const output: StructureOutput = { concept, imagePrompt, mvpPlan: shrink.mvpPlan, nextTasks: shrink.nextTasks };
    const stageNode = createGraphNode({
      type: 'structure',
      title: concept.name,
      summary: concept.tagline,
      payload: output,
    });
    ctx.emit({ agentId: 'structure', status: 'done', stage: 'outline', message: `计划图就绪：${concept.name}`, partial: stageNode });
    return {
      output,
      stageNode,
      experience: {
        outcome: 'success',
        agentId: 'structure',
        summary: `生成概念 ${concept.name}`,
        lesson: ctx.client.kind === 'mock' ? 'mock 模板产出（行为等价基线）' : '真实 LLM 产出',
      },
    };
  },
};
