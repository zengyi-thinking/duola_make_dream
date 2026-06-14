import type { AgentIntent } from './types';
import { TOPIC_RULES } from './topics';

/**
 * 关键词到 intent 的映射规则。
 *
 * 排序原则：先具体后宽泛。
 * - "AI/agent" 是 creator-tool 的高频子场景，必须排在 productivity-tool 之前
 * - learning-tool 比 productivity-tool 更具体，提到前面
 * - playful-tool 保持最后兜底
 */
const INTENT_RULES: Array<{ intent: AgentIntent; rule: RegExp }> = [
  { intent: 'browser-extension', rule: /插件|extension|chrome|tab|浏览器|边栏|sidebar/i },
  { intent: 'creator-tool', rule: /ai|agent|智能|模型|gpt|llm|copilot|创作|海报|设计|prompt|图片|灵感|生成/i },
  { intent: 'learning-tool', rule: /学习|记忆|课程|复习|知识|笔记|研究|读|书/i },
  { intent: 'playful-tool', rule: /游戏|玩|趣味|互动|宠物|陪伴/i },
  { intent: 'productivity-tool', rule: /效率|整理|todo|任务|流程|管理|清单|日程|时间|提醒/i },
];

export function routeIdeaIntent(input: string): AgentIntent {
  // 注意：意图分类用 INTENT_RULES（5 个 intent），与主题词 TOPIC_RULES 共享正则但维度不同。
  // 例如 "ai" 在 INTENT_RULES 命中 creator-tool，但在 TOPIC_RULES 命中 AI 产品标签。
  const matched = INTENT_RULES.find((item) => item.rule.test(input));
  return matched?.intent ?? 'productivity-tool';
}

/** Re-export for callers that want both intent + topic labels in one place. */
export { TOPIC_RULES };
