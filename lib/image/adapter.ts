import type { RuntimeConfig } from '@/lib/agent/types';
import type { GeneratedImageRecord, ImageGenerationRequest } from './types';

export function buildImagePrompt(request: ImageGenerationRequest): string {
  const styleMap = {
    'line-art': 'minimalist line-art illustration, blue and white palette, pocket assistant aesthetic',
    'product-ui': 'clean product UI concept, browser extension popup, product design framing',
    'knowledge-card': 'knowledge card poster, structured typography, educational card composition',
    poster: 'clean poster layout, visual hierarchy, concept poster design',
    mindmap: 'structured mindmap poster, concept graph, blue-white knowledge map',
  } satisfies Record<ImageGenerationRequest['style'], string>;

  return [
    `Source: ${request.sourceType}.`,
    `Title: ${request.title}.`,
    `Style: ${styleMap[request.style]}.`,
    `Content: ${request.content}.`,
    'Do not use copyrighted cartoon characters. Keep the visual language original, soft, pocket-like, and product-ready.',
  ].join(' ');
}

export async function generateImageWithAdapter(
  request: ImageGenerationRequest,
  runtimeConfig: RuntimeConfig,
): Promise<GeneratedImageRecord> {
  const prompt = buildImagePrompt(request);

  if (runtimeConfig.imageMode === 'proxy' && runtimeConfig.imageProxyEndpoint) {
    return {
      id: crypto.randomUUID(),
      requestId: request.id,
      prompt,
      status: 'queued',
      previewText: '已为后续代理调用准备好图片请求。',
      model: runtimeConfig.imageModel,
      createdAt: Date.now(),
    };
  }

  return {
    id: crypto.randomUUID(),
    requestId: request.id,
    prompt,
    status: 'mocked',
    previewText: '当前阶段使用 mock adapter。未来可由 gpt-image-2 或代理服务生成正式图片。',
    model: runtimeConfig.imageModel,
    createdAt: Date.now(),
  };
}
