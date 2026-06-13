import type { MessageRequest, MessageResponse } from './types';

/**
 * 消息通道封装
 *
 * 提供类型安全的消息发送和监听工具函数
 */

/**
 * 发送消息到 Background（从 Popup 或 Content Script 调用）
 */
export async function sendMessage<T = unknown>(
  request: MessageRequest,
): Promise<MessageResponse & { data?: T }> {
  try {
    return await browser.runtime.sendMessage(request);
  } catch (err) {
    console.error('[Messaging] 发送消息失败:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * 向指定 Tab 发送消息（从 Background 调用）
 */
export async function sendTabMessage(
  tabId: number,
  request: MessageRequest,
): Promise<MessageResponse> {
  try {
    return await browser.tabs.sendMessage(tabId, request);
  } catch (err) {
    console.error('[Messaging] 发送 Tab 消息失败:', err);
    return { success: false, error: String(err) };
  }
}

/**
 * 获取当前活跃 Tab
 */
export async function getActiveTab() {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab;
}

/**
 * 快捷发送聊天消息
 */
export async function sendChat(content: string) {
  return sendMessage({
    type: 'chat',
    payload: { content },
  });
}

/**
 * 快捷发送反馈
 */
export async function sendFeedback(
  messageId: string,
  feedbackType: 'like' | 'dislike' | 'skip',
) {
  return sendMessage({
    type: 'feedback',
    payload: { messageId, feedbackType },
  });
}
