import type { AgentMessage, IntentType } from '@/lib/agent/types';
import { DORA_PERSONALITY } from '@/lib/agent/personality';
import type { MessageRequest, MessageResponse } from '@/lib/messaging/types';

/**
 * Background Service Worker — Agent 的核心大脑
 *
 * 职责：
 * 1. 监听来自 Popup 和 Content Script 的消息
 * 2. 调度 Agent 任务（意图识别 → 路由 → 工具调用）
 * 3. 管理记忆和用户画像
 */

export default defineBackground(() => {
  console.log('[DoraAgent] 🤖 哆啦造梦 Agent 已启动', { id: browser.runtime.id });

  // 监听来自 Popup / Content Script 的消息
  browser.runtime.onMessage.addListener(
    (message: MessageRequest, sender, sendResponse) => {
      handleMessage(message, sender)
        .then(sendResponse)
        .catch((err) => {
          console.error('[DoraAgent] 消息处理出错:', err);
          sendResponse({ success: false, error: String(err) } as MessageResponse);
        });

      // 返回 true 表示异步响应
      return true;
    },
  );
});

/**
 * 处理入站消息，分发给对应的处理器
 */
async function handleMessage(
  message: MessageRequest,
  _sender: browser.Runtime.MessageSender,
): Promise<MessageResponse> {
  console.log('[DoraAgent] 收到消息:', message.type);

  switch (message.type) {
    case 'chat':
      return handleChat(message.payload as AgentMessage);

    case 'get_profile':
      return handleGetProfile();

    case 'page_context':
      return handlePageContext(message.payload);

    default:
      return { success: false, error: '未知的消息类型' };
  }
}

/**
 * 处理聊天消息 — Agent 核心流程
 * TODO: Phase 2 接入 LLM
 */
async function handleChat(userMessage: AgentMessage): Promise<MessageResponse> {
  // 1. 意图识别（骨架）
  const intent: IntentType = recognizeIntent(userMessage.content);

  // 2. 根据意图路由到对应处理器（骨架）
  const response = await routeToHandler(intent, userMessage);

  // 3. 记录到记忆系统（骨架）
  // await saveToMemory(userMessage, response);

  return {
    success: true,
    data: {
      id: `dora-${Date.now()}`,
      role: 'dora',
      content: response,
      emotion: resolveEmotion(intent),
      timestamp: Date.now(),
    },
  };
}

/**
 * 简单的意图识别（关键词匹配，后续替换为 LLM）
 */
function recognizeIntent(content: string): IntentType {
  const lower = content.toLowerCase();

  if (/画|图片|生成|设计|做/.test(lower)) return 'create';
  if (/玩|游戏|猜|讲|笑话/.test(lower)) return 'play';
  if (/什么|为什么|怎么|如何|查/.test(lower)) return 'knowledge';
  return 'chat';
}

/**
 * 路由到对应的处理器
 * TODO: Phase 2 实现各处理器
 */
async function routeToHandler(
  intent: IntentType,
  _message: AgentMessage,
): Promise<string> {
  const templates = DORA_PERSONALITY.responseTemplates[intent];
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * 根据意图映射哆啦A梦的表情
 */
function resolveEmotion(intent: IntentType) {
  const map: Record<IntentType, string> = {
    create: 'surprised',
    play: 'happy',
    knowledge: 'thinking',
    chat: 'default',
  };
  return map[intent] || 'default';
}

/**
 * 获取用户画像
 * TODO: Phase 3 实现用户画像
 */
async function handleGetProfile(): Promise<MessageResponse> {
  return {
    success: true,
    data: {
      name: '大雄',
      createdAt: Date.now(),
      preferences: {},
    },
  };
}

/**
 * 处理页面上下文信息（来自 Content Script）
 * TODO: Phase 2 实现页面理解
 */
async function handlePageContext(payload: unknown): Promise<MessageResponse> {
  console.log('[DoraAgent] 收到页面上下文:', payload);
  return { success: true };
}
