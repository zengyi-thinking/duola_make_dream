/**
 * ImageAgent —— 发明链路生图阶段（计划图确认后单独触发）。
 * 平移自 runImageGeneration（image service），用 concept 生成实际图片。
 * 调图片 API（非 LLM），mock/failed/done 三态降级。
 */
import type { ProductConcept, RuntimeConfig } from '@/lib/agent/types';
import type { GeneratedImageRecord, ImageGenerationStyle } from '@/lib/image/types';
import type { AgentRunResult, SubAgent } from '../types';
import { runImageGeneration } from '@/lib/image/service';
import { createGraphNode } from '@/lib/graph/types';

export interface ImageInput {
  concept: ProductConcept;
  style: ImageGenerationStyle;
  runtimeConfig: RuntimeConfig;
}
export interface ImageOutput {
  imageRecord: GeneratedImageRecord;
}

export const imageAgent: SubAgent<ImageInput, ImageOutput> = {
  id: 'image',
  stage: 'generate',
  needsLlm: true,
  async run(input, ctx): Promise<AgentRunResult<ImageOutput>> {
    ctx.emit({ agentId: 'image', status: 'running', stage: 'generate', message: 'Rendering Image…调用生图 Agent' });
    const { record } = await runImageGeneration(
      {
        sourceType: 'idea',
        title: input.concept.name,
        content: input.concept.tagline,
        style: input.style,
      },
      input.runtimeConfig,
    );
    const output: ImageOutput = { imageRecord: record };
    const stageNode = createGraphNode({
      type: 'image',
      title: record.request.title || input.concept.name,
      summary: (record.prompt ?? record.status).slice(0, 80),
      payload: record,
      sourceId: record.id,
    });
    ctx.emit({ agentId: 'image', status: 'done', stage: 'generate', message: `图片 ${record.status}`, partial: stageNode });
    return {
      output,
      stageNode,
      experience: record.status === 'done'
        ? { outcome: 'success', agentId: 'image', summary: '生图成功', lesson: '图片代理可达' }
        : { outcome: 'failure', agentId: 'image', summary: `生图 ${record.status}`, lesson: record.status === 'mocked' ? '未配置图片档，走 mock' : '生图失败，检查 endpoint/apiKey' },
    };
  },
};
