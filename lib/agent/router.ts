import type { AgentIntent } from './types';

const INTENT_RULES: Array<{ intent: AgentIntent; rule: RegExp }> = [
  { intent: 'browser-extension', rule: /插件|extension|chrome|tab|浏览器/i },
  { intent: 'learning-tool', rule: /学习|记忆|课程|复习|知识/i },
  { intent: 'creator-tool', rule: /创作|海报|设计|prompt|图片|灵感/i },
  { intent: 'productivity-tool', rule: /效率|整理|todo|任务|流程|管理/i },
  { intent: 'playful-tool', rule: /游戏|玩|趣味|互动|宠物/i },
];

export function routeIdeaIntent(input: string): AgentIntent {
  const matched = INTENT_RULES.find((item) => item.rule.test(input));
  return matched?.intent ?? 'productivity-tool';
}
