import type { FeedbackAction, HarnessPatch } from './types';

export function buildHarnessPatchFromFeedback(action: FeedbackAction): HarnessPatch | null {
  if (action !== 'dislike-direction') {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    target: 'prompt',
    scope: 'runtime-config',
    reason: '用户明确表示不喜欢当前方向，建议降低发散感并提高产品聚焦度。',
    before: '默认输出：鼓励发散并同时给出多个想法切面。',
    after: '默认输出：先聚焦一个最强产品方向，再补充 1 个保守备选。',
    riskLevel: 'low',
    requireUserApproval: true,
    status: 'pending',
    createdAt: Date.now(),
  };
}
