import type { ModelProfile, RuntimeConfig } from '@/lib/agent/types';
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
 * - 读取激活的图片配置档 → 真实调用图片 API
 * - 未配置 / 配置不完整 → 返回 mock 或 failed 记录，避免静默失联
 *
 * privacy-check: allow — 仅发送 prompt 文本到用户配置的图片端点
 */
export async function generateImageWithAdapter(
  request: ImageGenerationRequest,
  runtimeConfig: RuntimeConfig,
): Promise<GeneratedImageRecord> {
  const prompt = buildImagePrompt(request);
  const profile = runtimeConfig.imageProfiles.find((p) => p.id === runtimeConfig.activeImageProfileId)
    ?? runtimeConfig.imageProfiles[0]
    ?? null;
  const baseRecord = {
    id: crypto.randomUUID(),
    requestId: request.id,
    request,
    prompt,
    model: profile?.model ?? 'gpt-image-2',
    createdAt: Date.now(),
  };

  if (!profile) {
    return {
      ...baseRecord,
      status: 'mocked',
      previewText: '没有找到图片配置档，当前仅保留 Prompt 记录。',
    };
  }

  if (!profile.apiKey || !profile.endpoint || !profile.model) {
    return {
      ...baseRecord,
      status: 'failed',
      previewText: '图片配置档不完整，请在设置中补全模型、端点和 API Key。',
    };
  }

  try {
    const imageUrl = await callImageApi(prompt, profile);
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

const IMAGE_POLL_INTERVAL_MS = 4000;
const IMAGE_MAX_POLLS = 45; // 45 × 4s = 180s，覆盖 2k 的 ~100s 预估 + 余量
const IMAGE_FETCH_TIMEOUT_MS = 20000;

/**
 * 调用 apimart gpt-image-2 等「异步任务式」图片端点。
 * 协议：POST /v1/images/generations 提交 → 返回 task_id → 轮询 GET /v1/tasks/{task_id} 至 completed。
 * 同时兼容少数同步直接返回 url 的端点（pickImageUrl 兜底）。
 *
 * privacy-check: allow — 仅发送 prompt 文本，轮询任务状态，不附带本地其它用户数据
 */
async function callImageApi(prompt: string, profile: ModelProfile): Promise<string> {
  const origin = new URL(profile.endpoint).origin;

  // 1. 提交任务
  const submit = await postJson(profile.endpoint, profile.apiKey, {
    // apimart gpt-image-2 接受宽高比（如 '16:9'）+ resolution，而非 OpenAI 像素格式。
    model: profile.model,
    prompt,
    n: 1,
    size: '16:9',
    resolution: '2k',
  }, 30000);

  // 兜底：个别端点可能同步直接返回图片
  const directUrl = pickImageUrl(submit);
  if (directUrl) return directUrl;

  // 提交返回 task_id（apimart: data[0].task_id；个别端点: data.task_id）
  const taskId: unknown = submit?.data?.[0]?.task_id ?? submit?.data?.task_id;
  if (typeof taskId !== 'string' || !taskId) {
    throw new Error('图片 API 未返回 task_id（异步任务标识）');
  }

  // 2. 轮询任务结果
  const tasksUrl = `${origin}/v1/tasks/${taskId}`;
  for (let i = 0; i < IMAGE_MAX_POLLS; i++) {
    await sleep(IMAGE_POLL_INTERVAL_MS);
    const polled = await getJson(tasksUrl, profile.apiKey);
    const task = polled?.data;
    const status = task?.status;

    if (status === 'completed' || status === 'succeeded') {
      const url = pickImageUrl(task);
      if (url) return url;
      throw new Error('图片任务已完成但未返回图片地址');
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`图片任务执行失败：${task?.error ?? status}`);
    }
    // pending / processing → 继续轮询
  }
  throw new Error(`图片生成超时（轮询 ${(IMAGE_MAX_POLLS * IMAGE_POLL_INTERVAL_MS) / 1000}s 未完成）`);
}

async function postJson(url: string, apiKey: string, body: unknown, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`, // privacy-check: allow
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`[${res.status}] ${errText.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url: string, apiKey: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}` }, // privacy-check: allow
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`[${res.status}] ${errText.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 从任务对象或同步响应里提取图片地址，兼容多种字段命名（apimart: result.images[].url[]）。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickImageUrl(node: any): string | null {
  if (!node) return null;
  const images = node?.result?.images ?? node?.images ?? node?.data?.result?.images;
  const first = Array.isArray(images) ? images[0] : images;
  let url: unknown = first?.url ?? first?.image_url;
  if (Array.isArray(url)) url = url[0];
  if (typeof url === 'string' && url) return url;
  const b64: unknown = first?.b64_json;
  if (typeof b64 === 'string' && b64) {
    return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
