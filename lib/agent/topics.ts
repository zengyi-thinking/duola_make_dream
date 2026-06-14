/**
 * PocketBuddy 主题词 → 标签的映射。
 *
 * 单点定义：router（意图分类）、extractThemesFromIdea（画像主题提炼）
 * 共享同一份主题词库，避免漂移。
 */

export interface TopicRule {
  label: string;
  rule: RegExp;
}

export const TOPIC_RULES: TopicRule[] = [
  { label: '浏览器插件', rule: /插件|extension|chrome|边栏|sidebar/i },
  { label: 'AI 产品', rule: /ai|agent|智能|模型|gpt|llm|copilot/i },
  { label: '效率工具', rule: /效率|整理|todo|任务|流程|管理|清单|日程|时间|提醒/i },
  { label: '学习工具', rule: /学习|记忆|课程|复习|知识|笔记|研究|读书|阅读/i },
  { label: '创作辅助', rule: /创作|海报|设计|prompt|图片|灵感|生成/i },
  { label: '陪伴型工具', rule: /游戏|玩|趣味|互动|宠物|陪伴/i },
];

/** 抽取文本中命中的所有主题标签。 */
export function matchTopics(text: string): string[] {
  return TOPIC_RULES.filter((topic) => topic.rule.test(text)).map((topic) => topic.label);
}