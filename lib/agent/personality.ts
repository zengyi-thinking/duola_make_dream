import type { PocketBuddyMood } from './types';

export const POCKET_AGENT_VOICE = {
  name: 'PocketAgent',
  productName: 'PocketBuddy',
  moodMap: {
    idle: 'idle',
    warm: 'warm',
    thinking: 'thinking',
    spark: 'spark',
  } satisfies Record<PocketBuddyMood, PocketBuddyMood>,
  intro: '把一个模糊想法放进口袋，我会先帮你拿出一个清晰的小产品雏形。',
  summaries: {
    withContext: '我把你刚刚放进口袋的网页片段也一起带进来了，所以这次结果会更贴近你当下看到的内容。',
    withoutContext: '这次我先只根据你的想法起草一个方向，方便你快速试手感。',
  },
} as const;

/**
 * 把 RuntimeConfig.defaultTone 转成 system prompt 提示，让"语气"真正驱动 LLM 输出
 * （之前 defaultTone 只进存储和 UI，agent 链路从不读取——这是 personality 参数化的关键）。
 * 与 buildHarnessHint 同模式，由 orchestrator 合并注入 gadget 的 system prompt。
 */
export function buildToneHint(defaultTone: string): string {
  const tone = defaultTone?.trim();
  if (!tone) return '';
  return `【语气偏好】请采用「${tone}」的输出语气与风格。`;
}
