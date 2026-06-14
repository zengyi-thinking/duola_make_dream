/**
 * StructureAgent —— 发明链路第 4 阶段：信息编排，生成产品概念 + 计划面板 + 图片 prompt + MVP。
 * 平移自 processIdeaSubmission 的中段（runIdeaLens + runProductCamera + runShrinkLight）。
 *
 * 产品重设计：runIdeaLens 现在产出信息密集型 PlanBoardData（含 5 类模块），
 * 本 agent 把它放进 StructureOutput.planBoard，Director 再写入 artifact.planBoard，
 * 供前端 PlanBoard 组件与 InfographicPanel 渲染。
 *
 * 降级策略与原 orchestrator 一致（mock→模板/失败→模板）。ctx.hint 注入三个 gadget。
 */
import type { AgentIntent, PlanBoardData, ProductConcept, UserProfile } from '@/lib/agent/types';
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
  /** 兼容字段（ProductConcept 子集），旧消费方仍可用 */
  concept: ProductConcept;
  /** 信息密集型计划面板数据（PlanBoard/InfographicPanel 渲染源） */
  planBoard: PlanBoardData;
  imagePrompt: string;
  mvpPlan: string[];
  nextTasks: string[];
}

export const structureAgent: SubAgent<StructureInput, StructureOutput> = {
  id: 'structure',
  stage: 'outline',
  needsLlm: true,
  async run(input, ctx): Promise<AgentRunResult<StructureOutput>> {
    ctx.emit({ agentId: 'structure', status: 'running', stage: 'outline', message: 'Structuring…生成计划面板与 MVP' });
    const planBoard = await runIdeaLens(
      { idea: input.idea, intent: input.intent, profile: input.profile, contextLine: input.contextLine },
      ctx.client,
      ctx.hint,
    );
    const imagePrompt = await runProductCamera(planBoard, ctx.client, ctx.hint);
    const shrink = await runShrinkLight(planBoard, ctx.client, ctx.hint);
    const output: StructureOutput = {
      concept: planBoard,
      planBoard,
      imagePrompt,
      mvpPlan: shrink.mvpPlan,
      nextTasks: shrink.nextTasks,
    };
    const stageNode = createGraphNode({
      type: 'structure',
      title: planBoard.name,
      summary: planBoard.tagline,
      payload: output,
    });
    ctx.emit({ agentId: 'structure', status: 'done', stage: 'outline', message: `计划面板就绪：${planBoard.name}`, partial: stageNode });
    return {
      output,
      stageNode,
      experience: {
        outcome: 'success',
        agentId: 'structure',
        summary: `生成计划 ${planBoard.name}（${planBoard.modules.length} 模块）`,
        lesson: ctx.client.kind === 'mock' ? 'mock 模板产出（含 5 类模块）' : '真实 LLM 产出信息密集计划',
      },
    };
  },
};
