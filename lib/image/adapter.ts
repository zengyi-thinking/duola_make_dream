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

/**
 * 生成图片记录。
 * - imageMode === 'proxy' 且配置了 endpoint+key → 真实调用图片 API
 * - 否则 → mock，仅返回 prompt 文本
 *
 * privacy-check: allow — 仅发送 prompt 文本到用户配置的图片端点
 */
export async function generateImageWithAdapter(
  request: ImageGenerationRequest,
  runtimeConfig: RuntimeConfig,
): Promise<GeneratedImageRecord> {
  const prompt = buildImagePrompt(request);
  const baseRecord = {
    id: crypto.randomUUID(),
    requestId: request.id,
    prompt,
    model: runtimeConfig.imageModel,
    createdAt: Date.now(),
  };

  if (runtimeConfig.imageMode !== 'proxy' || !runtimeConfig.imageProxyEndpoint) {
    return {
      ...baseRecord,
      status: 'mocked',
      previewText: '当前使用 mock。在设置中切换为「真实生成」可调用图片 API。',
    };
  }

  if (!runtimeConfig.imageApiKey) {
    return {
      ...baseRecord,
      status: 'failed',
      previewText: '图片 API Key 未配置。请在设置中填写。',
    };
  }

  try {
    const imageUrl = await callImageApi(prompt, runtimeConfig);
    return {
      ...baseRecord,
      status: 'done',
      imageUrl,
      previewText: '图片已生成。',
    };
  } catch (err) {
    return {
      ...baseRecord,
      status: 'failed',
      previewText: `图片生成失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * 调用 OpenAI 兼容的 images/generations 端点。
 * 兼容 apimart.ai（GPT Image）及类似代理。
 */
async function callImageApi(prompt: string, config: RuntimeConfig): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(config.imageProxyEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${config.imageApiKey}`, // privacy-check: allow
      },
      body: JSON.stringify({
        model: config.imageModel,
        prompt,
        n: 1,
        size: '1024x1024',
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`[${res.status}] ${errText.slice(0, 200)}`);
    }

    const data = await res.json() as {
      data?: Array<{ url?: string; b64_json?: string }>;
    };

    const item = data.data?.[0];
    if (!item) throw new Error('图片 API 返回为空');

    if (item.url) return item.url;
    if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;

    throw new Error('图片 API 未返回 url 或 b64_json');
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('图片请求超时（60s）');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
