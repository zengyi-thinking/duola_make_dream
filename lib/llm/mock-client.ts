import type { LlmClient, LlmRequest, LlmResponse } from './types';

/**
 * Mock LLM 客户端。
 *
 * 不调用任何外部 API，直接返回请求的最后一条 user message，
 * 供 mock 链路验证数据流。fromLiveApi 恒为 false。
 */
export function createMockLlmClient(): LlmClient {
  return {
    kind: 'mock',
    async generate(req: LlmRequest): Promise<LlmResponse> {
      const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
      return {
        text: lastUser?.content ?? '',
        fromLiveApi: false,
      };
    },
  };
}
