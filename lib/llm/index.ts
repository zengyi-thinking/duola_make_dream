import type { LlmClient } from './types';
import { createAnthropicCompatibleClient } from './client';
import { getRuntimeConfig } from '@/lib/storage/local';

export type { LlmClient, LlmRequest, LlmResponse, LlmMessage } from './types';
export { createAnthropicCompatibleClient } from './client';

/**
 * 根据激活的 LLM 配置档返回客户端（多配置档，cc-switch 风格）。
 * 无激活档或档内 key 缺失 → 抛错（由 background 的 errorResponse 兜底，不卡 sidepanel）。
 */
export async function getLlmClient(): Promise<LlmClient> {
  const cfg = await getRuntimeConfig();
  const profile = cfg.llmProfiles.find((p) => p.id === cfg.activeLlmProfileId);
  if (!profile) {
    throw new Error('未选择 LLM 配置档，请在设置中添加并激活一个配置档');
  }
  return createAnthropicCompatibleClient({
    apiKey: profile.apiKey,
    endpoint: profile.endpoint,
    model: profile.model,
  });
}
