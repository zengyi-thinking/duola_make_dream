import type { LlmClient } from './types';
import { createAnthropicCompatibleClient } from './client';
import { createMockLlmClient } from './mock-client';
import { getRuntimeConfig } from '@/lib/storage/local';

export type { LlmClient, LlmRequest, LlmResponse, LlmMessage } from './types';
export { createAnthropicCompatibleClient } from './client';

/**
 * 根据激活的 LLM 配置档返回客户端（多配置档，cc-switch 风格）。
 *
 * 策略：
 * - 找到激活档且 apiKey/endpoint/model 都非空 → 返回真实 anthropic-compatible 客户端
 * - 没找到激活档 / 档内字段缺失 → 返回 mock 客户端
 * - 任何意外（如 storage 损坏）→ 也返回 mock 客户端
 *
 * 这样保证"开箱即用"：用户没配 LLM 时整个插件能用，gadget 自动走模板；
 * 配了 LLM 后走真实模型。
 */
export async function getLlmClient(): Promise<LlmClient> {
  try {
    const cfg = await getRuntimeConfig();
    const profile = cfg.llmProfiles.find((p) => p.id === cfg.activeLlmProfileId);
    if (!profile) return createMockLlmClient();
    if (!profile.apiKey || !profile.endpoint || !profile.model) return createMockLlmClient();
    return createAnthropicCompatibleClient({
      apiKey: profile.apiKey,
      endpoint: profile.endpoint,
      model: profile.model,
    });
  } catch (err) {
    console.warn('[getLlmClient] 配置读取失败，降级到 mock：', err);
    return createMockLlmClient();
  }
}
