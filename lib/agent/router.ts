import type { IntentType, AgentMessage, AgentResponse, AgentState } from './types';
import type { ChatMessage, DoraEmotion } from './types';
import { DORA_PERSONALITY } from './personality';

/**
 * 任务路由调度
 *
 * 根据意图将用户消息分发到对应的处理器
 * 每个处理器返回 AgentResponse
 */

/** 处理器函数签名 */
type IntentHandler = (
  message: AgentMessage,
) => Promise<AgentResponse>;

/** 已注册的处理器映射 */
const handlers: Partial<Record<IntentType, IntentHandler>> = {};

/**
 * 注册意图处理器
 */
export function registerHandler(intent: IntentType, handler: IntentHandler) {
  handlers[intent] = handler;
}

/**
 * 路由消息到对应处理器
 * @param intent 已识别的意图
 * @param message 用户消息
 * @returns Agent 响应
 */
export async function route(
  intent: IntentType,
  message: AgentMessage,
): Promise<AgentResponse> {
  const handler = handlers[intent];

  if (handler) {
    return handler(message);
  }

  // 兜底：使用人格系统模板回复
  return fallbackResponse(intent);
}

/**
 * 兜底回复（无注册处理器时使用）
 */
function fallbackResponse(intent: IntentType): AgentResponse {
  const templates = DORA_PERSONALITY.responseTemplates[intent];
  const content = templates[Math.floor(Math.random() * templates.length)];
  const emotion = DORA_PERSONALITY.emotionMap[intent];

  const chatMessage: ChatMessage = {
    id: `dora-${Date.now()}`,
    role: 'dora',
    content,
    emotion: emotion as DoraEmotion,
    timestamp: Date.now(),
  };

  return {
    message: chatMessage,
    stateUpdate: {
      status: 'idle',
      currentIntent: intent,
      lastActivity: Date.now(),
    } satisfies Partial<AgentState>,
  };
}
