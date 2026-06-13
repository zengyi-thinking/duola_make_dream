/**
 * 消息通信 — 类型定义
 *
 * Popup ↔ Background ↔ Content Script 之间的消息协议
 */

/** 消息类型枚举 */
export type MessageType =
  | 'chat'          // 聊天消息
  | 'get_profile'   // 获取用户画像
  | 'page_context'  // 页面上下文
  | 'tool_execute'  // 执行工具
  | 'feedback';     // 用户反馈

/** 通用消息请求 */
export interface MessageRequest {
  type: MessageType;
  payload?: unknown;
}

/** 通用消息响应 */
export interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** 聊天请求 */
export interface ChatRequest extends MessageRequest {
  type: 'chat';
  payload: {
    content: string;
    context?: {
      pageUrl?: string;
      pageTitle?: string;
    };
  };
}

/** 聊天响应数据 */
export interface ChatResponseData {
  id: string;
  role: 'dora';
  content: string;
  emotion: string;
  timestamp: number;
}

/** 工具执行请求 */
export interface ToolExecuteRequest extends MessageRequest {
  type: 'tool_execute';
  payload: {
    toolId: string;
    params: Record<string, unknown>;
  };
}

/** 反馈请求 */
export interface FeedbackRequest extends MessageRequest {
  type: 'feedback';
  payload: {
    messageId: string;
    feedbackType: 'like' | 'dislike' | 'skip';
  };
}
