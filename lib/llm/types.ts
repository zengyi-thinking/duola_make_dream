/**
 * LLM 模块类型定义
 */

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  /** 固定系统提示，用户输入绝不拼入此处（防注入） */
  system?: string;
  messages: LlmMessage[];
  maxTokens?: number;
}

export interface LlmResponse {
  /** 模型返回的文本 */
  text: string;
  /** 原始响应，调试用 */
  raw?: unknown;
  /** 本次调用是否真实命中外部 API（mock 时为 false） */
  fromLiveApi: boolean;
}

export interface LlmClient {
  generate(req: LlmRequest): Promise<LlmResponse>;
  /** 客户端类型标识 */
  readonly kind: string;
}
