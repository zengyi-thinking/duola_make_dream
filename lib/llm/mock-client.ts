import type { LlmClient, LlmRequest, LlmResponse } from './types';

/**
 * Mock LLM 客户端。
 *
 * 不调用任何外部 API，直接把 user message 的最后一条 content 原样回传（让调用方
 * 走完链路、用于本地验证数据流）。fromLiveApi 恒为 false。
 *
 * 在 [lib/agent/gadgets/*] 各 gadget 内部，检测到 `client.kind === 'mock'` 时
 * 会自动走本地模板逻辑（buildTemplate* / buildTemplateConcept 等），不会真正
 * 调 mock 的 generate。所以这个 mock 主要充当"我配 LLM 了但还没配好"或
 * "我想本地开发"的兜底。
 */
export function createMockLlmClient(): LlmClient {
  return {
    kind: 'mock',
    async generate(req: LlmRequest): Promise<LlmResponse> {
      const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
      return {
        text: lastUser?.content ?? '',
      };
    },
  };
}