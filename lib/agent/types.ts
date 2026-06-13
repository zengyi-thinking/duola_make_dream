/**
 * Agent 系统核心类型定义
 */

/** 哆啦A梦表情类型 */
export type DoraEmotion = 'default' | 'happy' | 'thinking' | 'surprised';

/** 意图类型 */
export type IntentType = 'create' | 'play' | 'knowledge' | 'chat';

/** 消息角色 */
export type MessageRole = 'user' | 'dora' | 'system';

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  emotion?: DoraEmotion;
  timestamp: number;
  /** 关联的工具调用 ID */
  toolCallId?: string;
}

/** Agent 消息（用于内部通信） */
export interface AgentMessage {
  content: string;
  metadata?: Record<string, unknown>;
}

/** Agent 运行状态 */
export interface AgentState {
  status: 'idle' | 'thinking' | 'executing' | 'error';
  currentIntent?: IntentType;
  lastActivity: number;
}

/** 对话上下文 */
export interface ConversationContext {
  messages: ChatMessage[];
  pageInfo?: PageContext;
  userProfile?: UserProfile;
}

/** 页面上下文（来自 Content Script） */
export interface PageContext {
  title: string;
  url: string;
  description?: string;
  keywords?: string;
  mainText?: string;
  imageCount: number;
}

/** 用户画像 */
export interface UserProfile {
  name: string;
  createdAt: number;
  preferences: UserPreferences;
  stats: UserStats;
}

/** 用户偏好 */
export interface UserPreferences {
  /** 偏好的创作风格 */
  creativeStyle?: string;
  /** 常用工具 ID 列表 */
  favoriteTools?: string[];
  /** 喜欢的话题标签 */
  interests?: string[];
}

/** 用户统计数据 */
export interface UserStats {
  totalMessages: number;
  totalCreations: number;
  streakDays: number;
  lastActiveDate: string;
}

/** Agent 响应 */
export interface AgentResponse {
  message: ChatMessage;
  suggestedTools?: string[];
  stateUpdate?: Partial<AgentState>;
}
