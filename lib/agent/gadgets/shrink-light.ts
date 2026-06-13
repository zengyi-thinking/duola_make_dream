import type { ProductConcept } from '../types';

export function runShrinkLight(concept: ProductConcept): {
  mvpPlan: string[];
  nextTasks: string[];
} {
  return {
    mvpPlan: [
      '先做一句话输入、结果卡片和本地记忆，不接任何外部 API。',
      '把网页划词片段通过“放进口袋”送进 background，当成灵感上下文。',
      '只输出 1 个主方向、1 段图片 Prompt、1 组 MVP 拆解，保证速度和闭环。',
    ],
    nextTasks: [
      `给 ${concept.name} 增加 2 套结果风格模板，测试用户更偏爱哪种表达方式。`,
      '为反馈按钮增加可解释的风格迁移逻辑，而不只是记录点击。',
      '接入后端代理，再把本地 mock 规则替换成真实模型调用。',
    ],
  };
}
