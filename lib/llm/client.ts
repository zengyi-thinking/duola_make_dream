import type { LlmClient, LlmRequest, LlmResponse } from './types';

export interface AnthropicCompatibleConfig {
  apiKey: string;
  /** 不含 /v1/messages 后缀的 base，如 https://api.minimaxi.com/anthropic */
  endpoint: string;
  model: string;
  /** 请求超时（ms），默认 30000 */
  timeoutMs?: number;
  /** 最大输出 token，默认 1024 */
  defaultMaxTokens?: number;
}

/**
 * 创建 Anthropic Messages 协议兼容的 LLM 客户端。
 *
 * 适用于 MiniMax（https://api.minimaxi.com/anthropic）和原生 Anthropic。
 * 协议：POST {endpoint}/v1/messages
 *
 * privacy-check: allow — 仅发送 prompt 文本到用户配置的端点，不附带本地其它用户数据
 */
export function createAnthropicCompatibleClient(config: AnthropicCompatibleConfig): LlmClient {
  const { apiKey, endpoint, model, timeoutMs = 30000, defaultMaxTokens = 1024 } = config;

  if (!apiKey) {
    throw new Error('LLM API Key 未配置');
  }

  return {
    kind: 'anthropic-compatible',
    async generate(req: LlmRequest): Promise<LlmResponse> {
      const url = `${endpoint.replace(/\/$/, '')}/v1/messages`;
      const body = {
        model,
        max_tokens: req.maxTokens ?? defaultMaxTokens,
        ...(req.system ? { system: req.system } : {}),
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey, // privacy-check: allow
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`LLM 请求失败 [${res.status}]: ${errText.slice(0, 300)}`);
        }

        const data = await res.json() as {
          content?: Array<{ type: string; text?: string }>;
          // 部分兼容端点可能用 OpenAI 风格字段兜底
          choices?: Array<{ message?: { content?: string } }>;
        };

        // 优先 Anthropic 风格 content[].text
        const text = data.content
          ?.filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join('')
          // 兜底 OpenAI 风格
          || data.choices?.[0]?.message?.content
          || '';

        if (!text) {
          throw new Error('LLM 返回内容为空');
        }

        return { text, raw: data };
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`LLM 请求超时（${timeoutMs}ms）`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
