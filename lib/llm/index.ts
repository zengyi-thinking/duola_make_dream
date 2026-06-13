import type { LlmClient } from './types';
import { createAnthropicCompatibleClient } from './client';
import { createMockLlmClient } from './mock-client';
import { getRuntimeConfig } from '@/lib/storage/local';

export type { LlmClient, LlmRequest, LlmResponse, LlmMessage } from './types';
export { createAnthropicCompatibleClient } from './client';
export { createMockLlmClient } from './mock-client';

/**
 * 根据运行时配置返回 LLM 客户端。
 * - mock → 本地模拟客户端
 * - minimax / anthropic / custom → Anthropic 兼容客户端（走真实 API）
 */
export async function getLlmClient(): Promise<LlmClient> {
  const cfg = await getRuntimeConfig();

  if (cfg.llmProvider === 'mock') {
    return createMockLlmClient();
  }

  return createAnthropicCompatibleClient({
    apiKey: cfg.llmApiKey,
    endpoint: cfg.llmEndpoint,
    model: cfg.llmModel,
  });
}
