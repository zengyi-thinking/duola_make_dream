import type { RuntimeConfig } from '@/lib/agent/types';
import { buildPipelineTrace, createPipelineStage } from '@/lib/agent/pipeline';
import { generateImageWithAdapter } from './adapter';
import type { GeneratedImageRecord, ImageGenerationRequest } from './types';

export function createImageGenerationRequest(
  input: Omit<ImageGenerationRequest, 'id' | 'createdAt'>,
): ImageGenerationRequest {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...input,
  };
}

export async function runImageGeneration(
  input: Omit<ImageGenerationRequest, 'id' | 'createdAt'>,
  runtimeConfig: RuntimeConfig,
): Promise<{ request: ImageGenerationRequest; record: GeneratedImageRecord }> {
  const request = createImageGenerationRequest(input);
  const record = await generateImageWithAdapter(request, runtimeConfig);
  const pipelineTrace = buildPipelineTrace({
    kind: 'image',
    title: request.title,
    summary: record.previewText ?? `状态：${record.status}`,
    sourceId: request.relatedNoteId ?? request.id,
    stages: [
      createPipelineStage('plan', '规划', '锁定图片来源与目标', `${request.sourceType} · ${request.style}`),
      createPipelineStage('research', '调研', '整理提示词与上下文', request.content.slice(0, 48) || '没有正文内容'),
      createPipelineStage('reflect', '反思', '对齐当前图片模型配置', runtimeConfig.activeImageProfileId ?? '默认配置'),
      createPipelineStage('outline', '信息编排', '提交异步生成任务', request.title || request.sourceType),
      createPipelineStage('generate', '生成', record.status === 'done' ? '图片已返回' : record.previewText ?? '生成未完成', record.status === 'done' ? undefined : record.status, record.status === 'done' ? 'done' : 'skipped'),
    ],
  });
  return { request, record: { ...record, pipelineTrace } };
}
