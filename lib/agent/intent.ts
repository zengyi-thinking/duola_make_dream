import type { IntentType } from './types';

/**
 * 意图识别模块
 *
 * 分析用户输入，判断其意图类型
 * 当前为关键词匹配的简单实现，Phase 2 将接入 LLM
 */

/** 意图识别关键词表 */
const INTENT_KEYWORDS: Record<IntentType, RegExp> = {
  create: /画|图片|生成|设计|做|创造|想象|具象|画笔|变出/,
  play: /玩|游戏|猜|讲|故事|笑话|有趣|无聊|陪我/,
  knowledge: /什么|为什么|怎么|如何|查|搜索|分析|解释|是什么|帮我看看/,
  chat: /.*/, // 默认匹配所有
};

/** 意图优先级（从高到低） */
const INTENT_PRIORITY: IntentType[] = ['create', 'play', 'knowledge', 'chat'];

/**
 * 识别用户消息的意图
 * @param content 用户输入文本
 * @returns 意图类型
 */
export function recognizeIntent(content: string): IntentType {
  for (const intent of INTENT_PRIORITY) {
    if (intent === 'chat') continue; // chat 是兜底，最后才用
    if (INTENT_KEYWORDS[intent].test(content)) {
      return intent;
    }
  }
  return 'chat';
}

/**
 * 意图识别结果（带置信度，为后续 LLM 版本预留）
 */
export interface IntentResult {
  intent: IntentType;
  confidence: number;
  /** 所有意图的置信度分布 */
  distribution: Record<IntentType, number>;
}

/**
 * 高级意图识别（预留接口，Phase 2 接入 LLM 实现）
 */
export async function recognizeIntentAdvanced(
  _content: string,
): Promise<IntentResult> {
  // TODO: Phase 2 — 调用 LLM 进行意图识别
  throw new Error('高级意图识别尚未实现，请使用 recognizeIntent');
}
