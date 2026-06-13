/**
 * Agent 系统 — 统一导出入口
 */

export type {
  DoraEmotion,
  IntentType,
  MessageRole,
  ChatMessage,
  AgentMessage,
  AgentState,
  AgentResponse,
  ConversationContext,
  PageContext,
  UserProfile,
  UserPreferences,
  UserStats,
} from './types';

export { DORA_PERSONALITY } from './personality';
export { recognizeIntent } from './intent';
export { route, registerHandler } from './router';
